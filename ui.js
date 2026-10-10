/* 할 일 수첩 — 화면 코드. 저장소(store)는 TodoApp.boot(store)로 받는다.
   store: { kind, start(cb), set(id,body), update(id,patch), remove(id), saveCats(cats), importAll(data)→Promise<number>,
            signIn?(email,pw), signOut?(), email? }
   cb: { onData({tasks:Map, cats:Array|null}), onStatus("loading"|"live"|"local"|"signedout"|"config"), onError(err) } */
(function(){
"use strict";
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const DOW=["일","월","화","수","목","금","토"];
const COLORS=["c1","c2","c3","c4","c5","c6","c7","c8"];
const DEFAULT_CATS=[{id:"k1",name:"일상",color:"c5",subs:[]},{id:"k2",name:"업무·공부",color:"c3",subs:[]},{id:"k3",name:"건강",color:"c1",subs:[]}];
const pad=n=>String(n).padStart(2,"0");
const keyOf=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const parse=k=>{const a=k.split("-").map(Number);return new Date(a[0],a[1]-1,a[2]);};
const addDays=(k,n)=>{const d=parse(k);d.setDate(d.getDate()+n);return keyOf(d);};
const uid8=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/,TIME_RE=/^\d{2}:\d{2}$/;
let today=keyOf(new Date());

const pref={get(k,d){try{const v=localStorage.getItem("todo."+k);return v==null?d:v;}catch(e){return d;}},set(k,v){try{localStorage.setItem("todo."+k,v);}catch(e){}}};
const narrow=window.matchMedia&&window.matchMedia("(max-width: 839px)").matches;

const S={tasks:new Map(),cats:DEFAULT_CATS.slice(),view:pref.get("view","day"),sel:today,cursor:today,
  calMode:pref.get("calMode",narrow?"week":"month"),showDone:false,mode:"loading",
  adding:null,addSub:null,addDraft:"",lastSub:{},just:null,
  sheet:null,editing:null,edit:null,delArm:false,catDraft:null,catDelArm:null,importData:null};
let store=null;

const catOf=t=>S.cats.find(c=>c.id===t.cat)||S.cats[0];
const subsOf=c=>Array.isArray(c&&c.subs)?c.subs:[];
const byCreated=(a,b)=>(a.createdAt||0)-(b.createdAt||0);
const byTime=(a,b)=>{const x=a.time||"99:99",y=b.time||"99:99";return x<y?-1:x>y?1:byCreated(a,b);};
const byDateTime=(a,b)=>{const x=a.date||"9999",y=b.date||"9999";return x<y?-1:x>y?1:byTime(a,b);};
function relWord(k){if(k===today)return"오늘";if(k===addDays(today,1))return"내일";if(k===addDays(today,-1))return"어제";return"";}
function shortDate(k){const d=parse(k);return (d.getMonth()+1)+"월 "+d.getDate()+"일 ("+DOW[d.getDay()]+")";}
function fmtTime(t){if(!t)return"";const [h,m]=t.split(":").map(Number);return (h<12?"오전 ":"오후 ")+((h%12)||12)+":"+pad(m);}

/* ---------- 저장 ---------- */
const setTask=(id,b)=>store.set(id,b);
const patchTask=(id,p)=>store.update(id,p);
const delTask=id=>store.remove(id);
function saveCats(cats){S.cats=cats;render();store.saveCats(cats);}
function onError(e){
  const c=e&&e.code;
  if(c==="quota_exceeded"||c==="resource-exhausted")toast("저장 공간이 가득 찼어요. 완료한 할 일을 몇 개 지운 뒤 다시 해 주세요.");
  else if(c==="network")toast("앱을 불러오지 못했어요. 인터넷 연결을 확인해 주세요. 잠시 뒤 다시 시도할게요.");
  else if(c==="invalid_argument"||c==="permission-denied")toast("이 계정으로는 저장할 수 없어요. 다시 로그인해 주세요.");
  else toast("저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
}
function addTask(cat,sub,title,date){
  title=title.trim();if(!title)return;
  setTask(uid8("t_"),{title,note:"",date:date||null,time:null,cat,sub:sub||null,done:false,doneAt:null,createdAt:Date.now(),subtasks:[]});
}

/* ---------- 렌더 ---------- */
function render(){
  const out=S.mode==="signedout"||S.mode==="config";
  document.body.dataset.view=S.view;
  document.body.dataset.auth=out?"out":"in";
  $("#vDay").setAttribute("aria-pressed",S.view==="day");
  $("#vAll").setAttribute("aria-pressed",S.view==="all");
  const bn=$("#banner");
  bn.hidden=S.mode!=="local";
  if(S.mode==="local")bn.textContent="로그인한 상태로 열어야 할 일이 저장되고 폰·PC 사이에서 동기화돼요. 지금 적는 내용은 이 창을 닫으면 사라져요.";
  if(S.mode==="signedout")return renderLogin();
  if(S.mode==="config")return renderConfig();
  if(S.view==="day"){renderCal();renderDay();}else renderAll();
  if(S.adding){const inp=document.getElementById("add-"+S.adding);if(inp){inp.value=S.addDraft;inp.focus({preventScroll:true});try{inp.setSelectionRange(inp.value.length,inp.value.length);}catch(e){}}}
}

function renderLogin(){
  if($("#loginForm"))return;
  $("#main").innerHTML='<div class="auth"><h1>로그인</h1><p>로그인하면 폰과 PC에서 같은 할 일을 봐요.</p>'+
    '<form id="loginForm" novalidate><label>이메일<input class="inp" id="l-email" type="email" autocomplete="username" inputmode="email" required></label>'+
    '<label>비밀번호<input class="inp" id="l-pw" type="password" autocomplete="current-password" required></label>'+
    '<div class="err" id="l-err"></div><button class="btn pri" id="l-btn" type="submit">로그인</button></form></div>';
}
function renderConfig(){
  $("#main").innerHTML='<div class="auth"><h1>설정이 남았어요</h1><p><code>firebase-config.js</code> 파일에 Firebase 설정값을 붙여넣은 뒤 다시 올려 주세요. 설치 가이드 2단계에 방법이 있어요.</p></div>';
}

function ring(s){
  if(!s)return '<svg class="ring" viewBox="0 0 24 24" aria-hidden="true"></svg>';
  if(s.d===s.n)return '<svg class="ring" viewBox="0 0 24 24" aria-hidden="true"><circle class="full" cx="12" cy="12" r="10.5"/><path class="ck" d="M7.5 12.3l3 3 6-6.3" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const C=2*Math.PI*9.5,off=C*(1-s.d/s.n);
  return '<svg class="ring" viewBox="0 0 24 24" aria-hidden="true"><circle class="bgc" cx="12" cy="12" r="9.5" fill="none" stroke-width="2.4"/><circle class="fgc" cx="12" cy="12" r="9.5" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="'+C.toFixed(2)+'" stroke-dashoffset="'+off.toFixed(2)+'" transform="rotate(-90 12 12)"/><text x="12" y="15.2" text-anchor="middle">'+(s.n-s.d)+'</text></svg>';
}

function renderCal(){
  const stats={};
  for(const t of S.tasks.values()){if(!t.date)continue;const s=stats[t.date]||(stats[t.date]={n:0,d:0});s.n++;if(t.done)s.d++;}
  const c=parse(S.cursor);let start,cells;
  if(S.calMode==="month"){
    const first=new Date(c.getFullYear(),c.getMonth(),1);
    const days=new Date(c.getFullYear(),c.getMonth()+1,0).getDate();
    start=new Date(first);start.setDate(1-first.getDay());
    cells=Math.ceil((first.getDay()+days)/7)*7;
  }else{start=new Date(c);start.setDate(c.getDate()-c.getDay());cells=7;}
  let h='<div class="calhead"><h2>'+c.getFullYear()+'년 '+(c.getMonth()+1)+'월</h2>'+
    (S.sel!==today||S.cursor!==today?'<button class="small" type="button" data-act="today">오늘</button>':'')+
    '<button class="icon" type="button" data-act="nav" data-d="-1" aria-label="'+(S.calMode==="month"?"이전 달":"이전 주")+'"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'+
    '<button class="icon" type="button" data-act="nav" data-d="1" aria-label="'+(S.calMode==="month"?"다음 달":"다음 주")+'"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>';
  h+='<div class="dows">'+DOW.map(d=>'<span>'+d+'</span>').join("")+'</div><div class="grid">';
  for(let i=0;i<cells;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);const k=keyOf(d),s=stats[k];
    const cls=["day","d"+d.getDay()];
    if(S.calMode==="month"&&d.getMonth()!==c.getMonth())cls.push("out");
    if(k===today)cls.push("today");if(k===S.sel)cls.push("sel");
    const lab=(d.getMonth()+1)+"월 "+d.getDate()+"일"+(k===today?" 오늘":"")+(s?", 할 일 "+s.n+"개 중 "+s.d+"개 완료":"");
    h+='<button type="button" class="'+cls.join(" ")+'" data-act="pick" data-k="'+k+'" aria-label="'+lab+'"'+(k===S.sel?' aria-current="date"':'')+'><span class="num">'+d.getDate()+'</span>'+ring(s)+'</button>';
  }
  h+='</div><div class="calfoot"><button class="linkish" type="button" data-act="calmode">'+(S.calMode==="month"?"한 주만 보기 ▴":"한 달 보기 ▾")+'</button></div>';
  $("#cal").innerHTML=h;
}

function chk(t){
  return '<button class="chk" type="button" role="checkbox" aria-checked="'+(!!t.done)+'" aria-label="'+esc(t.title)+' 완료" data-act="toggle" data-id="'+t.id+'"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 7.2l2.6 2.6L11 4.4" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
}
function dateChip(k){
  if(!k)return '<span class="chip">날짜 없음</span>';
  const r=relWord(k);
  if(k<today)return '<span class="chip late">'+(r||shortDate(k))+' 지남</span>';
  return '<span class="chip'+(k===today?' today':'')+'">'+(r||shortDate(k))+'</span>';
}
function row(t,withDate){
  const cat=catOf(t),meta=[];
  const sub=t.sub?subsOf(cat).find(s=>s.id===t.sub):null;
  if(withDate)meta.push(dateChip(t.date));
  if(t.time&&t.date)meta.push('<span class="chip time">'+fmtTime(t.time)+'</span>');
  const subs=Array.isArray(t.subtasks)?t.subtasks:[];
  if(subs.length)meta.push('<span>세부 '+subs.filter(s=>s.done).length+'/'+subs.length+'</span>');
  if(t.note)meta.push('<span>메모</span>');
  let just="",delay="";
  if(t.done&&S.just&&S.just.id===t.id){const el=Date.now()-S.just.at;if(el<500){just=" just";delay=' style="animation-delay:-'+el+'ms"';}}
  return '<li class="task'+(t.done?' done':'')+just+'" style="--cc:var(--'+cat.color+')">'+chk(t)+
    '<button class="ttl" type="button" data-act="edit" data-id="'+t.id+'"><span class="tline"><span class="t"'+delay+'>'+esc(t.title)+'</span>'+(sub?'<span class="tag">'+esc(sub.name)+'</span>':'')+'</span>'+
    (meta.length?'<span class="meta">'+meta.join("")+'</span>':'')+'</button></li>';
}
const plusSvg='<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
function group(cat,items,withDate){
  const subs=subsOf(cat);
  const cnt=!items.length?"":withDate?String(items.length):items.filter(t=>t.done).length+"/"+items.length;
  let h='<section class="grp" style="--cc:var(--'+cat.color+')"><div class="ghead"><span class="dot"></span><h3>'+esc(cat.name)+'</h3><span class="cnt">'+cnt+'</span>'+
    '<button class="plus" type="button" data-act="add" data-cat="'+cat.id+'" aria-label="'+esc(cat.name)+'에 할 일 추가">'+plusSvg+'</button></div><ul class="tasks">';
  h+=items.map(t=>row(t,withDate)).join("");
  if(S.adding===cat.id){
    const cur=subs.find(s=>s.id===S.addSub);
    h+='<li class="addrow"><input id="add-'+cat.id+'" type="text" data-cat="'+cat.id+'" placeholder="할 일을 적고 Enter" autocomplete="off" enterkeyhint="done" aria-label="새 할 일">';
    if(subs.length)h+='<div class="addsubs" role="group" aria-label="소분류"><button class="pill" type="button" data-keep data-act="addsub" data-sub="" aria-pressed="'+(!cur)+'">없음</button>'+subs.map(s=>'<button class="pill" type="button" data-keep data-act="addsub" data-sub="'+s.id+'" aria-pressed="'+(!!cur&&cur.id===s.id)+'">'+esc(s.name)+'</button>').join("")+'</div>';
    h+='</li>';
  }
  h+='</ul>';
  if(!items.length&&S.adding!==cat.id)h+='<button class="emptyadd" type="button" data-act="add" data-cat="'+cat.id+'">+ 할 일 추가</button>';
  return h+'</section>';
}

function renderDay(){
  const k=S.sel,d=parse(k),r=relWord(k);
  const list=[...S.tasks.values()].filter(t=>t.date===k).sort(byTime);
  const n=list.length,dn=list.filter(t=>t.done).length;
  let h='<div class="dayhead"><h1>'+(d.getMonth()+1)+'월 '+d.getDate()+'일<small>'+DOW[d.getDay()]+'요일</small></h1>'+(r?'<span class="rel">'+r+'</span>':'')+'</div>';
  if(S.mode==="loading")h+='<div class="prog loading">불러오는 중…</div>';
  else h+='<div class="prog">'+(n?(dn===n?n+'개 모두 끝냈어요':n+'개 중 '+dn+'개 완료'):'아직 적은 할 일이 없어요')+'<div class="bar"><i style="width:'+(n?Math.round(dn/n*100):0)+'%"></i></div></div>';
  if(k===today){
    const od=[...S.tasks.values()].filter(t=>t.date&&t.date<today&&!t.done);
    if(od.length)h+='<div class="carry"><span>지난 날에 못 끝낸 할 일 <b>'+od.length+'개</b></span><button class="small" type="button" data-act="carry">오늘로 가져오기</button></div>';
  }
  if(S.mode!=="loading"&&S.tasks.size===0)h+='<p class="hint">카테고리 옆 <b>+</b>를 눌러 첫 할 일을 적어 보세요. 시간이나 메모는 적은 할 일을 누르면 넣을 수 있어요.</p>';
  h+='<div class="groups">'+S.cats.map(c=>group(c,list.filter(t=>catOf(t).id===c.id),false)).join("")+'</div>';
  $("#main").innerHTML=h;
}

function renderAll(){
  const all=[...S.tasks.values()];
  const open=all.filter(t=>!t.done).sort(byDateTime);
  const done=all.filter(t=>t.done).sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));
  let h='<div class="dayhead"><h1>전체 할 일</h1></div>';
  h+=S.mode==="loading"?'<div class="prog loading">불러오는 중…</div>':'<div class="prog">남은 할 일 '+open.length+'개 · 날짜와 시간 순</div>';
  h+='<div class="groups">'+S.cats.map(c=>group(c,open.filter(t=>catOf(t).id===c.id),true)).join("")+'</div>';
  if(done.length){
    h+='<div class="donebox"><button class="linkish" type="button" data-act="showdone">'+(S.showDone?'완료한 할 일 접기':'완료한 할 일 '+done.length+'개 보기')+'</button>';
    if(S.showDone)h+='<section class="grp" style="--cc:var(--c8);margin-top:8px"><ul class="tasks">'+done.slice(0,150).map(t=>row(t,true)).join("")+'</ul></section>';
    h+='</div>';
  }
  $("#main").innerHTML=h;
}

