# 2.3.0: 고정 일정 하나에 요일·시간 여러 개(예: 월 10:30–11:45, 수 14:00–15:30)
import os, subprocess, sys, time
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "dist", "app")
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8791"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
MOCK = """const m=TodoApp.memoryStore();
m.importAll({cats:null,tpls:[],tasks:[],events:[
 {id:'e_s',title:'자료구조',place:'IT관',color:'c6',days:[1],time:'10:30',end:'11:45',slots:[{days:[1],time:'10:30',end:'11:45'},{days:[3],time:'14:00',end:'15:30'}],
  from:null,until:null,holOff:false,remind:null,note:'',skips:[],archived:false,createdAt:1},
 {id:'e_o',title:'영어회화',place:'',color:'c3',days:[2,4],time:'09:00',end:'10:00',from:null,until:null,holOff:false,remind:null,note:'',skips:[],archived:false,createdAt:2}]});
TodoApp.boot({kind:'pwa',start(c){m.start({onData(d){window.__last=d;c.onData(d);},onStatus:x=>c.onStatus(x==='local'?'live':x),onError:c.onError});},set:m.set,update:m.update,remove:m.remove,saveCats:m.saveCats,importAll:m.importAll});"""
n = 0
def check(cond, msg):
    global n; n += 1
    assert cond, msg
    print("ok", msg)
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 900}); pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("**/app.js", lambda r: r.fulfill(body=MOCK, content_type="text/javascript"))
    # 다음 주 월요일을 기준으로
    mon = pg.evaluate("""(()=>{const d=new Date();d.setDate(d.getDate()+((8-d.getDay())%7||7));return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})()""")
    add = lambda k, n_: pg.evaluate("([k,n])=>{const d=new Date(k+'T12:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}", [k, n_])
    wed, tue = add(mon, 2), add(mon, 1)
    pg.goto("http://localhost:8791/#d=" + mon); pg.wait_for_selector(".grp")
    pg.click("[data-act=view][data-v=week]"); pg.wait_for_timeout(300)
    ev = lambda k: [x.replace("\n", " ") for x in pg.locator(f".blk.ev[data-id=e_s][data-k='{k}']").all_inner_texts()]
    check(len(ev(mon)) == 1 and "10:30–11:45" in ev(mon)[0], "월: 10:30–11:45 " + str(ev(mon)))
    check(len(ev(wed)) == 1 and "14:00–15:30" in ev(wed)[0], "수: 14:00–15:30 " + str(ev(wed)))
    check(len(ev(tue)) == 0 and pg.locator(".blk.ev[data-id=e_s]").count() == 2, "다른 요일엔 없음")
    check(pg.locator(f".blk.ev[data-id=e_o][data-k='{tue}']").count() == 1, "예전 방식(묶음 없는) 일정도 그대로")

    # 수요일 칸 → 정보: 이 날 시간 + 매주 전체
    pg.click(f".blk.ev[data-id=e_s][data-k='{wed}']"); pg.wait_for_timeout(200)
    info = pg.inner_text(".info")
    check("오후 2:00–3:30" in info.split("매주")[0] and pg.locator(".info .islot").count() == 2, "정보: 시간은 이 날 것, 매주에 둘 다")
    # 이 날만 바꾸기: 평소는 수요일 시간
    pg.click(".sheet [data-act=evday]"); pg.wait_for_timeout(200)
    check(pg.input_value("#e-time") == "14:00" and "평소 오후 2:00" in pg.inner_text(".sheet"), "이 날만 바꾸기: 그 요일 시간으로 시작")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # 정보 → 편집: 그 날의 묶음이 펼쳐짐
    pg.click(f".blk.ev[data-id=e_s][data-k='{wed}']"); pg.wait_for_timeout(200)
    pg.click(".sheet [data-act=eedit]"); pg.wait_for_timeout(200)
    check(pg.input_value("#e-time") == "14:00" and pg.locator(".slot.on").count() == 1 and pg.locator("button.slot").count() == 1, "편집: 수요일 묶음이 펼쳐짐")
    # 다른 묶음으로 바꿔 보기만 하고 닫으면 '저장 안 하고' 알림 없음
    pg.click("button.slot"); pg.wait_for_timeout(150)
    check(pg.input_value("#e-time") == "10:30", "다른 묶음 펼치기")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check(not pg.is_visible("#toast") or pg.inner_text("#toastMsg") != "저장 안 하고 닫았어요", "펼치기만 하고 닫으면 고친 것 아님")

    # 다른 묶음에 있는 요일은 못 고름
    pg.click("[data-act=menu]"); pg.click(".sheet [data-act=evs]"); pg.wait_for_timeout(150)
    rowtxt = pg.inner_text(".tplrow:has-text('자료구조') .when")
    check("월 오전 10:30–11:45" in rowtxt and "수 오후 2:00–3:30" in rowtxt, "목록에 묶음 둘: " + rowtxt.replace("\n", " / "))
    pg.click(".tplrow:has-text('자료구조')"); pg.wait_for_timeout(150)
    pg.click(".slot.on [data-act=eday][data-d='3']"); pg.wait_for_timeout(150)
    check("다른 시간에" in pg.inner_text("#toastMsg"), "다른 묶음의 요일 누르면 알림")
    check(pg.get_attribute(".slot.on [data-d='3']", "aria-pressed") == "false", "그 요일은 안 들어감")
    # 월요일 시작을 11:00으로(길이 유지 → 끝 12:15), 금요일 추가
    pg.fill("#e-time", "11:00"); pg.dispatch_event("#e-time", "change"); pg.wait_for_timeout(100)
    check(pg.input_value("#e-end") == "12:15", "시작 옮기면 끝도(길이 유지)")
    pg.click(".slot.on [data-act=eday][data-d='5']"); pg.wait_for_timeout(100)
    # 새 묶음: 목 16:00, 30분
    pg.click("[data-act=evslotadd]"); pg.wait_for_timeout(150)
    check(pg.locator(".slot").count() == 3 and pg.input_value("#e-time") == "11:00", "묶음 추가: 펼친 시간을 이어받음")
    pg.click(".slot.on [data-act=eday][data-d='4']")
    pg.fill("#e-time", "16:00"); pg.dispatch_event("#e-time", "change"); pg.wait_for_timeout(100)
    pg.click(".durrow [data-m='30']"); pg.wait_for_timeout(100)
    pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(300)
    e = pg.evaluate("window.__last.events.get('e_s')")
    sl = [(x["days"], x["time"], x["end"]) for x in e["slots"]]
    check(sl == [([1, 5], "11:00", "12:15"), ([3], "14:00", "15:30"), ([4], "16:00", "16:30")], "저장: " + str(sl))
    check(e["days"] == [1, 5] and e["time"] == "11:00" and e["end"] == "12:15", "첫 묶음은 days·time·end에도(예전 버전용)")

    # 묶음 빼기 → 하나 남으면 예전처럼(slots 없음)
    pg.click("[data-act=menu]"); pg.click(".sheet [data-act=evs]"); pg.wait_for_timeout(150)
    pg.click(".tplrow:has-text('자료구조')"); pg.wait_for_timeout(150)
    for _ in range(2):
        pg.click(".slot.on [data-act=evslotdel]"); pg.wait_for_timeout(120)
    check(pg.locator(".slot").count() == 0 and pg.locator("[data-act=evslotadd]").count() == 1, "하나 남으면 보통 화면")
    pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(300)
    e = pg.evaluate("window.__last.events.get('e_s')")
    check(e.get("slots") is None and e["days"] == [4] and e["time"] == "16:00", "하나만 남으면 slots 없이: " + str((e["days"], e["time"])))

    # 새 고정 일정: 요일 없는 빈 묶음은 버림
    pg.click("[data-act=menu]"); pg.click(".sheet [data-act=evs]"); pg.click("[data-act=evnew]"); pg.wait_for_timeout(150)
    pg.fill("#e-title", "실험")
    pg.fill("#e-time", "13:00"); pg.dispatch_event("#e-time", "change"); pg.wait_for_timeout(100)
    pg.click("[data-act=evslotadd]"); pg.wait_for_timeout(100)
    pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(300)
    new = [v for v in pg.evaluate("[...window.__last.events.values()]") if v["title"] == "실험"]
    check(len(new) == 1 and new[0].get("slots") is None and new[0]["time"] == "13:00" and new[0]["end"] == "14:00", "빈 묶음은 버리고 저장")

    # 폰 화면에서도 편집 시트 모양 확인
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(300)
    pg.click("[data-act=menu]"); pg.click(".sheet [data-act=evs]"); pg.click(".tplrow:has-text('실험')"); pg.wait_for_timeout(150)
    pg.click("[data-act=evslotadd]"); pg.click(".slot.on [data-act=eday][data-d='2']"); pg.wait_for_timeout(150)
    pg.screenshot(path=os.path.join(HERE, "out", "slots_phone.png"), full_page=False)
    ow = pg.evaluate("document.querySelector('.sheet').scrollWidth<=document.querySelector('.sheet').clientWidth")
    check(ow, "폰: 가로로 넘치지 않음")
    ctx.close(); b.close()
srv.kill()
print("checks:", n, "errors:", errs)
assert not errs, errs
