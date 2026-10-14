# 핵심 흐름 회귀 테스트: 다른 test_*.py는 값을 출력해 눈으로 보는 용도고, 이 파일은 assert로 실패를 잡는다.
import os, subprocess, sys, time
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "dist", "app")
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8781"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
# 메모리 저장소에 "오늘" 기준 데이터를 넣고 시작한다
MOCK = """const m=TodoApp.memoryStore();window.__m=m;
const k=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const T=(id,o)=>Object.assign({id,title:id,note:'',date:k(0),time:null,end:null,remind:null,cat:'k1',sub:null,done:false,doneAt:null,createdAt:1,subtasks:[]},o);
m.importAll({cats:null,tpls:[],tasks:[
 T('t_late1',{title:'밀린 하나',date:k(-2)}),T('t_late2',{title:'밀린 둘',date:k(-1)}),
 T('t_a',{title:'겹침 가',time:'13:00',end:'14:30'}),T('t_b',{title:'겹침 나',time:'13:10',end:'14:00',cat:'k2'}),T('t_c',{title:'겹침 다',time:'13:20',end:'14:10',cat:'k3'}),
 T('t_x',{title:'<img src=x onerror="window.__xss=1">'})],
 events:[{id:'e_1',title:'자료구조',place:'IT관',color:'c6',days:[0,1,2,3,4,5,6],time:'15:00',end:'16:30',from:null,until:null,holOff:false,remind:null,note:'',skips:[],archived:false,createdAt:1}]});
TodoApp.boot(m);"""
errs = []
def open_page(b, w, h):
    ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=w < 600)
    ctx.add_init_script("try{localStorage.setItem('todo.tt7','1')}catch(e){}")  # 폰 7일 보기 기준 테스트(3일 보기는 test_tt3.py)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("**/app.js", lambda r: r.fulfill(body=MOCK, content_type="text/javascript"))
    pg.goto("http://localhost:8781/"); pg.wait_for_selector(".grp")
    return ctx, pg
def today_key(pg):
    return pg.evaluate("(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})()")
