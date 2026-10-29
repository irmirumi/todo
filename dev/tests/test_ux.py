# 2.0.0 사용성: 오프라인 알림, 불러오는 중 알림, 캘린더 반복 할 일 → 정보 시트
import os, subprocess, sys, time
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "dist", "app")
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8787"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
# 'live'(로그인됨)처럼 보이게, 처음 1.5초는 'loading'
MOCK = """const m=TodoApp.memoryStore();
m.importAll({cats:null,events:[],tasks:[],tpls:[{id:'r_1',title:'분리수거',days:[0,1,2,3,4,5,6],cat:'k1',subtasks:[],auto:false}]});
TodoApp.boot({kind:'pwa',start(c){c.onStatus('loading');setTimeout(()=>m.start({onData:c.onData,onStatus:x=>c.onStatus(x==='local'?'live':x),onError:c.onError}),1500);},set:m.set,update:m.update,remove:m.remove,saveCats:m.saveCats,importAll:m.importAll});"""
n = 0
def check(cond, msg):
    global n; n += 1
    assert cond, msg
    print("ok", msg)
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("**/app.js", lambda r: r.fulfill(body=MOCK, content_type="text/javascript"))
    pg.goto("http://localhost:8787/"); pg.wait_for_selector(".grp")
    pg.click("[data-act=add] >> nth=0"); pg.wait_for_timeout(150)
    check("불러오는 중" in pg.inner_text("#toastMsg") and pg.is_visible("#toast"), "불러오는 중에 누르면 알려 줌")
    pg.wait_for_selector(".task.ghost"); pg.wait_for_timeout(300)
    check(pg.is_hidden("#banner"), "연결돼 있으면 알림 줄 없음")
    ctx.set_offline(True); pg.wait_for_timeout(300)
    check(pg.is_visible("#banner") and "오프라인" in pg.inner_text("#banner"), "오프라인이면 알림 줄")
    ctx.set_offline(False); pg.wait_for_timeout(300)
    check(pg.is_hidden("#banner") and "다시 연결" in pg.inner_text("#toastMsg"), "돌아오면 알림 줄 사라지고 알려 줌")
    pg.click(".task.ghost .ttl"); pg.wait_for_timeout(250)
    check(pg.locator("[data-act=iadd]").count() == 1 and pg.locator("[data-act=itpl]").count() == 1, "캘린더 반복 할 일 줄 → 정보 시트(이 날 추가·편집)")
    pg.click("[data-act=iadd]"); pg.wait_for_timeout(300)
    check(pg.locator(".task:not(.ghost):has-text('분리수거')").count() == 1, "정보 시트에서 이 날 할 일로 추가")
    ctx.close(); b.close()
srv.kill()
print("checks:", n, "errors:", errs)
assert not errs, errs
