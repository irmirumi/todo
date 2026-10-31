# 2.8.0 메모: 폰 목록·편집 시트(닫으면 저장), 마크다운·체크 바로 하기·색, 휴지통·복원, 검색, PC 보드(두 번 눌러 붙이기·바로 쓰기·끌기·크기·빈 메모 정리), 백업, XSS
import json
from playwright.sync_api import sync_playwright
from ttb import check, serve, done, OUT
srv = serve(8798)
MOCK = """const m=TodoApp.memoryStore();window.__m=m;
m.importAll({cats:null,tasks:[],tpls:[],events:[],memos:[
 {id:'m_a',text:'# 자료구조 3주차\\n- 스택은 **LIFO**\\n- [ ] 과제 범위 확인\\n- [x] 슬라이드 받기\\n<img src=x onerror=window.__xss=1>',color:'c5',x:40,y:40,w:260,h:220,z:1,createdAt:1,updatedAt:2},
 {id:'m_b',text:'영어 단어 외울 것\\n`ubiquitous`',color:'',x:340,y:40,w:240,h:200,z:2,createdAt:1,updatedAt:1}]});
const s=Object.assign({},m,{kind:'pwa',start(c){m.start({onData:(d,meta)=>{window.__d=d;c.onData(d,meta);},onStatus:x=>c.onStatus(x==='local'?'live':x),onError:c.onError});}});
TodoApp.boot(s);"""
errs = []
memos = lambda pg: pg.evaluate("Object.fromEntries(__d.memos)")
with sync_playwright() as p:
    b = p.chromium.launch()
    # ---------- 폰 ----------
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True); pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.route("**/app.js", lambda r: r.fulfill(body=MOCK, content_type="text/javascript"))
    pg.goto("http://localhost:8798/"); pg.wait_for_selector(".grp")
    pg.click("[data-act=view][data-v=memo]"); pg.wait_for_timeout(200)
    check(pg.locator(".mcard").count() == 2 and pg.locator(".board").count() == 0, "폰: 목록으로 보임(보드 없음)")
    check(pg.locator(".mcard").first.get_attribute("data-id") == "m_a", "최근 고친 것이 위")
    card = pg.locator(".mcard[data-id=m_a]")
    check(card.locator(".mh1").inner_text() == "자료구조 3주차" and card.locator("b").inner_text() == "LIFO" and pg.locator(".mcard[data-id=m_b] code").count() == 1, "마크다운: 제목·굵게·코드")
    check(pg.evaluate("window.__xss") is None and "<img" in card.inner_text(), "HTML은 글자로만(XSS 없음)")
    pg.screenshot(path=OUT + "memo-phone-list.png")
    # 체크 바로 하기(메모가 열리지 않음)
    card.locator(".mcb").first.click(); pg.wait_for_timeout(150)
    check("- [x] 과제 범위 확인" in memos(pg)["m_a"]["text"] and not pg.is_visible("#dlg"), "체크 목록은 목록에서 바로 체크")
    # 새 메모: 시트에서 쓰고 닫으면 저장
    pg.click("[data-act=mnew]"); pg.wait_for_timeout(200)
    check(pg.evaluate("document.activeElement.id") == "m-text", "새 메모: 입력칸에 바로 포커스")
    pg.keyboard.type("장보기 말고 수업 준비물\n- [ ] 계산기"); pg.click(".sheet [data-act=mcolor][data-color=c3]"); pg.wait_for_timeout(100)
    check(pg.input_value("#m-text").startswith("장보기 말고"), "색을 골라도 쓰던 글 유지")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(350)
    new = [v for v in memos(pg).values() if v["text"].startswith("장보기 말고")]
    check(len(new) == 1 and new[0]["color"] == "c3" and new[0]["w"] == 240, "닫으면 저장(색 포함)")
    check("메모를 추가했어요" in pg.inner_text("#toastMsg"), "추가 알림")
    pg.click("[data-act=mnew]"); pg.wait_for_timeout(200); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check(len(memos(pg)) == 3, "아무것도 안 쓰고 닫으면 안 만듦")
    # 고치기: 바꾼 칸만
    pg.click(".mcard[data-id=m_b]"); pg.wait_for_timeout(200)
    pg.fill("#m-text", "영어 단어 외울 것 (30개)"); pg.click(".sheet [data-act=close]"); pg.wait_for_timeout(300)
    check(memos(pg)["m_b"]["text"] == "영어 단어 외울 것 (30개)" and memos(pg)["m_b"]["color"] == "", "완료로 닫아도 저장")
    # 검색
    pg.fill("#mq", "자료구조"); pg.wait_for_timeout(150)
    check(pg.locator(".mcard").count() == 1, "메모 검색")
    pg.fill("#mq", ""); pg.wait_for_timeout(150)
    # 휴지통
    pg.click(".mcard[data-id=m_b]"); pg.wait_for_timeout(200); pg.click(".sheet [data-act=mdel]"); pg.wait_for_timeout(300)
    check(memos(pg)["m_b"].get("deletedAt") and pg.locator(".mcard[data-id=m_b]").count() == 0 and "휴지통" in pg.inner_text("#toastMsg"), "휴지통으로")
    pg.click("[data-act=menu]"); pg.click("[data-act=trash]"); pg.wait_for_timeout(200)
    check("메모 ·" in pg.inner_text(".sheet") and "영어 단어" in pg.inner_text(".sheet"), "휴지통에 메모가 보임")
    pg.click(".sheet [data-act=trestore][data-id=m_b]"); pg.wait_for_timeout(200); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check(pg.locator(".mcard[data-id=m_b]").count() == 1, "복원")
    # 백업
    pg.click("[data-act=menu]"); pg.click("[data-act=export]"); data = json.loads(pg.input_value("#x-out")); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check(len(data.get("memos", [])) == 3 and all(t["id"].startswith("t_") for t in data["tasks"]), "백업에 메모 포함(할 일과 따로)")
    check(pg.evaluate("document.documentElement.scrollWidth") <= 390, "폰: 가로로 안 넘침")
    ctx.close()
    # ---------- PC ----------
    ctx = b.new_context(viewport={"width": 1280, "height": 860}); pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("**/app.js", lambda r: r.fulfill(body=MOCK, content_type="text/javascript"))
    pg.goto("http://localhost:8798/"); pg.wait_for_selector(".grp")
    pg.click("[data-act=view][data-v=memo]"); pg.wait_for_timeout(200)
    check(pg.locator(".board .mnote").count() == 2, "PC: 보드에 포스트잇")
    box = pg.locator("#mn-m_a").bounding_box()
    check(abs(box["width"] - 260) < 2, "저장된 크기대로")
    pg.screenshot(path=OUT + "memo-pc-board.png")
    # 끌어 옮기기
    bar = pg.locator("#mn-m_a .mbar").bounding_box()
    pg.mouse.move(bar["x"] + 40, bar["y"] + 12); pg.mouse.down(); pg.mouse.move(bar["x"] + 140, bar["y"] + 112, steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
    t = memos(pg)["m_a"]
    check(t["x"] == 140 and t["y"] == 140 and t["z"] == 3, "끌어 옮기면 자리 저장, 맨 위로 " + str((t["x"], t["y"], t["z"])))
    # 크기
    rz = pg.locator("#mn-m_a .mrz").bounding_box()
    pg.mouse.move(rz["x"] + 9, rz["y"] + 9); pg.mouse.down(); pg.mouse.move(rz["x"] + 69, rz["y"] + 49, steps=4); pg.mouse.up(); pg.wait_for_timeout(200)
    t = memos(pg)["m_a"]
    check(t["w"] == 320 and t["h"] == 260, "모서리로 크기 저장 " + str((t["w"], t["h"])))
    # 바로 쓰기
    pg.click("#mn-m_b .mbody"); pg.wait_for_timeout(150)
    check(pg.evaluate("document.activeElement.id") == "mt-m_b", "누르면 그 자리에서 쓰기")
    pg.keyboard.press("End"); pg.keyboard.type("\n- 다음 주까지"); pg.wait_for_timeout(1000)
    check(memos(pg)["m_b"]["text"].endswith("- 다음 주까지"), "쓰는 중에도 저장")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    check(pg.locator("#mn-m_b textarea").count() == 0 and pg.locator("#mn-m_b .mbody li").count() == 1, "Esc로 끝내면 마크다운으로")
    # 두 번 눌러 붙이기 → 안 쓰고 벗어나면 없어짐
    sb = pg.locator("#bsurf").bounding_box()
    pg.mouse.dblclick(sb["x"] + 700, sb["y"] + 400); pg.wait_for_timeout(200)
    check(len(memos(pg)) == 3 and pg.evaluate("document.activeElement.id||''").startswith("mt-"), "빈 곳 두 번 → 새 메모, 바로 쓰기")
    pg.mouse.click(sb["x"] + 900, sb["y"] + 600); pg.wait_for_timeout(200)
    check(len(memos(pg)) == 2, "아무것도 안 쓰면 없어짐")
    pg.mouse.dblclick(sb["x"] + 700, sb["y"] + 400); pg.wait_for_timeout(200); pg.keyboard.type("회의 메모"); pg.mouse.click(sb["x"] + 900, sb["y"] + 620); pg.wait_for_timeout(200)
    nm = [v for v in memos(pg).values() if v["text"] == "회의 메모"]
    check(len(nm) == 1 and nm[0]["x"] > 400, "쓰면 그 자리에 남음")
    # 크게 열기 → 시트
    pg.click("#mn-m_a [data-act=mopen]"); pg.wait_for_timeout(250)
    check(pg.input_value("#m-text").startswith("# 자료구조"), "크게 열기: 편집 시트")
    pg.click(".sheet [data-act=mcolor][data-color=c1]"); pg.click(".sheet [data-act=close]"); pg.wait_for_timeout(300)
    check(memos(pg)["m_a"]["color"] == "c1" and memos(pg)["m_a"]["x"] == 140, "색만 바꿔도 자리 그대로")
    pg.screenshot(path=OUT + "memo-pc-board2.png")
    # 검색하면 PC도 목록
    pg.fill("#mq", "회의"); pg.wait_for_timeout(150)
    check(pg.locator(".board").count() == 0 and pg.locator(".mcard").count() == 1, "PC 검색: 결과 목록")
    ctx.close()
    # 다크
    ctx = b.new_context(viewport={"width": 1280, "height": 860}, color_scheme="dark"); pg = ctx.new_page()
    pg.route("**/app.js", lambda r: r.fulfill(body=MOCK, content_type="text/javascript"))
    pg.goto("http://localhost:8798/"); pg.wait_for_selector(".grp"); pg.click("[data-act=view][data-v=memo]"); pg.wait_for_timeout(200)
    pg.screenshot(path=OUT + "memo-pc-dark.png")
    ctx.close()
    b.close()
srv.terminate(); done(errs)
