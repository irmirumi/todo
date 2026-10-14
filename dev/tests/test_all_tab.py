import os as _os
HERE=_os.path.dirname(_os.path.abspath(__file__))
APP=_os.path.join(HERE,"..","dist","app")
import subprocess, time, sys, json, datetime
from playwright.sync_api import sync_playwright
OUT=_os.path.join(HERE,"out")+"/"
srv=subprocess.Popen([sys.executable,"-m","http.server","8782"],cwd=APP,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
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
 "tpls":[{"id":"r_1","title":"영어 수업","cat":"k2","sub":"b1","time":"09:00","end":"10:15","days":[1,3,0],"subtasks":[{"id":"s1","t":"교재"}]},{"id":"r_2","title":"끝난 특강","cat":"k2","time":"13:00","days":[2],"until":D(-1),"subtasks":[]}]}
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
    pg.goto("http://localhost:8782/"); pg.wait_for_selector(".grp"); pg.wait_for_timeout(400)
    print(tag,"tabs:",pg.inner_text(".seg").replace("\n"," "))
    pg.screenshot(path=OUT+tag+"2-day.png",full_page=True)
    pg.click("[data-act=view][data-v=all]"); pg.wait_for_timeout(300)
    print(tag,"past collapsed:",pg.inner_text(".pastbox").replace("\n"," "),"| first sec:",pg.inner_text(".dsec .ghead >> nth=0").replace("\n"," "))
    pg.screenshot(path=OUT+tag+"2-all.png",full_page=True)
    pg.click("[data-act=showpast]"); pg.wait_for_timeout(250)
    print(tag,"past open rows:",[x.inner_text() for x in pg.locator(".pastbox .task .t").all()])
    pg.screenshot(path=OUT+tag+"2-all-open.png",full_page=True)
    pg.click(".pastbox .skipbtn >> nth=0"); pg.click("[data-act=laterskip]"); pg.wait_for_timeout(300)  # 2.1.0~: 언제 할지 묻는 시트 → 안 하고 끝내기
    print(tag,"after skip past:",pg.locator(".pastbox .task").count(),"| toast:",pg.inner_text("#toastMsg"),"| donebox:",pg.inner_text(".donebox"))
    # check alignment of 지남? now headings: compare baselines of h3 and dw in first dsec
    print(tag,"baseline diff:",pg.evaluate("(()=>{const h=document.querySelector('.dsec .dlink h3'),d=document.querySelector('.dsec .dlink .rel')||document.querySelector('.dsec .dlink .dw');const a=h.getBoundingClientRect(),c=d.getBoundingClientRect();return Math.round(a.bottom-c.bottom)})()"))
    pg.click("[data-act=view][data-v=day]"); pg.wait_for_timeout(200)
    pg.click("[data-act=pick][data-k='%s']"%D(-1)); pg.wait_for_timeout(250)
    print(tag,"day of skipped: prog",pg.inner_text(".prog"),"| skipped rows:",pg.locator(".task.skipped").count())
    pg.screenshot(path=OUT+tag+"2-skipday.png",full_page=True)
    pg.click(".task.skipped .chk"); pg.wait_for_timeout(250); print(tag,"unskip:",pg.locator(".task.skipped").count())
    pg.click("[data-act=view][data-v=week]"); pg.wait_for_timeout(300)
    print(tag,"untimed strip:",pg.locator(".uchip").count(),[x.inner_text() for x in pg.locator(".uchip").all()],"| ghost:",pg.locator(".blk.ghost").count())
    pg.screenshot(path=OUT+tag+"2-week.png",full_page=True)
    pg.click(".blk:not(.ghost):not(.grpb) >> nth=0"); pg.wait_for_timeout(300)
    print(tag,"info:",pg.inner_text("#sheet").replace("\n"," | ")[:200])
    pg.screenshot(path=OUT+tag+"2-info.png")
    pg.click("#sheet [data-act=toggle]"); pg.wait_for_timeout(300); print(tag,"info after done:",pg.inner_text("#sheet .actions"))
    pg.click("[data-act=iedit]"); pg.wait_for_timeout(250); print(tag,"edit opened:",pg.locator("#e-title").count())
    pg.screenshot(path=OUT+tag+"2-edit.png")
    pg.click(":is([data-act=save],[data-act=close])"); pg.wait_for_timeout(300)
    if pg.locator(".blk.ghost").count():
        pg.click(".blk.ghost >> nth=0"); pg.wait_for_timeout(300); print(tag,"ghost info:",pg.inner_text("#sheet").replace("\n"," | ")[:160])
        pg.screenshot(path=OUT+tag+"2-ginfo.png")
        pg.click("[data-act=iadd]"); pg.wait_for_timeout(400); print(tag,"ghost add:",pg.inner_text("#toastMsg"),"| ghosts:",pg.locator(".blk.ghost").count())
    if pg.locator(".ucount").count():  # 폰(1.6.0~): 개수 칩 → 그날 캘린더
        pg.click(".ucount >> nth=0"); pg.wait_for_timeout(300); print(tag,"ucount → view:",pg.evaluate("document.body.dataset.view"))
        assert pg.evaluate("document.body.dataset.view") == "day"
    else:
        pg.click(".uchip >> nth=0"); pg.wait_for_timeout(300); print(tag,"uchip info:",pg.inner_text("#sheet h2"))
        pg.go_back(); pg.wait_for_timeout(300)
    print(tag,"scrollW:",pg.evaluate("document.documentElement.scrollWidth"))
    b.close()
go(390,844,"m"); go(1280,900,"pc")
srv.terminate(); print("errors:",errs)
