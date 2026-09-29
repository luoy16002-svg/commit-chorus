"""Slice 1 check: offline render levels for the opening and the busiest weeks, then live playback without errors."""
import base64, json, sys, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5180/'
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page()
    errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(URL); pg.wait_for_function('window.__cc', timeout=20000)
    deno = json.load(open('public/presets/deno.json', encoding='utf-8'))
    # busiest bar, found the same way the arranger does
    import datetime
    t0 = deno['commits'][0]['t']; d0 = datetime.datetime.fromtimestamp(t0/1000, datetime.timezone.utc)
    monday = datetime.datetime(d0.year, d0.month, d0.day, tzinfo=datetime.timezone.utc) - datetime.timedelta(days=d0.weekday())
    bars = {}
    for c in deno['commits']:
        day = int((c['t']/1000 - monday.timestamp()) // 86400); bars[day//7] = bars.get(day//7, 0) + 1
    busiest = max(bars, key=bars.get)
    for label, secs, frm in [('opening', 30, 0), ('busiest', 14, max(0, busiest*7 - 14))]:
        r = pg.evaluate('([s, f]) => window.__cc.render("deno", s, f)', [secs, frm])
        open(f'tests/e2e/{label}.wav', 'wb').write(base64.b64decode(r['wavBase64']))
        print(f"{label}: peak {r['peakDb']:.1f} dBFS, rms {r['rmsDb']:.1f} dBFS (from beat {frm}, busiest bar {busiest} has {bars[busiest]} commits)")
    pg.locator('.preset').first.click()
    pg.get_by_role('button', name='Play', exact=True).click()
    time.sleep(4)
    beat = pg.evaluate('window.__cc.beat()')
    print('live beat after 4 s:', round(beat, 2))
    print('errors:', errors[:5])
    b.close()
