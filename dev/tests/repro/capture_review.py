"""Synthetic review fixture; no account/network writes. Run after dev/build.py."""
import json, threading, functools, datetime
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[3]; OUT=ROOT/'dev/ux-shots'; OUT.mkdir(exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*a): pass
srv=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'dev/dist/app')))
threading.Thread(target=srv.serve_forever,daemon=True).start()
base=datetime.date(2026,10,29)
cats=[{'id':f'k{i+1}','name':n,'color':f'c{i+1}','subs':[]} for i,n in enumerate(['생활','공부','건강','프로젝트','가족','약속','정리','기타'])]
tasks=[]
for d in range(-2,5):
 for j,name in enumerate(['자료구조 복습','장보기','과제 제출','산책','메일 답장','영어 단어','세탁','발표 준비','병원 예약','책 읽기']):
  tasks.append(dict(id=f't_{d+2}_{j}',title=name,date=str(base+datetime.timedelta(days=d)),cat=f'k{j%8+1}',time=f'{9+j:02}:00' if j<5 else None,end=f'{10+j:02}:00' if j<5 else None,done=j==1,doneAt=1793200000000 if j==1 else None,postponed=4 if j==2 else 0,note='',subtasks=[],createdAt=j,remind=10 if j==0 else None))
tasks.append(dict(id='t_trash',title='취소된 준비물 <확인>',date=str(base),cat='k1',deletedAt=1793200000000))
events=[dict(id=f'e_{i}',title=n,place='강의실 '+str(i+1),color=f'c{i+3}',days=[1,4],time='10:30',end='11:45',slots=[dict(id='',days=[1,4],time='10:30',end='11:45'),dict(id='b',days=[3,5],time='14:00',end='15:15')],holOff=False) for i,n in enumerate(['자료구조','영어회화','스터디'])]
tpls=[dict(id=f'r_{i}',title=n,days=list(range(7)),cat='k1',time='08:00',auto=i!=2,subtasks=[]) for i,n in enumerate(['물 마시기','일기 쓰기','분리수거'])]
def mock(empty):
 data=dict(cats=None if empty else cats,tasks=[] if empty else tasks,tpls=[] if empty else tpls,events=[] if empty else events)
 return 'const m=TodoApp.memoryStore();m.importAll('+json.dumps(data,ensure_ascii=False)+''');let cb;const start=()=>m.start({onData:(d,meta)=>{window.__reviewData=d;cb.onData(d,meta);},onStatus:s=>cb.onStatus('live'),onError:cb.onError});TodoApp.boot({...m,start(c){cb=c;cb.onStatus('signedout');},signIn(){start();return Promise.resolve();},resetPassword(){return Promise.resolve();},push:{state:async()=>'on',enable:async()=>{},disable:async()=>{},test:async()=>({sent:1})}});'''
manifest=[]
try:
 with sync_playwright() as p:
  b=p.chromium.launch()
  for width,height in [(390,844),(1280,860)]:
   for theme in ['light','dark']:
    for empty in [False,True]:
     ctx=b.new_context(viewport=dict(width=width,height=height),color_scheme=theme,locale='ko-KR',timezone_id='Asia/Seoul',has_touch=width==390,service_workers='block',reduced_motion='reduce')
     pg=ctx.new_page(); pg.clock.install(time=datetime.datetime(2026,10,29,3,tzinfo=datetime.timezone.utc))
     pg.route('**/app.js',lambda r:r.fulfill(body=mock(empty),content_type='text/javascript'))
     prefix=f'{width}-{theme}-'+('empty' if empty else 'week')
     def shot(name):
      filename=prefix+'-'+name+'.png';pg.screenshot(path=str(OUT/filename));manifest.append(filename)
     pg.goto(f'http://127.0.0.1:{srv.server_port}/');pg.wait_for_selector('#l-email');shot('login')
     pg.fill('#l-email','review@example.test');pg.fill('#l-pw','local-only');pg.click('#l-btn');pg.wait_for_selector('.grp');shot('day')
     if empty:
      pg.click('[data-act=add][data-cat=k1]');pg.fill('#add-k1','내일 3시 회의');shot('quick');pg.press('#add-k1','Enter');pg.press('#add-k1','Escape')
      pg.click('[data-act=view][data-v=all]');pg.click('[data-act=edit]');shot('edit-folded');pg.click('[data-act=emore]');shot('edit-expanded')
      pg.click('[data-act=eremind][data-m="10"]');pg.click('[data-act=save]');pg.wait_for_function('!document.querySelector("#dlg").open');pg.wait_for_function("[...__reviewData.tasks.values()].some(t=>t.title==='회의' && t.remind===10 && t.time==='15:00')")
      pg.click('[data-act=menu]');pg.click('.menu [data-act=evs]');pg.click('[data-act=evnew]');pg.fill('#e-title','영어 수업');pg.fill('#e-place','학원 201호');pg.fill('#s-time-0','10:00');pg.fill('#s-end-0','11:00')
      day=pg.locator('[data-act=sday][data-d="4"]').first
      if day.get_attribute('aria-pressed')!='true':day.click()
      shot('first-fixed');pg.click('[data-act=save]');pg.wait_for_function('!document.querySelector("#dlg").open');pg.click('[data-act=view][data-v=week]');pg.wait_for_function("[...__reviewData.events.values()].some(e=>e.title==='영어 수업' && e.days.includes(4) && e.time==='10:00')");shot('first-timetable')
     else:
      for v in ['all','week']:
       pg.click('[data-act=view][data-v='+v+']');shot(v)
      pg.click('[data-act=view][data-v=day]');pg.locator('[data-act=edit]').first.click();shot('edit');pg.click('[data-act=eskip]');shot('later');pg.press('body','Escape');pg.wait_for_function('!document.querySelector("#dlg").open')
      for action in ['tpls','evs','trash']:
       pg.click('[data-act=menu]');shot('menu');pg.click('[data-act='+action+']');shot(action);pg.press('body','Escape');pg.wait_for_function('!document.querySelector("#dlg").open')
     ctx.close()
  b.close()
finally: srv.shutdown()
(OUT/'manifest.json').write_text(json.dumps(sorted(set(manifest)),ensure_ascii=False,indent=2))
print('captured',len(manifest),'screens')