/* ---------- 시트 공통 ---------- */
const dlg=$("#dlg"),sheet=$("#sheet");
function openSheet(kind,draw){S.sheet=kind;draw();if(!dlg.open)dlg.showModal();}
function closeDlg(){if(dlg.open)dlg.close();}
dlg.addEventListener("close",()=>{S.sheet=null;S.editing=null;S.edit=null;S.catDraft=null;S.importData=null;});
dlg.addEventListener("click",ev=>{if(ev.target===dlg)closeDlg();});

/* ---------- 더보기 ---------- */
function drawMenu(){
  let h='<h2>더보기</h2><div class="menu">'+
    '<button type="button" data-act="cats">카테고리와 소분류<small>이름, 색, 소분류(과목 등) 편집</small></button>'+
    '<button type="button" data-act="export">데이터 내보내기<small>다른 곳으로 옮길 때 쓰는 백업 텍스트</small></button>'+
    '<button type="button" data-act="import">데이터 가져오기<small>내보낸 텍스트를 붙여넣어 불러오기</small></button>';
  if(store.signOut)h+='<button type="button" data-act="logout">로그아웃<small>'+esc(store.email||"")+'</small></button>';
  h+='</div><div class="actions"><span class="sp"></span><button class="btn sec" type="button" data-act="close">닫기</button></div>';
  sheet.innerHTML=h;
}
function exportJSON(){
  const tasks=[...S.tasks.values()].map(t=>{const o=Object.assign({},t);return o;});
  return JSON.stringify({app:"todo-notebook",version:1,exportedAt:new Date().toISOString(),cats:S.cats,tasks});
}
function drawExport(){
  const n=S.tasks.size;
  sheet.innerHTML='<h2>데이터 내보내기</h2><p>할 일 '+n+'개와 카테고리 '+S.cats.length+'개가 들어 있어요. 복사해서 새 앱의 <b>데이터 가져오기</b>에 붙여넣으면 돼요.</p>'+
    '<textarea class="inp code" id="x-out" readonly aria-label="내보낸 데이터">'+esc(exportJSON())+'</textarea>'+
    '<div class="actions"><span class="sp"></span><button class="btn sec" type="button" data-act="close">닫기</button><button class="btn pri" type="button" data-act="copy">복사</button></div>';
}
function clean(t){
  const s=v=>typeof v==="string"?v:"";
  return {title:s(t.title).slice(0,500)||"제목 없음",note:s(t.note).slice(0,5000),
    date:DATE_RE.test(t.date)?t.date:null,time:TIME_RE.test(t.time)?t.time:null,
    cat:s(t.cat)||null,sub:s(t.sub)||null,done:!!t.done,doneAt:typeof t.doneAt==="number"?t.doneAt:null,
    createdAt:typeof t.createdAt==="number"?t.createdAt:Date.now(),
    subtasks:Array.isArray(t.subtasks)?t.subtasks.filter(x=>x&&typeof x.t==="string").slice(0,100).map(x=>({id:s(x.id)||uid8("s"),t:x.t.slice(0,300),done:!!x.done})):[]};
}
function parseImport(text){
  let d;try{d=JSON.parse(text);}catch(e){return {err:"내보내기에서 복사한 텍스트를 그대로 붙여넣어 주세요."};}
  if(!d||!Array.isArray(d.tasks))return {err:"할 일 목록을 찾지 못했어요. 내보내기 텍스트가 맞는지 확인해 주세요."};
  const tasks=d.tasks.filter(t=>t&&typeof t.id==="string"&&/^t_[A-Za-z0-9_-]{1,60}$/.test(t.id)).map(t=>Object.assign({id:t.id},clean(t)));
  let cats=null;
  if(Array.isArray(d.cats)&&d.cats.length)cats=d.cats.filter(c=>c&&typeof c.id==="string"&&/^[A-Za-z0-9_-]{1,40}$/.test(c.id)).slice(0,40).map(c=>({
    id:c.id,name:String(c.name||"이름 없음").slice(0,24),color:COLORS.includes(c.color)?c.color:"c8",
    subs:Array.isArray(c.subs)?c.subs.filter(s=>s&&typeof s.id==="string"&&/^[A-Za-z0-9_-]{1,40}$/.test(s.id)).slice(0,60).map(s=>({id:s.id,name:String(s.name||"").slice(0,20)||"이름 없음"})):[]}));
  if(cats&&!cats.length)cats=null;
  return {tasks,cats};
}
function drawImport(){
  const d=S.importData;
  sheet.innerHTML='<h2>데이터 가져오기</h2><p>다른 곳에서 <b>데이터 내보내기</b>로 복사한 텍스트를 붙여넣어 주세요. 같은 할 일은 덮어쓰고, 지금 있는 다른 할 일은 그대로 둬요.</p>'+
    '<textarea class="inp code" id="i-in" placeholder="여기에 붙여넣기" aria-label="가져올 데이터"></textarea><div class="err" id="i-err"></div>'+
    (d?'<p id="i-sum">할 일 <b>'+d.tasks.length+'개</b>'+(d.cats?', 카테고리 <b>'+d.cats.length+'개</b>':'')+'를 가져와요.</p>':'')+
    '<div class="actions"><span class="sp"></span><button class="btn sec" type="button" data-act="close">닫기</button><button class="btn pri" type="button" data-act="'+(d?'importgo':'importcheck')+'">'+(d?'가져오기':'확인')+'</button></div>';
}

