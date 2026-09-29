"""Slice 3 check: a live repository loads from GitHub and opens with the same notes as its preset; errors are explained."""
import json, subprocess, sys, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5180/'
preset = json.loads(subprocess.run(['npx', 'tsx', '-e', "import {readFileSync} from 'node:fs'; import {arrange} from './src/music/arranger'; const s=arrange(JSON.parse(readFileSync('public/presets/deno.json','utf8'))); console.log(JSON.stringify(s.notes.slice(0,200).map(x=>[x.beat,x.inst,x.midi])))"], capture_output=True, text=True, shell=True).stdout)
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1440, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('.preset', timeout=20000)
    pg.fill('.search input', 'https://github.com/denoland/deno')
    pg.click('.search button')
    pg.wait_for_selector('.songhead', timeout=90000)
    head = pg.inner_text('.songhead p')
    live = pg.evaluate('window.__cc.opening(200)')
    print('header:', head)
    print('opening notes identical to preset:', live == preset, len(live))
    pg.fill('.search input', 'this-owner-does-not-exist-9f3/nothing')
    pg.click('.search button')
    pg.wait_for_selector('.error', timeout=30000)
    print('error shown:', pg.inner_text('.error'), '| song kept:', pg.inner_text('.songhead h2'))
    pg.fill('.search input', 'not a repo')
    pg.click('.search button'); time.sleep(0.5)
    print('bad input:', pg.inner_text('.error'))
    pg.screenshot(path='tests/e2e/live.png')
    print('page errors:', errs[:3])
    b.close()
