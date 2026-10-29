# 고정 일정: 달력 띠, 시간표 칸, 정보 창, 이날만 쉼, 빈칸에서 추가(할 일·고정 일정), 목록, 숨기기
import json, datetime
from playwright.sync_api import sync_playwright
from ttb import check, serve, done, OUT
srv=serve(8784)
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
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":w,"height":h},has_touch=w<600,device_scale_factor=2 if w<600 else 1); ctx.add_init_script("try{localStorage.setItem('todo.tt7','1')}catch(e){}"); pg=ctx.new_page()
    pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m:m.type=="error" and errs.append(m.text))
    pg.route("**/app.js",lambda r:r.fulfill(body=MOCK,content_type="text/javascript"))
    pg.goto("http://localhost:8784/"); pg.wait_for_selector(".grp"); pg.wait_for_timeout(300)
    strip=[x.inner_text().replace("\n"," ") for x in pg.locator(".evrow").all()]
    exp=[e for e in [("영어회화",{1,3}),("자료구조",{2,4,5})] if T.isoweekday()%7 in e[1]]
    check(len(strip)==len(exp) and all(any(n in x for x in strip) for n,_ in exp), "달력 일정 띠: 오늘 요일 것만 "+str(strip))
    pg.screenshot(path=OUT+tag+"4-day.png",full_page=True)
    pg.click("[data-act=view][data-v=week]"); pg.wait_for_timeout(300)
    check(pg.locator(".blk.ev").count()>=3 and "고정 일정 관리" in pg.inner_text(".ttfoot"), "시간표 고정 일정 칸·관리 버튼")
    pg.screenshot(path=OUT+tag+"4-week.png",full_page=True)
    pg.click(".blk.ev >> nth=0"); pg.wait_for_timeout(300)
    inf=pg.inner_text("#sheet"); check("고정 일정" in inf and "이날만 바꾸기" in inf and "이날만 쉼" in inf, "고정 일정 정보 창")
    pg.screenshot(path=OUT+tag+"4-einfo.png")
    pg.click("[data-act=eskipday]"); pg.wait_for_timeout(300); check(pg.inner_text("#sheet [data-act=eskipday]")=="쉼 취소", "이날만 쉼 → 쉼 취소")
    pg.go_back(); pg.wait_for_timeout(300); check(pg.locator(".blk.ev.off").count()==1, "쉬는 칸 흐리게")
    # slot → 고정 일정
    col=pg.locator(".ttcol >> nth=4"); bb=col.bounding_box()
    pg.mouse.click(bb["x"]+bb["width"]/2, bb["y"]+bb["height"]*0.8); pg.wait_for_timeout(300)
    check("무엇을 넣을까요?" in pg.inner_text("#sheet"), "빈칸 → 무엇을 넣을지")
    pg.click("[data-act=slotev]"); pg.wait_for_timeout(300)
    dd=[x.inner_text() for x in pg.locator(".days .pill[aria-pressed=true]").all()]; t0,t1=pg.input_value("#s-time-0"),pg.input_value("#s-end-0")
    check(len(dd)==1 and t0 and t1 and t0<t1, "빈칸에서 고정 일정: 그 요일·시간, 끝 +1시간 "+str((dd,t0,t1)))
    pg.keyboard.type("동아리"); pg.fill("#e-place","학생회관"); pg.click("[data-act=evcolor][data-color=c3]")
    pg.screenshot(path=OUT+tag+"4-evedit.png")
    pg.click(":is([data-act=save],[data-act=close])"); pg.wait_for_timeout(400); check(pg.inner_text("#toastMsg")=="고정 일정을 추가했어요", "고정 일정 추가 알림")
    # slot → 할 일
    col=pg.locator(".ttcol >> nth=5"); bb=col.bounding_box()
    pg.mouse.click(bb["x"]+bb["width"]/2, bb["y"]+bb["height"]*0.3); pg.wait_for_timeout(300)
    pg.click("[data-act=slottask]"); pg.wait_for_timeout(300); pg.keyboard.type("슬롯 할 일"); pg.click(":is([data-act=save],[data-act=close])"); pg.wait_for_timeout(400)
    t=[x for x in pg.evaluate("[...__d.tasks.values()]") if x["title"]=="슬롯 할 일"]; check(len(t)==1 and t[0]["time"] and t[0]["end"], "빈칸에서 할 일: 그 날·시간, 끝 +1시간")
    # menu list + archive
    pg.click("[data-act=menu]"); pg.wait_for_timeout(200); check("고정 일정" in pg.inner_text(".menu"), "설정 메뉴")
    pg.click(".menu [data-act=evs]"); pg.wait_for_timeout(200); check("숨김·종료 1" in pg.inner_text("#sheet") and "끝난 특강" in pg.inner_text("#sheet"), "고정 일정 목록: 끝난 것은 숨김·종료로")
    pg.screenshot(path=OUT+tag+"4-evs.png")
    pg.click(".tplrow >> nth=0"); pg.wait_for_timeout(200); pg.click("[data-act=evarc]"); pg.wait_for_timeout(300)
    check(len(pg.evaluate("[...__d.events.values()].filter(e=>e.archived).map(e=>e.title)"))==1, "숨기기")
    b.close()
go(390,844,"m"); go(1280,900,"pc")
srv.terminate(); done(errs)
