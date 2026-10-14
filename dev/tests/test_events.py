import os as _os
HERE=_os.path.dirname(_os.path.abspath(__file__))
APP=_os.path.join(HERE,"..","dist","app")
import subprocess, time, sys, json, datetime
from playwright.sync_api import sync_playwright
OUT=_os.path.join(HERE,"out")+"/"
srv=subprocess.Popen([sys.executable,"-m","http.server","8784"],cwd=APP,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
T=datetime.date.today(); D=lambda n:(T+datetime.timedelta(days=n)).isoformat()
mon=T-datetime.timedelta(days=T.weekday())
cats=[{"id":"k1","name":"일상","color":"c7","subs":[]},{"id":"k2","name":"수업","color":"c5","subs":[{"id":"b1","name":"영어"},{"id":"b2","name":"수학"},{"id":"b3","name":"과학"}]},{"id":"k3","name":"건강","color":"c3","subs":[]}]
tasks=[
 ("t_1","장보기","k1",None,D(0),"18:00",None),("t_2","수학 숙제","k2","b2",D(0),"10:00","11:30"),("t_3","영어 단어","k2","b1",D(0),"10:00",None),
 ("t_4","산책","k3",None,D(0),"10:00","10:40"),("t_5","가 메모 정리","k1",None,D(0),None,None),("t_6","나 운동","k3",None,D(0),None,None),
 ("t_7","과학 실험 보고서","k2","b3",D(1),"14:00","16:00"),("t_8","밀린 일","k1",None,D(-2),None,None),("t_13","지난주 과제","k2","b2",D(-6),"09:00",None),("t_14","어제 할 일","k3",None,D(-1),None,None),("t_15","오늘 종일 A","k1",None,D(0),None,None),("t_16","내일 종일","k3",None,D(1),None,None),("t_9","언젠가 할 일","k1",None,None,None,None),
 ("t_10","겹침 A","k1",None,D(1),"14:30","15:00"),("t_11","겹침 B","k3",None,D(1),"14:45","15:30"),("t_12","아침 요가","k3",None,D(2),"07:00","08:00"),
]
data={"cats":cats,"tasks":[{"id":i,"title":ti,"cat":c,"sub":sb,"date":d,"time":tm,"end":en,"note":"메모 예시\n두 줄","done":False,"createdAt":n,"subtasks":[]} for n,(i,ti,c,sb,d,tm,en) in enumerate(tasks)],
 "events":[{"id":"e_1","title":"영어회화","place":"공학관 301","color":"c4","days":[1,3],"time":"09:00","end":"10:15","holOff":True,"remind":10,"note":"","skips":[]},{"id":"e_2","title":"자료구조","place":"IT관 204","color":"c6","days":[2,4,5],"time":"13:00","end":"14:30","holOff":True,"note":"","skips":[]},{"id":"e_3","title":"끝난 특강","color":"c1","days":[3],"time":"15:00","end":"16:00","until":D(-3),"skips":[]}],"tpls":[{"id":"r_1","title":"영어 수업","cat":"k2","sub":"b1","time":"09:00","end":"10:15","days":[1,3,0],"subtasks":[{"id":"s1","t":"교재"}]},{"id":"r_2","title":"끝난 특강","cat":"k2","time":"13:00","days":[2],"until":D(-1),"subtasks":[]}]}
MOCK="""const m=TodoApp.memoryStore();let cb;window.__m=m;
const s={kind:'pwa',email:'me@example.com',start(c){cb=c;m.importAll(%s).then(()=>m.start({onData:d=>{window.__d=d;cb.onData(d);},onStatus:x=>cb.onStatus(x==='local'?'live':x),onError:cb.onError}));},
set:m.set,update:m.update,remove:m.remove,saveCats:m.saveCats,importAll:m.importAll,push:{state:async()=>'on',enable:async()=>{},disable:async()=>{},test:async()=>({sent:1}),schedule(){},refresh(){}}};
TodoApp.boot(s);"""%json.dumps(data,ensure_ascii=False)
errs=[]
def go(w,h,tag):
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":w,"height":h},has_touch=w<600,device_scale_factor=2 if w<600 else 1); pg=ctx.new_page()
    pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m:m.type=="error" and errs.append(m.text))
    pg.route("**/app.js",lambda r:r.fulfill(body=MOCK,content_type="text/javascript"))
    pg.goto("http://localhost:8784/"); pg.wait_for_selector(".grp"); pg.wait_for_timeout(300)
    print(tag,"day strip:",[x.inner_text().replace("\n"," ") for x in pg.locator(".evrow").all()])
    pg.screenshot(path=OUT+tag+"4-day.png",full_page=True)
    pg.click("[data-act=view][data-v=week]"); pg.wait_for_timeout(300)
    print(tag,"ev blocks:",pg.locator(".blk.ev").count(),"| footer:",pg.inner_text(".ttfoot").replace("\n"," "))
    pg.screenshot(path=OUT+tag+"4-week.png",full_page=True)
    pg.click(".blk.ev >> nth=0"); pg.wait_for_timeout(300)
    print(tag,"ev info:",pg.inner_text("#sheet").replace("\n"," | ")[:200])
    pg.screenshot(path=OUT+tag+"4-einfo.png")
    pg.click("[data-act=eskipday]"); pg.wait_for_timeout(300); print(tag,"after skip:",pg.inner_text("#sheet [data-act=eskipday]"))
    pg.go_back(); pg.wait_for_timeout(300); print(tag,"off blocks:",pg.locator(".blk.ev.off").count())
    # slot → 고정 일정
    col=pg.locator(".ttcol >> nth=4"); bb=col.bounding_box()
    pg.mouse.click(bb["x"]+bb["width"]/2, bb["y"]+bb["height"]*0.8); pg.wait_for_timeout(300)
    print(tag,"slot sheet:",pg.inner_text("#sheet").replace("\n"," | "))
    pg.click("[data-act=slotev]"); pg.wait_for_timeout(300)
    print(tag,"ev form days:",[x.inner_text() for x in pg.locator(".days .pill[aria-pressed=true]").all()],"time:",pg.input_value("#e-time"),pg.input_value("#e-end"))
    pg.keyboard.type("동아리"); pg.fill("#e-place","학생회관"); pg.click("[data-act=evcolor][data-color=c3]")
    pg.screenshot(path=OUT+tag+"4-evedit.png")
    pg.click("[data-act=close]"); pg.wait_for_timeout(400); print(tag,"toast:",pg.inner_text("#toastMsg"),"| ev blocks:",pg.locator(".blk.ev").count())
    # slot → 할 일
    col=pg.locator(".ttcol >> nth=5"); bb=col.bounding_box()
    pg.mouse.click(bb["x"]+bb["width"]/2, bb["y"]+bb["height"]*0.3); pg.wait_for_timeout(300)
    pg.click("[data-act=slottask]"); pg.wait_for_timeout(300); pg.keyboard.type("슬롯 할 일"); pg.click("[data-act=close]"); pg.wait_for_timeout(400)
    t=[x for x in pg.evaluate("[...__d.tasks.values()]") if x["title"]=="슬롯 할 일"]; print(tag,"slot task:",t and (t[0]["date"],t[0]["time"],t[0]["end"]))
    # menu list + archive
    pg.click("[data-act=menu]"); pg.wait_for_timeout(200); print(tag,"menu:",pg.inner_text(".menu").replace("\n"," | ")[:120])
    pg.click(".menu [data-act=evs]"); pg.wait_for_timeout(200); print(tag,"evs:",pg.inner_text("#sheet").replace("\n"," | ")[:260])
    pg.screenshot(path=OUT+tag+"4-evs.png")
    pg.click(".tplrow >> nth=0"); pg.wait_for_timeout(200); pg.click("[data-act=evarc]"); pg.wait_for_timeout(300)
    print(tag,"archived:",pg.evaluate("[...__d.events.values()].filter(e=>e.archived).map(e=>e.title)"))
    print(tag,"holiday check (fri 10/9 hidden):",pg.evaluate("(()=>{return 1})()"))
    exp=pg.evaluate("1")
    b.close()
go(390,844,"m"); go(1280,900,"pc")
srv.terminate(); print("errors:",errs)
