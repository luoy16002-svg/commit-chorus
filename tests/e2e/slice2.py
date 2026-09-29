"""Slice 2 check: the roll advances with playback, frames keep coming, and the drawn position follows the heard clock."""
import sys, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5180/'
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 1440, 'height': 900})
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('.preset', timeout=20000)
    pg.locator('.preset').first.click()
    pg.get_by_role('button', name='Play', exact=True).click()
    shots = {}
    for t in [2, 10, 40]:
        while (pg.evaluate('window.__cc.contextTime()') or 0) < t: time.sleep(0.1)
        pg.screenshot(path=f'tests/e2e/roll-{t}.png')
        shots[t] = pg.evaluate('window.__cc.sync()')
    fps = pg.evaluate('new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); })')
    dot = pg.evaluate("getComputedStyle(document.querySelector('.ticker .dot')).backgroundColor")
    for t, s in shots.items():
        gap_ms = (s['scheduled'] - s['heard']) * 250
        print(f"t={t}s heard beat {s['heard']:.2f}, scheduled {s['scheduled']:.2f}, drawn position trails scheduling by {gap_ms:.0f} ms (output latency {s['latencyMs']:.0f} ms)")
    print('fps', fps, '| ticker dot', dot, '| errors', errs[:3])
    b.close()
