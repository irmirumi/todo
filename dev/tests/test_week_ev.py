# 1.7.0: 시간표 일요일 시작·보기 필터·소분류 태그, 고정 일정 이 날만 바꾸기
import os, subprocess, sys, time
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "dist", "app")
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8785"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
MOCK = """const m=TodoApp.memoryStore();
const k=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const T=(id,o)=>Object.assign({id,title:id,note:'',date:k(0),time:null,end:null,remind:null,cat:'k2',sub:null,done:false,doneAt:null,createdAt:1,subtasks:[]},o);
m.importAll({cats:[{id:'k1',name:'일상',color:'c7',subs:[]},{id:'k2',name:'수업',color:'c5',subs:[{id:'b1',name:'자료구조'}]}],tpls:[],
 tasks:[T('t_1',{title:'과제 풀기',time:'10:00',end:'12:00',sub:'b1'}),T('t_2',{title:'종일 일',cat:'k1'})],
 events:[{id:'e_1',title:'영어회화',place:'공학관',color:'c6',days:[0,1,2,3,4,5,6],time:'15:00',end:'16:30',from:null,until:null,holOff:false,remind:null,note:'',skips:[],archived:false,createdAt:1}]});
TodoApp.boot({kind:'pwa',start(c){m.start({onData(d){window.__last=d;c.onData(d);},onStatus:x=>c.onStatus(x==='local'?'live':x),onError:c.onError});},set:m.set,update:m.update,remove:m.remove,saveCats:m.saveCats,importAll:m.importAll});"""
n = 0
def check(cond, msg):
    global n; n += 1
    assert cond, msg
    print("ok", msg)
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    ctx.add_init_script("try{localStorage.setItem('todo.tt7','1')}catch(e){}")  # 폰 7일 보기 기준 테스트(3일 보기는 test_tt3.py)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("**/app.js", lambda r: r.fulfill(body=MOCK, content_type="text/javascript"))
    pg.goto("http://localhost:8785/"); pg.wait_for_selector(".grp")
    tk = pg.evaluate("(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})()")
    ev = lambda: pg.evaluate("window.__last.events.get('e_1')")
    pg.click("[data-act=view][data-v=week]"); pg.wait_for_timeout(200)
    heads = pg.locator(".tth small").all_inner_texts()
    check(heads == ["일", "월", "화", "수", "목", "금", "토"], "시간표 한 주는 일요일부터: " + str(heads))
    # 소분류 태그
    blk = pg.locator(".blk.tblk:has-text('과제 풀기')")
    check(blk.locator(".btag").inner_text() == "자료구조" and "수업" not in blk.inner_text(), "할 일 칸에 소분류만(카테고리 이름 없음)")
    # 보기 필터
    check(pg.get_attribute("[data-act=ttshow][data-v=all]", "aria-pressed") == "true", "기본은 모두")
    pg.click("[data-act=ttshow][data-v=ev]"); pg.wait_for_timeout(150)
    check(pg.locator(".blk.tblk").count() == 0 and pg.locator(".blk.ev").count() >= 7 and pg.locator(".ttall").count() == 0, "고정 일정만: 할 일·종일 줄 숨김")
    pg.click("[data-act=ttshow][data-v=task]"); pg.wait_for_timeout(150)
    check(pg.locator(".blk.ev").count() == 0 and pg.locator(".blk.tblk").count() == 1 and pg.locator(".ttall").count() == 1, "할 일만: 고정 일정 숨김")
    pg.reload(); pg.wait_for_selector(".tt")
    check(pg.get_attribute("[data-act=ttshow][data-v=task]", "aria-pressed") == "true", "보기 선택은 기억")
    pg.click("[data-act=ttshow][data-v=all]")
    # 이 날만 바꾸기
    pg.click(f".ttcol[data-k='{tk}'] .blk.ev")
    pg.click("[data-act=evday]")
    check(pg.inner_text(".sheet h2") == "이 날만 바꾸기" and pg.input_value("#e-time") == "15:00" and pg.input_value("#e-place") == "공학관", "이 날만 바꾸기: 원래 값으로 시작")
    pg.fill("#e-time", "1100"); pg.fill("#e-end", "1230"); pg.fill("#e-place", "인문관 101"); pg.click(".sheet [data-act=close]"); pg.wait_for_timeout(250)
    o = ev()["ovr"]
    check(o == {tk: {"time": "11:00", "end": "12:30", "place": "인문관 101"}}, "이 날만 저장: " + str(o))
    check(ev()["time"] == "15:00" and ev()["place"] == "공학관", "평소 값은 그대로")
    b2 = pg.locator(f".ttcol[data-k='{tk}'] .blk.ev")
    check("11:00–12:30" in b2.inner_text() and "인문관 101" in b2.inner_text(), "시간표 그 날 칸이 바뀐 시간·장소로")
    other = pg.locator(".ttcol:not([data-k='" + tk + "']) .blk.ev").first.inner_text()
    check("15:00–16:30" in other, "다른 날은 그대로")
    b2.click()
    info = pg.inner_text(".sheet")
    check("이 날만" in info and "평소" in info and "인문관 101" in info, "정보 시트에 이 날만·평소 표시")
    check(pg.locator("[data-act=evdayreset]").count() == 0, "정보 시트엔 원래대로 버튼이 없음(바꾸기 시트 안에만)")
    pg.click("[data-act=evday]"); pg.click("[data-act=evdayreset]"); pg.wait_for_timeout(250)
    check(not ev().get("ovr"), "원래대로 → 변경 지움")
    check("15:00–16:30" in pg.locator(f".ttcol[data-k='{tk}'] .blk.ev").inner_text(), "시간표도 원래대로")
    # 안 바꾸고 닫으면 안 씀
    pg.click(f".ttcol[data-k='{tk}'] .blk.ev"); pg.click("[data-act=evday]"); pg.click(".sheet [data-act=close]"); pg.wait_for_timeout(200)
    check(not ev().get("ovr"), "그대로 닫으면 변경 없음")
    # 캘린더 줄
    pg.click(f".ttcol[data-k='{tk}'] .blk.ev"); pg.click("[data-act=evday]"); pg.fill("#e-place", "온라인"); pg.click(".sheet [data-act=close]"); pg.wait_for_timeout(200)
    pg.click(f".tth[data-k='{tk}']"); pg.wait_for_timeout(200)
    row = pg.locator(".evrow").inner_text()
    check("온라인" in row and "이 날만 변경" in row and "오후 3:00" in row, "캘린더 고정 일정 줄에 이 날만 변경 표시: " + row.replace("\n", " "))
    # 내보내기 → 가져오기 하면 ovr 유지
    pg.click("[data-act=menu]"); pg.click("[data-act=export]"); txt = pg.input_value("#x-out"); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.click("[data-act=menu]"); pg.click("[data-act=import]"); pg.fill("#i-in", txt); pg.click("[data-act=importcheck]"); pg.click("[data-act=importgo]"); pg.wait_for_timeout(300)
    check(ev()["ovr"][tk]["place"] == "온라인", "내보내기·가져오기에 이 날만 변경 포함")
    # 폰: 주말 비면 월~금
    pg.set_viewport_size({"width": 390, "height": 844}); pg.click("[data-act=view][data-v=week]")
    pg.click("[data-act=ttshow][data-v=task]"); pg.wait_for_timeout(300)
    heads = pg.locator(".tth small").all_inner_texts()
    check(len(heads) in (5, 7) and (len(heads) == 7 or heads == ["월", "화", "수", "목", "금"]), "폰: 주말이 비면 월~금 " + str(heads))
    pg.click("[data-act=ttshow][data-v=all]")
    ctx.close(); b.close()
srv.kill()
print("checks:", n, "errors:", errs)
assert not errs, errs
