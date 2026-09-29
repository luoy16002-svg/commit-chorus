"""Record the demo: screen video from Playwright, the app's own audio from an in-page recorder, and
timestamps of every step so the edit can cut both tracks at the same points."""
import base64, json, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'https://luoy16002-svg.github.io/commit-chorus/'
OUT = Path('tests/e2e/demo'); OUT.mkdir(parents=True, exist_ok=True)
for f in OUT.glob('*.webm'): f.unlink()
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
    ctx = b.new_context(viewport={'width': W, 'height': H}, record_video_dir=str(OUT), record_video_size={'width': W, 'height': H},
                        permissions=['clipboard-read', 'clipboard-write'])
    ctx.add_init_script(CURSOR)
    pg = ctx.new_page()
    t_page = time.time()
    mark = lambda k: marks.__setitem__(k, round(time.time() - t_page, 3))

    def glide(locator, click=True):
        box = locator.bounding_box()
        pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2, steps=28)
        time.sleep(0.25)
        if click:
            pg.mouse.down(); time.sleep(0.08); pg.mouse.up()

    pg.goto(URL); pg.wait_for_selector('.preset', timeout=30000)
    pg.evaluate('document.fonts.ready')
    pg.mouse.move(W / 2, H * 0.8)
    tap_epoch = pg.evaluate('window.__cc.startTap()') / 1000
    marks['tap'] = round(tap_epoch - t_page, 3)
    time.sleep(1.0); mark('home')
    time.sleep(3.0)
    glide(pg.locator('.preset').nth(0)); pg.wait_for_selector('.songhead'); time.sleep(1.2)
    glide(pg.get_by_role('button', name='Play', exact=True)); mark('deno_play')
    time.sleep(25); mark('deno_end')

    glide(pg.locator('.search input'))
    pg.keyboard.type('sveltejs/svelte', delay=85); time.sleep(0.4); mark('svelte_typed')
    glide(pg.locator('.search button')); mark('svelte_fetch')
    pg.wait_for_selector('.songhead h2:has-text("sveltejs/svelte")', timeout=90000); mark('svelte_loaded')
    time.sleep(1.0)
    glide(pg.get_by_role('button', name='Play', exact=True)); mark('svelte_play')
    time.sleep(17); mark('svelte_end')

    glide(pg.locator('.brand')); pg.wait_for_selector('.preset'); time.sleep(1.2)
    glide(pg.locator('.preset').nth(2)); pg.wait_for_selector('.songhead'); time.sleep(1.0)
    glide(pg.get_by_role('button', name='Speed')); time.sleep(0.5)
    glide(pg.get_by_role('button', name='Play', exact=True)); mark('bun_play')
    pg.mouse.move(W * 0.72, H * 0.86, steps=20)
    pg.wait_for_selector('.endcard', timeout=120000); mark('bun_end')
    time.sleep(2.2)
    glide(pg.get_by_role('button', name='Copy link')); mark('copied')
    time.sleep(2.8); mark('finish')

    audio_b64 = pg.evaluate('window.__cc.stopTap()')
    (OUT / 'audio.webm').write_bytes(base64.b64decode(audio_b64))
    ctx.close(); b.close()

video = next(p for p in OUT.glob('*.webm') if p.name != 'audio.webm')
video.rename(OUT / 'screen.webm')
(OUT / 'marks.json').write_text(json.dumps(marks, indent=1))
print(json.dumps(marks))
