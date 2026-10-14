# 마감(1.5.0) 회귀 테스트
import os, subprocess, sys, time, json
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "dist", "app")
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8783"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
# 메모리 저장소 + Firestore처럼 undefined 값을 거부 + 알림 켜진 것처럼(store.push)
MOCK = """const m=TodoApp.memoryStore();window.__m=m;
const bad=(v,p)=>{if(v===undefined)throw new Error('undefined at '+p);if(v&&typeof v==='object')for(const k in v)bad(v[k],p+'.'+k);};
const s=Object.assign({},m,{kind:'pwa',set(id,b){bad(b,id);return m.set(id,b);},update(id,p){bad(p,id);return m.update(id,p);},
 push:{state:()=>Promise.resolve('on'),schedule(){},enable:()=>Promise.resolve(),disable:()=>Promise.resolve(),test:()=>Promise.resolve({sent:1})}});
s.start=c=>m.start({onData:d=>{window.__last=d;c.onData(d);},onStatus:c.onStatus,onError:c.onError});
window.__all=()=>{const o={};for(const [k,v] of window.__last.tasks)o[k]=v;return o;};
m.importAll({cats:null,tpls:[],tasks:[],events:[{id:'e_1',title:'자료구조',place:'IT관',color:'c6',days:[0,1,2,3,4,5,6],time:'15:00',end:'16:30',from:null,until:null,holOff:false,remind:null,note:'',skips:[],archived:false,createdAt:1}]});
TodoApp.boot(s);"""
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
    pg.goto("http://localhost:8783/"); pg.wait_for_selector(".grp")
    K = lambda n: pg.evaluate("n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}", n)
    tasks = lambda: {k: v for k, v in pg.evaluate("__all()").items() if k.startswith("t_")}

    # 1) 마감 정하기: 기본은 일주일 뒤 → 목록에 D-7
    pg.click("[data-act=add][data-cat=k1]"); pg.keyboard.type("보고서"); pg.keyboard.press("Enter"); pg.keyboard.press("Escape")
    pg.click(".ttl:has-text('보고서')")
    check(pg.locator("[data-act=dueset]").count() == 1 and pg.locator("#e-due").count() == 0, "마감은 처음엔 버튼 하나")
    pg.click("[data-act=dueset]")
    check(pg.input_value("#e-due") == K(7), "기본 마감 = 일주일 뒤")
    pg.click(".sheet [data-act=close]"); pg.wait_for_timeout(250)
    t = [v for v in tasks().values() if v["title"] == "보고서"][0]
    check(t["due"] == K(7) and t["dueTime"] is None and t["dueRemind"] is None, "저장: due만, 시간·알림 null")
    check("D-7" in pg.inner_text(".task:has-text('보고서')"), "목록에 D-7")

    # 2) 오늘 14:00 마감 + 하루 전 알림
    pg.click(".ttl:has-text('보고서')"); pg.fill("#e-due", K(0)); pg.dispatch_event("#e-due", "change")
    pg.fill("#e-duet", "14:00"); pg.dispatch_event("#e-duet", "change")
    pg.click("[data-act=eduer][data-m='1440']")
    check("오늘" in pg.inner_text("label[for=e-due]"), "라벨에 남은 날 표시")
    pg.click(".sheet [data-act=close]"); pg.wait_for_timeout(250)
    t = [v for v in tasks().values() if v["title"] == "보고서"][0]
    check(t["due"] == K(0) and t["dueTime"] == "14:00" and t["dueRemind"] == 1440, "마감 시간·알림 저장")
    check("D-day 오후 2:00" in pg.inner_text(".task:has-text('보고서')"), "오늘 마감은 D-day + 시간")
    # 바꾸지 않고 닫으면 쓰지 않음
    before = json.dumps(tasks(), sort_keys=True)
    pg.click(".ttl:has-text('보고서')"); pg.click(".sheet [data-act=close]"); pg.wait_for_timeout(200)
    check(json.dumps(tasks(), sort_keys=True) == before, "안 고치면 저장 안 함")

    # 3) 어제 마감 → 마감 지남, 지우기
    pg.click(".ttl:has-text('보고서')"); pg.fill("#e-due", K(-1)); pg.dispatch_event("#e-due", "change"); pg.click(".sheet [data-act=close]"); pg.wait_for_timeout(250)
    check("마감 지남" in pg.inner_text(".task:has-text('보고서')"), "지난 마감은 '마감 지남'")
    pg.click(".ttl:has-text('보고서')"); pg.click("[data-act=duenone]"); pg.click(".sheet [data-act=close]"); pg.wait_for_timeout(250)
    t = [v for v in tasks().values() if v["title"] == "보고서"][0]
    check(t["due"] is None and t["dueRemind"] is None and "D-" not in pg.inner_text(".task:has-text('보고서')"), "마감 지우기")

    # 4) 수업에서 과제 추가 → 제목에 수업 이름, 날짜 없음, 마감 = 다음 수업
    nowm = pg.evaluate("(()=>{const d=new Date();return d.getHours()*60+d.getMinutes();})()")
    nk = K(0) if nowm < 15 * 60 else K(1)
    pg.click(".evrow"); pg.click("[data-act=evtask]")
    check(pg.input_value("#e-title") == "자료구조 ", "제목은 수업 이름으로 시작")
    check(pg.is_checked("#e-nodate") and pg.input_value("#e-due") == nk, "날짜 없음 + 마감은 다음 수업 날(" + nk + ")")
    pg.keyboard.type("과제 1"); pg.click("[data-act=ecat][data-cat=k2]"); pg.click(".sheet [data-act=close]"); pg.wait_for_timeout(250)
    t = [v for v in tasks().values() if v["title"] == "자료구조 과제 1"][0]
    check(t["date"] is None and t["due"] == nk and t["dueTime"] == "15:00" and t["cat"] == "k2", "과제 저장: 마감 15:00, 고른 카테고리")
    # 다음 과제는 지난번 카테고리로
    pg.click(".evrow"); pg.click("[data-act=evtask]")
    check(pg.get_attribute("[data-act=ecat][data-cat=k2]", "aria-pressed") == "true", "다음 과제는 지난번 카테고리")
    pg.click(".sheet [data-act=tplcancel]"); pg.wait_for_timeout(250)
    check(len([v for v in tasks().values() if v["title"].startswith("자료구조")]) == 1, "취소하면 안 생김")

    # 5) 마감날: 캘린더 점 + 그날 '마감' 줄, 누르면 편집
    pg.click(f".day[data-k='{nk}']")
    check(pg.locator(f".day[data-k='{nk}'] .dd").count() == 1, "캘린더 마감 점")
    check("마감" in (pg.get_attribute(f".day[data-k='{nk}']", "aria-label") or ""), "읽어 주기 라벨에 마감")
    row = pg.locator(".duerow:has-text('자료구조 과제 1')")
    check(row.count() == 1 and "오후 3:00" in row.inner_text(), "그날 '마감' 줄")
    row.click()
    check(pg.input_value("#e-title") == "자료구조 과제 1", "마감 줄 누르면 편집")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(250)
    # 전체 탭: 날짜 없음 칸에 D-n
    pg.click("[data-act=view][data-v=all]")
    check(("D-" in pg.inner_text("#ds-none")) or ("D-day" in pg.inner_text("#ds-none")), "전체 탭 날짜 없음에도 D 표시")
    # 완료하면 D 표시와 점이 사라짐
    pg.click("#ds-none .task:has-text('자료구조') .chk"); pg.wait_for_timeout(250)
    pg.click("[data-act=view][data-v=day]")
    check(pg.locator(f".day[data-k='{nk}'] .dd").count() == 0, "완료하면 캘린더 점 없어짐")
    pg.screenshot(path=os.path.join(HERE, "out", "due-day.png"))
    ctx.close(); b.close()
srv.kill()
print("checks:", n, "errors:", errs)
assert not errs, errs