/* ---------- 편집 시트 ---------- */
function openEdit(id){
  const t=S.tasks.get(id);if(!t)return;
  const cat=catOf(t);
  S.editing=id;S.delArm=false;
  S.edit={title:t.title,note:t.note||"",date:t.date||"",time:t.time||"",nodate:!t.date,cat:cat.id,
    sub:subsOf(cat).some(s=>s.id===t.sub)?t.sub:null,subDraft:"",
    subtasks:(t.subtasks||[]).map(s=>({id:s.id,t:s.t,done:!!s.done}))};
  openSheet("edit",drawEdit);
}
function syncEdit(){
  const e=S.edit;if(!e)return;
  const g=id=>document.getElementById(id);
  if(g("e-title"))e.title=g("e-title").value;
  if(g("e-note"))e.note=g("e-note").value;
  if(g("e-date"))e.date=g("e-date").value;
  if(g("e-time"))e.time=g("e-time").value;
  if(g("e-nodate"))e.nodate=g("e-nodate").checked;
  e.subtasks.forEach(s=>{const i=g("s-"+s.id),c=g("sc-"+s.id);if(i)s.t=i.value;if(c)s.done=c.checked;});
  const n=g("s-new");e.subDraft=n?n.value:"";
}
function drawEdit(){
  const e=S.edit,cat=S.cats.find(c=>c.id===e.cat)||S.cats[0],subs=subsOf(cat);
  let h='<h2>할 일 수정</h2>';
  h+='<div class="field"><label for="e-title">할 일</label><input class="inp" id="e-title" type="text" value="'+esc(e.title)+'" autocomplete="off"><div class="err" id="e-err"></div></div>';
  h+='<div class="field"><span class="lbl">카테고리</span><div class="catpick">'+S.cats.map(c=>'<button type="button" style="--cc:var(--'+c.color+')" aria-pressed="'+(c.id===e.cat)+'" data-act="ecat" data-cat="'+c.id+'"><i></i>'+esc(c.name)+'</button>').join("")+'</div>';
  if(subs.length)h+='<div class="catpick" style="--cc:var(--'+cat.color+');margin-top:4px">'+[{id:"",name:"소분류 없음"}].concat(subs).map(s=>'<button type="button" class="pill" aria-pressed="'+((s.id||null)===e.sub)+'" data-act="esub" data-sub="'+s.id+'">'+esc(s.name)+'</button>').join("")+'</div>';
  h+='</div>';
  h+='<div class="field"><label for="e-date">날짜와 시간</label><div class="row">'+
    '<input class="inp" id="e-date" type="date" value="'+esc(e.date||S.sel)+'" style="max-width:170px"'+(e.nodate?' disabled':'')+'>'+
    '<input class="inp" id="e-time" type="time" value="'+esc(e.time)+'" style="max-width:130px" aria-label="시간"'+(e.nodate?' disabled':'')+'>'+
    (e.time&&!e.nodate?'<button class="linkish" type="button" data-act="notime">시간 빼기</button>':'')+
    '<label class="opt"><input type="checkbox" id="e-nodate" data-act="nodate"'+(e.nodate?' checked':'')+'>날짜 없음</label></div></div>';
  h+='<div class="field"><span class="lbl">세부 할 일</span><ul class="subs">'+e.subtasks.map(s=>'<li><input type="checkbox" id="sc-'+s.id+'"'+(s.done?' checked':'')+' aria-label="완료"><input type="text" id="s-'+s.id+'" value="'+esc(s.t)+'" aria-label="세부 할 일"><button class="x" type="button" data-act="subdel" data-sid="'+s.id+'" aria-label="지우기">×</button></li>').join("")+
    '<li><input type="text" id="s-new" value="'+esc(e.subDraft||"")+'" placeholder="+ 세부 할 일 추가 (Enter)" autocomplete="off" style="margin-left:25px"></li></ul></div>';
  h+='<div class="field"><label for="e-note">메모</label><textarea class="inp" id="e-note" placeholder="필요한 내용을 적어 두세요">'+esc(e.note)+'</textarea></div>';
  h+='<div class="actions"><button class="btn dng'+(S.delArm?' armed':'')+'" type="button" data-act="del">'+(S.delArm?'한 번 더 누르면 삭제':'삭제')+'</button><button class="btn sec" type="button" data-act="tomorrow">내일로 미루기</button><span class="sp"></span><button class="btn sec" type="button" data-act="close">닫기</button><button class="btn pri" type="button" data-act="save">저장</button></div>';
  sheet.innerHTML=h;
}
function saveEdit(){
  syncEdit();const e=S.edit,id=S.editing;
  const title=e.title.trim();
  if(!title){$("#e-err").textContent="할 일 이름을 적어 주세요.";$("#e-title").focus();return;}
  const subtasks=e.subtasks.filter(s=>s.t.trim()).map(s=>({id:s.id,t:s.t.trim(),done:!!s.done}));
  if(e.subDraft&&e.subDraft.trim())subtasks.push({id:uid8("s"),t:e.subDraft.trim(),done:false});
  const date=e.nodate?null:(e.date||null);
  patchTask(id,{title,note:e.note.trim(),date,time:date&&e.time?e.time:null,cat:e.cat,sub:e.sub||null,subtasks});
  closeDlg();
}

