# 안전: 불러오는 중 막기, 입력 유지, 시트 위 알림, 삭제 되돌리기, 복원 데이터 검사(XSS), 버전
import json, datetime
from playwright.sync_api import sync_playwright
from ttb import check, serve, done, OUT
srv=serve(8778)
MOCK="""const m=TodoApp.memoryStore();let cb;window.__m=m;window.__xss=0;
const s={kind:'pwa',email:'me@example.com',
start(c){cb=c;c.onStatus('loading');window.__go=()=>m.start({onData:d=>{window.__d=d;cb.onData(d);},onStatus:x=>cb.onStatus(x==='local'?'live':x),onError:cb.onError});},
set:m.set,update:m.update,remove:m.remove,saveCats:m.saveCats,importAll:m.importAll,
push:{state:async()=>'off',enable:async()=>{},disable:async()=>{},test:async()=>({sent:1}),schedule(){},refresh(){}}};
TodoApp.boot(s);"""
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":390,"height":844},has_touch=True); pg=ctx.new_page()
    pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m:m.type=="error" and errs.append(m.text))
    pg.route("**/app.js",lambda r:r.fulfill(body=MOCK,content_type="text/javascript"))
    pg.goto("http://localhost:8778/"); pg.wait_for_selector(".grp")
    pg.click("[data-act=add][data-cat=k1]"); pg.wait_for_timeout(150)
    check(pg.locator(".addrow").count()==0, "불러오는 중엔 추가 막음")
    pg.click("[data-act=menu]"); pg.wait_for_timeout(150); check(not pg.evaluate("document.getElementById('dlg').open"), "불러오는 중엔 메뉴 막음")
    pg.evaluate("__go()"); pg.wait_for_timeout(300)
    pg.click("[data-act=add][data-cat=k1]"); pg.keyboard.type("초안 유지"); pg.wait_for_timeout(100)
    pg.evaluate("TodoApp && document.dispatchEvent(new Event('visibilitychange'))")
    check(pg.input_value("#add-k1")=="초안 유지", "다시 그려도 입력 중인 글 유지")
    pg.keyboard.press("Enter"); pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    # toast above open sheet + clickable
    pg.click("text=초안 유지"); pg.wait_for_timeout(200); pg.click(".sheet [data-act=emore]"); pg.wait_for_timeout(100)
    pg.click(".remind [data-m='10']") if pg.locator(".remind .pill:not(:disabled)").count() else None
    pg.fill("#e-time","09:00"); pg.wait_for_timeout(100); pg.click(".remind [data-m='10']"); pg.wait_for_timeout(250)
    box=pg.locator("#toast").bounding_box()
    top=pg.evaluate(f"(()=>{{const e=document.elementFromPoint({box['x']+box['width']-20},{box['y']+box['height']/2});return e&&(e.id||e.className)}})()")
    check(top=="toastAct", "시트 위에서도 알림 버튼이 맨 위(누를 수 있음) "+str(top))
    pg.screenshot(path=OUT+"toast-over-sheet.png")
    pg.click("#toastAct"); pg.wait_for_timeout(250); check(pg.inner_text("#sheet h2")=="알림", "알림의 '켜기' → 알림 설정")
    pg.go_back(); pg.wait_for_timeout(400)
    # delete → undo toast survives sheet close
    pg.click("text=초안 유지"); pg.wait_for_timeout(200); pg.click("[data-act=del]"); pg.wait_for_timeout(500)
    check(pg.is_visible("#toast"), "시트가 닫혀도 삭제 알림은 남음")
    pg.click("#toastAct"); pg.wait_for_timeout(300); check(pg.locator("text=초안 유지").count()==1, "되돌리기")
    # XSS import
    evil={"tasks":[{"id":"t_x1","title":"악성","date":None,"cat":"k1","subtasks":[{"id":"\"><img src=x onerror=window.__xss=1>","t":"a"}]}]}
    pg.click("[data-act=menu]"); pg.wait_for_timeout(150); pg.click("[data-act=import]"); pg.wait_for_timeout(150)
    pg.fill("#i-in",json.dumps(evil)); pg.click("[data-act=importcheck]"); pg.click("[data-act=importgo]"); pg.wait_for_timeout(300)
    pg.click("[data-act=view][data-v=all]"); pg.wait_for_timeout(200); pg.click("text=악성"); pg.wait_for_timeout(300)
    check(pg.evaluate("window.__xss")==0 and "<" not in pg.evaluate("[...__d.tasks.values()].find(t=>t.id==='t_x1').subtasks[0].id"), "백업 복원: 이상한 id는 새로 만들고 스크립트는 안 돎")
    pg.go_back(); pg.wait_for_timeout(300)
    pg.click("[data-act=menu]"); pg.wait_for_timeout(150); check(pg.inner_text(".ver").startswith("또박 ") and "__" not in pg.inner_text(".ver"), "버전 표시")
    b.close()
srv.terminate(); done(errs)
