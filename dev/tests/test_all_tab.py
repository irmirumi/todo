# 전체 탭: 밀린 할 일 접기·넘기기, 기록, 안 함인 날, 시간표 시간 미정 줄·정보 창, 개수 칩
import json, datetime
from playwright.sync_api import sync_playwright
from ttb import check, serve, done, OUT
srv=serve(8782)
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
    check(pg.inner_text(".seg").split()==["달력","시간표","전체"], "탭 이름")
    pg.screenshot(path=OUT+tag+"2-day.png",full_page=True)
    pg.click("[data-act=view][data-v=all]"); pg.wait_for_timeout(300)
    check("밀린 할 일" in pg.inner_text(".pastbox") and "3개" in pg.inner_text(".pastbox") and pg.locator(".pastbox .task").count()==0, "밀린 할 일 3개, 처음엔 접힘")
    pg.screenshot(path=OUT+tag+"2-all.png",full_page=True)
    pg.click("[data-act=showpast]"); pg.wait_for_timeout(250)
    check([x.inner_text() for x in pg.locator(".pastbox .task .t").all()]==['어제 할 일','밀린 일','지난주 과제'], "펼치면 최근 날짜부터")
    pg.screenshot(path=OUT+tag+"2-all-open.png",full_page=True)
    pg.click(".pastbox .skipbtn >> nth=0"); pg.click("[data-act=laterskip]"); pg.wait_for_timeout(300)  # 2.1.0~: 언제 할지 묻는 시트 → 안 하고 끝내기
    check(pg.locator(".pastbox .task").count()==2 and pg.inner_text("#toastMsg")=="‘안 함’으로 남겼어요" and "안 함 1개" in pg.inner_text(".donebox"), "안 함으로 남기면 밀린 할 일에서 빠지고 기록에")
    # check alignment of 지남? now headings: compare baselines of h3 and dw in first dsec
    check(abs(pg.evaluate("(()=>{const h=document.querySelector('.dsec .dlink h3'),d=document.querySelector('.dsec .dlink .rel')||document.querySelector('.dsec .dlink .dw');const a=h.getBoundingClientRect(),c=d.getBoundingClientRect();return Math.round(a.bottom-c.bottom)})()"))<=3, "날짜 머리 글자 아랫줄 맞춤")
    pg.click("[data-act=view][data-v=day]"); pg.wait_for_timeout(200)
    pg.click("[data-act=pick][data-k='%s']"%D(-1)); pg.wait_for_timeout(250)
    check(pg.inner_text(".prog")=="할 일 없음" and pg.locator(".task.skipped").count()==1, "안 함인 날: 흐리게 남고 숫자엔 안 셈")
    pg.screenshot(path=OUT+tag+"2-skipday.png",full_page=True)
    pg.click(".task.skipped .chk"); pg.wait_for_timeout(250); check(pg.locator(".task.skipped").count()==0, "왼쪽 동그라미로 안 함 취소")
    pg.click("[data-act=view][data-v=week]"); pg.wait_for_timeout(300)
    check(pg.locator(".uchip").count()>=3 and pg.inner_text(".ttallL")=="시간 미정", "시간표 위 '시간 미정' 줄")
    pg.screenshot(path=OUT+tag+"2-week.png",full_page=True)
    pg.click(".blk:not(.ghost):not(.grpb) >> nth=0"); pg.wait_for_timeout(300)
    check("날짜" in pg.inner_text("#sheet") and "완료하기" in pg.inner_text("#sheet"), "시간표 칸 → 정보 창")
    pg.screenshot(path=OUT+tag+"2-info.png")
    pg.click("#sheet [data-act=toggle]"); pg.wait_for_timeout(300); check("완료 취소" in pg.inner_text("#sheet .actions"), "정보 창에서 완료")
    pg.click("[data-act=iedit]"); pg.wait_for_timeout(250); check(pg.locator("#e-title").count()==1, "정보 창 → 편집")
    pg.screenshot(path=OUT+tag+"2-edit.png")
    pg.click(":is([data-act=save],[data-act=close])"); pg.wait_for_timeout(300)
    if pg.locator(".blk.ghost").count():
        pg.click(".blk.ghost >> nth=0"); pg.wait_for_timeout(300); check("추가 전" in pg.inner_text("#sheet") or "자동" in pg.inner_text("#sheet"), "빗금 칸 → 반복 할 일 정보")
        pg.screenshot(path=OUT+tag+"2-ginfo.png")
        pg.click("[data-act=iadd]"); pg.wait_for_timeout(400); check("할 일을 추가했어요" in pg.inner_text("#toastMsg"), "이날 할 일에 추가")
    if pg.locator(".ucount").count():  # 폰(1.6.0~): 개수 칩 → 그날 캘린더
        pg.click(".ucount >> nth=0"); pg.wait_for_timeout(300); check(pg.evaluate("document.body.dataset.view")=="day", "개수 칩 → 그날 달력")
    else:
        pg.click(".uchip >> nth=0"); pg.wait_for_timeout(300); check(pg.inner_text("#sheet h2")!="", "칩 → 정보 창")
        pg.go_back(); pg.wait_for_timeout(300)
    check(pg.evaluate("document.documentElement.scrollWidth")<=w, "가로로 안 넘침")
    b.close()
go(390,844,"m"); go(1280,900,"pc")
srv.terminate(); done(errs)
