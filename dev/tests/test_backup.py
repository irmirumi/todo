"""백업 확인과 실제 복원이 같은 내용을 사용하며 부분 복원을 성공으로 숨기지 않는다."""
import json, os, subprocess, sys
from playwright.sync_api import sync_playwright, expect
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, '..', 'dist', 'app')
MOCK = """const m=TodoApp.memoryStore(); window.__calls=[]; window.__hold=false;
const s={...m,importAll(d){__calls.push(d);if(__hold)return new Promise((resolve,reject)=>{window.__reject=reject;});return m.importAll(d);}};
TodoApp.boot(s);"""
n = 0
def check(cond, msg):
    global n
    assert cond, msg
    n += 1
    print('ok', msg)

srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8792', '--bind', '127.0.0.1'], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for width in (390, 1280):
            ctx = b.new_context(viewport={'width': width, 'height': 900}, reduced_motion='reduce')
            pg = ctx.new_page()
            errors = []
            pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.route('**/app.js', lambda r: r.fulfill(body=MOCK, content_type='text/javascript'))
            # Wait for HTTP readiness rather than a fixed startup sleep.
            from urllib.request import urlopen
            import time
            for attempt in range(50):
                try:
                    urlopen('http://127.0.0.1:8792/').close()
                    break
                except OSError:
                    time.sleep(.1)
            pg.goto('http://127.0.0.1:8792/')
            pg.wait_for_selector('.grp')
            def open_import():
                pg.click('[data-act=menu]')
                pg.click('[data-act=import]')
            open_import()
            too_many = {'tasks': [], 'tpls': [{'id': 'r_'+str(i), 'title': str(i), 'days': [1]} for i in range(201)]}
            pg.fill('#i-in', json.dumps(too_many))
            pg.click('[data-act=importcheck]')
            check(pg.locator('[data-act=importgo]').count() == 0 and '한도' in pg.inner_text('#i-err'), '201개 반복 할 일을 조용히 200개로 자르지 않음')
            cases = [
                {'tasks': [], 'cats': [{'id': 'k'+str(i)} for i in range(41)]},
                {'tasks': [], 'events': [{'id': 'e_'+str(i)} for i in range(201)]},
                {'tasks': [{'id': 't_a', 'subtasks': [{'t': str(i)} for i in range(101)]}]},
                {'tasks': [], 'events': [{'id': 'e_a', 'slots': [{}]*15}]},
                {'tasks': [], 'cats': [{'id': 'k1', 'subs': [{'id': 's'+str(i)} for i in range(61)]}]},
                {'tasks': [], 'events': [{'id': 'e_a', 'skips': ['2026-01-01']*5001}]},
                {'tasks': [], 'events': [{'id': 'e_a', 'ovr': {str(i): {'place': 'x'} for i in range(5001)}}]},
            ]
            for data in cases:
                pg.fill('#i-in', json.dumps(data)); pg.click('[data-act=importcheck]')
                check(pg.locator('[data-act=importgo]').count() == 0 and '한도' in pg.inner_text('#i-err'), '중첩 목록/고정 일정 한도 초과 차단')
            original = json.dumps({'tasks': [{'id': 't_old', 'title': '이전 백업'}]})
            pg.fill('#i-in', original); pg.click('[data-act=importcheck]')
            check(pg.input_value('#i-in') == original, '확인 후에도 백업 텍스트를 보존')
            pg.fill('#i-in', '{')
            check(pg.locator('[data-act=importgo]').count() == 0 and pg.locator('#i-sum').count() == 0, '수정하면 이전 확인 결과 무효화')
            pg.click('[data-act=importcheck]')
            check(pg.inner_text('#i-err') != '' and pg.evaluate('__calls.length') == 0, '깨진 새 백업으로 이전 백업을 복원하지 않음')
            replacement = {'tasks': [{'id': 't_new', 'title': '새 백업'}], 'tpls': [{'id': 'r_'+str(i), 'title': str(i), 'days': [1]} for i in range(200)]}
            pg.fill('#i-in', json.dumps(replacement)); pg.click('[data-act=importcheck]')
            pg.screenshot(path=os.path.join(HERE, 'out', f'backup-{width}.png'), full_page=True)
            pg.evaluate('__hold=true')
            pg.click('[data-act=importgo]')
            check(pg.is_disabled('#i-in') and pg.is_disabled('[data-act=importgo]'), '복원 진행 중 텍스트 변경·중복 실행 방지')
            pg.evaluate("__reject({code:'permission-denied'})")
            expect(pg.locator('#i-in')).to_be_enabled()
            expect(pg.locator('[data-act=importgo]')).to_be_enabled()
            check(pg.locator('#i-sum').count() == 1, '실패하면 확인한 백업을 보존하고 재시도 가능')
            pg.evaluate('__hold=false;__calls=[]')
            pg.click('[data-act=importgo]')
            expect(pg.locator('#dlg')).not_to_be_visible()
            calls = pg.evaluate('__calls')
            check(len(calls) == 1 and calls[0]['tasks'][0]['id'] == 't_new' and len(calls[0]['tpls']) == 200, '다시 확인한 백업 전체만 한 번 복원 (200개 경계)')
            check(not errors, '브라우저 오류 없음')
            ctx.close()
        b.close()
finally:
    srv.terminate()
    srv.wait(timeout=5)
print('checks:', n)
