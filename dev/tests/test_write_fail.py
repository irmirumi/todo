# 실제 app.js + 가짜 Firebase: 서버가 쓰기를 거절하면 화면이 원래대로 돌아오고 알림이 뜬다, 쉼은 배열에 하나만 넣기(arrayUnion)
import os, json
from playwright.sync_api import sync_playwright
from ttb import check, serve, done, HERE
FAKE = open(os.path.join(HERE, "fake_firebase.js"), encoding="utf-8").read()
CFG = 'export const firebaseConfig={apiKey:"test-key",authDomain:"x",projectId:"my-todo-e4949",appId:"x"};'
srv = serve(8794)
SEED = """(()=>{if(sessionStorage.getItem('fakefs'))return;
const k=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const P='users/u1/items/';
sessionStorage.setItem('fakefs',JSON.stringify([[P+'t_1',{title:'보고서',note:'',date:k(0),time:null,end:null,remind:null,cat:'k1',sub:null,done:false,doneAt:null,createdAt:1,subtasks:[]}],
 [P+'e_1',{title:'자료구조',place:'IT관',color:'c6',days:[0,1,2,3,4,5,6],time:'15:00',end:'16:30',from:null,until:null,holOff:false,remind:null,note:'',skips:['2020-01-01'],archived:false,createdAt:1}],
 [P+'meta',{cats:[{id:'k1',name:'일상',color:'c7',subs:[]}]}]]));})();"""
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
    ctx.add_init_script(SEED)
    ctx.route("**/firebase-config.js", lambda r: r.fulfill(body=CFG, content_type="text/javascript"))
    ctx.route("https://www.gstatic.com/**", lambda r: r.fulfill(body=FAKE, content_type="text/javascript"))
    ctx.route("https://*.workers.dev/**", lambda r: r.fulfill(body='{"ok":true,"key":"x"}', content_type="application/json"))
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("http://localhost:8794/"); pg.wait_for_selector(".grp"); pg.wait_for_timeout(500)
    doc = lambda i: pg.evaluate("i=>window.__fs.docs.get('users/u1/items/'+i)", i)
    tk = pg.evaluate("(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})()")
    # 거절: 완료 체크
    pg.evaluate("window.__fs.failNext='permission-denied'")
    pg.click(".task:has-text('보고서') .chk"); pg.wait_for_timeout(400)
    check(doc("t_1")["done"] is False, "서버가 거절하면 저장 안 됨")
    check("done" not in (pg.get_attribute(".task:has-text('보고서')", "class") or ""), "화면도 원래대로(체크 풀림)")
    check(pg.inner_text("#toastMsg") == "저장 권한이 없어요. 다시 로그인해 주세요", "권한 오류 알림")
    pg.evaluate("window.__fs.failNext='unavailable-x'")
    pg.click(".task:has-text('보고서') .chk"); pg.wait_for_timeout(400)
    check(pg.inner_text("#toastMsg") == "방금 바꾼 내용을 저장하지 못했어요. 다시 해 주세요", "그 밖의 오류 알림")
    pg.click(".task:has-text('보고서') .chk"); pg.wait_for_timeout(400)
    check(doc("t_1")["done"] is True, "다시 하면 저장")
    # 쉼: arrayUnion으로 하나만
    pg.click("[data-act=view][data-v=week]"); pg.wait_for_timeout(300)
    pg.click(f".blk.ev[data-k='{tk}']"); pg.click(".sheet [data-act=eskipday]"); pg.wait_for_timeout(400)
    check(doc("e_1")["skips"] == ["2020-01-01", tk], "쉼: 있던 것은 두고 하나만 더함(배열 덮어쓰기 아님)")
    pg.click(".sheet [data-act=eskipday]"); pg.wait_for_timeout(400)
    check(doc("e_1")["skips"] == ["2020-01-01"], "쉼 취소: 그 하나만 뺌")
    # 여러 묶음 복원: 두 번째 묶음이 실패하면 '일부만 복원됐어요', 다시 하면 전부
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    big = json.dumps({"tasks": [{"id": "t_imp%d" % i, "title": "복원 %d" % i, "date": tk} for i in range(450)]})
    pg.click("[data-act=menu]"); pg.click("[data-act=import]"); pg.fill("#i-in", big); pg.click("[data-act=importcheck]"); pg.wait_for_timeout(150)
    pg.evaluate("window.__fs.failAfter=1"); pg.click("[data-act=importgo]"); pg.wait_for_timeout(600)
    n = pg.evaluate("[...__fs.docs.keys()].filter(k=>k.includes('/t_imp')).length")
    check(n == 400 and "일부만 복원됐어요" in pg.inner_text("#i-err"), "두 번째 묶음 실패: 일부만 복원됐다고 알림 (" + str(n) + "개)")
    pg.click("[data-act=importgo]"); pg.wait_for_timeout(800)
    n = pg.evaluate("[...__fs.docs.keys()].filter(k=>k.includes('/t_imp')).length")
    check(n == 450 and not pg.is_visible("#dlg"), "한 번 더 복원하면 전부")
    ctx.close(); b.close()
srv.terminate()
done(errs)
