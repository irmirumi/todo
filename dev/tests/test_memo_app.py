# 2.9.0 메모 앱: /memo/는 같은 코드를 메모 화면만으로 연다. 폰 또박에는 메모 탭이 없고 메뉴에서 메모 앱으로 안내.
# 메모 앱은 보기 설정(todo.view)을 바꾸지 않고, 휴지통·비우기는 메모만, 날짜 열기(#week 등)는 무시
from playwright.sync_api import sync_playwright
from ttb import check, serve, done, OUT
srv = serve(8799)
MOCK = """const m=TodoApp.memoryStore();window.__m=m;const now=Date.now();
m.importAll({cats:null,tpls:[],events:[],
 tasks:[{id:'t_keep',title:'남길 할 일',date:null,cat:'k1',done:false,createdAt:1,subtasks:[]},{id:'t_bin',title:'휴지통 할 일',date:null,cat:'k1',done:false,createdAt:1,subtasks:[],deletedAt:now}],
 memos:[{id:'m_a',text:'# 수업 메모\\n- 첫 줄',color:'c5',x:40,y:40,w:260,h:220,z:1,createdAt:1,updatedAt:2},
        {id:'m_bin',text:'지운 메모',color:'',x:340,y:40,w:240,h:200,z:2,createdAt:1,updatedAt:1,deletedAt:now}]});
const s=Object.assign({},m,{kind:'pwa',email:'me@example.com',signOut(){return Promise.resolve();},start(c){m.start({onData:(d,meta)=>{window.__d=d;c.onData(d,meta);},onStatus:x=>c.onStatus(x==='local'?'live':x),onError:c.onError});}});
TodoApp.boot(s);"""
errs = []
URL = "http://localhost:8799/"
def ctx_page(b, w, h, touch, scheme="light"):
    ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=touch, color_scheme=scheme); pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.route("**/app.js", lambda r: r.fulfill(body=MOCK, content_type="text/javascript"))
    return ctx, pg
