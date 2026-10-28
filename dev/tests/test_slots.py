# 2.3.1: 고정 일정 요일·시간 줄 여러 개. 같은 요일 두 번(중간에 쉬는 수업)도 된다
import os, subprocess, sys, time
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "dist", "app")
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8791"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
MOCK = """const m=TodoApp.memoryStore();
const E=(o)=>Object.assign({place:'',color:'c6',from:null,until:null,holOff:false,remind:null,note:'',skips:[],archived:false,createdAt:1},o);
m.importAll({cats:null,tpls:[],tasks:[],events:[
 E({id:'e_s',title:'자료구조',place:'IT관',days:[1],time:'10:30',end:'11:45',slots:[{id:'',days:[1],time:'10:30',end:'11:45'},{id:'b',days:[3],time:'14:00',end:'15:30'}]}),
 E({id:'e_l',title:'실험',color:'c3',days:[4],time:'09:00',end:'12:00',slots:[{id:'',days:[4],time:'09:00',end:'12:00'},{id:'p',days:[4],time:'14:00',end:'17:00'}]}),
 E({id:'e_o',title:'영어회화',color:'c2',days:[2],time:'09:00',end:'10:00',createdAt:2})]});
TodoApp.boot({kind:'pwa',start(c){m.start({onData(d){window.__last=d;c.onData(d);},onStatus:x=>c.onStatus(x==='local'?'live':x),onError:c.onError});},set:m.set,update:m.update,remove:m.remove,saveCats:m.saveCats,importAll:m.importAll});"""
n = 0
def check(cond, msg):
    global n; n += 1
    assert cond, msg
    print("ok", msg)
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 900}); pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("**/app.js", lambda r: r.fulfill(body=MOCK, content_type="text/javascript"))
    mon = pg.evaluate("""(()=>{const d=new Date();d.setDate(d.getDate()+((8-d.getDay())%7||7));return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})()""")
    add = lambda k, n_: pg.evaluate("([k,n])=>{const d=new Date(k+'T12:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}", [k, n_])
    tue, wed, thu = add(mon, 1), add(mon, 2), add(mon, 3)
    pg.goto("http://localhost:8791/#d=" + mon); pg.wait_for_selector(".grp")
    pg.click("[data-act=view][data-v=week]"); pg.wait_for_timeout(300)
    blk = lambda id_, k: pg.locator(f".blk.ev[data-id={id_}][data-k='{k}']")
    txt = lambda id_, k: [x.replace("\n", " ") for x in blk(id_, k).all_inner_texts()]
    ev = lambda: pg.evaluate("Object.fromEntries(window.__last.events)")
    check(len(txt("e_s", mon)) == 1 and "10:30–11:45" in txt("e_s", mon)[0] and "14:00–15:30" in txt("e_s", wed)[0], "요일마다 제 시간")
    check(blk("e_s", tue).count() == 0 and blk("e_o", tue).count() == 1, "다른 요일엔 없음, 예전 방식 일정도 그대로")
    t = txt("e_l", thu)
    check(len(t) == 2 and any("9:00–12:00" in x for x in t) and any("14:00–17:00" in x for x in t), "같은 요일 두 번: " + str(t))

    # 목요일 오후 칸 → 이 날만 쉼: 오후만 쉼
    pg.click(f".blk.ev[data-id=e_l][data-k='{thu}'][data-s=p]"); pg.wait_for_timeout(200)
    info = pg.inner_text(".info")
    check("오후 2:00–5:00" in info.split("매주")[0] and pg.locator(".info .islot").count() == 2, "정보: 이 칸 시간 + 매주 둘")
    pg.click(".sheet [data-act=eskipday]"); pg.wait_for_timeout(250)
    check(ev()["e_l"]["skips"] == [thu + "#p"], "쉼 키는 '날짜#줄': " + str(ev()["e_l"]["skips"]))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check("off" in blk("e_l", thu).nth(1).get_attribute("class") and "off" not in (blk("e_l", thu).nth(0).get_attribute("class") or ""), "오후만 쉼으로 보임")
    # 목요일 오전 → 이 날만 10:00
    pg.click(f".blk.ev[data-id=e_l][data-k='{thu}'][data-s='']"); pg.wait_for_timeout(200)
    pg.click(".sheet [data-act=evday]"); pg.wait_for_timeout(200)
    check(pg.input_value("#e-time") == "09:00" and "평소 오전 9:00" in pg.inner_text(".sheet"), "이 날만 바꾸기: 그 줄 시간으로 시작")
    pg.fill("#e-time", "10:00"); pg.dispatch_event("#e-time", "change"); pg.wait_for_timeout(100)
    pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(300)
    check(list(ev()["e_l"]["ovr"].keys()) == [thu], "오전 줄은 날짜 키 그대로")
    t = txt("e_l", thu)
    check(any("10:00–" in x for x in t) and any("14:00–17:00" in x for x in t), "오전만 바뀜: " + str(t))

    # 편집: 줄이 다 펼쳐져 있음. 안 고치고 닫으면 알림 없음
    pg.click("[data-act=menu]"); pg.click(".sheet [data-act=evs]"); pg.wait_for_timeout(150)
    rowtxt = pg.inner_text(".tplrow:has-text('실험') .when")
    check("목 오전 9:00–오후 12:00" in rowtxt and "목 오후 2:00–5:00" in rowtxt, "목록: " + rowtxt.replace("\n", " / "))
    pg.click(".tplrow:has-text('자료구조')"); pg.wait_for_timeout(150)
    check(pg.locator(".slot").count() == 2 and pg.input_value("#s-time-0") == "10:30" and pg.input_value("#s-time-1") == "14:00", "줄 둘 다 바로 고칠 수 있음")
    check(pg.input_value("#s-dur-0") == "75", "길이 1시간 15분")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check(not pg.is_visible("#toast") or pg.inner_text("#toastMsg") != "변경 사항을 저장하지 않았어요", "안 고치고 닫으면 알림 없음")

    pg.click("[data-act=menu]"); pg.click(".sheet [data-act=evs]"); pg.click(".tplrow:has-text('자료구조')"); pg.wait_for_timeout(150)
    pg.fill("#s-time-0", "11:00"); pg.dispatch_event("#s-time-0", "change"); pg.wait_for_timeout(100)
    check(pg.input_value("#s-end-0") == "12:15", "시작 옮기면 끝도(길이 유지)")
    pg.select_option("#s-dur-1", "90"); pg.wait_for_timeout(100)
    check(pg.input_value("#s-end-1") == "15:30", "길이 고르면 끝이 맞춰짐")
    pg.select_option("#s-dur-1", "75"); pg.wait_for_timeout(100)
    pg.click(".slot[data-i='0'] [data-act=sday][data-d='3']"); pg.wait_for_timeout(100)
    pg.click("[data-act=slotadd]"); pg.wait_for_timeout(150)
    check(pg.locator(".slot").count() == 3 and pg.input_value("#s-time-2") == "14:00" and "요일을 골라" in pg.inner_text(".slot[data-i='2']"), "줄 추가: 앞 줄 시간 이어받고 요일 고르라는 안내")
    pg.click(".slot[data-i='2'] [data-act=sday][data-d='3']"); pg.wait_for_timeout(100)
    check("겹쳐요" in pg.inner_text(".slot[data-i='2']"), "같은 요일에 시간 겹치면 안내")
    pg.fill("#s-time-2", "16:00"); pg.dispatch_event("#s-time-2", "change"); pg.wait_for_timeout(100)
    check("겹쳐요" not in pg.inner_text(".sheet"), "안 겹치면 안내 사라짐")
    pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(300)
    e = ev()["e_s"]; sl = [(x["id"] or "-", x["days"], x["time"], x["end"]) for x in e["slots"]]
    check([s[1:] for s in sl] == [([1, 3], "11:00", "12:15"), ([3], "14:00", "15:15"), ([3], "16:00", "17:15")] and sl[0][0] == "-" and sl[1][0] == "b" and sl[2][0] not in ("-", "b"), "저장: " + str(sl))
    check(e["days"] == [1, 3] and e["time"] == "11:00", "id 없는 줄은 days·time에도(예전 버전용)")
    check(len(txt("e_s", wed)) == 3, "수요일 세 번")

    # 줄 빼기 → 하나 남으면 slots 없이
    pg.click("[data-act=menu]"); pg.click(".sheet [data-act=evs]"); pg.click(".tplrow:has-text('자료구조')"); pg.wait_for_timeout(150)
    for _ in range(2):
        pg.click(".slot[data-i='1'] [data-act=slotdel]"); pg.wait_for_timeout(120)
    check(pg.locator(".slot").count() == 1 and pg.locator("[data-act=slotdel]").count() == 0, "하나 남으면 빼기 없음")
    pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(300)
    check(ev()["e_s"].get("slots") is None and ev()["e_s"]["days"] == [1, 3], "하나만 남으면 slots 없이")
    # 첫 줄을 빼면 남은 줄의 쉼은 그대로
    pg.click("[data-act=menu]"); pg.click(".sheet [data-act=evs]"); pg.click(".tplrow:has-text('실험')"); pg.wait_for_timeout(150)
    pg.click(".slot[data-i='0'] [data-act=slotdel]"); pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(300)
    e = ev()["e_l"]
    check(e["slots"] == [{"id": "p", "days": [4], "time": "14:00", "end": "17:00"}] and e["time"] == "14:00", "남은 줄은 id 유지: " + str(e["slots"]))
    check(blk("e_l", thu).count() == 1 and "off" in blk("e_l", thu).get_attribute("class"), "그 줄의 쉼도 그대로")

    # 새 고정 일정: 시작 정하면 끝 +1시간, 요일 없는 줄은 버림
    pg.click("[data-act=menu]"); pg.click(".sheet [data-act=evs]"); pg.click("[data-act=evnew]"); pg.wait_for_timeout(150)
    pg.fill("#e-title", "동아리")
    pg.fill("#s-time-0", "19:00"); pg.dispatch_event("#s-time-0", "change"); pg.wait_for_timeout(100)
    check(pg.input_value("#s-end-0") == "20:00", "새 일정: 끝 +1시간")
    pg.click("[data-act=slotadd]"); pg.wait_for_timeout(100)
    pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(300)
    new = [v for v in ev().values() if v["title"] == "동아리"]
    check(len(new) == 1 and new[0].get("slots") is None and new[0]["time"] == "19:00", "빈 줄은 버리고 저장")

    # 폰
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(300)
    pg.click("[data-act=menu]"); pg.click(".sheet [data-act=evs]"); pg.click(".tplrow:has-text('동아리')"); pg.wait_for_timeout(150)
    pg.click("[data-act=slotadd]"); pg.click(".slot[data-i='1'] [data-act=sday][data-d='4']"); pg.wait_for_timeout(150)
    pg.evaluate("document.querySelector('.slots').scrollIntoView()"); pg.wait_for_timeout(100)
    pg.screenshot(path=os.path.join(HERE, "out", "slots_phone.png"))
    check(pg.evaluate("[...document.querySelectorAll('.slot')].every(s=>s.scrollWidth<=s.clientWidth+1)"), "폰: 줄 카드가 가로로 안 넘침")
    ctx.close(); b.close()
srv.kill()
print("checks:", n, "errors:", errs)
assert not errs, errs
