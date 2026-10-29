# 반복 할 일(자동 추가를 끈 흐름): 할 일에서 등록, 흐린 줄·＋로 추가, 지우면 다시, 요일 바꾸기, 새로 만들기·취소, 삭제·되돌리기, 백업
import json
from playwright.sync_api import sync_playwright
from ttb import check, serve, done, OUT
srv=serve(8776)
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

    pg.click("[data-act=add][data-cat=k2]"); pg.keyboard.type("영어 수업"); pg.keyboard.press("Enter"); pg.keyboard.press("Escape")
    pg.click("text=영어 수업"); pg.wait_for_timeout(200); pg.click(".sheet [data-act=emore]"); pg.wait_for_timeout(100)
    pg.fill("#e-time","10:00"); pg.wait_for_timeout(100); pg.click(".remind [data-m='10']"); pg.wait_for_timeout(100)
    pg.fill("#s-new","교재 챙기기"); pg.keyboard.press("Enter"); pg.wait_for_timeout(100)
    check("반복 할 일로 등록" in pg.inner_text(".repbtn"), "할 일 편집: '반복 할 일로 등록'")
    pg.click("[data-act=tplfrom]"); pg.wait_for_timeout(200)
    check(len(pg.locator(".days .pill[aria-pressed=true]").all())==1 and pg.input_value("#e-time")=="10:00" and pg.locator(".subs li:not(.new)").count()==1 and pg.locator(".subs input[type=checkbox]").count()==0, "반복 등록 창: 그 요일·시간·세부 할 일(체크 없이)")
    pg.uncheck("#e-auto"); pg.wait_for_timeout(100)  # 이 테스트는 '추가 전' 흐린 줄 흐름(자동 추가는 test_v25.py)
    pg.click(".days [data-d='1']"); pg.click(".days [data-d='3']"); pg.wait_for_timeout(100)

    pg.screenshot(path=OUT+tag+"-tpl.png")
    pg.click(":is([data-act=save],[data-act=close])"); pg.wait_for_timeout(400)
    check(pg.inner_text("#toastMsg")=="반복 할 일을 등록했어요", "등록 알림")
    d=pg.evaluate("({t:[...__d.tasks.values()],r:[...__d.tpls.values()]})")
    r0=d["r"][0]; t0=d["t"][0]
    check(r0["title"]=="영어 수업" and len(r0["days"])==3 and r0["time"]=="10:00" and r0["remind"]==10 and len(r0["subtasks"])==1 and r0["auto"] is False, "반복 원본: 요일 3개·시간·알림·세부")
    check(t0.get("tpl")==r0["id"] and t0["time"]=="10:00" and t0["remind"]==10, "원래 할 일은 그대로 두고 원본과 연결")
    check(pg.locator(".task.ghost").count()==0, "연결돼 있으니 오늘엔 흐린 줄 없음")
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
    check(pg.locator(".task.ghost").count()==1 and pg.inner_text(".prog").endswith("할 일이 없어요") and pg.inner_text("#g-k2 .cnt")=="", "다른 날: 흐린 줄 하나, 숫자엔 안 셈")
    check("눌러서 추가" in pg.inner_text(".task.ghost .meta"), "흐린 줄에 '추가 전'")
    pg.screenshot(path=OUT+tag+"-ghost.png")
    pg.click(".task.ghost .gadd"); pg.wait_for_timeout(400)
    check(pg.locator(".task.ghost").count()==0 and pg.locator(".task:not(.ghost)").count()==1 and "0/1" in pg.inner_text(".prog"), "＋ → 진짜 할 일, 숫자에 셈")
    d=pg.evaluate("[...__d.tasks.values()].filter(t=>t.date==='"+k+"')")
    check(len(d)==1 and d[0]["time"]=="10:00" and d[0]["remind"]==10 and len(d[0]["subtasks"])==1, "추가한 할 일: 원본 내용 그대로")
    pg.screenshot(path=OUT+tag+"-added.png")
    # undo by deleting added -> ghost returns
    pg.click(".task:not(.ghost) .ttl"); pg.wait_for_timeout(200); check("반복 설정 편집" in pg.inner_text(".repbtn"), "추가한 할 일 편집: '반복 설정 편집'(펼쳐져 있음)")
    pg.click("[data-act=del]"); pg.wait_for_timeout(400); check(pg.locator(".task.ghost").count()==1, "지우면 흐린 줄이 다시")
    # menu list & edit
    pg.click("[data-act=menu]"); pg.wait_for_timeout(200); pg.click(".sheet [data-act=tpls]"); pg.wait_for_timeout(200)
    check("영어 수업" in pg.inner_text(".tpllist"), "설정 › 반복 할 일 목록")
    pg.screenshot(path=OUT+tag+"-list.png")
    pg.click(".tplrow"); pg.wait_for_timeout(200)
    for dd in ["1","3",str(td.isoweekday()%7)]:
        if pg.get_attribute(f".days [data-d='{dd}']","aria-pressed")=="true": pg.click(f".days [data-d='{dd}']")
    pg.click(".days [data-d='0']" if nxt.isoweekday()%7!=0 else ".days [data-d='2']"); pg.wait_for_timeout(100)
    pg.click(":is([data-act=save],[data-act=close])"); pg.wait_for_timeout(400)
    check(pg.locator(".task.ghost").count()==0, "요일을 바꾸면 그 날엔 흐린 줄 없음")
    # new template from menu
    pg.click("[data-act=menu]"); pg.wait_for_timeout(200); pg.click(".sheet [data-act=tpls]"); pg.wait_for_timeout(200); pg.click("[data-act=tplnew]"); pg.wait_for_timeout(200)
    check(pg.evaluate("document.activeElement.id")=="e-title" and pg.is_checked("#e-auto"), "새 반복 할 일: 이름에 포커스, 자동 추가 기본 켬")
    pg.keyboard.type("운동"); pg.uncheck("#e-auto"); check(len(pg.locator(".days .pill[aria-pressed=true]").all())==1, "기본 요일은 보고 있는 날"); pg.click(":is([data-act=save],[data-act=close])"); pg.wait_for_timeout(400)
    check([x.inner_text().split("\n")[0] for x in pg.locator(".task.ghost").all()]==["운동"], "새 반복 할 일의 흐린 줄")
    # cancel new template
    pg.click("[data-act=menu]"); pg.wait_for_timeout(200); pg.click(".sheet [data-act=tpls]"); pg.wait_for_timeout(200); pg.click("[data-act=tplnew]"); pg.wait_for_timeout(200)
    pg.keyboard.type("취소될 것"); pg.click("[data-act=tplcancel]"); pg.wait_for_timeout(300)
    check(pg.evaluate("__d.tpls.size")==2, "취소하면 안 생김")
    # delete + undo via ghost title
    pg.click(".task.ghost .ttl >> nth=0"); pg.wait_for_timeout(200); pg.click("[data-act=itpl]"); pg.wait_for_timeout(200); pg.click("[data-act=tpldel]"); pg.wait_for_timeout(200)
    check(pg.evaluate("__d.tpls.size")==2 and pg.inner_text(".sheet [data-act=tpldel]")=="정말 삭제" and "휴지통에 남지 않아요" in pg.inner_text("#toastMsg"), "반복 할 일 삭제는 한 번 더 확인(휴지통에 안 남음)")
    pg.click("[data-act=tpldel]"); pg.wait_for_timeout(300)
    check(pg.evaluate("__d.tpls.size")==1, "반복 할 일 삭제"); pg.click("#toastAct"); pg.wait_for_timeout(300); check(pg.evaluate("__d.tpls.size")==2, "삭제 되돌리기")
    # export/import roundtrip
    exp=pg.evaluate("(()=>{document.querySelector('[data-act=menu]').click();return 1})()"); pg.wait_for_timeout(200); pg.click("[data-act=export]"); pg.wait_for_timeout(200)
    j=json.loads(pg.input_value("#x-out")); check(len(j["tpls"])==2 and 10 in [t.get("remind") for t in j["tasks"]], "백업에 반복 할 일·알림")
    pg.go_back(); pg.wait_for_timeout(300)
    pg.evaluate("__m.remove && [...__d.tpls.keys()].forEach(k=>__m.remove(k))"); pg.wait_for_timeout(200)
    pg.click("[data-act=menu]"); pg.wait_for_timeout(200); pg.click("[data-act=import]"); pg.wait_for_timeout(200)
    pg.fill("#i-in",json.dumps(j)); pg.click("[data-act=importcheck]"); pg.wait_for_timeout(200); check("반복 할 일 2개" in pg.inner_text("#i-sum"), "복원 확인 요약")
    pg.click("[data-act=importgo]"); pg.wait_for_timeout(300); check(pg.evaluate("__d.tpls.size")==2, "복원 뒤 반복 할 일 2개")
    b.close()
run(390,844,True,"m")
run(1280,860,False,"pc")
srv.terminate(); done(errs)
