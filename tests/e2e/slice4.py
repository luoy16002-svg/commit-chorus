"""Slice 4 check: a shared link opens the player, double speed plays to the end card, and Copy link round-trips."""
import sys, time
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5180/'
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, permissions=['clipboard-read', 'clipboard-write'])
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE + '?repo=oven-sh/bun'); pg.wait_for_selector('.songhead', timeout=20000)
    print('opened from link:', pg.inner_text('.songhead h2'))
    pg.get_by_role('button', name='Speed').click()
    pg.get_by_role('button', name='Play', exact=True).click()
    t0 = time.time()
    pg.wait_for_selector('.endcard', timeout=120000)
    print(f'end card after {time.time() - t0:.0f} s at 2x')
    time.sleep(0.8)
    pg.screenshot(path='tests/e2e/endcard.png')
    print(pg.inner_text('.endcard').replace('\n', ' | '))
    pg.get_by_role('button', name='Copy link').click(); time.sleep(0.3)
    link = pg.evaluate('navigator.clipboard.readText()')
    print('copied:', link, '| button now:', pg.inner_text('.endcard .primary'))
    pg2 = ctx.new_page(); pg2.goto(link); pg2.wait_for_selector('.songhead', timeout=20000)
    print('link opens:', pg2.inner_text('.songhead h2'), '| play ready:', pg2.get_by_role('button', name='Play', exact=True).is_visible())
    print('errors:', errs[:3])
    b.close()
