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
    pg.goto("http://localhost:8798/memo/"); pg.wait_for_selector(".mcard")  # 2.9.0: 폰의 메모는 메모 앱에서(또박에는 메모 탭 없음)
    check(pg.locator(".mgrid .mcol").count() == 2 and pg.locator(".mcard").count() == 2 and pg.locator(".board").count() == 0, "폰: 2열 카드(보드 없음, 2.10.0)")
    check(pg.locator(".mfab[data-act=mnew]").is_visible() and pg.locator("#mq").count() == 0 and "2" in pg.inner_text(".mcount"), "떠 있는 ＋, 검색은 접힘, 개수")
    check(pg.locator(".mcard").first.get_attribute("data-id") == "m_a", "최근 고친 것이 위")
    card = pg.locator(".mcard[data-id=m_a]")
    check(card.locator(".mh1").inner_text() == "자료구조 3주차" and card.locator("b").inner_text() == "LIFO" and pg.locator(".mcard[data-id=m_b] code").count() == 1, "마크다운: 제목·굵게·코드")
    check(pg.evaluate("window.__xss") is None and "<img" in card.inner_text(), "HTML은 글자로만(XSS 없음)")
    pg.screenshot(path=OUT + "memo-phone-list.png")
    # 체크 바로 하기(메모가 열리지 않음)
    card.locator(".mcb").first.click(); pg.wait_for_timeout(150)
    check("- [x] 과제 범위 확인" in memos(pg)["m_a"]["text"] and not pg.is_visible("#dlg"), "체크 목록은 목록에서 바로 체크")
    # 새 메모: 화면 전체 편집(2.10.0). 쓰는 중에도 저장, 뒤로가기로 닫힘
    pg.click("[data-act=mnew]"); pg.wait_for_timeout(350)
    check(pg.locator("#mpage").is_visible() and not pg.is_visible("#dlg") and pg.evaluate("document.activeElement.id") == "m-text", "새 메모: 화면 전체 편집, 입력칸에 바로 포커스")
    pg.keyboard.type("장보기 말고 수업 준비물\n- [ ] 계산기"); pg.wait_for_timeout(1000)
    new = [v for v in memos(pg).values() if v["text"].startswith("장보기 말고")]
    check(len(new) == 1 and new[0]["w"] == 240 and pg.locator("#mpage [data-act=mdel]").count() == 1, "닫기 전에도 0.8초 뒤 저장(새 메모가 생김)")
    pg.click("#mpage [data-act=mpal]"); pg.click("#mpage [data-act=mcolor][data-color=c3]"); pg.wait_for_timeout(100)
    check(pg.input_value("#m-text").startswith("장보기 말고") and "tint" in pg.get_attribute("#mpage", "class"), "색을 골라도 쓰던 글 유지, 편집 화면도 그 색")
    pg.go_back(); pg.wait_for_timeout(350)
    new = [v for v in memos(pg).values() if v["text"].startswith("장보기 말고")]
    check(len(new) == 1 and new[0]["color"] == "c3" and pg.locator("#mpage").is_hidden() and len(memos(pg)) == 3, "뒤로가기로 닫으면 저장(색 포함, 한 번만 만듦)")
    pg.click("[data-act=mnew]"); pg.wait_for_timeout(300); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check(len(memos(pg)) == 3, "아무것도 안 쓰고 닫으면 안 만듦")
    pg.click("[data-act=mnew]"); pg.wait_for_timeout(300); pg.keyboard.type("잠깐"); pg.wait_for_timeout(1000)
    check(len(memos(pg)) == 4, "(쓰는 중 저장됨)")
    pg.fill("#m-text", ""); pg.click("#mpage [data-act=mback]"); pg.wait_for_timeout(300)
    check(len(memos(pg)) == 3 and not any(v["text"] == "" for v in memos(pg).values()), "새로 쓰다 다 지우고 닫으면 남기지 않음")
    # 꾸미기 막대: 커서 줄에 체크 목록, 다시 누르면 뗌 / 굵게는 선택한 글에 / 목록에서 엔터면 다음 줄도 목록, 빈 항목 엔터면 끝
    pg.click("[data-act=mnew]"); pg.wait_for_timeout(200)
    pg.keyboard.type("살 것"); pg.click("#mpage .mfmt [data-k=chk]"); pg.wait_for_timeout(50)
    check(pg.input_value("#m-text") == "- [ ] 살 것" and pg.evaluate("document.activeElement.id") == "m-text", "체크 버튼: 커서 줄을 체크 목록으로(입력칸 포커스 유지)")
    pg.keyboard.press("Enter"); pg.keyboard.type("계산기"); pg.keyboard.press("Enter"); pg.keyboard.press("Enter")
    check(pg.input_value("#m-text") == "- [ ] 살 것\n- [ ] 계산기\n", "엔터로 체크 목록 이어가기, 빈 항목에서 엔터면 끝 " + repr(pg.input_value("#m-text")))
    pg.keyboard.type("중요"); pg.keyboard.down("Shift"); [pg.keyboard.press("ArrowLeft") for _ in range(2)]; pg.keyboard.up("Shift")
    pg.click("#mpage .mfmt [data-k=b]"); pg.wait_for_timeout(50)
    check(pg.input_value("#m-text").endswith("**중요**"), "굵게: 선택한 글을 감쌈")
    pg.click("#mpage .mfmt [data-k=b]"); pg.wait_for_timeout(50)
    check(pg.input_value("#m-text").endswith("\n중요"), "굵게 한 번 더: 뗌")
    pg.click("#mpage .mfmt [data-k=h]"); pg.wait_for_timeout(50)
    check(pg.input_value("#m-text").endswith("\n# 중요"), "제목 버튼")
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(50)
    check(pg.input_value("#m-text").endswith("\n중요"), "되돌리기(Ctrl+Z)도 됨")
    pg.click("#mpage [data-act=mback]"); pg.wait_for_timeout(300)
    nm = [v for v in memos(pg).values() if v["text"].startswith("- [ ] 살 것")]
    check(len(nm) == 1, "꾸민 메모 저장")
    # 고치기: 바꾼 칸만
    pg.click(".mcard[data-id=m_b]"); pg.wait_for_timeout(200)
    check(pg.input_value("#m-text").startswith("영어 단어") and "에 고침" in pg.inner_text("#mpage .mpwhen"), "카드 누르면 그 메모 편집")
    pg.fill("#m-text", "영어 단어 외울 것 (30개)"); pg.click("#mpage [data-act=mback]"); pg.wait_for_timeout(300)
    check(memos(pg)["m_b"]["text"] == "영어 단어 외울 것 (30개)" and memos(pg)["m_b"]["color"] == "", "←로 닫아도 저장")
    check(pg.evaluate("history.state&&history.state.mpage") is None and pg.evaluate("document.body.classList.contains('mpopen')") is False, "닫으면 기록·스크롤 잠금 정리")
    # 검색: 돋보기로 열고, 다시 누르면 지우고 닫음
    pg.click("[data-act=msearch]"); pg.wait_for_timeout(100)
    check(pg.evaluate("document.activeElement.id") == "mq", "돋보기: 검색칸 열고 포커스")
    pg.keyboard.type("자료구조"); pg.wait_for_timeout(150)
    check(pg.locator(".mcard").count() == 1, "메모 검색")
    pg.click("[data-act=msearch]"); pg.wait_for_timeout(150)
    check(pg.locator("#mq").count() == 0 and pg.locator(".mcard").count() == len(memos(pg)), "검색 닫으면 전부")
    # 휴지통
    pg.click(".mcard[data-id=m_b]"); pg.wait_for_timeout(200); pg.click("#mpage [data-act=mdel]"); pg.wait_for_timeout(350)
    check(memos(pg)["m_b"].get("deletedAt") and pg.locator(".mcard[data-id=m_b]").count() == 0 and "휴지통" in pg.inner_text("#toastMsg") and pg.locator("#mpage").is_hidden(), "휴지통으로(편집 화면 닫힘)")
    pg.click("[data-act=menu]"); pg.click("[data-act=trash]"); pg.wait_for_timeout(200)
    check("메모 ·" in pg.inner_text(".sheet") and "영어 단어" in pg.inner_text(".sheet"), "휴지통에 메모가 보임")
    pg.click(".sheet [data-act=trestore][data-id=m_b]"); pg.wait_for_timeout(200); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check(pg.locator(".mcard[data-id=m_b]").count() == 1, "복원")
    check(pg.evaluate("document.documentElement.scrollWidth") <= 390, "폰 메모 앱: 가로로 안 넘침")
    # 백업은 또박에서만(2.9.1: 메모 앱은 할 일을 안 받아서). 이 목업 저장소는 페이지마다 새로 차므로 시드 메모 2개
    pg.goto("http://localhost:8798/app/"); pg.wait_for_selector(".grp"); pg.wait_for_timeout(300)
    pg.click("[data-act=menu]"); pg.click("[data-act=export]"); data = json.loads(pg.input_value("#x-out")); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check(len(data.get("memos", [])) >= 2 and all(t["id"].startswith("t_") for t in data["tasks"]), "백업(또박)에 메모 포함(할 일과 따로)")
    ctx.close()
    # ---------- PC ----------
    ctx = b.new_context(viewport={"width": 1280, "height": 860}); pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("**/app.js", lambda r: r.fulfill(body=MOCK, content_type="text/javascript"))
    pg.goto("http://localhost:8798/app/"); pg.wait_for_selector(".grp")
    pg.click("[data-act=view][data-v=memo]"); pg.wait_for_timeout(500)  # 탭 전환 움직임(약 .35초)이 끝난 뒤
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
    check(pg.locator("#mn-m_b .mbar .mfmt").count() == 1, "보드: 쓰는 중엔 막대에 꾸미기 버튼")
    pg.keyboard.press("Control+b"); pg.keyboard.type("x"); pg.wait_for_timeout(50)
    check(pg.input_value("#mt-m_b").endswith("**x**"), "Ctrl+B: 굵게")
    pg.keyboard.press("Control+z"); pg.keyboard.press("Control+z"); pg.wait_for_timeout(50)
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
    pg.goto("http://localhost:8798/app/"); pg.wait_for_selector(".grp"); pg.click("[data-act=view][data-v=memo]"); pg.wait_for_timeout(500)  # 탭 전환 움직임(약 .35초)이 끝난 뒤
    pg.screenshot(path=OUT + "memo-pc-dark.png")
    ctx.close()
    b.close()
srv.terminate(); done(errs)
