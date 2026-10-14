# 2.1.0: 자정 넘김, 소분류는 이름의 일부, '안 함' → 다른 날에 하기
import os, subprocess, sys, time
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "dist", "app")
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8788"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
MOCK = """const m=TodoApp.memoryStore();
const k=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const T=(id,o)=>Object.assign({id,title:id,note:'',date:k(0),time:null,end:null,remind:null,cat:'k2',sub:null,done:false,doneAt:null,createdAt:1,subtasks:[]},o);
m.importAll({cats:[{id:'k1',name:'일상',color:'c7',subs:[]},{id:'k2',name:'수업',color:'c5',subs:[{id:'b1',name:'자료구조'}]}],
 tpls:[{id:'r_1',title:'복습',days:[0,1,2,3,4,5,6],cat:'k2',sub:'b1',subtasks:[]}],
 tasks:[T('t_n',{title:'밤샘 공부',time:'23:00',end:'01:30',cat:'k1'}),T('t_s',{title:'과제 3',time:'10:00',end:'11:00',sub:'b1'}),T('t_u',{title:'종일 일',sub:'b1'}),
  T('t_old',{title:'지난 리포트',date:k(-2),subtasks:[{id:'s1',t:'초안',done:true}]})],
 events:[{id:'e_1',title:'알바',place:'',color:'c3',days:[0,1,2,3,4,5,6],time:'22:00',end:'02:00',holOff:false,skips:[],createdAt:1}]});
TodoApp.boot({kind:'pwa',start(c){m.start({onData(d){window.__last=d;c.onData(d);},onStatus:x=>c.onStatus(x==='local'?'live':x),onError:c.onError});},set:m.set,update:m.update,remove:m.remove,saveCats:m.saveCats,importAll:m.importAll});"""
n = 0
def check(cond, msg):
    global n; n += 1
    assert cond, msg
    print("ok", msg)
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("**/app.js", lambda r: r.fulfill(body=MOCK, content_type="text/javascript"))
    pg.goto("http://localhost:8788/"); pg.wait_for_selector(".grp")
    K = lambda d: pg.evaluate("n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}", d)
    tasks = lambda: {v["id"]: v for v in pg.evaluate("[...window.__last.tasks.values()]")}
    # --- 자정 넘김
    check("오후 11:00–다음 날 오전 1:30" in pg.inner_text(".task:has-text('밤샘 공부')"), "목록: 다음 날 끝 표시")
    pg.click(".ttl:has-text('밤샘 공부')")
    check("다음 날 오전 1:30에 끝나요" in pg.inner_text(".sheet") and pg.locator(".tbad").count() == 0, "편집: 오류 대신 '다음 날 …에 끝나요'")
    pg.fill("#e-end", "23:00"); pg.dispatch_event("#e-end", "change")
    check(pg.locator(".tbad").count() == 1, "시작과 같은 시각만 오류")
    pg.fill("#e-end", "00:30"); pg.dispatch_event("#e-end", "change"); pg.click(".sheet :is([data-act=save],[data-act=close])"); pg.wait_for_timeout(200)
    check(tasks()["t_n"]["end"] == "00:30", "자정 넘긴 끝 시간 저장")
    q2 = pg.evaluate("TodoApp.parseQuick('밤 11시-1시 야식','2026-10-15')")
    check(q2["time"] == "23:00" and q2["end"] == "01:00", "한 줄 입력 '밤 11시-1시' → 새벽 1시까지")
    q = pg.evaluate("TodoApp.parseQuick('23:00~01:00 정리','2026-10-15')")
    check(q["time"] == "23:00" and q["end"] == "01:00", "한 줄 입력 23:00~01:00 → 자정 넘김")
    pg.click("[data-act=view][data-v=week]"); pg.wait_for_timeout(400)
    blk = pg.locator(f".ttcol[data-k='{K(0)}'] .blk.tblk:has-text('밤샘 공부')")
    bb = blk.bounding_box(); body = pg.locator(f".ttcol[data-k='{K(0)}']").bounding_box()
    check(abs((bb["y"] + bb["height"]) - (body["y"] + body["height"])) < 4, "시작한 날 칸은 자정(맨 아래)까지")
    carry = pg.locator(f".ttallC .ucarry[data-k='{K(0)}']")
    txt = " | ".join(" ".join(x.split()) for x in carry.all_inner_texts())
    check("~0:30 밤샘 공부" in txt and "~2:00 알바" in txt, "다음 날 종일 줄에 '~끝 시각 이름'으로 이어서: " + txt)
    # --- 소분류는 이름 앞에
    check(pg.locator(".blk.tblk:has-text('과제 3'):has(.ntag:text-is('자료구조'))").count() == 1, "시간표 칸: 이름 + 소분류 태그")
    check(pg.locator(".uchip:has(.nt:text-is('종일 일')):has(.ntag:text-is('자료구조'))").count() == 1, "종일 칩: 이름 + 소분류 태그")
    tg = pg.evaluate("(()=>{const b=document.querySelector('.blk.tblk .ntag');return [!!b.closest('.bt'), getComputedStyle(b).textDecorationLine];})()")
    check(tg == [False, "none"], f"소분류 태그는 이름 글자(취소선 대상) 밖에 따로 {tg}")
    pg.locator(".blk.tblk:has-text('과제 3')").click()
    check(" ".join(pg.inner_text(".sheet h2").split()) in ("과제 3 자료구조","과제 3자료구조") and pg.locator(".sheet h2 .ntag").count() == 1 and "자료구조" not in pg.inner_text(".sheet .eyebrow"), "정보 시트 제목: 소분류 + 이름(위 줄은 카테고리만)")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.click("[data-act=menu]"); pg.click("#sheet [data-act=tpls]")
    check(pg.locator(".tpllist .nm:has(.nt:text-is('복습')):has(.ntag:text-is('자료구조'))").count() == 1, "반복 할 일 목록: 이름 + 소분류 태그")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    # --- 안 함 → 다른 날에
    pg.click("[data-act=view][data-v=all]"); pg.click("[data-act=showpast]"); pg.wait_for_timeout(150)
    pg.click(".pastbox [data-act=skip]")
    check(pg.inner_text(".sheet h2") == "언제 할까요?" and pg.locator(".laterpick [data-k]").count() == 3, "'안 함' 누르면 언제 할지 물음")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check(not tasks()["t_old"].get("skipped"), "그냥 닫으면 아무것도 안 바뀜")
    pg.click(".pastbox [data-act=skip]"); pg.click(f".laterpick [data-k='{K(1)}']"); pg.wait_for_timeout(250)
    ts = tasks(); o = ts["t_old"]; cp = [v for v in ts.values() if v.get("from") == "t_old"]
    check(o["skipped"] and o["laterDate"] == K(1) and len(cp) == 1, "원래 날은 안 함, 내일에 새로")
    c = cp[0]
    check(c["date"] == K(1) and c["fromDate"] == K(-2) and c["again"] == 1 and c["subtasks"][0]["done"] and not c["done"], "새 할 일: 내용·세부 진행 그대로, 어디서 왔는지 기록")
    check("내일에 다시 넣었어요" in pg.inner_text("#toastMsg"), "알려 줌")
    pg.click("#toastAct"); pg.wait_for_timeout(250)
    ts = tasks()
    check(not ts["t_old"].get("skipped") and not ts["t_old"].get("later") and not any(v.get("from") == "t_old" for v in ts.values()), "되돌리기: 둘 다 원래대로")
    pg.click(".pastbox [data-act=skip]"); pg.click("[data-act=laterskip]"); pg.wait_for_timeout(250)
    check(tasks()["t_old"]["skipped"] and not tasks()["t_old"].get("later"), "'안 하고 끝내기'는 정리만")
    # 이미 안 함인 할 일 → 다른 날에(편집 시트), 두 번째
    pg.click("[data-act=showdone]"); pg.click(".donebox .ttl:has-text('지난 리포트')")
    check(pg.locator("[data-act=elater]").count() == 1 and pg.locator("[data-act=tomorrow]").count() == 0, "안 함인 할 일 편집: '다른 날에'")
    pg.click("[data-act=elater]"); pg.fill("#l-date", K(5)); pg.click("[data-act=later][data-k=pick]"); pg.wait_for_timeout(250)
    c1 = [v for v in tasks().values() if v.get("from") == "t_old"][0]
    check(c1["date"] == K(5) and tasks()["t_old"]["laterDate"] == K(5), "날짜 골라 다시 넣기")
    # 새 할 일을 또 미루면 2번째
    pg.click(f"#ds-{K(5)} .ttl:has-text('지난 리포트')")
    check("못 한 것" in pg.inner_text(f"#ds-{K(5)}"), "새 할 일에 '…에 못 한 것'")
    pg.click("[data-act=eskip]"); pg.click(f".laterpick [data-k='{K(1)}']"); pg.wait_for_timeout(250)
    c2 = [v for v in tasks().values() if v.get("from") == c1["id"]][0]
    check(c2["again"] == 2 and "2번째 다시" in pg.inner_text(f"#ds-{K(1)}"), "두 번째 미루면 '2번째 다시'")
    check("다시" in pg.inner_text(".donebox") if pg.locator(".donebox").count() else True, "원래 것엔 '…에 다시'")
    pg.click("[data-act=view][data-v=day]"); pg.wait_for_timeout(200)
    pg.screenshot(path=os.path.join(HERE, "out", "v21-day.png"), full_page=True)
    ctx.close(); b.close()
srv.kill()
print("checks:", n, "errors:", errs)
assert not errs, errs