n = 0
def check(cond, msg):
    global n; n += 1
    assert cond, msg
    print("ok", msg)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx, pg = open_page(b, 390, 844)
    tk = today_key(pg)
    check(pg.evaluate("window.__xss") is None, "제목의 HTML이 실행되지 않음")
    check(pg.locator(".task:has-text('img src=x')").count() == 1, "HTML 제목이 글자로 보임")

    # 오프라인 알림 줄(메모리 저장소는 'local'이라 원래 줄이 떠 있음 → 문구만 바뀌지 않는지 확인)
    ctx.set_offline(True); pg.wait_for_timeout(200)
    check("로그인하지 않아" in pg.inner_text("#banner"), "로그인 안 한 상태 알림이 오프라인 알림보다 먼저")
    ctx.set_offline(False); pg.wait_for_timeout(200)
    # 추가: 엔터로 두 개, 포커스 유지
    before = pg.locator("#g-k1 .task:not(.ghost)").count()
    pg.click("[data-act=add][data-cat=k1]")
    pg.keyboard.type("장보기"); pg.keyboard.press("Enter")
    pg.keyboard.type("빨래"); pg.keyboard.press("Enter")
    check(pg.locator("#g-k1 .task:not(.ghost)").count() == before + 2, "엔터로 두 개 추가")
    check(pg.evaluate("document.activeElement.id") == "add-k1", "추가 뒤에도 입력칸 포커스 유지")
    pg.keyboard.press("Escape")

    # 편집: 버튼 이름 '저장', 바깥 눌러 닫으면 저장
    pg.click("#g-k1 .ttl:has-text('장보기')")
    check(pg.inner_text(".sheet .btn.pri") == "저장", "편집 시트 주 버튼은 '저장'")
    pg.fill("#e-time", "18:30"); pg.mouse.click(5, 5); pg.wait_for_timeout(300)
    check("오후 6:30" in pg.inner_text("#g-k1"), "바깥 눌러 닫으면 시간 저장")

    # 삭제 → 되돌리기
    pg.click("#g-k1 .ttl:has-text('빨래')"); pg.click(".sheet [data-act=del]"); pg.wait_for_timeout(250)
    check(pg.locator(".task:has-text('빨래')").count() == 0, "삭제")
    pg.click("#toastAct"); pg.wait_for_timeout(200)
    check(pg.locator(".task:has-text('빨래')").count() == 1, "삭제 되돌리기")

    # 밀린 할 일 오늘로 → 되돌리기
    check("2개" in pg.inner_text(".carry"), "밀린 할 일 2개 표시")
    pg.click(".carry [data-act=carry]"); pg.wait_for_timeout(200)
    check(pg.locator(".carry").count() == 0 and pg.locator(".task:has-text('밀린 하나')").count() == 1, "오늘로 옮기기")
    check(pg.is_visible("#toastAct") and pg.inner_text("#toastAct") == "되돌리기", "오늘로 옮기기에 되돌리기 있음")
    pg.click("#toastAct"); pg.wait_for_timeout(200)
    check(pg.locator(".carry").count() == 1 and pg.locator(".task:has-text('밀린 하나')").count() == 0, "오늘로 옮기기 되돌리기")

    # 달력 스와이프(한 주 보기): 7일 이동
    if "한 달 보기" not in pg.inner_text(".calfoot"): pg.click("[data-act=calmode]")
    h1 = pg.inner_text(".dayhead h1")
    box = pg.locator("#cal").bounding_box()
    pg.evaluate("""([x,y])=>{const el=document.getElementById('cal');const mk=(t,cx)=>new TouchEvent(t,{bubbles:true,changedTouches:[new Touch({identifier:1,target:el,clientX:cx,clientY:y})],touches:t==='touchend'?[]:[new Touch({identifier:1,target:el,clientX:cx,clientY:y})]});el.dispatchEvent(mk('touchstart',x+120));el.dispatchEvent(mk('touchend',x));}""", [box["x"] + 100, box["y"] + 80])
    check(pg.inner_text(".dayhead h1") != h1, "한 주 보기에서 스와이프하면 다른 날로")
    pg.click("[data-act=today]")

    # 시간표: 칸 시간은 24시간제, 폰에선 겹침 묶음, 넓히면 다시 그려서 풀림
    pg.click("[data-act=view][data-v=week]"); pg.wait_for_timeout(200)
    ev = pg.locator(".blk.ev").first.inner_text()
    check("15:00–16:30" in ev, "고정 일정 칸 시간 24시간제: " + ev.replace("\n", " "))
    check(pg.locator(".blk.grpb").count() >= 1, "폰: 겹친 할 일 3개가 묶임")
    pg.set_viewport_size({"width": 1280, "height": 900}); pg.wait_for_timeout(400)
    check(pg.locator(".blk.grpb").count() == 0 and pg.locator(".blk.tblk").count() >= 3, "창을 넓히면 다시 그려서 나란히")
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(400)
    check(pg.locator(".blk.grpb").count() >= 1, "다시 좁히면 묶음")
    pg.set_viewport_size({"width": 390, "height": 500}); pg.wait_for_timeout(400)
    check(pg.locator(".blk.grpb").count() >= 1, "높이만 바뀌면(키보드) 그대로")

    # 정보 시트의 '완료'는 할 일 완료 체크
    pg.set_viewport_size({"width": 1280, "height": 900}); pg.wait_for_timeout(400)
    pg.click(".blk.tblk:has-text('겹침 가')")
    check(pg.inner_text(".sheet .btn.pri") == "완료", "정보 시트 주 버튼은 '완료'")
    pg.click(".sheet .btn.pri"); pg.wait_for_timeout(200)
    check(pg.locator(".blk.tblk.done").count() == 1, "정보 시트 '완료'로 완료 처리")
    ctx.close(); b.close()
srv.kill()
print("checks:", n, "errors:", errs)
assert not errs, errs
