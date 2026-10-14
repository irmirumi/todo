import os as _os
HERE=_os.path.dirname(_os.path.abspath(__file__))
APP=_os.path.join(HERE,"..","dist","app")
import subprocess, time, sys
from playwright.sync_api import sync_playwright
OUT=_os.path.join(HERE,"out")+"/"
srv=subprocess.Popen([sys.executable,"-m","http.server","8777"],cwd=APP,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
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
    print("deep link day:", pg.inner_text(".dayhead h1"), "| hash cleared:", pg.evaluate("location.hash")=="")
    pg.click("[data-act=today]"); pg.wait_for_timeout(250)
    pg.click("[data-act=add][data-cat=k1]"); pg.keyboard.type("병원 예약"); pg.keyboard.press("Enter"); pg.keyboard.type("시간 없는 일"); pg.keyboard.press("Enter"); pg.keyboard.press("Escape")
    pg.click("text=시간 없는 일"); pg.wait_for_timeout(200)
    print("no time → pills disabled:", pg.locator(".remind .pill:disabled").count(), "/", pg.locator(".remind .pill").count())
    pg.go_back(); pg.wait_for_timeout(300)
    pg.click("text=병원 예약"); pg.wait_for_timeout(200)
    pg.fill("#e-time","15:00"); pg.wait_for_timeout(150)
    print("with time → enabled:", pg.locator(".remind .pill:disabled").count()==0)
    pg.click(".remind [data-m='10']"); pg.wait_for_timeout(200)
    print("toast (push off):", pg.inner_text("#toast"))
    pg.screenshot(path=OUT+"r-edit.png")
    pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(350)
    print("row meta:", pg.locator("#main .meta").first.inner_text().replace("\n"," | "))
    pg.click("[data-act=menu]"); pg.wait_for_timeout(150)
    print("menu notify:", pg.inner_text("#m-notify"))
    pg.click("[data-act=notify]"); pg.wait_for_timeout(150)
    pg.click("[data-act=pushon]"); pg.wait_for_timeout(200)
    print("after enable:", pg.inner_text(".sheet p")[:20], "| test btn:", pg.locator("[data-act=pushtest]").count())
    pg.click("[data-act=pushtest]"); pg.wait_for_timeout(150); print("test toast:", pg.inner_text("#toast"))
    pg.screenshot(path=OUT+"r-notify.png")
    print("schedule calls:", pg.evaluate("__push.sched"))
    b.close()
srv.terminate(); print("errors:",errs)