/* ---------- 카테고리 시트 ---------- */
function openCats(){S.catDraft=S.cats.map(c=>({id:c.id,name:c.name,color:c.color,subs:subsOf(c).map(s=>({id:s.id,name:s.name})),subNew:""}));S.catDelArm=null;openSheet("cats",drawCats);}
function syncCats(){(S.catDraft||[]).forEach(c=>{const i=document.getElementById("cn-"+c.id);if(i)c.name=i.value;c.subs.forEach(s=>{const j=document.getElementById("sn-"+s.id);if(j)s.name=j.value;});const n=document.getElementById("snew-"+c.id);c.subNew=n?n.value:"";});}
function drawCats(){
  const counts={};for(const t of S.tasks.values()){const k=catOf(t).id;counts[k]=(counts[k]||0)+1;}
  let h='<h2>카테고리와 소분류</h2><p>소분류는 할 일 이름 옆에 작은 태그로 붙어요. 과목이나 프로젝트처럼 나눌 때 써요.</p><div>'+S.catDraft.map(c=>'<div class="catrow" style="--cc:var(--'+c.color+')"><div class="row"><input class="inp" id="cn-'+c.id+'" type="text" value="'+esc(c.name)+'" placeholder="카테고리 이름" aria-label="카테고리 이름" maxlength="24">'+
    (S.catDraft.length>1?'<button class="btn dng'+(S.catDelArm===c.id?' armed':'')+'" type="button" data-act="catdel" data-cat="'+c.id+'">'+(S.catDelArm===c.id?(counts[c.id]?'할 일 '+counts[c.id]+'개는 첫 카테고리로. 삭제':'한 번 더 누르면 삭제'):'삭제')+'</button>':'')+'</div>'+
    '<div class="sw" role="group" aria-label="색">'+COLORS.map(k=>'<button type="button" style="--cc:var(--'+k+')" aria-pressed="'+(k===c.color)+'" aria-label="색 '+k.slice(1)+'" data-act="catcolor" data-cat="'+c.id+'" data-color="'+k+'"></button>').join("")+'</div>'+
    '<div class="subl">'+c.subs.map(s=>'<span class="subitem"><input id="sn-'+s.id+'" type="text" value="'+esc(s.name)+'" aria-label="소분류 이름" maxlength="20"><button class="x" type="button" data-act="subrm" data-cat="'+c.id+'" data-sub="'+s.id+'" aria-label="소분류 지우기">×</button></span>').join("")+
    '<input class="subnew" id="snew-'+c.id+'" data-cat="'+c.id+'" type="text" value="'+esc(c.subNew||"")+'" placeholder="+ 소분류 (예: 과목) Enter" maxlength="20" autocomplete="off"></div></div>').join("")+'</div>';
  h+='<div class="actions"><button class="btn sec" type="button" data-act="catadd">+ 카테고리 추가</button><span class="sp"></span><button class="btn sec" type="button" data-act="close">닫기</button><button class="btn pri" type="button" data-act="catsave">저장</button></div>';
  sheet.innerHTML=h;
}
function saveCatsFromDraft(){
  syncCats();
  const cats=S.catDraft.map(c=>{
    const subs=c.subs.filter(s=>s.name.trim()).map(s=>({id:s.id,name:s.name.trim()}));
    if(c.subNew&&c.subNew.trim())subs.push({id:uid8("b"),name:c.subNew.trim()});
    return {id:c.id,name:c.name.trim()||"이름 없음",color:c.color,subs};
  });
  const byId=new Map(cats.map(c=>[c.id,c]));
  for(const t of S.tasks.values()){
    const cat=byId.get(t.cat)||cats[0];
    const sub=t.sub&&cat.subs.some(s=>s.id===t.sub)?t.sub:null;
    if(cat.id!==t.cat||sub!==(t.sub||null))patchTask(t.id,{cat:cat.id,sub});
  }
  saveCats(cats);closeDlg();toast("카테고리를 저장했어요.");
}

