# 시트 닫기(끌기·바깥), PC 숫자 시간 입력·미리보기, 카테고리 안 정렬
import json, datetime
from playwright.sync_api import sync_playwright
from ttb import check, serve, done, OUT
srv=serve(8774)
MOCK="""const m=TodoApp.memoryStore();let cb;const s={kind:'pwa',email:'me@example.com',
start(c){cb=c;c.onStatus('signedout');},set:m.set,update:m.update,remove:m.remove,saveCats:m.saveCats,importAll:m.importAll,
signIn(e,p){return Promise.resolve(m.start({onData:cb.onData,onStatus:x=>cb.onStatus(x==='local'?'live':x),onError:cb.onError}));},
signOut(){cb.onStatus('signedout');return Promise.resolve();}};TodoApp.boot(s);"""
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":1280,"height":860})
    pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m:m.type=="error" and errs.append(m.text))
    pg.route("**/app.js",lambda r:r.fulfill(body=MOCK,content_type="text/javascript"))
    pg.goto("http://localhost:8774/"); pg.fill("#l-email","a@b.c"); pg.fill("#l-pw","x"); pg.click("#l-btn"); pg.wait_for_selector(".grp")
    # 소분류 두 개
    pg.click("[data-act=menu]"); pg.click("[data-act=cats]"); pg.fill("#cn-k2","수업")
    for n in ["자료구조","영어"]: pg.fill("#snew-k2",n); pg.press("#snew-k2","Enter")
    # 드래그: 입력칸에서 누르고 시트 안 다른 곳에서 떼기 → 안 닫혀야 함
    box=pg.locator("#cn-k1").bounding_box(); box2=pg.locator(".sheet h2").bounding_box()
    pg.mouse.move(box["x"]+10,box["y"]+10); pg.mouse.down(); pg.mouse.move(box2["x"]+5,box2["y"]+5,steps=5); pg.mouse.up()
    check(pg.is_visible("#dlg"), "시트 안에서 끌면 안 닫힘")
    # 입력칸에서 끌어서 바깥에서 놓기 → 안 닫힘(누른 곳이 안쪽)
    pg.mouse.move(box["x"]+10,box["y"]+10); pg.mouse.down(); pg.mouse.move(20,20,steps=5); pg.mouse.up()
    check(pg.is_visible("#dlg"), "안에서 눌러 밖에서 떼도 안 닫힘")
    pg.mouse.click(20,20); pg.wait_for_timeout(300)
    check(not pg.is_visible("#dlg") and pg.inner_text("#toastMsg")=="변경 내용을 저장하지 않았어요", "바깥을 누르면 닫히고 저장 안 함")
    pg.click("#toastAct"); pg.wait_for_timeout(250); pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(300)  # 2.2.0~: 다시 열기 → 저장
    # 할 일들: 수업 카테고리
    pg.click("[data-act=add][data-cat=k2]")
    def add(title,sub):
        pg.click(".addsubs [data-sub='%s']"%sub if sub else ".addsubs [data-sub='']"); pg.fill("#add-k2",title); pg.press("#add-k2","Enter")
    subs={ "자료구조":pg.locator(".addsubs .pill:nth-child(2)").get_attribute("data-sub"), "영어":pg.locator(".addsubs .pill:nth-child(3)").get_attribute("data-sub")}
    add("하 과제",subs["영어"]); add("가 단어",subs["영어"]); add("수강신청",None); add("다 복습",subs["자료구조"]); add("나 퀴즈",subs["자료구조"]); add("가 강의",subs["자료구조"])
    pg.keyboard.press("Escape")
    # 시간: 나 퀴즈 0900, 가 강의 2359 (텍스트 입력)
    for t,v in [("나 퀴즈","0900"),("가 강의","2359")]:
        pg.click("text="+t); pg.wait_for_timeout(150)
        pg.click("#e-time"); pg.keyboard.type(v); pg.wait_for_timeout(80)
        check(pg.inner_text("#e-time-p")==("오전 9:00" if v=="0900" else "오후 11:59") and pg.locator("[data-act=notime]").count()==1, t+": 숫자로 쓰면 미리보기")
        pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
    # 잘못된 시간 → 기존 유지
    pg.click("text=가 강의"); pg.fill("#e-time",""); pg.click("#e-time"); pg.keyboard.type("2400"); pg.wait_for_timeout(80)
    check(pg.inner_text("#e-time-p")=="시간을 확인해 주세요", "잘못된 시간 안내"); pg.mouse.click(20,20); pg.wait_for_timeout(300)
    check(pg.locator("#g-k2 .t").all_inner_texts()==['나 퀴즈','가 강의','다 복습','가 단어','하 과제','수강신청'], "카테고리 안 순서: 소분류 순서 → 시간 → 가나다")
    check(pg.locator("#g-k2 .chip.time").all_inner_texts()==['오전 9:00','오후 11:59'], "잘못 쓰고 닫으면 원래 시간 그대로")
    pg.click("text=가 강의"); pg.wait_for_timeout(200); pg.screenshot(path=OUT+"pc-edit.png"); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT+"pc-day.png")
    b.close()
srv.terminate(); done(errs)
