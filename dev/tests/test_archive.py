# 오래된 기록 묶기(1.4.0) 통합 테스트: 실제 app.js + archive.js를 띄우고 Firebase만 가짜(fake_firebase.js)로 바꾼다.
import os, subprocess, sys, time, json
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "dist", "app")
FAKE = open(os.path.join(HERE, "fake_firebase.js"), encoding="utf-8").read()
CFG = 'export const firebaseConfig={apiKey:"test-key",authDomain:"x",projectId:"my-todo-e4949",appId:"x"};'
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8782"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
SEED = """(()=>{if(sessionStorage.getItem('fakefs'))return;
const day=864e5,now=Date.now(),k=ms=>{const d=new Date(ms);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const T=(o)=>Object.assign({title:'',note:'',date:null,time:null,end:null,remind:null,cat:'k1',sub:null,done:false,doneAt:null,createdAt:now-200*day,subtasks:[]},o);
const P='users/u1/items/';
const docs=[
 [P+'t_old1',T({title:'오래된 완료',date:k(now-90*day),done:true,doneAt:now-90*day,subtasks:[{id:'s1',t:'세부',done:true}]})],
 [P+'t_old2',T({title:'오래된 안함',date:k(now-100*day),skipped:true,skippedAt:now-95*day})],
 [P+'t_old3',T({title:'날짜 없는 옛 완료',done:true,doneAt:now-80*day})],
 [P+'t_open',T({title:'오래된 미완료',date:k(now-90*day)})],
 [P+'t_recent',T({title:'최근 완료',date:k(now-10*day),done:true,doneAt:now-10*day})],
 [P+'t_late',T({title:'늦게 끝낸 것',date:k(now-90*day),done:true,doneAt:now-5*day})],
 [P+'t_dup',T({title:'되살린 것',date:k(now-90*day)})],
 [P+'a_2000-01',{tasks:{t_dup:{title:'되살린 것(옛 사본)',date:'2000-01-05',done:true,doneAt:1,cat:'k1',subtasks:[]}}}],
 [P+'r_1',{title:'반복',days:[1],cat:'k1',subtasks:[]}],
 [P+'meta',{cats:[{id:'k1',name:'일상',color:'c7',subs:[]},{id:'k2',name:'공부',color:'c5',subs:[]}]}]];
sessionStorage.setItem('fakefs',JSON.stringify(docs));sessionStorage.setItem('oldday',k(now-90*day));sessionStorage.setItem('old2day',k(now-100*day));})();"""
n = 0
def check(cond, msg):
    global n; n += 1
    assert cond, msg
    print("ok", msg)
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    # 서비스 워커는 막는다: 켜 두면 가짜 설정 파일 대신 서버의 자리표시자를 가져온다(오프라인 동작은 test_offline.py)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, service_workers="block")
    ctx.add_init_script(SEED)
    ctx.route("**/firebase-config.js", lambda r: r.fulfill(body=CFG, content_type="text/javascript"))
    ctx.route("https://www.gstatic.com/**", lambda r: r.fulfill(body=FAKE, content_type="text/javascript"))
    ctx.route("https://*.workers.dev/**", lambda r: r.fulfill(body='{"ok":true,"key":"x"}', content_type="application/json"))
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.goto("http://localhost:8782/"); pg.wait_for_selector(".grp"); pg.wait_for_timeout(600)
    docs = lambda: dict(pg.evaluate("[...window.__fs.docs]"))
    def open_day(k):
        pg.evaluate("k=>{location.hash='#d='+k}", k); pg.reload(); pg.wait_for_selector(".grp"); pg.wait_for_timeout(500)
    d = docs(); ids = sorted(x.split("/")[-1] for x in d)
    arch = {x.split("/")[-1]: v for x, v in d.items() if x.split("/")[-1].startswith("a_")}
    inarch = sorted(t for v in arch.values() for t in v["tasks"])
    print("docs:", ids)
    check(d["users/u1/items/a_2000-01"]["tasks"] == {}, "되살린 할 일의 옛 사본은 묶음에서 지움")
    inarch = [t for t in inarch if t != "t_dup"]
    check(inarch == ["t_old1", "t_old2", "t_old3"], "60일 지난 완료·안 함만 묶임: " + str(inarch))
    check(not any(i in ids for i in ["t_old1", "t_old2", "t_old3"]), "묶은 할 일의 원래 문서는 지워짐")
    check(all(i in ids for i in ["t_dup", "t_open", "t_recent", "t_late", "r_1", "meta"]), "미완료·최근·늦게 끝낸 것·반복·카테고리는 그대로")
    a1 = [v for v in arch.values() if "t_old1" in v["tasks"]][0]["tasks"]["t_old1"]
    check(a1["title"] == "오래된 완료" and a1["subtasks"][0]["t"] == "세부" and "id" not in a1, "묶음 안 내용이 그대로(세부 할 일 포함)")
    oldday = pg.evaluate("sessionStorage.getItem('oldday')"); old2day = pg.evaluate("sessionStorage.getItem('old2day')")

    # 화면은 묶였는지 모른다: 그날을 열면 그대로 보임
    open_day(oldday)
    row = pg.locator(".task:has-text('오래된 완료')")
    check(row.count() == 1 and "done" in row.get_attribute("class"), "묶인 할 일도 그날 화면에 완료로 보임")
    pg.click("[data-act=view][data-v=all]"); pg.click("[data-act=showdone]"); pg.wait_for_timeout(200)
    check(pg.locator("#main .task:has-text('날짜 없는 옛 완료')").count() == 1, "전체 탭 완료 목록에도 보임")
    pg.click("[data-act=menu]"); pg.click("[data-act=export]")
    out = json.loads(pg.input_value("#x-out"))
    check(len(out["tasks"]) == 7 and not any(k.startswith("a_") for k in [t["id"] for t in out["tasks"]]), "내보내기에 묶인 할 일도 보통 할 일로 7개(중복 없이)")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # 다시 고치면 풀림: 완료 취소
    open_day(oldday)
    pg.click(".task:has-text('오래된 완료') .chk"); pg.wait_for_timeout(400)
    d = docs()
    t1 = d.get("users/u1/items/t_old1")
    check(t1 is not None and t1["done"] is False and t1["title"] == "오래된 완료" and len(t1["subtasks"]) == 1, "완료 취소하면 원래 문서로 돌아옴(내용 유지)")
    check(not any("t_old1" in v.get("tasks", {}) for k, v in d.items() if k.split("/")[-1].startswith("a_")), "묶음에서는 빠짐")
    check(pg.locator(".task:has-text('오래된 완료')").count() == 1 and "done" not in pg.locator(".task:has-text('오래된 완료')").get_attribute("class"), "화면에 한 번만, 미완료로")
    # 한 번 더 고치면 보통 저장
    pg.click(".task:has-text('오래된 완료') .chk"); pg.wait_for_timeout(300)
    check(docs()["users/u1/items/t_old1"]["done"] is True, "풀린 뒤 다시 완료는 보통 저장")

    # 묶인 할 일 삭제 → 되돌리기
    open_day(old2day)
    pg.click(".ttl:has-text('오래된 안함')"); pg.click(".sheet [data-act=del]"); pg.wait_for_timeout(400)
    d = docs()
    check("users/u1/items/t_old2" not in d and not any("t_old2" in v.get("tasks", {}) for k, v in d.items() if "/a_" in k), "묶인 할 일 삭제")
    pg.click("#toastAct"); pg.wait_for_timeout(400)
    check(docs().get("users/u1/items/t_old2", {}).get("title") == "오래된 안함", "삭제 되돌리기는 원래 문서로")

    # 같은 날 다시 열어도 또 묶지 않음(하루 한 번). 다음 날 열면 다시 돌아서 되살린 것도 다시 묶음
    before = json.dumps(docs(), sort_keys=True)
    pg.reload(); pg.wait_for_selector(".grp"); pg.wait_for_timeout(600)
    check(json.dumps(docs(), sort_keys=True) == before, "같은 날 다시 열면 그대로")
    pg.evaluate("localStorage.removeItem('ttobak.arch.u1')")
    pg.reload(); pg.wait_for_selector(".grp"); pg.wait_for_timeout(600)
    d = docs(); inarch = sorted(t for k, v in d.items() if "/a_" in k for t in v["tasks"])
    # t_old1은 방금 다시 완료해서(완료 시각이 지금) 안 묶이는 게 맞다. 되돌린 t_old2는 옛 기록이라 다시 묶인다
    check(inarch == ["t_old2", "t_old3"] and "users/u1/items/t_old1" in d, "다음 날: 되돌린 옛 기록은 다시 묶고, 방금 완료한 건 그대로: " + str(inarch))
    check(len([k for k in d if "/t_" in k]) == 5, "남은 할 일 문서 5개")
    # 되살린 할 일을 지워도 옛 사본이 다시 나타나지 않음
    pg.evaluate("k=>{location.hash='#d='+k}", oldday); pg.reload(); pg.wait_for_selector(".grp"); pg.wait_for_timeout(500)
    check(pg.locator(".task:has-text('되살린 것')").count() == 1, "되살린 할 일은 한 번만 보임")
    pg.click(".ttl:has-text('되살린 것')"); pg.click(".sheet [data-act=del]"); pg.wait_for_timeout(400)
    check(pg.locator(".task:has-text('되살린 것')").count() == 0, "지우면 사라지고 옛 사본도 안 나타남")
    ctx.close(); b.close()
srv.kill()
print("checks:", n, "errors:", errs)
assert not errs, errs