/* ---------- 이벤트 ---------- */
document.addEventListener("mousedown",ev=>{if(ev.target.closest&&ev.target.closest("[data-keep]"))ev.preventDefault();});
document.addEventListener("click",ev=>{
  const b=ev.target.closest&&ev.target.closest("[data-act]");if(!b)return;
  const a=b.dataset.act;
  switch(a){
    case"view":S.view=b.dataset.v;pref.set("view",S.view);S.adding=null;render();break;
    case"pick":S.sel=b.dataset.k;S.cursor=b.dataset.k;S.adding=null;render();break;
    case"today":S.sel=today;S.cursor=today;render();break;
    case"nav":{const d=+b.dataset.d;if(S.calMode==="month"){const c=parse(S.cursor);S.cursor=keyOf(new Date(c.getFullYear(),c.getMonth()+d,1));}else S.cursor=addDays(S.cursor,7*d);render();break;}
    case"calmode":S.calMode=S.calMode==="month"?"week":"month";S.cursor=S.sel;pref.set("calMode",S.calMode);render();break;
    case"add":{const cat=b.dataset.cat;S.adding=cat;S.addDraft="";S.addSub=S.lastSub[cat]||null;render();break;}
    case"addsub":S.addSub=b.dataset.sub||null;S.lastSub[S.adding]=S.addSub;render();break;
    case"toggle":{const t=S.tasks.get(b.dataset.id);if(!t)break;const done=!t.done;
      b.setAttribute("aria-checked",done);const li=b.closest(".task");
      if(done){S.just={id:t.id,at:Date.now()};if(li)li.classList.add("done","just");}else if(li)li.classList.remove("done","just");
      patchTask(t.id,{done,doneAt:done?Date.now():null});break;}
    case"edit":openEdit(b.dataset.id);break;
    case"carry":{let n=0;for(const t of S.tasks.values())if(t.date&&t.date<today&&!t.done){patchTask(t.id,{date:today});n++;}toast(n+"개를 오늘로 가져왔어요.");break;}
    case"showdone":S.showDone=!S.showDone;render();break;
    case"menu":openSheet("menu",drawMenu);break;
    case"cats":openCats();break;
    case"export":openSheet("export",drawExport);break;
    case"copy":{const ta=$("#x-out");const sel=()=>{ta.focus();ta.select();toast("텍스트를 선택해 뒀어요. 길게 눌러 복사해 주세요.");};
      try{navigator.clipboard.writeText(ta.value).then(()=>toast("복사했어요."),sel);}catch(e){sel();}break;}
    case"import":S.importData=null;openSheet("import",drawImport);break;
    case"importcheck":{const txt=$("#i-in").value;const r=parseImport(txt);if(r.err){$("#i-err").textContent=r.err;break;}
      if(!r.tasks.length&&!r.cats){$("#i-err").textContent="가져올 할 일이 없어요.";break;}
      S.importData=r;drawImport();$("#i-in").value=txt;break;}
    case"importgo":{const d=S.importData;if(!d)break;b.disabled=true;b.textContent="가져오는 중…";
      store.importAll(d).then(n=>{closeDlg();toast("할 일 "+n+"개를 가져왔어요.");},e=>{onError(e);b.disabled=false;b.textContent="가져오기";});break;}
    case"logout":closeDlg();store.signOut();break;
    case"close":closeDlg();break;
    case"save":saveEdit();break;
    case"ecat":syncEdit();if(S.edit.cat!==b.dataset.cat){S.edit.cat=b.dataset.cat;S.edit.sub=null;}drawEdit();break;
    case"esub":syncEdit();S.edit.sub=b.dataset.sub||null;drawEdit();break;
    case"nodate":syncEdit();drawEdit();break;
    case"notime":syncEdit();S.edit.time="";drawEdit();break;
    case"subdel":syncEdit();S.edit.subtasks=S.edit.subtasks.filter(s=>s.id!==b.dataset.sid);drawEdit();break;
    case"del":if(!S.delArm){syncEdit();S.delArm=true;drawEdit();}else{delTask(S.editing);closeDlg();toast("삭제했어요.");}break;
    case"tomorrow":{syncEdit();const base=(!S.edit.nodate&&S.edit.date)||today;const nd=addDays(base,1);patchTask(S.editing,{date:nd});closeDlg();toast(shortDate(nd)+"로 미뤘어요.");break;}
    case"catcolor":syncCats();S.catDraft.find(c=>c.id===b.dataset.cat).color=b.dataset.color;drawCats();break;
    case"catdel":syncCats();if(S.catDelArm!==b.dataset.cat){S.catDelArm=b.dataset.cat;}else{S.catDraft=S.catDraft.filter(c=>c.id!==b.dataset.cat);S.catDelArm=null;}drawCats();break;
    case"subrm":{syncCats();const c=S.catDraft.find(x=>x.id===b.dataset.cat);c.subs=c.subs.filter(s=>s.id!==b.dataset.sub);drawCats();break;}
    case"catadd":{syncCats();const used=new Set(S.catDraft.map(c=>c.color));const color=COLORS.find(c=>!used.has(c))||COLORS[S.catDraft.length%8];const id=uid8("k");S.catDraft.push({id,name:"",color,subs:[],subNew:""});drawCats();const i=document.getElementById("cn-"+id);if(i)i.focus();break;}
    case"catsave":saveCatsFromDraft();break;
  }
});
document.addEventListener("submit",ev=>{
  if(ev.target.id!=="loginForm")return;
  ev.preventDefault();
  const email=$("#l-email").value.trim(),pw=$("#l-pw").value,err=$("#l-err"),btn=$("#l-btn");
  if(!email||!pw){err.textContent="이메일과 비밀번호를 모두 적어 주세요.";return;}
  btn.disabled=true;btn.textContent="로그인 중…";err.textContent="";
  store.signIn(email,pw).catch(e=>{
    const c=e&&e.code||"";
    err.textContent=c.includes("invalid-credential")||c.includes("wrong-password")||c.includes("user-not-found")||c.includes("invalid-email")?"이메일이나 비밀번호가 맞지 않아요."
      :c.includes("too-many-requests")?"시도가 너무 많았어요. 잠시 뒤 다시 해 주세요."
      :c.includes("network")?"인터넷 연결을 확인해 주세요.":"로그인하지 못했어요. ("+c+")";
    btn.disabled=false;btn.textContent="로그인";
  });
});
const composing=e=>e.isComposing||e.keyCode===229;
document.addEventListener("keydown",ev=>{
  const el=ev.target;if(!el.matches)return;
  const enter=ev.key==="Enter"&&!composing(ev);
  if(el.matches(".addrow input")){
    if(enter){ev.preventDefault();addTask(el.dataset.cat,S.addSub,el.value,S.view==="day"?S.sel:null);S.addDraft="";el.value="";}
    else if(ev.key==="Escape"){ev.preventDefault();S.adding=null;render();}
  }else if(el.id==="e-title"&&enter){ev.preventDefault();saveEdit();}
  else if(el.id==="s-new"&&enter){
    ev.preventDefault();const v=el.value.trim();if(!v)return;syncEdit();
    S.edit.subtasks.push({id:uid8("s"),t:v,done:false});S.edit.subDraft="";drawEdit();
    const n=$("#s-new");if(n)n.focus();
  }else if(el.matches(".subnew")&&enter){
    ev.preventDefault();const v=el.value.trim();if(!v)return;syncCats();
    const c=S.catDraft.find(x=>x.id===el.dataset.cat);c.subs.push({id:uid8("b"),name:v});c.subNew="";drawCats();
    const n=document.getElementById("snew-"+c.id);if(n)n.focus();
  }
});
document.addEventListener("input",ev=>{if(ev.target.matches&&ev.target.matches(".addrow input"))S.addDraft=ev.target.value;});
document.addEventListener("focusout",ev=>{
  const el=ev.target;
  if(el.matches&&el.matches(".addrow input")){
    setTimeout(()=>{const a=document.activeElement;if(S.adding===el.dataset.cat&&!(a&&a.matches&&a.matches(".addrow input"))&&!S.addDraft.trim()){S.adding=null;render();}},200);
  }
});

