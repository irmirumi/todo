import os as _os, re as _re
HERE=_os.path.dirname(_os.path.abspath(__file__))
CACHE=_re.search(r'const CACHE = "([^"]+)"',open(_os.path.join(HERE,"..","src","pwa","sw.js")).read()).group(1)
APP=_os.path.join(HERE,"..","dist","app")
import subprocess, time, sys
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,"-m","http.server","8779"],cwd=APP,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":390,"height":844}); pg=ctx.new_page()
    pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.goto("http://localhost:8779/"); pg.wait_for_timeout(2500)
    print("status screen:",pg.inner_text("#main h1"))
    print("sw active:",pg.evaluate("navigator.serviceWorker.controller?1:(navigator.serviceWorker.ready.then(()=>1),0)"))
    pg.reload(); pg.wait_for_timeout(1000)
    keys=pg.evaluate("caches.keys()"); n=pg.evaluate("caches.open('"+CACHE+"').then(c=>c.keys()).then(k=>k.length)")
    print("caches:",keys,"entries:",n)
    srv.terminate(); time.sleep(.5)
    t0=time.time(); pg.reload(); pg.wait_for_selector("#main h1"); print("offline reload ok:",pg.inner_text("#main h1"),"in %.1fs"%(time.time()-t0))
    print("ui.js loaded offline:",pg.evaluate("!!window.TodoApp"))
    b.close()
print("errors:",errs)
