# 기본 흐름: 로그인, 카테고리·소분류, 한 줄 추가(포커스 유지), 편집 저장/버리기, 휴지통·되돌리기, 시간 지우기, 한글 조합 엔터, 카테고리 순서·숨김, 공휴일, 스와이프, 백업 복원, 다크
from playwright.sync_api import sync_playwright
from ttb import check, serve, done, OUT
srv = serve(8773)
MOCK = """const m=TodoApp.memoryStore();let cb;const s={kind:'pwa',email:'me@example.com',
start(c){cb=c;c.onStatus('signedout');},set:m.set,update:m.update,remove:m.remove,saveCats:m.saveCats,importAll:m.importAll,
signIn(e,p){return p==='ok'?Promise.resolve(m.start({onData:cb.onData,onStatus:x=>cb.onStatus(x==='local'?'live':x),onError:cb.onError})):Promise.reject({code:'auth/invalid-credential'});},
signOut(){cb.onStatus('signedout');return Promise.resolve();}};TodoApp.boot(s);"""
errs = []
def page(b, w, h, dark=False):
    ctx = b.new_context(viewport={"width": w, "height": h}, color_scheme="dark" if dark else "light", has_touch=w < 600)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.route("**/app.js", lambda r: r.fulfill(body=MOCK, content_type="text/javascript"))
    pg.goto("http://localhost:8773/")
    return pg
def login(pg):
    pg.wait_for_selector("#loginForm"); pg.fill("#l-email", "me@example.com"); pg.fill("#l-pw", "ok"); pg.click("#l-btn")
    pg.wait_for_selector(".grp")
def seed(pg):
    pg.click("[data-act=menu]"); pg.click("[data-act=cats]")
    pg.fill("#cn-k2", "수업")
    for n in ["자료구조", "영어"]:
        pg.fill("#snew-k2", n); pg.press("#snew-k2", "Enter")
    pg.click(".sheet :is([data-act=save],[data-act=close])"); pg.wait_for_timeout(300)
    pg.click("[data-act=add][data-cat=k2]")
    pg.click(".addsubs [data-sub]:nth-child(2)")
    pg.fill("#add-k2", "과제 3 제출"); pg.press("#add-k2", "Enter")
    same = pg.evaluate("document.activeElement && document.activeElement.id")
    check(same == "add-k2", "엔터로 추가해도 입력칸 포커스 유지")
    pg.click(".addsubs [data-sub]:nth-child(3)")
    pg.keyboard.type("단어 30개 외우기"); pg.press("#add-k2", "Enter")
    pg.click("[data-act=add][data-cat=k1]")
    pg.keyboard.type("장보기"); pg.keyboard.press("Enter")
    pg.keyboard.type("엄마 생신 선물 고르기"); pg.keyboard.press("Enter"); pg.keyboard.press("Escape")
    pg.click("text=장보기")
    pg.fill("#e-time", "18:30"); pg.click(".sheet [data-act=emore]"); pg.fill("#s-new", "우유"); pg.press("#s-new", "Enter"); pg.fill("#s-new", "계란")
    pg.click(".sheet [data-act=save]")  # 2.2.0~: 저장은 저장 버튼으로만
    pg.wait_for_timeout(300)
    check("오후 6:30" in pg.locator("#main .chip.time").all_inner_texts() and "세부 0/2" in pg.inner_text("#g-k1"), "저장: 시간·세부 할 일 2개(입력 중이던 것도)")
    pg.click("text=과제 3 제출"); pg.fill("#e-time", "09:00")
    pg.go_back(); pg.wait_for_timeout(300)  # 뒤로가기는 저장 안 하고 닫음 → 다시 열기 → 저장
    check(pg.inner_text("#toastMsg") == "변경 사항을 저장하지 않았어요", "뒤로가기는 저장 안 함 + 알림"); pg.click("#toastAct"); pg.wait_for_timeout(250); pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(300)
    check(not pg.is_visible("#dlg") and "오전 9:00" in pg.locator("#main .chip.time").all_inner_texts(), "다시 열어 저장하면 반영")
    pg.click(".task:has-text('단어') .chk"); pg.wait_for_timeout(500)
    # 삭제 + 되돌리기
    pg.click("text=엄마 생신"); pg.click(".sheet [data-act=del]"); pg.wait_for_timeout(200)
    check(pg.locator("text=엄마 생신").count() == 0 and "휴지통으로 옮겼어요" in pg.inner_text("#toast"), "삭제는 휴지통으로")
    pg.click("#toastAct"); pg.wait_for_timeout(200)
    check(pg.locator("text=엄마 생신").count() == 1, "되돌리기")

