import os as _os
HERE=_os.path.dirname(_os.path.abspath(__file__))
APP=_os.path.join(HERE,"..","dist","app")
import subprocess, time, sys, json
from playwright.sync_api import sync_playwright
OUT=_os.path.join(HERE,"out")+"/"
srv=subprocess.Popen([sys.executable,"-m","http.server","8776"],cwd=APP,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
MOCK="""const m=TodoApp.memoryStore();let cb;window.__m=m;
const s={kind:'pwa',email:'me@example.com',
start(c){cb=c;c.onStatus('signedout');},set:m.set,update:m.update,remove:m.remove,saveCats:m.saveCats,importAll:m.importAll,
signIn(e,p){return Promise.resolve(m.start({onData:d=>{window.__d=d;cb.onData(d);},onStatus:x=>cb.onStatus(x==='local'?'live':x),onError:cb.onError}));},
signOut(){cb.onStatus('signedout');return Promise.resolve();},
push:{state:async()=>'on',enable:async()=>{},disable:async()=>{},test:async()=>({sent:1}),schedule(){},refresh(){}}};
TodoApp.boot(s);"""
errs=[]
def run(w,h,touch,tag):
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":w,"height":h},has_touch=touch); pg=ctx.new_page()
    pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m:m.type=="error" and errs.append(m.text))
    pg.route("**/app.js",lambda r:r.fulfill(body=MOCK,content_type="text/javascript"))
    pg.goto("http://localhost:8776/"); pg.fill("#l-email","a@b.c"); pg.fill("#l-pw","x"); pg.click("#l-btn"); pg.wait_for_selector(".grp"); pg.wait_for_timeout(300)
    today=pg.evaluate("(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})()")
    print(tag,"today",today)
    pg.click("[data-act=add][data-cat=k2]"); pg.keyboard.type("영어 수업"); pg.keyboard.press("Enter"); pg.keyboard.press("Escape")
    pg.click("text=영어 수업"); pg.wait_for_timeout(200)
    pg.fill("#e-time","10:00"); pg.wait_for_timeout(100); pg.click(".remind [data-m='10']"); pg.wait_for_timeout(100)
    pg.fill("#s-new","교재 챙기기"); pg.keyboard.press("Enter"); pg.wait_for_timeout(100)
    print("repbtn:",pg.inner_text(".repbtn"))
    pg.click("[data-act=tplfrom]"); pg.wait_for_timeout(200)
    print("tpl sheet days pressed:",[x.inner_text() for x in pg.locator(".days .pill[aria-pressed=true]").all()], "| time:",pg.input_value("#e-time"), "| subs:",pg.locator(".subs li:not(.new)").count(), "| checkbox in subs:",pg.locator(".subs input[type=checkbox]").count())
    pg.click(".days [data-d='1']"); pg.click(".days [data-d='3']"); pg.wait_for_timeout(100)
    print("label:",pg.inner_text(".field .lbl >> nth=1"))
    pg.screenshot(path=OUT+tag+"-tpl.png")
    pg.click(":is([data-act=save],[data-act=close])"); pg.wait_for_timeout(400)
    print("toast:",pg.inner_text("#toastMsg"))
    d=pg.evaluate("({t:[...__d.tasks.values()],r:[...__d.tpls.values()]})")
    print("tpls:",[(r["title"],r["days"],r["time"],r["remind"],len(r["subtasks"])) for r in d["r"]], "| task linked:",d["t"][0].get("tpl")==d["r"][0]["id"], "| task kept time/remind/sub:",d["t"][0]["time"],d["t"][0]["remind"],len(d["t"][0]["subtasks"]))
    print("ghost today (linked so none):",pg.locator(".task.ghost").count())
    # go to a future day with the weekday
    import datetime
    td=datetime.date.fromisoformat(today); w=[1,3,td.isoweekday()%7]
    nxt=next(td+datetime.timedelta(days=i) for i in range(1,8) if ((td+datetime.timedelta(days=i)).isoweekday()%7) in w)
    k=nxt.isoformat()
    pg.evaluate(f"history.replaceState(null,'','#d={k}')"); 
    pg.evaluate("navigator.serviceWorker||0")
    # use internal openDate via SW message path not available; click calendar
    if pg.locator(f"[data-k='{k}']").count()==0: pg.click("[data-act=nav][data-d='1']"); pg.wait_for_timeout(300)
    pg.click(f"[data-k='{k}']"); pg.wait_for_timeout(300)
    print("day",k,"ghosts:",pg.locator(".task.ghost").count(),"| prog:",pg.inner_text(".prog"),"| grp cnt:",repr(pg.inner_text("#g-k2 .cnt")))
    print("ghost meta:",pg.inner_text(".task.ghost .meta").replace("\n"," | "))
    pg.screenshot(path=OUT+tag+"-ghost.png")
    pg.click(".task.ghost .gadd"); pg.wait_for_timeout(400)
    print("after +: ghosts",pg.locator(".task.ghost").count(),"real",pg.locator(".task:not(.ghost)").count(),"| prog:",pg.inner_text(".prog"))
    d=pg.evaluate("[...__d.tasks.values()].filter(t=>t.date==='"+k+"')")
    print("added:",[(t["title"],t["time"],t["remind"],len(t["subtasks"]),t["tpl"][:2]) for t in d])
    pg.screenshot(path=OUT+tag+"-added.png")
    # undo by deleting added -> ghost returns
    pg.click(".task:not(.ghost) .ttl"); pg.wait_for_timeout(200); print("added task repbtn:",pg.inner_text(".repbtn"))
    pg.click("[data-act=del]"); pg.wait_for_timeout(400); print("after delete ghost back:",pg.locator(".task.ghost").count())
    # menu list & edit
    pg.click("[data-act=menu]"); pg.wait_for_timeout(200); pg.click("[data-act=tpls]"); pg.wait_for_timeout(200)
    print("list:",pg.inner_text(".tpllist").replace("\n"," | "))
    pg.screenshot(path=OUT+tag+"-list.png")
    pg.click(".tplrow"); pg.wait_for_timeout(200)
    for dd in ["1","3",str(td.isoweekday()%7)]:
        if pg.get_attribute(f".days [data-d='{dd}']","aria-pressed")=="true": pg.click(f".days [data-d='{dd}']")
    pg.click(".days [data-d='0']" if nxt.isoweekday()%7!=0 else ".days [data-d='2']"); pg.wait_for_timeout(100)
    pg.click(":is([data-act=save],[data-act=close])"); pg.wait_for_timeout(400)
    print("after day change ghosts on",k,":",pg.locator(".task.ghost").count())
    # new template from menu
    pg.click("[data-act=menu]"); pg.wait_for_timeout(200); pg.click("[data-act=tpls]"); pg.wait_for_timeout(200); pg.click("[data-act=tplnew]"); pg.wait_for_timeout(200)
    print("focused title:",pg.evaluate("document.activeElement.id"))
    pg.keyboard.type("운동"); print("new tpl default day:",[x.inner_text() for x in pg.locator(".days .pill[aria-pressed=true]").all()]); pg.click(":is([data-act=save],[data-act=close])"); pg.wait_for_timeout(400)
    print("ghosts now:",[x.inner_text().split("\n")[0] for x in pg.locator(".task.ghost").all()])
    # cancel new template
    pg.click("[data-act=menu]"); pg.wait_for_timeout(200); pg.click("[data-act=tpls]"); pg.wait_for_timeout(200); pg.click("[data-act=tplnew]"); pg.wait_for_timeout(200)
    pg.keyboard.type("취소될 것"); pg.click("[data-act=tplcancel]"); pg.wait_for_timeout(300)
    print("tpl count after cancel:",pg.evaluate("__d.tpls.size"))
    # delete + undo via ghost title
    pg.click(".task.ghost .ttl >> nth=0"); pg.wait_for_timeout(200); pg.click("[data-act=itpl]"); pg.wait_for_timeout(200); pg.click("[data-act=tpldel]"); pg.wait_for_timeout(300)
    print("after del:",pg.evaluate("__d.tpls.size")); pg.click("#toastAct"); pg.wait_for_timeout(300); print("after undo:",pg.evaluate("__d.tpls.size"))
    # export/import roundtrip
    exp=pg.evaluate("(()=>{document.querySelector('[data-act=menu]').click();return 1})()"); pg.wait_for_timeout(200); pg.click("[data-act=export]"); pg.wait_for_timeout(200)
    j=json.loads(pg.input_value("#x-out")); print("export tpls:",len(j["tpls"]), "| task remind kept:",[t.get("remind") for t in j["tasks"]])
    pg.go_back(); pg.wait_for_timeout(300)
    pg.evaluate("__m.remove && [...__d.tpls.keys()].forEach(k=>__m.remove(k))"); pg.wait_for_timeout(200)
    pg.click("[data-act=menu]"); pg.wait_for_timeout(200); pg.click("[data-act=import]"); pg.wait_for_timeout(200)
    pg.fill("#i-in",json.dumps(j)); pg.click("[data-act=importcheck]"); pg.wait_for_timeout(200); print("import sum:",pg.inner_text("#i-sum"))
    pg.click("[data-act=importgo]"); pg.wait_for_timeout(300); print("tpls after import:",pg.evaluate("__d.tpls.size"))
    b.close()
run(390,844,True,"m")
run(1280,860,False,"pc")
srv.terminate(); print("errors:",errs)
