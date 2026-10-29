# 2.6.0 두 기기 안전(실제 app.js + 가짜 Firebase):
# - 첫 서버 스냅샷에서도 자동 추가가 돈다(C4)
# - 다른 기기가 먼저 만들고 고친 자동 할 일을 덮지 않는다(C1)
# - 다른 기기에서 되살린 휴지통 항목을 오래된 스냅샷으로 지우지 않는다(C2)
# - 오프라인이면 자동 추가를 미루고, 연결되면 한다(오류 알림 없이)
# - 편집은 바꾼 칸만 저장해 다른 기기가 그사이 고친 메모를 덮지 않는다(C3)
import os, json
from playwright.sync_api import sync_playwright
from ttb import check, serve, done, HERE
FAKE = open(os.path.join(HERE, "fake_firebase.js"), encoding="utf-8").read()
CFG = 'export const firebaseConfig={apiKey:"test-key",authDomain:"x",projectId:"my-todo-e4949",appId:"x"};'
srv = serve(8796)
P = "users/u1/items/"
KJS = "const k=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};"
errs = []

def page(b, seed_js, before=""):
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
    ctx.add_init_script("(()=>{if(sessionStorage.getItem('fakefs'))return;" + KJS + "const P='" + P + "';" + seed_js + "})();" + before)
    ctx.route("**/firebase-config.js", lambda r: r.fulfill(body=CFG, content_type="text/javascript"))
    ctx.route("https://www.gstatic.com/**", lambda r: r.fulfill(body=FAKE, content_type="text/javascript"))
    ctx.route("https://*.workers.dev/**", lambda r: r.fulfill(body='{"ok":true,"key":"x"}', content_type="application/json"))
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    return ctx, pg

META = "[P+'meta',{cats:[{id:'k1',name:'일상',color:'c7',subs:[]}]}]"
TPL = "[P+'r_x',{title:'물 마시기',days:[0,1,2,3,4,5,6],auto:true,cat:'k1',time:'09:00',subtasks:[],createdAt:1}]"
doc = lambda pg, i: pg.evaluate("i=>window.__fs.docs.get('" + P + "'+i)", i)
tasks_of = lambda pg: pg.evaluate("[...__fs.docs.keys()].filter(x=>x.includes('/t_x_')).sort()")

