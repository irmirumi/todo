# 2.6.0 두 기기 안전(실제 app.js + 가짜 Firebase):
# - (3.0.0) 반복 할 일 자동 추가는 없앴다: 옛 auto 데이터로도 안 만든다
# - 다른 기기에서 되살린 휴지통 항목을 오래된 스냅샷으로 지우지 않는다(C2)
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
    # 3.0.0: 반복 할 일 자동 추가는 없앴다. 옛 auto:true 데이터라도 할 일을 만들지 않고 madeUntil도 안 쓴다
    ctx, pg = page(b, "sessionStorage.setItem('fakefs',JSON.stringify([" + META + "," + TPL + "]));")
    pg.goto("http://localhost:8796/app/"); pg.wait_for_selector(".grp"); pg.wait_for_timeout(800)
    check(len(tasks_of(pg)) == 0 and doc(pg, "r_x").get("madeUntil") is None and pg.locator(".task.ghost").count() == 1, "옛 auto:true 반복 할 일도 자동으로 안 만듦(흐린 줄)")
    ctx.close()

    # C2: 30일 지난 휴지통 항목을 다른 기기에서 되살렸는데, 이 기기는 아직 옛 상태(deletedAt)를 봄
    seed = ("sessionStorage.setItem('fakefs',JSON.stringify([" + META + ",[P+'t_old',{title:'되살린 일',date:k(0),cat:'k1',done:false,subtasks:[],createdAt:1}]]));")
    ctx, pg = page(b, seed, "(()=>{Object.defineProperty(window,'__fs',{configurable:true,set(v){delete window.__fs;window.__fs=v;v.view={'" + P + "t_old':{title:'되살린 일',cat:'k1',done:false,subtasks:[],createdAt:1,deletedAt:1000}};},get(){return undefined;}});})();")
    pg.goto("http://localhost:8796/app/"); pg.wait_for_selector(".grp"); pg.wait_for_timeout(800)
    check(doc(pg, "t_old") is not None, "오래된 스냅샷으로 휴지통을 비워도 다른 기기에서 되살린 할 일은 남음")
    ctx.close()

    ctx, pg = page(b, "sessionStorage.setItem('fakefs',JSON.stringify([" + META + "," + TPL + ",[P+'t_x_1',{title:'물 마시기',date:k(0),cat:'k1',done:false,tpl:'r_x',subtasks:[],createdAt:2}]]));")
    pg.goto("http://localhost:8796/app/"); pg.wait_for_selector(".grp"); pg.wait_for_timeout(500)
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