pref = lambda pg: pg.evaluate("localStorage.getItem('todo.view')")
with sync_playwright() as p:
    b = p.chromium.launch()
    # ---------- 폰: 또박 ----------
    ctx, pg = ctx_page(b, 390, 844, True)
    ctx.add_init_script("try{if(!sessionStorage.getItem('seeded')){localStorage.setItem('todo.view','memo');sessionStorage.setItem('seeded','1')}}catch(e){}")
    pg.goto(URL); pg.wait_for_selector(".grp")
    check(pg.locator("#vMemo").is_hidden() and pg.locator("#vDay").is_visible(), "폰 또박: 메모 탭 없음(달력·시간표·전체)")
    check(pg.evaluate("document.body.dataset.view") == "day", "예전에 메모 탭에 있었어도 폰 또박은 달력으로 열림")
    pg.click("[data-act=menu]"); pg.wait_for_timeout(300)
    ml = pg.locator(".menu a.mlink")
    check(ml.count() == 1 and ml.get_attribute("href") == "memo/" and "메모 앱" in ml.inner_text(), "폰 또박 메뉴: '메모 앱' 링크")
    pg.screenshot(path=OUT + "memoapp-todo-menu.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # ---------- 폰: 메모 앱 ----------
    pg.evaluate("localStorage.setItem('todo.view','week')")
    pg.goto(URL + "memo/"); pg.wait_for_selector(".mcard")
    check(pg.title() == "또박 메모" and pg.evaluate("document.documentElement.dataset.app") == "memo", "메모 앱 페이지(제목·data-app)")
    check(pg.locator("header.top").count() == 0 and pg.inner_text("#main h1") == "메모" and pg.locator("#main .hrow .more").is_visible(), "메모 앱: 탭 줄 없이 머리에 ⋯")
    check(pg.locator(".mcard").count() == 1, "메모 목록(휴지통 것은 빼고)")
    check(pg.evaluate("document.querySelector('link[rel=manifest]').href").endswith("/memo/manifest.webmanifest"), "메모 앱 전용 manifest")
    mf = pg.evaluate("fetch('manifest.webmanifest').then(r=>r.json())")
    check(mf["name"] == "또박 메모" and mf["start_url"] == "./" and mf["icons"][0]["src"].startswith("../icons/memo-"), "manifest: 이름·시작 주소·메모 아이콘")
    check(pg.evaluate("fetch(new URL('../icons/memo-192.png',location)).then(r=>r.ok)"), "메모 아이콘 파일 있음")
    pg.screenshot(path=OUT + "memoapp-phone.png")
    # 새 메모(닫으면 저장)
    pg.click("[data-act=mnew]"); pg.wait_for_timeout(400); pg.fill("#m-text", "메모 앱에서 쓴 메모"); pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    check(any(v.get("text") == "메모 앱에서 쓴 메모" for v in pg.evaluate("[...__d.memos.values()]")) and pg.locator(".mcard").count() == 2, "메모 앱에서 새 메모 저장")
    check(pref(pg) == "week", "메모 앱은 또박의 보기 설정을 바꾸지 않음")
    # 메뉴: 메모에 필요한 것만
    pg.click("[data-act=menu]"); pg.wait_for_timeout(300)
    menu = pg.inner_text(".menu")
    check(all(x in menu for x in ["휴지통", "백업 만들기", "백업 복원", "또박 열기", "로그아웃"]) and pg.locator(".menu [data-act=cats], .menu [data-act=evs], .menu [data-act=tpls], .menu [data-act=notify]").count() == 0, "메모 앱 메뉴: 휴지통·백업·또박 열기·로그아웃만")
    check(pg.locator(".menu a.mlink").get_attribute("href") == "../" and "또박 메모" in pg.inner_text(".ver"), "또박 열기 링크·버전 이름")
    pg.screenshot(path=OUT + "memoapp-menu.png")
    # 휴지통: 메모만 보이고, 비우기도 메모만
    pg.click("[data-act=trash]"); pg.wait_for_timeout(300)
    rows = pg.locator(".trow").all_inner_texts()
    check(len(rows) == 1 and "지운 메모" in rows[0], "메모 앱 휴지통: 메모만 " + str(rows))
    pg.click("[data-act=tempty]"); pg.wait_for_timeout(100); pg.click("[data-act=tempty]"); pg.wait_for_timeout(300)
    check("m_bin" not in pg.evaluate("[...__d.memos.keys()]") and "t_bin" in pg.evaluate("[...__d.tasks.keys()]"), "비우기: 메모만 영구 삭제, 할 일은 남음")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    # 알림 눌러 열기·바로가기 주소(#week, #d=)는 메모 앱에서 무시
    pg.goto(URL + "memo/#week"); pg.wait_for_selector(".mcard"); pg.wait_for_timeout(300)
    check(pg.evaluate("document.body.dataset.view") == "memo" and pg.locator(".mcard").count() >= 1, "메모 앱은 #week로 열어도 메모 화면")
    ctx.close()

    # ---------- 폰 어두운 화면 ----------
    ctx, pg = ctx_page(b, 390, 844, True, "dark")
    pg.goto(URL + "memo/"); pg.wait_for_selector(".mcard"); pg.screenshot(path=OUT + "memoapp-phone-dark.png")
    ctx.close()

    # ---------- PC ----------
    ctx, pg = ctx_page(b, 1280, 860, False)
    pg.goto(URL); pg.wait_for_selector(".grp")
    check(pg.locator("#vMemo").is_visible(), "PC 또박: 메모 탭 그대로")
    pg.click("[data-act=menu]"); pg.wait_for_timeout(300)
    check(pg.locator(".menu a.mlink").count() == 0, "PC 또박 메뉴엔 '메모 앱' 없음")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.goto(URL + "memo/"); pg.wait_for_selector("#board")
    check(pg.locator("header.top").count() == 0 and pg.locator(".mnote").count() == 1, "PC 메모 앱: 보드")
    pg.screenshot(path=OUT + "memoapp-pc.png")
    ctx.close()
    b.close()
done(errs)