let tt;
function toast(msg){const t=$("#toast");t.textContent=msg;t.hidden=false;clearTimeout(tt);tt=setTimeout(()=>t.hidden=true,2600);}

function tick(){const k=keyOf(new Date());if(k!==today){if(S.sel===today){S.sel=k;S.cursor=k;}today=k;render();}}
document.addEventListener("visibilitychange",()=>{if(!document.hidden)tick();});
setInterval(tick,60000);

/* ---------- 메모리 저장소 (로그인 안 됐을 때·테스트용) ---------- */
function memoryStore(){
  const tasks=new Map();let cats=null,cb=null;
  const emit=()=>{if(cb)cb.onData({tasks:new Map(tasks),cats});};
  const st={kind:"memory",
    start(c){cb=c;cb.onStatus("local");emit();},
    set(id,b){tasks.set(id,Object.assign({id},b));emit();return Promise.resolve();},
    update(id,p){const t=tasks.get(id);if(t)tasks.set(id,Object.assign({},t,p));emit();return Promise.resolve();},
    remove(id){tasks.delete(id);emit();return Promise.resolve();},
    saveCats(c){cats=c;emit();return Promise.resolve();},
    importAll(d){if(d.cats)cats=d.cats;d.tasks.forEach(t=>{const b=Object.assign({},t);delete b.id;tasks.set(t.id,Object.assign({id:t.id},b));});emit();return Promise.resolve(d.tasks.length);}};
  return st;
}

window.TodoApp={
  memoryStore,
  boot(s){
    store=s;
    render();
    store.start({
      onData(d){S.tasks=d.tasks;if(Array.isArray(d.cats)&&d.cats.length)S.cats=d.cats;if(S.mode==="signedout"||S.mode==="config")return;render();},
      onStatus(m){if(m===S.mode)return;if(m==="signedout"){S.tasks=new Map();S.cats=DEFAULT_CATS.slice();closeDlg();}S.mode=m;$("#main").innerHTML="";render();},
      onError
    });
  }
};
})();
