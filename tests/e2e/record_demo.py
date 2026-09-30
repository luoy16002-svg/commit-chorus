"""Record the demo: screencast frames with their capture times, the app's own audio from an in-page
recorder, and timestamps of every step so the edit can cut both tracks at the same points.

Playwright's built-in video drops frames under load and then plays the rest faster, so the picture drifts
away from the step marks. Every screencast frame here carries its own timestamp instead, and the frames
are laid onto a constant 30 fps timeline afterwards."""
import base64, json, os, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'https://luoy16002-svg.github.io/commit-chorus/'
OUT = Path('tests/e2e/demo'); OUT.mkdir(parents=True, exist_ok=True)
FRAMES = OUT / 'frames'; FRAMES.mkdir(exist_ok=True)
for f in [*OUT.glob('*.webm'), *FRAMES.glob('*.jpg')]: f.unlink()
W, H = 1600, 900

CURSOR = """
window.addEventListener('DOMContentLoaded', () => {
  const c = document.createElement('div');
  c.style.cssText = 'position:fixed;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;'
    + 'background:rgba(243,208,138,.9);box-shadow:0 0 0 3px rgba(21,17,14,.55),0 2px 10px rgba(0,0,0,.5);'
    + 'pointer-events:none;z-index:99999;transition:transform .12s ease;';
  document.body.appendChild(c);
  document.addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  document.addEventListener('mousedown', () => { c.style.transform = 'scale(.7)'; }, true);
  document.addEventListener('mouseup', () => { c.style.transform = 'scale(1)'; }, true);
});
"""

marks = {}
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(viewport={'width': W, 'height': H}, permissions=['clipboard-read', 'clipboard-write'])
    ctx.add_init_script(CURSOR)
    pg = ctx.new_page()
    # With a token in DEMO_GH_TOKEN, API calls use the owner's own quota instead of the 60/hour anonymous one.
    token = os.environ.get('DEMO_GH_TOKEN')
    if token:
        pg.route('https://api.github.com/**', lambda route: route.continue_(headers={**route.request.headers, 'authorization': f'Bearer {token}'}))
    t_page = time.time()
    mark = lambda k: marks.__setitem__(k, round(time.time() - t_page, 3))

    frames = []
    cdp = ctx.new_cdp_session(pg)
    # Waits must go through Playwright: a plain time.sleep stops event delivery, so frames stop being
    # acknowledged and the screencast freezes.
    nap = lambda s: pg.wait_for_timeout(s * 1000)

    def on_frame(ev):
        name = f'{len(frames):05d}.jpg'
        (FRAMES / name).write_bytes(base64.b64decode(ev['data']))
        frames.append((round(ev['metadata']['timestamp'] - t_page, 4), name))
        cdp.send('Page.screencastFrameAck', {'sessionId': ev['sessionId']})

    cdp.on('Page.screencastFrame', on_frame)
    cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 92, 'maxWidth': W, 'maxHeight': H, 'everyNthFrame': 1})

    def glide(locator, click=True):
        box = locator.bounding_box()
        pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2, steps=28)
        nap(0.25)
        if click:
            pg.mouse.down(); nap(0.08); pg.mouse.up()

    pg.goto(URL); pg.wait_for_selector('.preset', timeout=30000)
    pg.evaluate('document.fonts.ready')
    pg.mouse.move(W / 2, H * 0.8)
    tap_epoch = pg.evaluate('window.__cc.startTap()') / 1000
    marks['tap'] = round(tap_epoch - t_page, 3)
    nap(1.0); mark('home')
    nap(3.0)
    glide(pg.locator('.preset').nth(0)); pg.wait_for_selector('.songhead'); nap(1.2)
    marks['play_box'] = pg.get_by_role('button', name='Play', exact=True).bounding_box()
    marks['track_box'] = pg.locator('.progress .track').bounding_box()
    glide(pg.get_by_role('button', name='Play', exact=True)); mark('deno_play')
    nap(25); mark('deno_end')

    glide(pg.locator('.search input'))
    pg.keyboard.type('sveltejs/svelte', delay=85); nap(0.4); mark('svelte_typed')
    glide(pg.locator('.search button')); mark('svelte_fetch')
    pg.wait_for_selector('.songhead h2:has-text("sveltejs/svelte")', timeout=90000); mark('svelte_loaded')
    nap(1.0)
    glide(pg.get_by_role('button', name='Play', exact=True)); mark('svelte_play')
    nap(17); mark('svelte_end')

    glide(pg.locator('.brand')); pg.wait_for_selector('.preset'); nap(1.2)
    glide(pg.locator('.preset').nth(2)); pg.wait_for_selector('.songhead'); nap(1.0)
    glide(pg.get_by_role('button', name='Speed')); nap(0.5)
    glide(pg.get_by_role('button', name='Play', exact=True)); mark('bun_play')
    pg.mouse.move(W * 0.72, H * 0.86, steps=20)
    pg.wait_for_selector('.endcard', timeout=120000); mark('bun_end')
    nap(2.2)
    glide(pg.get_by_role('button', name='Copy link')); mark('copied')
    nap(2.8); mark('finish')

    audio_b64 = pg.evaluate('window.__cc.stopTap()')
    (OUT / 'audio.webm').write_bytes(base64.b64decode(audio_b64))
    cdp.send('Page.stopScreencast')
    ctx.close(); b.close()

# Lay the frames on a 30 fps timeline: each frame holds until the next one arrived.
lines = []
for (t0, name), (t1, _) in zip(frames, frames[1:] + [(marks['finish'] + 0.5, None)]):
    lines += [f"file 'frames/{name}'", f'duration {max(0.001, t1 - t0):.4f}']
lines.append(f"file 'frames/{frames[-1][1]}'")
(OUT / 'frames.txt').write_text(chr(10).join(lines))
import subprocess
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(OUT / 'frames.txt'), '-vf', f'tpad=start_duration={frames[0][0]:.4f}:start_mode=clone,fps=30',
                '-c:v', 'libx264', '-crf', '12', '-preset', 'fast', '-pix_fmt', 'yuv420p', str(OUT / 'screen.mp4')], check=True)
print(len(frames), 'frames,', round(len(frames) / (frames[-1][0] - frames[0][0]), 1), 'fps average')
(OUT / 'marks.json').write_text(json.dumps(marks, indent=1))
print(json.dumps(marks))
