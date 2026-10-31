# 2.4.0: GPT 검토 반영 — 넘기기·반복 등록은 확정할 때 함께 저장, 완료한 할 일은 넘기기 없음, 이날만 바꾸기는 바꾼 칸만,
# 시작=종료·요일/시간 없는 고정 일정은 저장 막기, 카테고리 숫자 기준, 전체 탭 구성, 추가 전 표시, 한 줄 입력 날짜 표시, 시간 미정 줄
import os, subprocess, sys, time
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "dist", "app")
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8792"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
MOCK = """const m=TodoApp.memoryStore();
const k=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const T=(id,o)=>Object.assign({id,title:id,note:'',date:k(0),time:null,end:null,remind:null,cat:'k1',sub:null,done:false,doneAt:null,createdAt:1,subtasks:[]},o);
const w=new Date().getDay();
m.importAll({cats:null,tpls:[{id:'r_1',title:'분리수거',note:'',time:null,end:null,until:null,archived:false,remind:null,cat:'k1',sub:null,days:[w],subtasks:[],auto:false}],
 tasks:[T('t_a',{title:'보고서',time:'10:00',end:'11:30'}),T('t_d',{title:'끝낸 일',done:true,doneAt:1}),T('t_s',{title:'넘긴 일',skipped:true,skippedAt:1}),
  T('t_old',{title:'밀린 것',date:k(-3)}),T('t_u',{title:'시간 없는 일',date:k(1)})],
 events:[{id:'e_1',title:'자료구조',place:'IT관',color:'c6',days:[0,1,2,3,4,5,6],time:'15:00',end:'16:30',from:null,until:null,holOff:false,remind:null,note:'',skips:[],archived:false,createdAt:1}]});
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
    pg.goto("http://localhost:8792/"); pg.wait_for_selector(".grp")
    tasks = lambda: pg.evaluate("Object.fromEntries(window.__last.tasks)")
    ev = lambda: pg.evaluate("window.__last.events.get('e_1')")
    tk = pg.evaluate("(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})()")
    def esc():
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # 캘린더 숫자: 카테고리 머리도 안 함 제외(2개 중 1개 완료 + 보고서 = 1/2)
    check(pg.inner_text("#g-k1 .cnt") == "1/2" and "1/2 완료" in pg.inner_text(".prog"), "카테고리 숫자와 날짜 완료율이 같은 기준: " + pg.inner_text("#g-k1 .cnt"))
    check("눌러서 추가" in pg.inner_text("#g-k1 .task.ghost"), "반복 할 일 흐린 줄에 '추가 전'")
    # 완료한 할 일엔 넘기기 없음
    pg.click("#g-k1 .ttl:has-text('끝낸 일')")
    check(pg.locator(".sheet [data-act=eskip]").count() == 0, "완료한 할 일: 넘기기 없음")
    esc()
    # 넘기기: 고친 제목은 확정할 때 함께 저장, 취소하면 저장 안 함
    pg.click("#g-k1 .ttl:has-text('보고서')"); pg.fill("#e-title", "보고서 초안")
    pg.click(".sheet [data-act=eskip]"); pg.wait_for_timeout(150)
    check(pg.inner_text(".sheet h2") == "언제로 옮길까요?" and "안 함으로 남기기" in pg.inner_text(".sheet"), "넘기기 창")
    check(tasks()["t_a"]["title"] == "보고서", "넘기기 창을 열기만 하면 저장 안 함")
    pg.click(".sheet [data-act=close]"); pg.wait_for_timeout(300)
    check(tasks()["t_a"]["title"] == "보고서" and pg.inner_text("#toastMsg") == "변경 내용을 저장하지 않았어요", "취소하면 고친 것도 저장 안 함 + 알림")
    pg.click("#toastAct"); pg.wait_for_timeout(250)
    check(pg.input_value("#e-title") == "보고서 초안", "다시 열기: 고치던 그대로")
    pg.click(".sheet [data-act=eskip]"); pg.click(".laterpick [data-k]:nth-child(1)"); pg.wait_for_timeout(300)
    t = tasks()["t_a"]
    check(t["title"] == "보고서 초안" and not t.get("skipped") and t["date"] != tk and t.get("postponed") == 1, "날짜를 고르면 고친 제목도 저장되고 그 날로 옮김")
    check("옮겼어요" in pg.inner_text("#toastMsg"), "알림 문구")
    # 전체 탭 구성
    pg.click("[data-act=view][data-v=all]"); pg.wait_for_timeout(200)
    main = pg.inner_text("#main")
    check("앞으로" not in main and "날짜순" not in main and pg.locator(".pastbox h3").inner_text() == "밀린 할 일" and "모두 오늘로 옮기기" in main, "전체 탭: 앞으로·날짜순 없음, '밀린 할 일'")
    check(pg.locator(".donebox .dbh").inner_text() == "기록", "전체 탭 아래 '기록'")
    pg.click("[data-act=showdone]"); pg.wait_for_timeout(150)
    subs = pg.locator(".donebox .psub").all_inner_texts()
    check(len(subs) == 2 and subs[0].startswith("안 함") and subs[1].startswith("완료"), "기록 안에 안 함·완료 소제목: " + str(subs))
    # 반복 할 일로 등록(내일 할 일): 끝 시간도 옮김, 반복을 저장할 때 할 일 수정도 저장
    tm = pg.evaluate("(()=>{const d=new Date();d.setDate(d.getDate()+1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})()")
    pg.click("[data-act=showdone]"); pg.click(f"[data-act=goday][data-k='{tm}']"); pg.wait_for_timeout(300)
    pg.click("#g-k1 .ttl:has-text('시간 없는 일')")
    pg.fill("#e-title", "운동"); pg.fill("#e-time", "0700"); pg.dispatch_event("#e-time", "change"); pg.fill("#e-end", "0800"); pg.dispatch_event("#e-end", "change"); pg.wait_for_timeout(100)
    pg.click(".sheet [data-act=emore]"); pg.wait_for_timeout(100)
    pg.click(".sheet [data-act=tplfrom]"); pg.wait_for_timeout(150)
    check(pg.input_value("#e-end") == "08:00", "반복 등록: 끝 시간도 옮김")
    pg.click(".sheet [data-act=tplcancel]"); pg.wait_for_timeout(300)
    check(tasks()["t_u"]["title"] == "시간 없는 일" and pg.inner_text("#toastMsg") == "변경 내용을 저장하지 않았어요", "반복 등록을 취소하면 할 일 수정도 저장 안 함")
    pg.click("#toastAct"); pg.wait_for_timeout(250)
    if pg.locator(".sheet [data-act=emore]").count(): pg.click(".sheet [data-act=emore]"); pg.wait_for_timeout(100)
    pg.click(".sheet [data-act=tplfrom]"); pg.wait_for_timeout(150); pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(300)
    t = tasks()["t_u"]; r = [v for v in pg.evaluate("[...window.__last.tpls.values()]") if v["title"] == "운동"]
    check(t["title"] == "운동" and t["time"] == "07:00" and t.get("tpl") and len(r) == 1 and r[0]["end"] == "08:00", "반복을 저장하면 할 일 수정도 저장, 반복에 끝 시간")
    check(pg.inner_text("#toastMsg") == "반복 할 일을 등록했어요", "등록 알림")
    # 시작=종료면 저장 막음
    pg.click("#g-k1 .ttl:has-text('운동')"); pg.fill("#e-end", "0700"); pg.dispatch_event("#e-end", "change"); pg.wait_for_timeout(100)
    pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(200)
    check(pg.is_visible(".sheet [data-act=save]") and pg.inner_text("#toastMsg") == "시작 시간과 종료 시간이 같아요" and tasks()["t_u"]["end"] == "08:00", "시작=종료면 저장 막기")
    esc()
    # 한 줄 입력: 제목으로만 쓸 때 저장될 날짜
    pg.click("[data-act=add][data-cat=k1]"); pg.keyboard.type("3시 회의")
    check("내일 · 오후 3:00" in pg.inner_text(".qhint"), "시간만 쓰면 보고 있는 날 + 시간: " + pg.inner_text(".qhint"))
    pg.click(".qhint [data-act=qraw]")
    check("모두 제목으로 써요" in pg.inner_text(".qhint") and "내일" in pg.inner_text(".qhint"), "제목으로만: 보고 있는 날 표시")
    pg.keyboard.press("Escape")

    # 고정 일정: 이날만 장소만 → 원본 시간을 고치면 그날도 따라감
    pg.click("[data-act=view][data-v=week]"); pg.wait_for_timeout(300)
    # 보고 있는 날이 내일이라 시간표 주가 넘어갈 수 있다(토요일): 보이는 첫 고정 일정 칸의 날로 확인
    tk = pg.locator(".blk.ev").first.get_attribute("data-k")
    blk = pg.locator(f".blk.ev[data-k='{tk}']")
    blk.click(); pg.click(".sheet [data-act=evday]"); pg.fill("#e-place", "온라인"); pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(250)
    check(ev()["ovr"] == {tk: {"place": "온라인"}}, "이날만: 바꾼 장소만 기록 " + str(ev()["ovr"]))
    pg.click("[data-act=menu]"); pg.click(".sheet [data-act=evs]"); pg.click(".tplrow:has-text('자료구조')")
    check("지난 일정도 안 보여요" in pg.inner_text(".sheet") and pg.locator(".sheet [data-act=evarc]").inner_text() == "숨기기", "고정 일정: 숨기기 + 안내")
    pg.fill("#s-time-0", "1600"); pg.dispatch_event("#s-time-0", "change"); pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(300)
    t = pg.locator(f".blk.ev[data-k='{tk}']").inner_text()
    check("16:00–17:30" in t and "온라인" in t, "원본 시간을 고치면 장소만 바꾼 날도 새 시간: " + t.replace("\n", " "))
    # 요일·시간 없는 고정 일정은 저장 막음
    pg.click("[data-act=menu]"); pg.click(".sheet [data-act=evs]"); pg.click("[data-act=evnew]"); pg.fill("#e-title", "빈 일정")
    pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(200)
    check(pg.inner_text("#toastMsg") == "요일과 시작 시간을 정해 주세요" and pg.is_visible(".sheet [data-act=save]"), "요일·시간 없으면 저장 막기")
    esc()
    # 시간표 위 줄 이름(보고 있는 주가 다음 주면 시간 미정 할 일이 없을 수 있어 이번 주로)
    pg.evaluate("()=>{const b=document.querySelector('[data-act=wtoday]');if(b)b.click();}"); pg.wait_for_timeout(300)
    check(pg.locator(".ttallL").inner_text() == "시간 미정", "시간표 위 줄: 시간 미정")
    check(pg.locator(".ttfacts [data-act=evs]").inner_text() == "고정 일정 관리", "시간표 아래: 고정 일정 관리")
    pg.click("[data-act=menu]"); m = pg.inner_text(".menu")
    check("백업 만들기" in m and "백업 복원" in m and "숨김" in m, "설정 메뉴: 백업 만들기·복원, 숨김")
    esc()
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(300)
    pg.screenshot(path=os.path.join(HERE, "out", "v24-week.png"))
    pg.click("[data-act=view][data-v=day]"); pg.wait_for_timeout(300)
    pg.screenshot(path=os.path.join(HERE, "out", "v24-day.png"), full_page=True)
    ctx.close(); b.close()
srv.kill()
print("checks:", n, "errors:", errs)
assert not errs, errs
