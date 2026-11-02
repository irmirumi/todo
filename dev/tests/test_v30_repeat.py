# 3.0.0 반복 할 일 시간대(고정 일정과 같은 줄 카드): 요일마다 다른 시간, 같은 요일 두 번, 흐린 줄·시간표·추가가 시간대별로.
# 자동 추가 없음. 옛 반복 할 일(시간대 없음)과 tslot 없는 옛 할 일도 그대로 동작
import json
from playwright.sync_api import sync_playwright
from ttb import check, serve, done, OUT
srv = serve(8831)
MOCK = """const m=TodoApp.memoryStore();window.__m=m;
const k=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const w=new Date().getDay(),w1=(w+1)%7;
m.importAll({cats:null,events:[],tasks:[{id:'t_old',title:'옛 반복',date:k(0),cat:'k1',done:false,createdAt:1,subtasks:[],tpl:'r_old'}],
 tpls:[{id:'r_two',title:'근로',cat:'k2',days:[w],time:'09:00',end:'10:00',remind:10,subtasks:[],slots:[{id:'',days:[w],time:'09:00',end:'10:00'},{id:'a1',days:[w,w1],time:'14:00',end:'16:30'}]},
       {id:'r_old',title:'옛 반복',cat:'k1',days:[w],time:'08:00',subtasks:[]}]});
const s=Object.assign({},m,{kind:'pwa',push:{state:async()=>'on',enable:async()=>{},disable:async()=>{},test:async()=>({sent:1}),schedule(){},refresh(){}},
 start(c){m.start({onData:(d,meta)=>{window.__d=d;c.onData(d,meta);},onStatus:x=>c.onStatus(x==='local'?'live':x),onError:c.onError});}});
TodoApp.boot(s);"""
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    for W, H, tag in [(390, 844, "m"), (1280, 900, "pc")]:
        ctx = b.new_context(viewport={"width": W, "height": H}, has_touch=W < 600); pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
        pg.route("**/app.js", lambda r: r.fulfill(body=MOCK, content_type="text/javascript"))
        pg.goto("http://localhost:8831/app/"); pg.wait_for_selector(".grp"); pg.wait_for_timeout(400)
        tasks = lambda: pg.evaluate("[...__d.tasks.values()]")
        gh = pg.locator(".task.ghost:has-text('근로')")
        check(gh.count() == 2 and "9:00" in gh.nth(0).inner_text() and "2:00" in gh.nth(1).inner_text(), "같은 요일 시간대 두 개 → 흐린 줄 둘(각자 시간)")
        check(pg.locator(".task.ghost:has-text('옛 반복')").count() == 0, "tslot 없는 옛 할 일이 있으면 옛 반복은 흐린 줄 없음")
        check(not any(t.get("tpl") == "r_two" for t in tasks()), "자동 추가 없음")
        gh.nth(1).locator(".gadd").click(); pg.wait_for_timeout(400)
        t = [x for x in tasks() if x.get("tpl") == "r_two"]
        check(len(t) == 1 and t[0]["time"] == "14:00" and t[0]["end"] == "16:30" and t[0]["tslot"] == "a1" and t[0]["remind"] == 10, "＋: 그 시간대 시간으로 추가(tslot)")
        check(pg.locator(".task.ghost:has-text('근로')").count() == 1 and "9:00" in pg.inner_text(".task.ghost:has-text('근로')"), "남은 시간대만 흐린 줄")
        # 정보 창(남은 흐린 줄)
        pg.click(".task.ghost:has-text('근로') .ttl"); pg.wait_for_timeout(300)
        info = pg.inner_text("#sheet")
        check("9:00" in info and "10:00" in info and "자동" not in info, "흐린 줄 정보: 그 시간대 시간 " + info.replace("\n", " ")[:120])
        pg.click("[data-act=iadd]"); pg.wait_for_timeout(400)
        t = sorted([x for x in tasks() if x.get("tpl") == "r_two"], key=lambda x: x["time"])
        check(len(t) == 2 and t[0]["time"] == "09:00" and t[0]["tslot"] == "", "정보 창 '이날 할 일에 추가'도 그 시간대")
        # 편집: 시간대 카드
        pg.click("[data-act=menu]"); pg.wait_for_timeout(200); pg.click(".sheet [data-act=tpls]"); pg.wait_for_timeout(250)
        row = pg.locator(".tplrow:has-text('근로')")
        check(row.locator(".when.ms span").count() >= 2, "반복 할 일 목록: 시간대마다 한 줄")
        bb = [row.locator(x).bounding_box() for x in (".nm", ".when")]
        check(abs((bb[0]["y"] + bb[0]["height"] / 2) - (bb[1]["y"] + bb[1]["height"] / 2)) < 3, "목록: 이름이 시간 줄 묶음 가운데")
        pg.screenshot(path=OUT + tag + "-v30-tpls.png")
        row.click(); pg.wait_for_timeout(300)
        check(pg.locator(".sheet .slot").count() == 2 and pg.input_value("#s-time-1") in ("14:00",) and pg.locator("#e-auto").count() == 0, "편집: 시간대 카드 둘, 자동 추가 설정 없음")
        pg.click("[data-act=slotadd]"); pg.wait_for_timeout(150)
        pg.click(".slot[data-i='2'] [data-d='%d']" % ((pg.evaluate("new Date().getDay()") + 2) % 7)); pg.wait_for_timeout(100)
        pg.fill("#s-time-2", "19:00" if W >= 600 else "19:00"); pg.dispatch_event("#s-time-2", "change"); pg.wait_for_timeout(150)
        pg.screenshot(path=OUT + tag + "-v30-tpledit.png", full_page=True)
        pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(400)
        r = pg.evaluate("__d.tpls.get('r_two')")
        check(len(r["slots"]) == 3 and r["slots"][2]["time"] == "19:00" and r["days"] == r["slots"][0]["days"] and "auto" not in r, "저장: 시간대 3개(첫 줄은 예전 칸에도)")
        # 할 일 없는 시간대(시간 없이 요일만)도 됨: 새 반복 할 일
        pg.click("[data-act=menu]"); pg.wait_for_timeout(200); pg.click(".sheet [data-act=tpls]"); pg.wait_for_timeout(200); pg.click("[data-act=tplnew]"); pg.wait_for_timeout(200)
        pg.keyboard.type("빨래"); pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(400)
        r = [x for x in pg.evaluate("[...__d.tpls.values()]") if x["title"] == "빨래"]
        check(len(r) == 1 and r[0]["time"] is None and r[0].get("slots") is None and len(r[0]["days"]) == 1, "시간 없는 반복 할 일(시간대 하나는 예전 모양)")
        # 시간표: 흐린 칸이 시간대 시간에
        pg.click("[data-act=view][data-v=week]"); pg.wait_for_timeout(500)
        check(pg.locator(".blk.ghost").count() >= 1 and all(pg.locator(".blk.ghost").nth(i).get_attribute("data-s") is not None for i in range(pg.locator(".blk.ghost").count())), "시간표 흐린 칸에 시간대 표시(data-s)")
        ctx.close()
    b.close()
done(errs)
