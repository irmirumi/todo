# 2.2.0: 끝 시간 대신 '길이'로도 입력, 서로 맞춰짐
import os, subprocess, sys, time
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "dist", "app")
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8790"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
MOCK = """const m=TodoApp.memoryStore();
m.importAll({cats:null,tpls:[],events:[],tasks:[{id:'t_1',title:'회의',note:'',date:(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})(),time:null,end:null,remind:null,cat:'k1',sub:null,done:false,doneAt:null,createdAt:1,subtasks:[]}]});
TodoApp.boot({kind:'pwa',start(c){m.start({onData(d){window.__last=d;c.onData(d);},onStatus:x=>c.onStatus(x==='local'?'live':x),onError:c.onError});},set:m.set,update:m.update,remove:m.remove,saveCats:m.saveCats,importAll:m.importAll});"""
n = 0
def check(cond, msg):
    global n; n += 1
    assert cond, msg
    print("ok", msg)
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, opts in [("폰", dict(viewport={"width": 390, "height": 844}, has_touch=True)), ("PC", dict(viewport={"width": 1280, "height": 900}))]:
        ctx = b.new_context(**opts); pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.route("**/app.js", lambda r: r.fulfill(body=MOCK, content_type="text/javascript"))
        pg.goto("http://localhost:8790/"); pg.wait_for_selector(".grp")
        end = lambda: pg.input_value("#e-end")
        def setv(sel, v):
            pg.fill(sel, v); pg.dispatch_event(sel, "change"); pg.wait_for_timeout(80)
        if name == "폰":
            PD = lambda s: pg.evaluate("s=>TodoApp.parseDur(s)", s)
            for s, want in {"45분": 45, "1시간 반": 90, "2시간": 120, "1:30": 90, "1.5시간": 90, "90": 90, "2": 120, "1시간 20분": 80, "30분 동안": 30, "반": None, "0": None, "abc": None}.items():
                check(PD(s) == want, f"길이 해석 '{s}' → {PD(s)}")
        pg.click(".ttl:has-text('회의')")
        check(pg.locator(".durrow").count() == 0, f"{name}: 시작 시간 전엔 길이 줄 없음")
        setv("#e-time", "11:00")
        check(pg.locator(".durrow [data-act=edur]").count() == 5, f"{name}: 시작을 정하면 길이 줄")
        pg.click(".durrow [data-m='90']"); pg.wait_for_timeout(80)
        check(end() == "12:30" and pg.get_attribute(".durrow [data-m='90']", "aria-pressed") == "true", f"{name}: 1시간 반 → 끝 12:30")
        setv("#e-end", "13:00")
        check(pg.get_attribute(".durrow [data-m='120']", "aria-pressed") == "true", f"{name}: 끝을 고치면 길이가 따라옴(2시간 버튼)")
        setv("#e-end", "13:15")
        check(pg.locator(".durrow [aria-pressed=true]").count() == 0 and pg.input_value("#e-dur") == "2시간 15분", f"{name}: 버튼에 없는 길이는 직접 칸에(2시간 15분)")
        setv("#e-time", "12:00")
        check(end() == "14:15", f"{name}: 시작을 옮기면 길이를 지켜 끝도 옮김 → {end()}")
        setv("#e-dur", "45분")
        check(end() == "12:45", f"{name}: 길이 직접 '45분' → 12:45")
        setv("#e-time", "23:30"); pg.click(".durrow [data-m='60']"); pg.wait_for_timeout(80)
        check(end() == "00:30", f"{name}: 자정 넘김 23:30 + 1시간 → 00:30")
        pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(200)
        t = pg.evaluate("window.__last.tasks.get('t_1')")
        check(t["time"] == "23:30" and t["end"] == "00:30", f"{name}: 저장")
        # 고정 일정 시트에도
        pg.click("[data-act=menu]"); pg.click("#sheet [data-act=evs]"); pg.click("[data-act=evnew]")
        setv("#s-time-0", "09:00")
        check(pg.input_value("#s-end-0") == "10:00" and pg.input_value("#s-dur-0") == "60", f"{name}: 고정 일정도 길이(기본 1시간)")
        pg.select_option("#s-dur-0", "180"); pg.wait_for_timeout(80)
        check(pg.input_value("#s-end-0") == "12:00", f"{name}: 고정 일정 3시간 → 12:00")
        if name == "폰": pg.screenshot(path=os.path.join(HERE, "out", "dur-ev.png"))
        ctx.close()
    b.close()
srv.kill()
print("checks:", n, "errors:", errs)
assert not errs, errs
