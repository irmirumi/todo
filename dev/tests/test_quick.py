# 1.6.0: 한 줄 입력 해석, 폰 종일 줄 개수, 자정 근처 칸 잘림, 홈 화면 바로가기(#add, #week)
import os, subprocess, sys, time, json
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "dist", "app")
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8784"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
MOCK = """const m=TodoApp.memoryStore();window.__m=m;
const k=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const T=(id,o)=>Object.assign({id,title:id,note:'',date:k(0),time:null,end:null,remind:null,cat:'k1',sub:null,done:false,doneAt:null,createdAt:1,subtasks:[]},o);
m.importAll({cats:null,tpls:[],events:[],tasks:[T('t_n1',{title:'약 먹기',time:'23:40'}),T('t_u1',{title:'종일 하나'}),T('t_u2',{title:'종일 둘',done:true}),T('t_u3',{title:'종일 셋'})]});
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
    ctx.add_init_script("try{localStorage.setItem('todo.tt7','1')}catch(e){}")  # 폰 7일 보기 기준 테스트(3일 보기는 test_tt3.py)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("**/app.js", lambda r: r.fulfill(body=MOCK, content_type="text/javascript"))
    pg.goto("http://localhost:8784/"); pg.wait_for_selector(".grp")
    # --- 해석기: 기준일 2026-10-15(목)
    P = lambda s: (lambda r: r and {k: v for k, v in r.items() if k != "amb"})(pg.evaluate("s=>TodoApp.parseQuick(s,'2026-10-15')", s))
    cases = {
        "내일 3시 과제 제출": {"title": "과제 제출", "date": "2026-10-16", "time": "15:00", "end": None},
        "과제 제출 내일": {"title": "과제 제출", "date": "2026-10-16", "time": None, "end": None},
        "금요일 14:00 팀플": {"title": "팀플", "date": "2026-10-16", "time": "14:00", "end": None},
        "다음주 월요일 회의": {"title": "회의", "date": "2026-10-19", "time": None, "end": None},
        "이번주 토요일 대청소": {"title": "대청소", "date": "2026-10-17", "time": None, "end": None},
        "목요일 발표": {"title": "발표", "date": "2026-10-15", "time": None, "end": None},
        "10/20 병원": {"title": "병원", "date": "2026-10-20", "time": None, "end": None},
        "10월 31일 할로윈": {"title": "할로윈", "date": "2026-10-31", "time": None, "end": None},
        "3일 관리비": {"title": "관리비", "date": "2026-11-03", "time": None, "end": None},
        "오전 9시 운동": {"title": "운동", "date": None, "time": "09:00", "end": None},
        "저녁 7시 반 약속": {"title": "약속", "date": None, "time": "19:30", "end": None},
        "3시-5시 스터디": {"title": "스터디", "date": None, "time": "15:00", "end": "17:00"},
        "모레 15:00~16:30 면담": {"title": "면담", "date": "2026-10-17", "time": "15:00", "end": "16:30"},
        "9시 출근": {"title": "출근", "date": None, "time": "09:00", "end": None},
        "오후3시 미팅": {"title": "미팅", "date": None, "time": "15:00", "end": None},
    }
    for s, want in cases.items():
        got = P(s)
        check(got == want, f"해석 '{s}' → {got}")
    for s in ["3시간 공부", "일 마무리", "월 결산", "밤 산책", "내일", "수학 문제 30개", "1:1 면담"]:
        got = P(s)
        check(got is None or got["title"] == s, f"안 건드림 '{s}' → {got}")

    tk = pg.evaluate("(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})()")
    tm = pg.evaluate("(()=>{const d=new Date();d.setDate(d.getDate()+1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})()")
    tasks = lambda: [v for v in pg.evaluate("[...window.__last.tasks.values()]")]
    # --- 캘린더에서 입력: 미리보기 → 엔터 → 내일 15:00, 토스트 '보기'
    pg.click("[data-act=add][data-cat=k1]")
    pg.keyboard.type("내일 3시 과제 제출")
    check("날짜·시간: 내일 · 오후 3:00" in pg.inner_text(".qhint"), "입력하면서 미리보기")
    pg.keyboard.press("Enter"); pg.wait_for_timeout(200)
    t = [x for x in tasks() if x["title"] == "과제 제출"]
    check(len(t) == 1 and t[0]["date"] == tm and t[0]["time"] == "15:00", "내일 15:00으로 추가")
    check("내일 오후 3:00 · 할 일을 추가했어요" in pg.inner_text("#toastMsg") and pg.inner_text("#toastAct") == "오전으로", "다른 날로 들어가면 알려 줌(오전·오후를 짐작했으면 바꾸기 버튼)")
    check(pg.evaluate("document.activeElement.id") == "add-k1" and pg.inner_text(".qhint") == "", "입력칸 비우고 포커스 유지")
    # 그대로 쓰기
    pg.keyboard.type("내일 할 일 정리")
    pg.click(".qhint [data-act=qraw]")
    check("모두 제목으로" in pg.inner_text(".qhint") and "오늘" in pg.inner_text(".qhint"), "'제목으로만 사용'으로 끔(저장될 날짜도 보임)")
    check(pg.evaluate("document.activeElement.id") == "add-k1", "끄기 눌러도 입력칸 포커스")
    pg.keyboard.press("Enter"); pg.wait_for_timeout(200)
    t = [x for x in tasks() if x["title"] == "내일 할 일 정리"]
    check(len(t) == 1 and t[0]["date"] == tk and t[0]["time"] is None, "그대로 쓰면 제목 그대로, 오늘")
    pg.keyboard.type("오늘 9시 운동"); pg.keyboard.press("Enter"); pg.wait_for_timeout(200)
    t = [x for x in tasks() if x["title"] == "운동"]
    check(len(t) == 1 and t[0]["time"] == "09:00", "끈 건 한 번만: 다음 입력은 다시 해석")
    pg.keyboard.press("Escape")
    # --- 전체 탭
    pg.click("[data-act=view][data-v=all]"); pg.click("[data-act=add][data-cat=all]")
    pg.keyboard.type("모레 15:00~16:30 면담"); pg.keyboard.press("Enter"); pg.wait_for_timeout(200)
    t = [x for x in tasks() if x["title"] == "면담"]
    check(len(t) == 1 and t[0]["time"] == "15:00" and t[0]["end"] == "16:30", "전체 탭 입력도 해석(끝 시간 포함)")
    pg.keyboard.press("Escape")
    # --- 시간표: 폰 종일 줄은 개수, 자정 근처 칸은 안 잘림
    pg.click("[data-act=view][data-v=week]"); pg.wait_for_timeout(200)
    col = pg.locator(f".ttallC .uchip[data-k='{tk}']")
    check(col.count() == 1 and col.inner_text() == "할 일 3", "폰 종일 줄: 미완료 개수(종일 하나·셋·할 일 정리) → " + (col.inner_text() if col.count() else "-"))
    box = pg.evaluate("""()=>{const b=[...document.querySelectorAll('.blk')].find(x=>x.title==='약 먹기');const r=b.getBoundingClientRect(),p=b.closest('.ttbody').getBoundingClientRect();return [r.bottom,p.bottom];}""")
    check(box[0] <= box[1] + 0.5, f"23:40 칸이 시간표 안에 들어옴 {box}")
    col.click()
    check(pg.locator("body[data-view=day]").count() == 1, "개수 칩 누르면 그날 캘린더")
    pg.set_viewport_size({"width": 1280, "height": 900}); pg.click("[data-act=view][data-v=week]"); pg.wait_for_timeout(300)
    check(pg.locator(".ucount").count() == 0 and pg.locator(".ttallC .uchip:has-text('할 일 정리')").count() == 1, "PC 종일 줄은 제목 그대로")
    # --- 바로가기
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.goto("about:blank"); pg.goto("http://localhost:8784/#add"); pg.wait_for_selector(".grp"); pg.wait_for_timeout(300)
    check(pg.evaluate("document.activeElement && document.activeElement.id") == "add-k1" and pg.evaluate("location.hash") == "", "#add: 오늘 캘린더에서 바로 입력")
    pg.goto("about:blank"); pg.goto("http://localhost:8784/#week"); pg.wait_for_selector(".tt"); pg.wait_for_timeout(200)
    check(pg.locator("body[data-view=week]").count() == 1, "#week: 시간표")
    man = json.load(open(os.path.join(APP, "manifest.webmanifest"), encoding="utf-8"))
    check([s["url"] for s in man["shortcuts"]] == ["./#add", "./#week"], "manifest 바로가기 2개")
    ctx.close(); b.close()
srv.kill()
print("checks:", n, "errors:", errs)
assert not errs, errs
