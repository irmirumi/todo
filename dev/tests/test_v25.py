# 2.5.0: 반복 할 일 자동 추가, 휴지통, 검색, 편집 창 접기, 오전·오후 바꾸기, 비밀번호 재설정, 백업 파일, 공휴일 자료 끝 안내, 쉼 필드 쓰기
import os, json
from playwright.sync_api import sync_playwright
from ttb import check, serve, done, OUT, HERE
srv = serve(8793)
MOCK = """const m=TodoApp.memoryStore();window.__m=m;
const k=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const w=new Date().getDay(),w1=(w+1)%7,w2=(w+2)%7;
const T=(id,o)=>Object.assign({id,title:id,note:'',date:k(0),time:null,end:null,remind:null,cat:'k1',sub:null,done:false,doneAt:null,createdAt:1,subtasks:[]},o);
m.importAll({cats:null,tasks:[T('t_a',{title:'보고서 쓰기',note:'3장까지'}),T('t_old',{title:'옛 메모',deletedAt:Date.now()-40*864e5}),T('t_d',{title:'끝난 숙제',done:true,doneAt:1,date:k(-3)})],
 tpls:[{id:'r_auto',title:'분리수거',days:[w,w1,w2],cat:'k1',subtasks:[{id:'s1',t:'캔'}],time:'08:00',end:null,remind:10},
       {id:'r_man',title:'영어 단어',days:[w,w1,w2],cat:'k2',subtasks:[],auto:false}],
 events:[{id:'e_1',title:'자료구조',place:'IT관',color:'c6',days:[0,1,2,3,4,5,6],time:'15:00',end:'16:30',from:null,until:null,holOff:false,remind:null,note:'',skips:[],archived:false,createdAt:1}]});
const s=Object.assign({},m,{kind:'pwa',resetPassword:e=>{window.__reset=e;return Promise.resolve();},start(c){m.start({onData:(d,meta)=>{window.__d=d;c.onData(d,meta);},onStatus:x=>c.onStatus(x==='local'?'live':x),onError:c.onError});}});window.__s=s;
TodoApp.boot(s);"""
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, accept_downloads=True); pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("**/app.js", lambda r: r.fulfill(body=MOCK, content_type="text/javascript"))
    pg.goto("http://localhost:8793/"); pg.wait_for_selector(".grp"); pg.wait_for_timeout(400)
    key = lambda n: pg.evaluate("n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}", n)
    tk, tm, t2 = key(0), key(1), key(2)
    tasks = lambda: pg.evaluate("Object.fromEntries(__d.tasks)")
    tpl = lambda i: pg.evaluate("i=>__d.tpls.get(i)", i)

    # --- 반복 할 일 자동 추가: 오늘·내일만, 정해진 id, madeUntil
    ts = tasks(); aid = lambda kk: "t_auto_" + kk.replace("-", "")
    check(aid(tk) in ts and aid(tm) in ts and aid(t2) not in ts, "자동 추가: 오늘·내일 할 일이 생김(모레는 아직)")
    a = ts[aid(tk)]
    check(a["title"] == "분리수거" and a["time"] == "08:00" and a["remind"] == 10 and a["tpl"] == "r_auto" and a["subtasks"][0]["t"] == "캔", "원본 내용 그대로(시간·알림·세부)")
    check(tpl("r_auto")["madeUntil"] == tm, "원본에 어디까지 만들었는지 기록")
    check(not any(v.get("tpl") == "r_man" for v in ts.values()), "자동 추가를 끈 것은 안 만듦")
    check(pg.locator(".task.ghost").count() == 1 and "추가 전" in pg.inner_text(".task.ghost"), "끈 것은 '추가 전' 흐린 줄")
    # 지워도 다시 안 생김(데이터가 바뀔 때마다 자동 추가가 다시 돌지만 madeUntil로 막힘)
    pg.click("#g-k1 .ttl:has-text('분리수거')"); pg.click(".sheet [data-act=del]"); pg.wait_for_timeout(300)
    check(pg.inner_text("#toastMsg") == "휴지통으로 옮겼어요", "삭제는 휴지통으로")
    pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); pg.wait_for_timeout(200)
    pg.click("[data-act=add][data-cat=k1]"); pg.keyboard.type("아무거나"); pg.keyboard.press("Enter"); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check(pg.locator("#g-k1 .task:not(.ghost):has-text('분리수거')").count() == 0, "지운 자동 할 일은 데이터가 바뀌어도 다시 안 생김")

    # --- 휴지통
    pg.click("[data-act=menu]"); m = pg.inner_text(".menu")
    check("휴지통\n1개" in m, "설정에 휴지통(지운 것 1개 — 30일 지난 건 저절로 비움) "+repr(m[:200]))
    pg.click(".sheet [data-act=trash]"); pg.wait_for_timeout(200)
    check(pg.locator(".trow").count() == 1 and "30일 남음" in pg.inner_text(".sheet") and "t_old" not in tasks(), "휴지통 목록(40일 전에 지운 것은 이미 비워짐)")
    pg.click(".trow:has-text('분리수거') [data-act=trestore]"); pg.wait_for_timeout(250)
    check(pg.locator(".trow").count() == 0 and pg.locator("#g-k1 .task:has-text('분리수거')").count() == 1, "복원")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.click("#g-k1 .ttl:has-text('분리수거')"); pg.click(".sheet [data-act=del]"); pg.wait_for_timeout(300)
    pg.click("[data-act=menu]"); pg.click(".sheet [data-act=trash]"); pg.wait_for_timeout(200)
    pg.click(".sheet [data-act=tempty]"); pg.wait_for_timeout(100)
    check(pg.inner_text(".sheet [data-act=tempty]") == "정말 비우기", "비우기는 한 번 더 확인")
    pg.click(".sheet [data-act=tempty]"); pg.wait_for_timeout(250)
    check(aid(tk) not in tasks() and pg.locator(".trow").count() == 0, "비우기")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # --- 편집 창 접기
    pg.click("#g-k1 .ttl:has-text('아무거나')"); pg.wait_for_timeout(200)
    check(pg.locator("#e-note").count() == 0 and pg.locator(".sheet [data-act=emore]").count() == 1, "값이 없으면 알림·반복·세부·메모는 접힘")
    pg.click(".sheet [data-act=emore]"); pg.wait_for_timeout(100)
    check(pg.locator("#e-note").count() == 1 and pg.locator("#s-new").count() == 1, "펼치기")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check(pg.inner_text("#toastMsg") != "변경 사항을 저장하지 않았어요" or not pg.is_visible("#toast"), "펼치기만 하면 고친 것 아님")
    pg.click("#g-k1 .ttl:has-text('보고서 쓰기')"); pg.wait_for_timeout(200)
    check(pg.locator("#e-note").count() == 1, "메모가 있으면 처음부터 펼침")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # --- 한 줄 입력: 오전·오후를 짐작했으면 바꾸기
    pg.click("[data-act=add][data-cat=k1]"); pg.keyboard.type("7시 운동"); pg.wait_for_timeout(100)
    check("오전 7:00" in pg.inner_text(".qhint"), "'7시'는 오전으로 읽음")
    pg.keyboard.press("Enter"); pg.wait_for_timeout(200)
    check(pg.inner_text("#toastAct") == "오후로", "짐작한 시간이면 '오후로' 버튼")
    pg.click("#toastAct"); pg.wait_for_timeout(200)
    t = [v for v in tasks().values() if v["title"] == "운동"][0]
    check(t["time"] == "19:00", "오후로 → 19:00")
    pg.keyboard.type("오후 3시 회의"); pg.keyboard.press("Enter"); pg.wait_for_timeout(200)
    check(not pg.is_visible("#toast") or pg.inner_text("#toastAct") != "오전으로", "오전·오후를 썼으면 바꾸기 버튼 없음")
    pg.keyboard.press("Escape")

    # --- 검색
    pg.click("[data-act=view][data-v=all]"); pg.wait_for_timeout(200)
    pg.fill("#q", "3장"); pg.wait_for_timeout(200)
    check(pg.locator("#main .task").count() == 1 and "보고서 쓰기" in pg.inner_text("#main"), "검색: 메모 내용으로도 찾음")
    pg.fill("#q", "끝난"); pg.wait_for_timeout(200)
    check("끝난 숙제" in pg.inner_text("#main"), "검색: 완료한 것도")
    pg.fill("#q", "없는말"); pg.wait_for_timeout(200)
    check("맞는 할 일이 없어요" in pg.inner_text("#main"), "검색 결과 없음")
    pg.fill("#q", ""); pg.wait_for_timeout(200)

    # --- 고정 일정 쉼: 배열 통째로가 아니라 하나만(필드 쓰기)
    calls = []
    pg.evaluate("(()=>{const u=__s.update;window.__upd=[];__s.update=(id,p)=>{__upd.push(JSON.parse(JSON.stringify(p)));return u(id,p);};})()")
    pg.click("[data-act=view][data-v=week]"); pg.wait_for_timeout(300)
    pg.click(f".blk.ev[data-k='{tk}']"); pg.click(".sheet [data-act=eskipday]"); pg.wait_for_timeout(200)
    upd = pg.evaluate("__upd")
    check(upd and upd[-1] == {"skips": {"__fx": "union", "v": tk}}, "이날만 쉼: 그 날 하나만 넣기 " + str(upd[-1:]))
    check(pg.evaluate("__d.events.get('e_1').skips") == [tk], "저장 결과")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.click(f".blk.ev[data-k='{tm}']"); pg.click(".sheet [data-act=evday]"); pg.fill("#e-place", "온라인"); pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(250)
    upd = pg.evaluate("__upd")
    check(upd[-1] == {"ovr." + tm: {"place": "온라인"}}, "이날만 바꾸기: 그 날 칸만 쓰기 " + str(upd[-1]))
    check(pg.evaluate("__d.events.get('e_1').ovr") == {tm: {"place": "온라인"}}, "저장 결과(메모리 저장소도 경로 쓰기)")

    # --- 반복 할 일 관리: 시간표 아래에서 바로
    check(pg.locator(".ttfacts [data-act=tpls]").count() == 1, "시간표 아래 '반복 할 일 관리'")

    # --- 백업: 파일로 저장 → 파일 고르기로 복원
    pg.click("[data-act=menu]"); pg.click(".sheet [data-act=export]"); pg.wait_for_timeout(150)
    with pg.expect_download() as dl:
        pg.click(".sheet [data-act=xfile]")
    path = os.path.join(OUT, "backup.json"); dl.value.save_as(path)
    data = json.load(open(path, encoding="utf-8"))
    check(dl.value.suggested_filename.startswith("ttobak-backup-") and len(data["tasks"]) >= 4, "백업 파일 저장")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.click("[data-act=menu]"); pg.click(".sheet [data-act=import]"); pg.wait_for_timeout(150)
    pg.set_input_files("#i-file", path); pg.wait_for_timeout(400)
    check(pg.locator("#i-sum").count() == 1 and pg.locator("[data-act=importgo]").count() == 1, "백업 파일 고르면 바로 확인 단계")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    ctx.close()

    # --- 로그인: 비밀번호 재설정, 공휴일 자료 끝 안내
    LOGIN = MOCK.replace("TodoApp.boot(s);", "s.signIn=(e,p)=>Promise.resolve(m.start({onData:(d,meta)=>s.cb.onData(d,meta),onStatus:x=>s.cb.onStatus(x==='local'?'live':x),onError:x=>s.cb.onError(x)}));s.signOut=()=>Promise.resolve();s.start=c=>{s.cb=c;c.onStatus('signedout');};TodoApp.boot(s);")
    ctx = b.new_context(viewport={"width": 390, "height": 844}); pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("**/app.js", lambda r: r.fulfill(body=LOGIN, content_type="text/javascript"))
    pg.route("**/holidays.js", lambda r: r.fulfill(body='window.TTOBAK_HOLIDAYS={"2025-12-25":["기독탄신일"]};', content_type="text/javascript"))
    pg.goto("http://localhost:8793/"); pg.wait_for_selector("#loginForm")
    check("개인용 앱" in pg.inner_text(".auth"), "로그인 화면: 개인용이라는 안내")
    pg.click("[data-act=pwreset]"); pg.wait_for_timeout(100)
    check("이메일을 먼저" in pg.inner_text("#l-err"), "이메일 없이 누르면 안내")
    pg.fill("#l-email", "me@example.com"); pg.click("[data-act=pwreset]"); pg.wait_for_timeout(200)
    check(pg.evaluate("window.__reset") == "me@example.com" and "메일을 보냈어요" in pg.inner_text("#l-err"), "비밀번호 재설정 메일")
    pg.fill("#l-pw", "x"); pg.click("#l-btn"); pg.wait_for_selector(".grp")
    pg.click("[data-act=menu]"); pg.wait_for_timeout(150)
    check("공휴일 자료가 2025년까지만" in pg.inner_text(".sheet"), "공휴일 자료가 끝났으면 설정에 안내")
    ctx.close(); b.close()
srv.terminate()
done(errs)
