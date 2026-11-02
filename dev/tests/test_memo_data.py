# 2.9.1 메모 앱 데이터: 실제 app.js + 가짜 Firebase. 메모 앱은 메모 문서(m_)만 구독하고,
# 할 일을 모르는 채로 할 일에 손대지 않는다(알림 목록 보내기·묶기·자동 추가 없음). 또박은 그대로 전부 구독
import os
from playwright.sync_api import sync_playwright
from ttb import check, serve, done, HERE
srv = serve(8803)
FAKE = open(os.path.join(HERE, "fake_firebase.js"), encoding="utf-8").read()
CFG = 'export const firebaseConfig={apiKey:"test-key",authDomain:"x",projectId:"my-todo-e4949",appId:"x"};'
SEED = """(()=>{if(sessionStorage.getItem('fakefs'))return;
const day=864e5,now=Date.now(),P='users/u1/items/';
const T=o=>Object.assign({title:'',note:'',date:null,time:null,end:null,remind:null,cat:'k1',sub:null,done:false,doneAt:null,createdAt:now-200*day,subtasks:[]},o);
const docs=[
 [P+'t_old',T({title:'오래된 완료',date:'2026-01-02',done:true,doneAt:now-90*day})],
 [P+'t_soon',T({title:'곧 알림',date:new Date(now+864e5).toISOString().slice(0,10),time:'09:00',remind:10})],
 [P+'t_bin',T({title:'오래 지난 휴지통 할 일',deletedAt:now-40*day})],
 [P+'r_1',{title:'매일 반복',days:[0,1,2,3,4,5,6],cat:'k1',subtasks:[],createdAt:1}],
 [P+'a_2025-01',{tasks:{t_x:{title:'묶인 것',date:'2025-01-05',done:true,doneAt:1,cat:'k1',subtasks:[]}}}],
 [P+'meta',{cats:[{id:'k1',name:'일상',color:'c7',subs:[]}]}],
 [P+'m_a',{text:'# 수업 메모',color:'c4',x:40,y:40,w:240,h:200,z:1,createdAt:1,updatedAt:5}],
 [P+'m_old',{text:'오래 지난 지운 메모',color:'',x:0,y:0,w:240,h:200,z:2,createdAt:1,updatedAt:1,deletedAt:now-40*day}]];
sessionStorage.setItem('fakefs',JSON.stringify(docs));})();"""
errs, sync = [], []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, service_workers="block")
    ctx.add_init_script(SEED)
    ctx.route("**/firebase-config.js", lambda r: r.fulfill(body=CFG, content_type="text/javascript"))
    ctx.route("https://www.gstatic.com/**", lambda r: r.fulfill(body=FAKE, content_type="text/javascript"))
    def worker(r):
        if "/sync" in r.request.url: sync.append(r.request.url)
        r.fulfill(body='{"ok":true,"key":"x"}', content_type="application/json")
    ctx.route("https://*.workers.dev/**", worker)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    ids = lambda: sorted(x.split("/")[-1] for x in pg.evaluate("[...window.__fs.docs.keys()]"))
    before = None
    # ---------- 메모 앱 ----------
    pg.goto("http://localhost:8803/memo/"); pg.wait_for_selector(".mcard"); pg.wait_for_timeout(1200)
    before = ids()
    q = pg.evaluate("window.__fs.queries")
    check(q and all(x.get("lo") == "m_" and x.get("hi") == "m`" for x in q), "메모 앱: 메모 문서(m_)만 구독 " + str(q))
    check(pg.locator(".mcard").count() == 1, "메모 목록")
    check("t_old" in before and "t_bin" in before and not any(i.startswith("t_r_") or i.startswith("t_1_") for i in before), "할 일은 그대로(묶기·자동 추가·할 일 휴지통 비우기 없음)")
    check("m_old" not in before, "30일 지난 메모 휴지통은 비움")
    check(not sync, "알림 목록을 보내지 않음(빈 목록으로 덮지 않게)")
    pg.click("[data-act=mnew]"); pg.wait_for_timeout(300); pg.fill("#m-text", "새로 쓴 메모"); pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    mm = [v for k, v in pg.evaluate("[...window.__fs.docs]") if k.split("/")[-1].startswith("m_")]
    check(any(m.get("text") == "새로 쓴 메모" for m in mm) and pg.locator(".mcard").count() == 2, "메모 앱에서 쓴 메모가 서버로")
    # ---------- 또박: 예전처럼 전부 구독 ----------
    pg.evaluate("window.__fs.queries=[]")
    pg.goto("http://localhost:8803/app/"); pg.wait_for_selector(".grp"); pg.wait_for_timeout(1200)
    q = pg.evaluate("window.__fs.queries")
    check(q and all(x.get("lo") is None for x in q), "또박: 전부 구독")
    check(sync, "또박은 알림 목록을 보냄")
    b.close()
done(errs)
