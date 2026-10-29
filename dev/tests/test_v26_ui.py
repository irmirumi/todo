# 2.6.0 화면: 고정 일정 셋 이상은 한 줄 + 모두 보기, 저장 전 오전·오후 바꾸기, 시간을 넣으면 알림이 바로 보임,
# 저장 안 하고 닫은 편집 되찾기, 휴지통으로·정말 삭제, 저장 실패 안내가 남음, 창 이름·색 이름(화면 읽기), 검색 더 보기
import json
from playwright.sync_api import sync_playwright
from ttb import check, serve, done, OUT
srv = serve(8797)
MOCK = """const m=TodoApp.memoryStore();window.__m=m;
const k=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const T=(id,o)=>Object.assign({id,title:id,note:'',date:k(0),time:null,end:null,remind:null,cat:'k1',sub:null,done:false,doneAt:null,createdAt:1,subtasks:[]},o);
const E=(id,title,time,end)=>({id,title,place:'',color:'c5',days:[0,1,2,3,4,5,6],time,end,from:null,until:null,holOff:false,remind:null,note:'',skips:[],archived:false,createdAt:1});
const many=[];for(let i=0;i<230;i++)many.push(T('t_m'+i,{title:'회의록 '+i,date:k(-10-i%20),done:true,doneAt:i}));
m.importAll({cats:null,tasks:[T('t_a',{title:'보고서 쓰기',postponed:2}),T('t_b',{title:'장보기'})].concat(many),
 tpls:[],events:[E('e_1','아침 수업','00:00','00:30'),E('e_2','점심 수업','12:00','13:00'),E('e_3','저녁 수업','23:00','23:50')]});
const s=Object.assign({},m,{kind:'pwa',push:{state:async()=>'on',enable:async()=>{},disable:async()=>{},test:async()=>({sent:1}),schedule(){},refresh(){}},
 start(c){window.__cb=c;m.start({onData:(d,meta)=>{window.__d=d;c.onData(d,meta);},onStatus:x=>c.onStatus(x==='local'?'live':x),onError:c.onError});}});
TodoApp.boot(s);"""
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True); pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("**/app.js", lambda r: r.fulfill(body=MOCK, content_type="text/javascript"))
    pg.goto("http://localhost:8797/"); pg.wait_for_selector(".grp"); pg.wait_for_timeout(400)
    tasks = lambda: pg.evaluate("Object.fromEntries(__d.tasks)")
    # 고정 일정 셋 → 한 줄(지금·다음) + 모두 보기
    rows = pg.locator(".evstrip .evrow").count()
    check(rows <= 1 and "일정 3개 모두 보기" in pg.inner_text(".evstrip"), "고정 일정이 셋 이상이면 한 줄 + '모두 보기' (" + str(rows) + "줄)")
    pg.click("[data-act=evall]"); pg.wait_for_timeout(150)
    check(pg.locator(".evstrip .evrow").count() == 3 and pg.inner_text(".evmore") == "접기", "모두 보기 → 세 줄 + 접기")
    pg.click("[data-act=evall]"); pg.wait_for_timeout(150)
    # 목록에 미룬 횟수 없음, 정보 창에는 있음
    check("미룸" not in pg.inner_text("#main"), "목록에는 미룬 횟수 없음")
    pg.click(".task:has-text('보고서 쓰기') .ttl"); pg.wait_for_timeout(200)
    # 편집 창: 시간을 넣으면 알림 고르기가 접힌 채로도 보임
    check(pg.locator(".sheet .remind").count() == 0 and "알림" in pg.inner_text(".sheet .emore"), "시간 없으면 알림은 접힘")
    pg.fill("#e-time", "15:00"); pg.wait_for_timeout(150)
    check(pg.locator(".sheet .remind .pill:not(:disabled)").count() == 7 and "알림" not in pg.inner_text(".sheet .emore"), "시간을 넣으면 알림 고르기가 바로 보임")
    check(pg.get_attribute("#dlg", "aria-labelledby") == "sh-t" or pg.locator(".sheet h2").count() == 0, "창 이름 연결(제목이 있으면)")
    check(pg.inner_text(".sheet [data-act=del]") == "휴지통으로", "할 일 삭제 버튼은 '휴지통으로'")
    # 저장하지 않고 닫기 → 다시 열면 '불러오기'
    pg.fill("#e-title", "보고서 쓰기 2장"); pg.keyboard.press("Escape"); pg.wait_for_timeout(350)
    check(pg.inner_text("#toastAct") == "다시 편집", "저장 안 하고 닫으면 '다시 편집'")
    pg.evaluate("document.getElementById('toast').hidden=true")
    pg.click(".task:has-text('보고서 쓰기') .ttl"); pg.wait_for_timeout(250)
    check(pg.locator(".sheet .lostbar").count() == 1, "같은 할 일을 다시 열면 '저장하지 않은 변경 내용' 안내")
    pg.click("[data-act=lostload]"); pg.wait_for_timeout(150)
    check(pg.input_value("#e-title") == "보고서 쓰기 2장" and pg.input_value("#e-time") == "15:00" and pg.locator(".sheet .lostbar").count() == 0, "불러오기: 고치던 그대로")
    pg.click(".sheet [data-act=save]"); pg.wait_for_timeout(300)
    check(tasks()["t_a"]["title"] == "보고서 쓰기 2장" and tasks()["t_a"]["time"] == "15:00", "불러온 뒤 저장")
    pg.click(".task:has-text('보고서 쓰기') .ttl"); pg.wait_for_timeout(200)
    check(pg.locator(".sheet .lostbar").count() == 0, "저장한 뒤엔 안내 없음")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    # 한 줄 입력: 짐작한 오전·오후를 저장 전에 바꾸기
    pg.click("[data-act=add][data-cat=k1]"); pg.keyboard.type("내일 3시 치과"); pg.wait_for_timeout(150)
    check("오후 3:00" in pg.inner_text(".qhint") and pg.locator(".qhint [data-act=qflip]").inner_text() == "오전으로 바꾸기", "미리보기에 '오전으로 바꾸기'")
    pg.click(".qhint [data-act=qflip]"); pg.wait_for_timeout(100)
    check("오전 3:00" in pg.inner_text(".qhint") and pg.locator(".qhint [data-act=qflip]").inner_text() == "오후로 바꾸기", "누르면 오전으로(다시 누르면 오후로)")
    pg.keyboard.press("Enter"); pg.wait_for_timeout(250)
    t = [v for v in tasks().values() if v["title"] == "치과"][0]
    check(t["time"] == "03:00" and pg.inner_text("#toastAct") != "오후로 바꾸기", "고른 대로 저장, 다시 묻지 않음")
    pg.keyboard.press("Escape")
    # 저장 실패 안내는 닫을 때까지 남음
    pg.evaluate("__cb.onError({code:'unavailable'})"); pg.wait_for_timeout(100)
    check(pg.is_visible("#werr") and "저장하지 못했어요" in pg.inner_text("#werr"), "저장 실패 안내가 위에 남음")
    pg.wait_for_timeout(2700)
    check(pg.is_visible("#werr"), "알림이 사라져도 남아 있음")
    pg.click("[data-act=werrclose]"); check(not pg.is_visible("#werr"), "닫기")
    pg.evaluate("__cb.onError({code:'sync_retry'})"); check(not pg.is_visible("#werr"), "연결 재시도는 남기지 않음")
    # 색 이름(화면 읽기)
    pg.click("[data-act=menu]"); pg.click("[data-act=cats]"); pg.wait_for_timeout(200)
    check(pg.locator(".sheet [data-act=catcolor][aria-label='초록']").count() >= 1, "색 버튼 이름은 색 이름으로")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    # 검색 200개 넘으면 더 보기
    pg.click("[data-act=view][data-v=all]"); pg.wait_for_timeout(200)
    pg.fill("#q", "회의록"); pg.wait_for_timeout(250)
    check(pg.locator("#main .task").count() == 200 and pg.locator("[data-act=qmore]").count() == 1, "검색 결과 200개 + 더 보기")
    pg.click("[data-act=qmore]"); pg.wait_for_timeout(250)
    check(pg.locator("#main .task").count() == 230 and pg.locator("[data-act=qmore]").count() == 0, "더 보기 → 전부")
    pg.screenshot(path=OUT + "v26-all.png")
    b.close()
srv.terminate(); done(errs)
