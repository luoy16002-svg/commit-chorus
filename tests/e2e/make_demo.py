"""Turn the raw recording into the demo video: align the app's audio with the screen, cut the waiting,
scale to 1080p and level the sound to -14 LUFS."""
import json, subprocess
from pathlib import Path
import numpy as np

D = Path('tests/e2e/demo')
marks = json.loads((D / 'marks.json').read_text())
FPS = 25


def run(*args):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *args], check=True)


def probe_fps(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', str(path)],
                         capture_output=True, text=True).stdout.strip()
    n, d = out.split('/')
    return float(n) / float(d)


# 0. The marks are wall-clock times; they only line up with the video if the screencast kept every frame.
video_len = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(D / 'screen.mp4')],
                                 capture_output=True, text=True).stdout.strip())
assert video_len > marks['finish'] - 0.5, f'screen.mp4 is {video_len:.1f} s but the marks run to {marks["finish"]:.1f} s: frames were dropped, record again'

# 1. When is beat 0 heard in the video? The progress bar grows with the heard position, so fit a line
#    to its width over several seconds after the click and extrapolate back to zero.
tb = marks['track_box']
x, y, w = int(tb['x']), int(tb['y']), int(tb['width'])
t0 = marks['deno_play']
raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-ss', f'{t0}', '-t', '20', '-i', str(D / 'screen.mp4'),
                      '-vf', f'crop={w}:4:{x}:{y},format=gray,fps={FPS}', '-f', 'rawvideo', '-'], capture_output=True).stdout
rows = np.frombuffer(raw, np.uint8).reshape(-1, 4, w).astype(np.float32).mean(axis=1)
widths = np.array([(r > 90).sum() for r in rows], dtype=np.float64)
ts = t0 + np.arange(len(widths)) / FPS
# Fit only while the bar is visibly growing (playback may start a little after the click).
grow = (widths > 6) & (widths < 0.6 * w)
assert grow.sum() > FPS * 3, 'progress bar not found growing after the Play click'
ts, widths = ts[grow], widths[grow]
slope, icpt = np.polyfit(ts, widths, 1)
t_beat0_video = -icpt / slope
resid = np.abs(widths - (slope * ts + icpt)).max()
print(f'beat 0 heard at {t_beat0_video:.3f} s of video (fit {slope:.2f} px/s, max residual {resid:.1f} px)')

# 2. When does the first note start in the recorded audio?
run('-i', str(D / 'audio.webm'), '-ac', '1', '-ar', '48000', str(D / 'audio.wav'))
import soundfile as sf
a, sr = sf.read(D / 'audio.wav', dtype='float32')
start = int(max(0, marks['deno_play'] - marks['tap'] - 2) * sr)
env = np.abs(a[start:])
onset = start + int(np.argmax(env > 10 ** (-40 / 20)))
t_onset_audio = onset / sr
# The recorder hears beat 0 when it is rendered; the picture shows it once the output latency has passed.
# In the finished video both should coincide, so the audio's first note is placed at beat 0 of the picture.
audio_offset = t_beat0_video - t_onset_audio
print(f'first note at {t_onset_audio:.2f} s of audio -> audio starts at {audio_offset:.3f} s of video')

# 3. Segments to keep, in video time (marks are measured from page creation; shift by the click offset).
shift = t_beat0_video - 0.11 - marks['deno_play']  # the click happens ~0.11 s before beat 0 is heard
m = {k: v + shift for k, v in marks.items() if isinstance(v, (int, float))}
fetch_wait = m['svelte_loaded'] - m['svelte_fetch']
segments = [
    (m['home'] - 0.3, m['deno_end'] + 0.2),
    (m['deno_end'] + 0.2, m['svelte_fetch'] + min(fetch_wait, 1.6)),
    (m['svelte_loaded'] - 0.5, m['svelte_end']),
    (m['svelte_end'], m['bun_play'] + 7.0),
    (m['bun_end'] - 2.5, m['finish']),
]
print('segments', [(round(a, 2), round(b, 2)) for a, b in segments], 'total', round(sum(b - a for a, b in segments), 1), 's')

# 4. Mux the full audio under the full video first, then cut both together.
delay_ms = int(round(audio_offset * 1000))
afilter = f'adelay={delay_ms}|{delay_ms}' if delay_ms >= 0 else f'atrim=start={-audio_offset},asetpts=PTS-STARTPTS'
run('-i', str(D / 'screen.mp4'), '-i', str(D / 'audio.webm'), '-filter_complex', f'[1:a]{afilter},apad[a]',
    '-map', '0:v', '-map', '[a]', '-shortest', '-c:v', 'libx264', '-crf', '14', '-preset', 'fast', '-r', '30', '-c:a', 'pcm_s16le', str(D / 'full.mov'))

parts, labels = [], []
for i, (a0, b0) in enumerate(segments):
    fade = 0.05
    parts.append(f'[0:v]trim=start={a0:.3f}:end={b0:.3f},setpts=PTS-STARTPTS[v{i}]')
    parts.append(f'[0:a]atrim=start={a0:.3f}:end={b0:.3f},asetpts=PTS-STARTPTS,afade=t=in:d={fade},afade=t=out:st={b0 - a0 - fade:.3f}:d={fade}[a{i}]')
    labels.append(f'[v{i}][a{i}]')
fc = ';'.join(parts) + ';' + ''.join(labels) + f'concat=n={len(segments)}:v=1:a=1[v][a];[v]scale=1920:1080:flags=lanczos,fps=30[vo]'
run('-i', str(D / 'full.mov'), '-filter_complex', fc, '-map', '[vo]', '-map', '[a]', '-c:v', 'libx264', '-crf', '17', '-preset', 'slow',
    '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', str(D / 'cut.mov'))

# 5. Loudness to -14 LUFS (two passes) and final encode.
meas = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(D / 'cut.mov'), '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'],
                      capture_output=True, text=True).stderr
j = json.loads(meas[meas.rindex('{'):meas.rindex('}') + 1])
ln = (f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}"
      f":measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")
run('-i', str(D / 'cut.mov'), '-af', ln, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', str(D / 'commit-chorus-demo.mp4'))
dur = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(D / 'commit-chorus-demo.mp4')],
                     capture_output=True, text=True).stdout.strip()
print('done', D / 'commit-chorus-demo.mp4', dur, 's')
