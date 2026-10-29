# 시간표 겹침: 폰 7일 보기에서 묶음 → 목록 → 정보, PC는 나란히
import json, datetime
from playwright.sync_api import sync_playwright
from ttb import check, serve, done, OUT
srv=serve(8783)
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
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":w,"height":h},has_touch=w<600,device_scale_factor=2 if w<600 else 1); ctx.add_init_script("try{localStorage.setItem('todo.tt7','1')}catch(e){}"); pg=ctx.new_page()
    pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m:m.type=="error" and errs.append(m.text))
    pg.route("**/app.js",lambda r:r.fulfill(body=MOCK,content_type="text/javascript"))
    pg.goto("http://localhost:8783/"); pg.wait_for_selector(".grp"); pg.wait_for_timeout(300)
    pg.click("[data-act=view][data-v=week]"); pg.wait_for_timeout(300)
    merged=pg.locator(".grpb").count()
    check(merged>=1 if w<600 else merged==0, "폰 7일 보기는 좁아서 겹친 것을 묶고, PC는 나란히")
    pg.screenshot(path=OUT+tag+"3-week.png",full_page=True)
    if pg.locator(".grpb").count():
        pg.click(".grpb >> nth=0"); pg.wait_for_timeout(300)
        check("겹친 일정" in pg.inner_text("#sheet h2"), "묶음 → 겹친 일정 목록")
        pg.screenshot(path=OUT+tag+"3-group.png")
        pg.click(".grow >> nth=1"); pg.wait_for_timeout(300); check(pg.inner_text("#sheet h2")!="", "목록에서 누르면 그 정보")
        pg.go_back(); pg.wait_for_timeout(300)
    b.close()
go(390,844,"m"); go(1280,900,"pc")
srv.terminate(); done(errs)