def extra(pg):
    # 시간 지우기 버튼이 바로 생기는지
    pg.click("text=엄마 생신"); pg.fill("#e-time","14:00"); pg.wait_for_timeout(100)
    check(pg.locator("[data-act=notime]").count() == 1, "시간을 넣으면 '시간 지우기'가 바로 생김")
    pg.click("[data-act=notime]"); pg.wait_for_timeout(100)
    check(pg.input_value("#e-time") == "" and pg.locator("[data-act=notime]").count() == 0, "시간 지우기")
    pg.go_back(); pg.wait_for_timeout(300)
    # 한글 조합 엔터(안드로이드형: 조합 중 엔터 → compositionend), 맥형(조합 엔터+일반 엔터)
    pg.click("[data-act=add][data-cat=k3]"); pg.wait_for_timeout(100)
    n0=pg.locator("#g-k3 .task").count()
    pg.evaluate("""()=>{const el=document.getElementById('add-k3');el.value='스트레칭';
      el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:229,isComposing:true,bubbles:true}));
      el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'칭'}));}""")
    pg.wait_for_timeout(120)
    pg.evaluate("""()=>{const el=document.getElementById('add-k3');el.value='물 마시기';
      el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:229,isComposing:true,bubbles:true}));
      el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'기'}));
      el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true}));}""")
    pg.wait_for_timeout(120)
    check(pg.locator("#g-k3 .task").count() - n0 == 2, "한글 조합 엔터: 두 경우 모두 한 번씩 추가 " + str(pg.locator("#g-k3 .t").all_inner_texts()))
    pg.keyboard.press("Escape")
    # 카테고리 순서·보관
    pg.click("[data-act=menu]"); pg.click("[data-act=cats]"); pg.wait_for_timeout(200)
    pg.click("[data-act=catup][data-cat=k3]"); pg.wait_for_timeout(100)
    pg.click("[data-act=catarc][data-cat=k2]"); pg.wait_for_timeout(100)
    pg.screenshot(path=OUT+"p-cats.png")
    pg.click(".sheet :is([data-act=save],[data-act=close])"); pg.wait_for_timeout(300)
    check(pg.locator(".ghead h3").all_inner_texts() == ["일상", "건강"], "카테고리 순서 바꾸고 숨기기 " + str(pg.locator(".ghead h3").all_inner_texts()))
    check(pg.locator("text=과제 3 제출").count() == 0, "숨긴 카테고리의 할 일은 안 보임")
    pg.click("[data-act=menu]"); pg.click("[data-act=cats]"); pg.click("[data-act=catunarc][data-cat=k2]"); pg.click(".sheet :is([data-act=save],[data-act=close])"); pg.wait_for_timeout(300)
    check(pg.locator(".ghead h3").all_inner_texts() == ["일상", "건강", "수업"], "다시 표시하면 맨 뒤로 " + str(pg.locator(".ghead h3").all_inner_texts()))
    # 공휴일: 10/9
    if pg.locator("[data-k='2026-10-09']").count()==0: pg.click("[data-act=calmode]"); pg.wait_for_timeout(200)
    pg.click("[data-k='2026-10-09']"); pg.wait_for_timeout(100)
    check("한글날" in pg.inner_text(".eyebrow"), "공휴일 이름")
    pg.screenshot(path=OUT+"p-hol.png")
    pg.click("[data-act=today]") if pg.locator("[data-act=today]").count() else None
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = page(b, 390, 844)
    pg.screenshot(path=OUT + "p-login.png")
    login(pg); seed(pg); extra(pg)
    pg.wait_for_timeout(2700)
    pg.screenshot(path=OUT + "p-day.png", full_page=True)
    pg.click("text=장보기"); pg.wait_for_timeout(300); pg.screenshot(path=OUT + "p-edit.png")
    pg.go_back(); pg.wait_for_timeout(200)
    pg.click("[data-act=add][data-cat=k1]"); pg.wait_for_timeout(100); pg.screenshot(path=OUT + "p-adding.png")
    pg.keyboard.press("Escape")
    # 스와이프로 다음 주
    box = pg.locator("#cal").bounding_box()
    before = pg.inner_text(".dayhead h1") + pg.inner_text(".calhead h2") + pg.inner_text("#cal .grid")
    pg.evaluate("""([x,y])=>{const el=document.getElementById('cal');const mk=(t,cx)=>new TouchEvent(t,{bubbles:true,changedTouches:[new Touch({identifier:1,target:el,clientX:cx,clientY:y})],touches:t==='touchend'?[]:[new Touch({identifier:1,target:el,clientX:cx,clientY:y})]});el.dispatchEvent(mk('touchstart',x+120));el.dispatchEvent(mk('touchend',x));}""", [box["x"] + 100, box["y"] + 80])
    check(pg.inner_text(".dayhead h1") + pg.inner_text(".calhead h2") + pg.inner_text("#cal .grid") != before, "달력 밀기로 다른 주·달")
    check(pg.evaluate("document.documentElement.scrollWidth") <= 390, "폰: 가로로 안 넘침")
    data = None
    pg.click("[data-act=menu]"); pg.click("[data-act=export]"); data = pg.input_value("#x-out"); pg.go_back()
    # 다크 데스크톱
    pd = page(b, 1280, 860, dark=True); login(pd)
    pd.click("[data-act=menu]"); pd.click("[data-act=import]"); pd.fill("#i-in", data); pd.click("[data-act=importcheck]"); pd.click("[data-act=importgo]")
    pd.wait_for_timeout(2800)
    check(pd.locator("text=장보기").count() >= 1 and pd.locator(".ghead h3").all_inner_texts()[:2] == ["일상", "건강"], "다른 기기(PC)에서 백업 복원: 할 일·카테고리 순서")
    pd.click("[data-act=calmode]") if pd.locator("text=한 달 보기").count() else None
    pd.wait_for_timeout(200); pd.screenshot(path=OUT + "d-dark.png")
    pd.click("#vAll"); pd.wait_for_timeout(200); pd.screenshot(path=OUT + "d-all-dark.png")
    pd.click("[data-act=menu]"); pd.click("[data-act=cats]"); pd.wait_for_timeout(200); pd.screenshot(path=OUT + "d-cats-dark.png")
    pl = page(b, 1280, 860); login(pl); pl.wait_for_timeout(200); pl.screenshot(path=OUT + "d-light-empty.png")
    b.close()
srv.terminate()
done(errs)
