"""Cut the instrument recordings Commit Chorus plays from the VSCO-2 Community Edition library (CC0).

For each instrument, pick a recording every few semitones across the range the arranger uses,
trim it, fade it out, fold it to mono, level it, measure how far it is from concert pitch, and
encode a small MP3. Writes public/samples/<instrument>/<midi>.mp3 and public/samples/manifest.json.

Needs a local copy of VSCO-2 CE with the SFZ files (https://github.com/sgossner/VSCO-2-CE);
set VSCO_DIR to the folder that holds the sampler (default: the author's library path).
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import scipy.signal as sig
import soundfile as sf

VSCO_DIR = Path(os.environ.get('VSCO_DIR', 'C:/Projects/xinmi/media/samples'))
sys.path.insert(0, str(VSCO_DIR))
from sampler import load_sfz, read, tuning  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / 'public' / 'samples'
SR = 44100

# name: (sfz, sounding offset, lowest and highest sounding MIDI note used, seconds kept, step)
INSTRUMENTS = {
    'glock':  ('Glockenspiel',   12, 79, 96, 2.4, 3),
    'harp':   ('Harp',            0, 55, 86, 2.4, 4),
    'piano':  ('VSUpright1',      0, 52, 86, 2.6, 4),
    'violin': ('ViolinEnsPizz',   0, 60, 86, 1.6, 4),
    'viola':  ('ViolaEnsPizz',    0, 53, 77, 1.6, 4),
    'cello':  ('CelloEnsPizz',    0, 40, 65, 1.8, 4),
    'bass':   ('ContrabassPizz',  0, 31, 50, 1.8, 4),
    'pad':    ('ViolaEnsSusVib',  0, 50, 76, 3.2, 4),
}


def pick(regions, target, offset):
    """The steady, mid-velocity recording whose sounding pitch is nearest the target."""
    def cost(r):
        vel_mid = (r['lovel'] + r['hivel']) / 2
        unstable = tuning(r['file'], r['center'], offset)[1]
        return (abs(r['center'] + offset - target) * 10 + abs(vel_mid - 80) / 20
                + (5 if unstable else 0) + (r['seq'] - 1) * 0.01)
    return min(regions, key=cost)


def cut(file, seconds):
    a, sr = read(file)
    mono = a.mean(axis=1)
    mono = sig.resample_poly(mono, SR, sr) if sr != SR else mono
    mono = mono[: int(seconds * SR)].copy()
    fade = int(0.35 * SR)
    mono[-fade:] *= np.linspace(1, 0, fade) ** 2
    rms = np.sqrt(np.mean(mono[: int(0.4 * SR)] ** 2)) + 1e-9
    mono *= 0.12 / rms                       # even loudness across the recordings of one instrument
    peak = np.abs(mono).max()
    if peak > 0.89:
        mono *= 0.89 / peak                  # keep headroom (−1 dBFS)
    return mono.astype(np.float32)


def main():
    manifest = {}
    for name, (sfz, offset, lo, hi, seconds, step) in INSTRUMENTS.items():
        regions = load_sfz(sfz)
        (OUT / name).mkdir(parents=True, exist_ok=True)
        chosen = {}
        for target in range(lo, hi + 1, step):
            r = pick(regions, target, offset)
            chosen[r['center'] + offset] = r
        entries = []
        for sounding, r in sorted(chosen.items()):
            cents = tuning(r['file'], r['center'], offset)[0] + r['tune']
            audio = cut(r['file'], seconds)
            with tempfile.TemporaryDirectory() as tmp:
                wav = Path(tmp) / 'n.wav'
                sf.write(wav, audio, SR)
                mp3 = OUT / name / f'{sounding}.mp3'
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-ac', '1',
                                '-codec:a', 'libmp3lame', '-b:a', '96k', str(mp3)], check=True)
            entries.append({'midi': sounding, 'cents': round(cents, 1), 'file': f'{name}/{sounding}.mp3'})
        manifest[name] = entries
        print(name, [e['midi'] for e in entries], [e['cents'] for e in entries])
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=1))
    (OUT / 'LICENSE.txt').write_text(
        'Instrument recordings: Versilian Studios Chamber Orchestra 2, Community Edition (VSCO-2 CE),\n'
        'released under CC0 1.0 Universal. https://github.com/sgossner/VSCO-2-CE\n'
        'These files are trimmed, leveled and re-encoded excerpts.\n')


if __name__ == '__main__':
    main()
