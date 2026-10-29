"""Actual app.js callback order with fake Firebase; no account or remote writes.
Run after build: python3 dev/tests/repro/initial_auto.py
The fake emits a server snapshot first. Real SDK/cache ordering is not reproduced.
"""
import functools, json, threading
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[3]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT/'dev/dist/app')))
threading.Thread(target=srv.serve_forever, daemon=True).start()
seed = [['users/u1/items/r_test', dict(title='자동 생성 확인', days=list(range(7)), auto=True, cat='k1', subtasks=[])]]
fake = (ROOT/'dev/tests/fake_firebase.js').read_text()
errors = []
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(service_workers='block')
        ctx.add_init_script('sessionStorage.setItem("fakefs", '+json.dumps(json.dumps(seed))+');')
        ctx.route('**/firebase-config.js', lambda r: r.fulfill(body='export const firebaseConfig={apiKey:"test",projectId:"test",appId:"test"};', content_type='text/javascript'))
        ctx.route('https://www.gstatic.com/**', lambda r: r.fulfill(body=fake, content_type='text/javascript'))
        ctx.route('https://*.workers.dev/**', lambda r: r.fulfill(body='{"ok":true,"key":"x"}', content_type='application/json'))
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(f'http://127.0.0.1:{srv.server_port}/')
        pg.wait_for_selector('.grp')
        pg.wait_for_timeout(600)
        count = lambda: pg.evaluate("[...__fs.docs.keys()].filter(x=>x.includes('/t_')).length")
        assert count() == 0, 'Regression expectation changed: initial snapshot now creates tasks'
        # Same server snapshot again after live status: callback now runs daily().
        pg.evaluate("() => { for(const l of __fs.listeners) l.next({forEach:f=>[...__fs.docs].filter(([k])=>k.startsWith(l.path+'/')).forEach(([k,d])=>f({id:k.split('/').pop(),data:()=>d})),metadata:{fromCache:false,hasPendingWrites:false}}); }")
        pg.wait_for_function("[...__fs.docs.keys()].filter(x=>x.includes('/t_')).length===2")
        assert not errors, errors
        print('CONFIRMED fake server-first schedule: first snapshot 0 tasks; second identical snapshot 2 tasks')
        browser.close()
finally:
    srv.shutdown()
