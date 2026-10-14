import os as _os
HERE=_os.path.dirname(_os.path.abspath(__file__))
APP=_os.path.join(HERE,"..","dist","app")
import subprocess, time, sys
from playwright.sync_api import sync_playwright
OUT=_os.path.join(HERE,"out")+"/"
srv=subprocess.Popen([sys.executable,"-m","http.server","8774"],cwd=APP,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
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
    print("drag inside keeps open:", pg.is_visible("#dlg"))
    # 입력칸에서 끌어서 바깥에서 놓기 → 안 닫힘(누른 곳이 안쪽)
    pg.mouse.move(box["x"]+10,box["y"]+10); pg.mouse.down(); pg.mouse.move(20,20,steps=5); pg.mouse.up()
    print("drag to outside keeps open:", pg.is_visible("#dlg"))
    pg.mouse.click(20,20); pg.wait_for_timeout(300)
    print("click outside closes:", not pg.is_visible("#dlg"), "| toast:", pg.inner_text("#toastMsg"))
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
        print(t, "preview:", pg.inner_text("#e-time-p"), "| clear btn:", pg.locator("[data-act=notime]").count())
        pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
    # 잘못된 시간 → 기존 유지
    pg.click("text=가 강의"); pg.fill("#e-time",""); pg.click("#e-time"); pg.keyboard.type("2400"); pg.wait_for_timeout(80)
    print("bad preview:", pg.inner_text("#e-time-p")); pg.mouse.click(20,20); pg.wait_for_timeout(300)
    print("order:", pg.locator("#g-k2 .t").all_inner_texts())
    print("times:", pg.locator("#g-k2 .chip.time").all_inner_texts())
    pg.click("text=가 강의"); pg.wait_for_timeout(200); pg.screenshot(path=OUT+"pc-edit.png"); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT+"pc-day.png")
    b.close()
srv.terminate(); print("errors:",errs)
