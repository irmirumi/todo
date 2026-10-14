# 1.9.0: 폰 시간표 3일 보기(가로로 끝없이 밀기)
import os, subprocess, sys, time
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "dist", "app")
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8786"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
MOCK = """const m=TodoApp.memoryStore();
const k=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const T=(id,o)=>Object.assign({id,title:id,note:'',date:k(0),time:null,end:null,remind:null,cat:'k1',sub:null,done:false,doneAt:null,createdAt:1,subtasks:[]},o);
m.importAll({cats:null,tpls:[],events:[{id:'e_1',title:'자료구조',place:'IT관 204',color:'c6',days:[0,1,2,3,4,5,6],time:'13:00',end:'14:30',holOff:false,skips:[],createdAt:1}],
 tasks:[T('t_1',{title:'오늘 할 일',time:'10:00'}),T('t_2',{title:'열흘 뒤 할 일',date:k(10),time:'11:00'})]});
TodoApp.boot(m);"""
K = "n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}"
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
    pg.goto("http://localhost:8786/"); pg.wait_for_selector(".grp")
    k = lambda d: pg.evaluate(K, d)
    pg.click("[data-act=view][data-v=week]"); pg.wait_for_timeout(400)
    check(pg.locator(".tt3").count() == 1 and pg.locator(".tth").count() == 21, "폰 기본은 3일 보기(21일을 깔아 둠)")
    fb = pg.evaluate("document.querySelector('.ttfoot').getBoundingClientRect().bottom")
    check(fb <= 844, f"아래 버튼 줄까지 한 화면에 들어옴({fb:.0f}/844)")
    peek = pg.evaluate("""()=>{const t=document.querySelector('.tt3'),r=t.getBoundingClientRect();const c=[...t.querySelectorAll('.tth')].find(h=>{const b=h.getBoundingClientRect();return b.left<r.right&&b.right>r.right;});return c?Math.round(r.right-c.getBoundingClientRect().left):0;}""")
    check(5 <= peek <= 20, f"넷째 날이 살짝 보여 옆으로 밀 수 있다는 걸 알림({peek}px)")
    vis = lambda: pg.evaluate("""()=>{const t=document.querySelector('.tt3'),r=t.getBoundingClientRect();return [...t.querySelectorAll('.tth')].filter(h=>{const b=h.getBoundingClientRect();return b.left>=r.left+29&&b.right<=r.right+1;}).map(h=>h.dataset.k);}""")
    v = vis()
    check(v[0] == k(0) and len(v) == 3, "처음엔 오늘이 맨 왼쪽, 3일이 보임: " + str(v))
    w = pg.evaluate("document.querySelector('.ttcol').getBoundingClientRect().width")
    check(w > 100, f"칸 폭이 넓어짐({w:.0f}px)")
    check(pg.locator(".blk.ev").first.inner_text().count("\n") >= 2, "칸 안에 제목·시간·장소가 다 들어감")
    check("오늘" in pg.inner_text(".ebrow") and pg.is_hidden("[data-act=wtoday]"), "제목 위에 '오늘', 오늘 버튼은 숨김")
    # 화살표: 3일씩
    pg.click("[data-act=wnav][data-d='1']"); pg.wait_for_timeout(700)
    v = vis()
    check(v == [k(3), k(4), k(5)], "다음 화살표 → 3일 뒤: " + str(v))
    t = pg.inner_text("#tttitle"); d3 = pg.evaluate("k=>+k.slice(8)", k(3))
    check(str(d3) + "일" in t, "제목이 보이는 3일로 바뀜: " + t)
    check(pg.is_visible("[data-act=wtoday]"), "오늘이 안 보이면 '오늘' 버튼")
    # 끝없이 밀기: 계속 밀면 기준 주가 옮겨 가고, 열흘 뒤 할 일이 나온다
    for _ in range(3):
        pg.evaluate("()=>{const t=document.querySelector('.tt3');t.scrollLeft+=t.querySelector('.ttcol').offsetWidth*3;}"); pg.wait_for_timeout(500)
    v = vis()
    check(v == [k(12), k(13), k(14)] and pg.locator(".tth").count() == 21, "가장자리에서 다시 깔아도 보던 날 그대로: " + str(v))
    check(pg.locator(".blk:has-text('열흘 뒤 할 일')").count() == 1, "다음 주 너머 일정도 보임")
    # 오늘로
    pg.click("[data-act=wtoday]"); pg.wait_for_timeout(500)
    check(vis() == [k(0), k(1), k(2)], "오늘 버튼 → 오늘이 맨 왼쪽")
    # 세로로 밀어도 날짜 줄은 붙어 있음
    pg.evaluate("document.querySelector('.tt3').scrollTop=300"); pg.wait_for_timeout(200)
    gap = pg.evaluate("document.querySelector('.tt3 .tthead').getBoundingClientRect().top-document.querySelector('.tt3').getBoundingClientRect().top")
    check(abs(gap) < 2, f"세로로 밀어도 날짜 줄 고정({gap:.1f})")
    # 7일 보기 전환·기억
    pg.click("[data-act=tt7]"); pg.wait_for_timeout(300)
    check(pg.locator(".tt3").count() == 0 and pg.locator(".tth").count() in (5, 7), "7일 보기로 전환")
    pg.reload(); pg.wait_for_selector(".tt")
    check(pg.locator(".tt3").count() == 0 and pg.inner_text("[data-act=tt7]") == "3일 보기", "7일 보기 기억")
    pg.click("[data-act=tt7]"); pg.wait_for_timeout(300)
    check(pg.locator(".tt3").count() == 1 and vis()[0] == k(0), "다시 3일 보기")
    # 빈칸 누르기는 그대로
    col = pg.locator(f".ttcol[data-k='{k(1)}']"); bb = col.bounding_box()
    pg.mouse.click(bb["x"] + bb["width"] / 2, bb["y"] + 20)
    check(pg.is_visible("[data-act=slottask]"), "빈칸 누르면 넣기 시트")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    # PC는 7일 그대로
    pg.set_viewport_size({"width": 1280, "height": 900}); pg.wait_for_timeout(400)
    check(pg.locator(".tt3").count() == 0 and pg.locator(".tth").count() == 7 and pg.locator("[data-act=tt7]").count() == 0, "PC는 7일, 전환 버튼 없음")
    pg.screenshot(path=os.path.join(HERE, "out", "pc-tt.png"))
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(400)
    check(pg.locator(".tt3").count() == 1, "폰 크기로 돌아오면 3일")
    pg.screenshot(path=os.path.join(HERE, "out", "m-tt3.png"))
    ctx.close(); b.close()
srv.kill()
print("checks:", n, "errors:", errs)
assert not errs, errs
