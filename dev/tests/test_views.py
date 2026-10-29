# 보기: 전체 탭 정렬·추가, 시간표(3일/7일·지금 선·편집), 소분류 순서, 반복 할 일 숨기기·다시 사용
import json, datetime
from playwright.sync_api import sync_playwright
from ttb import check, serve, done, OUT
srv=serve(8780)
T=datetime.date.today(); D=lambda n:(T+datetime.timedelta(days=n)).isoformat()
mon=T-datetime.timedelta(days=T.weekday())
cats=[{"id":"k1","name":"일상","color":"c7","subs":[]},{"id":"k2","name":"수업","color":"c5","subs":[{"id":"b1","name":"영어"},{"id":"b2","name":"수학"},{"id":"b3","name":"과학"}]},{"id":"k3","name":"건강","color":"c3","subs":[]}]
tasks=[
 ("t_1","장보기","k1",None,D(0),"18:00",None),("t_2","수학 숙제","k2","b2",D(0),"10:00","11:30"),("t_3","영어 단어","k2","b1",D(0),"10:00",None),
 ("t_4","산책","k3",None,D(0),"10:00","10:40"),("t_5","가 메모 정리","k1",None,D(0),None,None),("t_6","나 운동","k3",None,D(0),None,None),
 ("t_7","과학 실험 보고서","k2","b3",D(1),"14:00","16:00"),("t_8","밀린 일","k1",None,D(-2),None,None),("t_9","언젠가 할 일","k1",None,None,None,None),
 ("t_10","겹침 A","k1",None,D(1),"14:30","15:00"),("t_11","겹침 B","k3",None,D(1),"14:45","15:30"),("t_12","아침 요가","k3",None,D(2),"07:00","08:00"),
]
data={"cats":cats,"tasks":[{"id":i,"title":ti,"cat":c,"sub":sb,"date":d,"time":tm,"end":en,"note":"","done":False,"createdAt":n,"subtasks":[]} for n,(i,ti,c,sb,d,tm,en) in enumerate(tasks)],
 "tpls":[{"id":"r_1","title":"영어 수업","cat":"k2","sub":"b1","time":"09:00","end":"10:15","days":[1,3],"subtasks":[]},{"id":"r_2","title":"끝난 특강","cat":"k2","time":"13:00","days":[2],"until":D(-1),"subtasks":[]}]}
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
    # '지금 선'은 시간표 범위(대략 9~18시) 안일 때만 그린다: 테스트를 도는 실제 시각에 따라 달라지지 않게 오늘 정오부터 흐르게 한다
    pg.clock.install(time=datetime.datetime.combine(T,datetime.time(12,0)))
    pg.goto("http://localhost:8780/"); pg.wait_for_selector(".grp"); pg.wait_for_timeout(400)
    pg.screenshot(path=OUT+tag+"-day.png",full_page=True)
    pg.click("[data-act=view][data-v=all]"); pg.wait_for_timeout(300)
    secs=pg.locator(".dsec").all()
    got={sct.locator(".ghead").inner_text().split("\n")[0]:[x.inner_text().split("\n")[0] for x in sct.locator(".task .t").all()] for sct in secs}
    vals=list(got.values())
    check(vals[0]==['영어 단어','수학 숙제','산책','장보기','가 메모 정리','나 운동'], "전체 탭 오늘: 시간 → 카테고리 → 소분류 → 가나다 "+str(vals[0]))
    check(vals[1]==['과학 실험 보고서','겹침 A','겹침 B'] and vals[-1]==['언젠가 할 일'], "내일·날짜 없음(맨 끝) 묶음")
    pg.screenshot(path=OUT+tag+"-all.png",full_page=True)
    pg.click("[data-act=add][data-cat=all]"); pg.wait_for_timeout(150); pg.click("[data-act=addcat][data-cat=k3]"); pg.click("[data-act=adddate][data-k='%s']"%D(1)); pg.keyboard.type("새 할일"); pg.keyboard.press("Enter"); pg.wait_for_timeout(250)
    t=[x for x in pg.evaluate("[...__d.tasks.values()]") if x["title"]=="새 할일"][0]; check(t["cat"]=="k3" and t["date"]==D(1), "전체 탭 추가: 고른 카테고리·날짜")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(150)
    pg.click("[data-act=view][data-v=week]"); pg.wait_for_timeout(300)
    check(pg.locator(".blk:not(.ghost)").count()>=6 and pg.locator(".nowline").count()==1, "시간표: 칸들과 지금 선")
    check(pg.locator(".tth").count()==(21 if w<600 else 7), "폰 3일 보기는 21일 이어 붙임, PC는 7일")
    pg.screenshot(path=OUT+tag+"-week.png",full_page=True)
    pg.click("[data-act=wnav][data-d='1']"); pg.wait_for_timeout(300)
    # 3일 보기는 부드럽게 넘어가서 '오늘' 버튼이 늦게 나타난다: 고정 대기 대신 보일 때까지 기다린다
    try: pg.wait_for_selector("[data-act=wtoday]:not([hidden])", timeout=5000); pg.click("[data-act=wtoday]")
    except Exception: pg.evaluate("document.querySelector('[data-act=wtoday]').click()")  # 느린 환경: 스크롤이 덜 끝나도 '오늘'로
    pg.wait_for_timeout(300)
    pg.click(".blk.tblk >> nth=0"); pg.wait_for_timeout(300); pg.click("[data-act=iedit]"); pg.wait_for_timeout(250)
    check(pg.input_value("#e-time")!="" , "시간표 정보 → 편집: 시간 그대로")
    pg.fill("#e-end","0900" if w>600 else "09:00"); pg.wait_for_timeout(150)
    if w>600: check("다음 날" in pg.inner_text("#e-end-p"), "끝이 시작보다 이르면 '다음 날'")
    pg.fill("#e-end","2200" if w>600 else "22:00"); pg.wait_for_timeout(150)
    pg.screenshot(path=OUT+tag+"-edit.png")
    pg.click(":is([data-act=save],[data-act=close])"); pg.wait_for_timeout(300)
    pg.click("[data-act=menu]"); pg.wait_for_timeout(200); pg.click("[data-act=cats]"); pg.wait_for_timeout(200)
    pg.click("[data-act=subdown][data-sub=b1]"); pg.wait_for_timeout(200)
    pg.screenshot(path=OUT+tag+"-cats.png")
    pg.click(":is([data-act=save],[data-act=close])"); pg.wait_for_timeout(300)
    check([x["name"] for x in pg.evaluate("__d.cats")[1]["subs"]]==["수학","영어","과학"], "소분류 순서 바꾸기")
    pg.click("[data-act=menu]"); pg.wait_for_timeout(200); pg.click(".sheet [data-act=tpls]"); pg.wait_for_timeout(200)
    check("영어 수업" in pg.inner_text(".sheet") and "숨김·종료 1" in pg.inner_text(".sheet"), "반복 할 일 목록: 쓰는 것 + 숨김·종료")
    pg.screenshot(path=OUT+tag+"-tpls.png")
    pg.click(".tplrow >> nth=0"); pg.wait_for_timeout(200); pg.fill("#e-until",D(20)); pg.wait_for_timeout(100); pg.screenshot(path=OUT+tag+"-tpl.png"); pg.click("[data-act=tplarc]"); pg.wait_for_timeout(300)
    r=pg.evaluate("__d.tpls.get('r_1')"); check(r["archived"] and r.get("until")==D(20), "숨기기(고친 종료일도 함께 저장)")
    pg.click("[data-act=menu]"); pg.wait_for_timeout(200); pg.click(".sheet [data-act=tpls]"); pg.wait_for_timeout(200); pg.click("text=영어 수업"); pg.wait_for_timeout(200); pg.click("[data-act=tplunarc]"); pg.wait_for_timeout(300)
    r=pg.evaluate("__d.tpls.get('r_1')"); check(not r["archived"], "다시 사용")
    check(pg.evaluate("document.documentElement.scrollWidth")<=w, "가로로 안 넘침")
    b.close()
go(390,844,"m"); go(1280,900,"pc")
srv.terminate(); done(errs)