with sync_playwright() as p:
    b = p.chromium.launch()
    # C4: 첫 스냅샷이 서버 것이어도 오늘·내일 몫이 생긴다
    ctx, pg = page(b, "sessionStorage.setItem('fakefs',JSON.stringify([" + META + "," + TPL + "]));")
    pg.goto("http://localhost:8796/"); pg.wait_for_selector(".grp")
    try: pg.wait_for_function("[...__fs.docs.keys()].filter(x=>x.includes('/t_x_')).length===2", timeout=3000)
    except Exception: pass
    check(len(tasks_of(pg)) == 2, "첫 서버 스냅샷에서도 오늘·내일 자동 추가 " + str(tasks_of(pg)))
    tk = pg.evaluate(KJS + "k(0)"); tid = "t_x_" + tk.replace("-", "")
    check(doc(pg, "r_x").get("madeUntil") == pg.evaluate(KJS + "k(1)"), "madeUntil은 만든 뒤 내일로")
    check(pg.evaluate("window.__fs.tx||0") >= 3, "자동 추가는 서버 확인(트랜잭션)으로")
    ctx.close()

    # C1: 다른 기기가 먼저 만들고 완료·제목 수정까지 했는데, 이 기기에는 아직 안 보임
    seed = ("const id='t_x_'+k(0).replace(/-/g,'');sessionStorage.setItem('fakefs',JSON.stringify([" + META + "," + TPL +
            ",[P+id,{title:'폰에서 고친 제목',date:k(0),cat:'k1',done:true,doneAt:5,tpl:'r_x',subtasks:[],createdAt:2}]]));")
    ctx, pg = page(b, seed, "(()=>{" + KJS + "const id='" + P + "t_x_'+k(0).replace(/-/g,'');Object.defineProperty(window,'__fs',{configurable:true,set(v){delete window.__fs;window.__fs=v;v.view={[id]:null};},get(){return undefined;}});})();")
    pg.goto("http://localhost:8796/"); pg.wait_for_selector(".grp"); pg.wait_for_timeout(800)
    d = doc(pg, tid)
    check(d and d["title"] == "폰에서 고친 제목" and d["done"] is True, "늦게 도착한 자동 추가가 다른 기기의 완료·수정을 덮지 않음 " + str(d))
    check(len(tasks_of(pg)) == 2, "내일 몫은 새로 만듦")
    ctx.close()

    # C2: 30일 지난 휴지통 항목을 다른 기기에서 되살렸는데, 이 기기는 아직 옛 상태(deletedAt)를 봄
    seed = ("sessionStorage.setItem('fakefs',JSON.stringify([" + META + ",[P+'t_old',{title:'되살린 일',date:k(0),cat:'k1',done:false,subtasks:[],createdAt:1}]]));")
    ctx, pg = page(b, seed, "(()=>{Object.defineProperty(window,'__fs',{configurable:true,set(v){delete window.__fs;window.__fs=v;v.view={'" + P + "t_old':{title:'되살린 일',cat:'k1',done:false,subtasks:[],createdAt:1,deletedAt:1000}};},get(){return undefined;}});})();")
    pg.goto("http://localhost:8796/"); pg.wait_for_selector(".grp"); pg.wait_for_timeout(800)
    check(doc(pg, "t_old") is not None, "오래된 스냅샷으로 휴지통을 비워도 다른 기기에서 되살린 할 일은 남음")
    ctx.close()

    # 오프라인: 트랜잭션이 실패하면 조용히 미루고, 다시 연결되면 한다
    ctx, pg = page(b, "sessionStorage.setItem('fakefs',JSON.stringify([" + META + "," + TPL + "]));", "(()=>{Object.defineProperty(window,'__fs',{configurable:true,set(v){delete window.__fs;window.__fs=v;v.offline=true;},get(){return undefined;}});})();")
    pg.goto("http://localhost:8796/"); pg.wait_for_selector(".grp"); pg.wait_for_timeout(700)
    check(len(tasks_of(pg)) == 0 and doc(pg, "r_x").get("madeUntil") is None, "오프라인이면 자동 추가를 미룸(madeUntil도 그대로)")
    check(not pg.is_visible("#toast") or "저장" not in pg.inner_text("#toast"), "오류 알림 없음")
    pg.evaluate("window.__fs.offline=false;window.__fs.emit()")
    try: pg.wait_for_function("[...__fs.docs.keys()].filter(x=>x.includes('/t_x_')).length===2", timeout=3000)
    except Exception: pass
    check(len(tasks_of(pg)) == 2, "연결되면 자동 추가")

    # C3: 편집 창을 연 사이 다른 기기가 메모를 고침 → 제목만 고쳐 저장해도 메모는 다른 기기 것
    pg.click(".task:has-text('물 마시기') .t >> nth=0"); pg.wait_for_timeout(250)
    tid = tasks_of(pg)[0].split("/")[-1]
    pg.evaluate("i=>{const p='" + P + "'+i;__fs.docs.set(p,Object.assign(__fs.docs.get(p),{note:'폰에서 쓴 메모'}));__fs.emit();}", tid)
    pg.wait_for_timeout(200)
    pg.fill("#e-title", "PC에서 고친 제목"); pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(400)
    d = doc(pg, tid)
    check(d["title"] == "PC에서 고친 제목" and d["note"] == "폰에서 쓴 메모", "편집은 바꾼 칸만 저장(다른 기기의 메모 보존) " + str({k: d.get(k) for k in ("title", "note")}))
    ctx.close()
    b.close()
srv.terminate(); done(errs)
