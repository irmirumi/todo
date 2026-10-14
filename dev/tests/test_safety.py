import os as _os
HERE=_os.path.dirname(_os.path.abspath(__file__))
APP=_os.path.join(HERE,"..","dist","app")
import subprocess, time, sys, json
from playwright.sync_api import sync_playwright
OUT=_os.path.join(HERE,"out")+"/"
srv=subprocess.Popen([sys.executable,"-m","http.server","8778"],cwd=APP,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
MOCK="""const m=TodoApp.memoryStore();let cb;window.__m=m;window.__xss=0;
const s={kind:'pwa',email:'me@example.com',
start(c){cb=c;c.onStatus('loading');window.__go=()=>m.start({onData:d=>{window.__d=d;cb.onData(d);},onStatus:x=>cb.onStatus(x==='local'?'live':x),onError:cb.onError});},
set:m.set,update:m.update,remove:m.remove,saveCats:m.saveCats,importAll:m.importAll,
push:{state:async()=>'off',enable:async()=>{},disable:async()=>{},test:async()=>({sent:1}),schedule(){},refresh(){}}};
TodoApp.boot(s);"""
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":390,"height":844},has_touch=True); pg=ctx.new_page()
    pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m:m.type=="error" and errs.append(m.text))
    pg.route("**/app.js",lambda r:r.fulfill(body=MOCK,content_type="text/javascript"))
    pg.goto("http://localhost:8778/"); pg.wait_for_selector(".grp")
    pg.click("[data-act=add][data-cat=k1]"); pg.wait_for_timeout(150)
    print("loading: add blocked:",pg.locator(".addrow").count()==0)
    pg.click("[data-act=menu]"); pg.wait_for_timeout(150); print("loading: menu blocked:",not pg.evaluate("document.getElementById('dlg').open"))
    pg.evaluate("__go()"); pg.wait_for_timeout(300)
    pg.click("[data-act=add][data-cat=k1]"); pg.keyboard.type("초안 유지"); pg.wait_for_timeout(100)
    pg.evaluate("TodoApp && document.dispatchEvent(new Event('visibilitychange'))")
    print("draft input value kept:",pg.input_value("#add-k1"))
    pg.keyboard.press("Enter"); pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    # toast above open sheet + clickable
    pg.click("text=초안 유지"); pg.wait_for_timeout(200)
    pg.click(".remind [data-m='10']") if pg.locator(".remind .pill:not(:disabled)").count() else None
    pg.fill("#e-time","09:00"); pg.wait_for_timeout(100); pg.click(".remind [data-m='10']"); pg.wait_for_timeout(250)
    box=pg.locator("#toast").bounding_box()
    top=pg.evaluate(f"(()=>{{const e=document.elementFromPoint({box['x']+box['width']-20},{box['y']+box['height']/2});return e&&(e.id||e.className)}})()")
    print("toast in dialog:",pg.evaluate("document.getElementById('toast').parentNode.id"),"| topmost at toast btn:",top)
    pg.screenshot(path=OUT+"toast-over-sheet.png")
    pg.click("#toastAct"); pg.wait_for_timeout(250); print("clicked 켜기 → sheet:",pg.inner_text("#sheet h2"))
    pg.go_back(); pg.wait_for_timeout(400)
    # delete → undo toast survives sheet close
    pg.click("text=초안 유지"); pg.wait_for_timeout(200); pg.click("[data-act=del]"); pg.wait_for_timeout(500)
    print("after delete toast visible:",pg.is_visible("#toast"),"| parent:",pg.evaluate("document.getElementById('toast').parentNode.tagName"))
    pg.click("#toastAct"); pg.wait_for_timeout(300); print("undo restored:",pg.locator("text=초안 유지").count())
    # XSS import
    evil={"tasks":[{"id":"t_x1","title":"악성","date":None,"cat":"k1","subtasks":[{"id":"\"><img src=x onerror=window.__xss=1>","t":"a"}]}]}
    pg.click("[data-act=menu]"); pg.wait_for_timeout(150); pg.click("[data-act=import]"); pg.wait_for_timeout(150)
    pg.fill("#i-in",json.dumps(evil)); pg.click("[data-act=importcheck]"); pg.click("[data-act=importgo]"); pg.wait_for_timeout(300)
    pg.click("[data-act=view][data-v=all]"); pg.wait_for_timeout(200); pg.click("text=악성"); pg.wait_for_timeout(300)
    print("xss fired:",pg.evaluate("window.__xss"),"| sub id:",pg.evaluate("[...__d.tasks.values()].find(t=>t.id==='t_x1').subtasks[0].id"))
    pg.go_back(); pg.wait_for_timeout(300)
    pg.click("[data-act=menu]"); pg.wait_for_timeout(150); print("version:",pg.inner_text(".ver"))
    b.close()
srv.terminate(); print("errors:",errs)
