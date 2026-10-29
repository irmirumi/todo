# 알림 화면: 깊은 링크, 알림 고르기 켜짐/꺼짐, 꺼진 기기 안내, 켜기·테스트, 목록 맞추기
import json
from playwright.sync_api import sync_playwright
from ttb import check, serve, done, OUT
srv=serve(8777)
MOCK="""const m=TodoApp.memoryStore();let cb;window.__push={st:'off',sched:0};
const s={kind:'pwa',email:'me@example.com',
start(c){cb=c;c.onStatus('signedout');},set:m.set,update:m.update,remove:m.remove,saveCats:m.saveCats,importAll:m.importAll,
signIn(e,p){return Promise.resolve(m.start({onData:d=>{cb.onData(d);s.push.schedule();},onStatus:x=>cb.onStatus(x==='local'?'live':x),onError:cb.onError}));},
signOut(){cb.onStatus('signedout');return Promise.resolve();},
push:{state:async()=>__push.st,enable:async()=>{__push.st='on'},disable:async()=>{__push.st='off'},test:async()=>({sent:1}),schedule(){__push.sched++},refresh(){}}};
TodoApp.boot(s);"""
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":390,"height":844},has_touch=True); pg=ctx.new_page()
    pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m:m.type=="error" and errs.append(m.text))
    pg.route("**/app.js",lambda r:r.fulfill(body=MOCK,content_type="text/javascript"))
    pg.goto("http://localhost:8777/#d=2026-10-09"); pg.fill("#l-email","a@b.c"); pg.fill("#l-pw","x"); pg.click("#l-btn"); pg.wait_for_selector(".grp"); pg.wait_for_timeout(200)
    check(pg.inner_text(".dayhead h1")=="10월 9일" and pg.evaluate("location.hash")=="", "알림을 누르면 그 날짜로(#d=), 주소는 지움")
    pg.click("[data-act=today]"); pg.wait_for_timeout(250)
    pg.click("[data-act=add][data-cat=k1]"); pg.keyboard.type("병원 예약"); pg.keyboard.press("Enter"); pg.keyboard.type("시간 없는 일"); pg.keyboard.press("Enter"); pg.keyboard.press("Escape")
    pg.click("text=시간 없는 일"); pg.wait_for_timeout(200); pg.click(".sheet [data-act=emore]"); pg.wait_for_timeout(100)
    check(pg.locator(".remind .pill").count()==7 and pg.locator(".remind .pill:disabled").count()==7, "시간이 없으면 알림 고르기 꺼짐")
    pg.go_back(); pg.wait_for_timeout(300)
    pg.click("text=병원 예약"); pg.wait_for_timeout(200); pg.click(".sheet [data-act=emore]"); pg.wait_for_timeout(100)
    pg.fill("#e-time","15:00"); pg.wait_for_timeout(150)
    check(pg.locator(".remind .pill:disabled").count()==0, "시간을 넣으면 알림 고르기 켜짐")
    pg.click(".remind [data-m='10']"); pg.wait_for_timeout(200)
    check("알림이 꺼져 있어요" in pg.inner_text("#toast"), "이 기기 알림이 꺼져 있으면 알려 줌")
    pg.screenshot(path=OUT+"r-edit.png")
    pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(350)
    check("10분 전" in pg.inner_text("#main"), "목록에 알림 표시")
    pg.click("[data-act=menu]"); pg.wait_for_timeout(150)
    check(pg.inner_text("#m-notify")=="이 기기에서 꺼짐", "설정 메뉴에 알림 상태")
    pg.click("[data-act=notify]"); pg.wait_for_timeout(150)
    pg.click("[data-act=pushon]"); pg.wait_for_timeout(200)
    check(pg.locator("[data-act=pushtest]").count()==1 and "켜져 있어요" in pg.inner_text(".sheet p"), "알림 켜기 → 테스트 버튼")
    pg.click("[data-act=pushtest]"); pg.wait_for_timeout(150); check("테스트 알림을 보냈어요" in pg.inner_text("#toast"), "테스트 알림")
    pg.screenshot(path=OUT+"r-notify.png")
    check(pg.evaluate("__push.sched")>=3, "데이터가 바뀔 때마다 알림 목록을 맞춤")
    b.close()
srv.terminate(); done(errs)
