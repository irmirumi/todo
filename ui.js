/* 또박 — 화면 코드. 저장소(store)는 TodoApp.boot(store)로 받는다.
   store: { kind, start(cb), set(id,body), update(id,patch), remove(id), saveCats(cats), importAll(data)→Promise<number>,
            signIn?(email,pw), signOut?(), email? }
   cb: { onData({tasks:Map, cats:Array|null, tpls:Map}), onStatus("loading"|"live"|"local"|"signedout"|"config"), onError(err) }
   카테고리: {id, name, color, subs:[{id,name}], archived?:true} — 배열 순서가 화면 순서.
   반복 일정(r_*): {title, note, time, remind, cat, sub, days:[요일 0~6], subtasks:[{id,t}]} — 그 요일에 흐리게 보이고 ＋로 할 일(tpl:id)이 된다. */
(function(){
"use strict";
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const DOW=["일","월","화","수","목","금","토"];
const COLORS=["c7","c1","c2","c3","c4","c5","c6","c8"];
const DEFAULT_CATS=[{id:"k1",name:"일상",color:"c7",subs:[]},{id:"k2",name:"업무·공부",color:"c5",subs:[]},{id:"k3",name:"건강",color:"c3",subs:[]}];
const HOL=window.TTOBAK_HOLIDAYS||{};
const REMIND=[[null,"끔"],[0,"정각"],[5,"5분 전"],[10,"10분 전"],[30,"30분 전"],[60,"1시간 전"],[1440,"하루 전"]];
const remindLabel=m=>(REMIND.find(r=>r[0]===m)||[0,m+"분 전"])[1];
const VERSION="1.1.0";
const WEEK=[1,2,3,4,5,6,0];
const sortDays=ds=>WEEK.filter(d=>Array.isArray(ds)&&ds.includes(d));
function daysLabel(ds){
  const s=sortDays(ds);
  if(s.length===7)return"매일";if(!s.length)return"요일 없음";
  if(s.length===5&&!s.includes(0)&&!s.includes(6))return"평일";
  if(s.length===2&&s.includes(0)&&s.includes(6))return"주말";
  return s.map(d=>DOW[d]).join("·");
}
const repSvg='<svg class="rep-i" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.2 5.4A3.9 3.9 0 0 1 9.1 3.4M9.8 6.6A3.9 3.9 0 0 1 2.9 8.6M9.4 1.4v2.3H7.1M2.6 10.6V8.3h2.3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const bellSvg='<svg class="bell" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5a3 3 0 0 0-3 3v2.2L2 8.5h8l-1-1.8V4.5a3 3 0 0 0-3-3zM4.8 10a1.2 1.2 0 0 0 2.4 0" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
const pad=n=>String(n).padStart(2,"0");
const keyOf=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const parse=k=>{const a=k.split("-").map(Number);return new Date(a[0],a[1]-1,a[2]);};
const addDays=(k,n)=>{const d=parse(k);d.setDate(d.getDate()+n);return keyOf(d);};
const uid8=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/,TIME_RE=/^\d{2}:\d{2}$/;
const fine=window.matchMedia&&window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const reduced=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let today=keyOf(new Date());

const pref={get(k,d){try{const v=localStorage.getItem("todo."+k);return v==null?d:v;}catch(e){return d;}},set(k,v){try{localStorage.setItem("todo."+k,v);}catch(e){}}};
const narrow=window.matchMedia&&window.matchMedia("(max-width: 839px)").matches;

const S={tasks:new Map(),tpls:new Map(),tplSrc:null,week:null,query:"",addCat:null,addDate:null,subMoved:null,cats:DEFAULT_CATS.slice(),view:pref.get("view","day"),sel:today,cursor:today,
  calMode:pref.get("calMode",narrow?"week":"month"),showDone:false,mode:"loading",anim:false,calDir:0,
  adding:null,addSub:null,addDraft:"",lastSub:{},focusAdd:false,
  sheet:null,editing:null,edit:null,editGone:false,catDraft:null,catDelArm:null,catMoved:null,importData:null};
let store=null;

const active=()=>S.cats.filter(c=>!c.archived);
const catOf=t=>S.cats.find(c=>c.id===t.cat)||active()[0]||S.cats[0];
const shown=t=>!catOf(t).archived;
const visibleTasks=()=>[...S.tasks.values()].filter(shown);
const subsOf=c=>Array.isArray(c&&c.subs)?c.subs:[];
const byCreated=(a,b)=>(a.createdAt||0)-(b.createdAt||0);
const byTime=(a,b)=>{const x=a.time||"99:99",y=b.time||"99:99";return x<y?-1:x>y?1:byCreated(a,b);};
const byDateTime=(a,b)=>{const x=a.date||"9999",y=b.date||"9999";return x<y?-1:x>y?1:byTime(a,b);};
const KO=new Intl.Collator("ko",{numeric:true,sensitivity:"base"});
function inCatOrder(cat,withDate){
  const rank=new Map(subsOf(cat).map((s,i)=>[s.id,i]));
  const sr=t=>rank.has(t.sub)?rank.get(t.sub):1e6;
  const timed=t=>!!(t.time&&t.date);
  return (a,b)=>(sr(a)-sr(b))
    ||(withDate?((a.date||"9999")<(b.date||"9999")?-1:(a.date||"9999")>(b.date||"9999")?1:0):0)
    ||((timed(a)?0:1)-(timed(b)?0:1))
    ||(timed(a)&&timed(b)&&a.time!==b.time?(a.time<b.time?-1:1):0)
    ||KO.compare(a.title||"",b.title||"")
    ||byCreated(a,b);
}
/* 이 날짜에 흐리게 보여 줄 반복 템플릿: 오늘 이후, 그 요일, 아직 그날 추가하지 않은 것 */
function ghostsFor(k){
  if(k<today||!S.tpls.size)return [];
  const w=parse(k).getDay(),used=new Set();
  for(const t of S.tasks.values())if(t.tpl&&t.date===k)used.add(t.tpl);
  return [...S.tpls.values()].filter(r=>!r.archived&&!(r.until&&k>r.until)&&Array.isArray(r.days)&&r.days.includes(w)&&!used.has(r.id)&&!catOf(r).archived)
    .map(r=>Object.assign({},r,{date:k,ghost:true}));
}
function relWord(k){if(k===today)return"오늘";if(k===addDays(today,1))return"내일";if(k===addDays(today,-1))return"어제";return"";}
const md=k=>{const d=parse(k);return (d.getMonth()+1)+"/"+d.getDate()+" ("+DOW[d.getDay()]+")";};
/* "2359"→"23:59", "930"→"09:30", "9"→"09:00", "9:5"→"09:05", ""→"" , 잘못된 값→null */
function parseTime(v){
  v=String(v||"").trim();if(!v)return "";
  let h,m;const c=v.match(/^(\d{1,2})\s*[:.]\s*(\d{1,2})$/);
  if(c){h=+c[1];m=+c[2];}
  else if(/^\d{1,4}$/.test(v)){if(v.length<=2){h=+v;m=0;}else{h=+v.slice(0,v.length-2);m=+v.slice(-2);}}
  else return null;
  return h<24&&m<60?pad(h)+":"+pad(m):null;
}
const mins=t=>{const a=t.split(":").map(Number);return a[0]*60+a[1];};
const okEnd=(t,e)=>!!(t&&e&&TIME_RE.test(e)&&mins(e)>mins(t));
/* "오전 10:00–11:30", 오전·오후가 바뀌면 둘 다 표시 */
function fmtRange(t,e){if(!t)return"";const a=fmtTime(t);if(!okEnd(t,e))return a;const b=fmtTime(e);return a+"–"+(a.slice(0,2)===b.slice(0,2)?b.slice(3):b);}
function fmtTime(t){if(!t)return"";const [h,m]=t.split(":").map(Number);return (h<12?"오전 ":"오후 ")+((h%12)||12)+":"+pad(m);}
function holName(k){
  const a=HOL[k];if(!a)return"";
  return a.map(n=>n.indexOf("대체공휴일")===0?"대체공휴일":n==="1월 1일"?"신정":n==="기독탄신일"?"성탄절":n.replace("3ㆍ1절","삼일절").replace("전국동시지방선거","지방선거일")).join(" · ");
}

const TRANSIENT=["enter","pop","from-next","from-prev","moved"];
/* 화면 바꿔 그리기: 바뀐 부분만 고쳐서 입력 중인 칸, 포커스, 스크롤, 애니메이션을 지킨다 */
function morph(el,html){
  if(!window.morphdom){el.innerHTML=html;return;}
  const w=document.createElement(el.tagName);w.innerHTML=html;
  window.morphdom(el,w,{childrenOnly:true,
    onBeforeElUpdated(from,to){
      for(const c of TRANSIENT)if(from.classList&&from.classList.contains(c))to.classList.add(c);
      if(from===document.activeElement&&(from.tagName==="INPUT"||from.tagName==="TEXTAREA"))return false;
      return !from.isEqualNode(to);
    },
    onNodeAdded(n){if(S.anim&&!reduced&&n.nodeType===1&&n.classList.contains("task")){n.classList.add("enter");setTimeout(()=>n.classList.remove("enter"),300);}return n;}
  });
}

/* ---------- 저장 ---------- */
const setTask=(id,b)=>store.set(id,b);
const patchTask=(id,p)=>store.update(id,p);
const delTask=id=>store.remove(id);
function saveCats(cats){S.cats=cats;render();store.saveCats(cats);}
function onError(e){
  const c=e&&e.code;
  if(c==="quota_exceeded"||c==="resource-exhausted")toast("저장 공간이 부족해요. 완료한 할 일을 지워 주세요.");
  else if(c==="network")toast("연결이 끊겼어요. 다시 시도하는 중…");
  else if(c==="not_ready")toast("아직 불러오는 중이에요. 잠시 후 다시 해 주세요.");
  else if(c==="invalid_argument"||c==="permission-denied")toast("저장 권한이 없어요. 다시 로그인해 주세요.");
  else toast("저장하지 못했어요. 다시 시도해 주세요.");
}
function addTask(cat,sub,title,date){
  title=title.trim();if(!title)return;
  setTask(uid8("t_"),{title,note:"",date:date||null,time:null,cat,sub:sub||null,done:false,doneAt:null,createdAt:Date.now(),subtasks:[]});
}
function removeWithUndo(id){
  const t=S.tasks.get(id);if(!t)return;
  const body=Object.assign({},t);delete body.id;
  delTask(id);
  toast("삭제했어요",{label:"되돌리기",fn:()=>setTask(id,body)});
}

/* ---------- 렌더 ---------- */
function render(){
  const out=S.mode==="signedout"||S.mode==="config";
  document.body.dataset.view=S.view;
  document.body.dataset.auth=out?"out":"in";
  for(const v of ["day","week","all"]){const b=document.querySelector('[data-act=view][data-v="'+v+'"]');if(b)b.setAttribute("aria-pressed",S.view===v);}
  const bn=$("#banner");
  bn.hidden=S.mode!=="local";
  if(S.mode==="local")bn.textContent="로그인하지 않아 저장되지 않아요";
  if(S.mode==="signedout")return renderLogin();
  if(S.mode==="config")return renderConfig();
  if(S.view==="day"){renderCal();renderDay();}else if(S.view==="week")renderWeek();else renderAll();
  if(S.focusAdd&&S.adding){S.focusAdd=false;const inp=document.getElementById("add-"+S.adding);if(inp)inp.focus();}
}

const markSvg='<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><rect class="bg" width="32" height="32" rx="9"/><g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="3.1" transform="translate(0 -0.4)"><polyline class="ck" opacity=".6" points="6.5,16.8 10.9,21.2 17.4,12.6"/><polyline class="ck" points="14.2,16.8 18.6,21.2 25.4,11.2"/></g></svg>';
function renderLogin(){
  if($("#loginForm"))return;
  $("#main").innerHTML='<div class="auth">'+markSvg+'<h1>로그인</h1><p>폰과 PC에서 같은 할 일을 봐요</p>'+
    '<form id="loginForm" novalidate><label>이메일<input class="inp" id="l-email" type="email" autocomplete="username" inputmode="email" required></label>'+
    '<label>비밀번호<input class="inp" id="l-pw" type="password" autocomplete="current-password" required></label>'+
    '<div class="err" id="l-err"></div><button class="btn pri" id="l-btn" type="submit">로그인</button></form></div>';
}
function renderConfig(){
  $("#main").innerHTML='<div class="auth">'+markSvg+'<h1>설정이 필요해요</h1><p><code>firebase-config.js</code>에 Firebase 설정값을 넣어 주세요. 설치 가이드 2단계를 참고하세요.</p></div>';
}

function ring(s){
  if(!s)return '<svg class="ring" viewBox="0 0 24 24" aria-hidden="true"></svg>';
  if(s.d===s.n)return '<svg class="ring" viewBox="0 0 24 24" aria-hidden="true"><circle class="full" cx="12" cy="12" r="10.5"/><path class="ck" d="M7.5 12.3l3 3 6-6.3" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const C=2*Math.PI*9.5,off=C*(1-s.d/s.n);
  return '<svg class="ring" viewBox="0 0 24 24" aria-hidden="true"><circle class="bgc" cx="12" cy="12" r="9.5" fill="none" stroke-width="2.4"/><circle class="fgc" cx="12" cy="12" r="9.5" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="'+C.toFixed(2)+'" stroke-dashoffset="'+off.toFixed(2)+'" transform="rotate(-90 12 12)"/><text x="12" y="15.3" text-anchor="middle">'+(s.n-s.d)+'</text></svg>';
}
const chev=d=>'<svg width="16" height="16" viewBox="0 0 16 16"><path d="'+(d<0?"M10 3L5 8l5 5":"M6 3l5 5-5 5")+'" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function renderCal(){
  const stats={};
  for(const t of visibleTasks()){if(!t.date)continue;const s=stats[t.date]||(stats[t.date]={n:0,d:0});s.n++;if(t.done)s.d++;}
  const c=parse(S.cursor);let start,cells;
  if(S.calMode==="month"){
    const first=new Date(c.getFullYear(),c.getMonth(),1);
    const days=new Date(c.getFullYear(),c.getMonth()+1,0).getDate();
    start=new Date(first);start.setDate(1-first.getDay());
    cells=Math.ceil((first.getDay()+days)/7)*7;
  }else{start=new Date(c);start.setDate(c.getDate()-c.getDay());cells=7;}
  const unit=S.calMode==="month"?"달":"주";
  let h='<div class="calhead"><h2>'+c.getFullYear()+'년 '+(c.getMonth()+1)+'월</h2>'+
    (S.sel!==today||S.cursor!==today?'<button class="small" type="button" data-act="today">오늘</button>':'')+
    '<button class="icon" type="button" data-act="nav" data-d="-1" aria-label="이전 '+unit+'">'+chev(-1)+'</button>'+
    '<button class="icon" type="button" data-act="nav" data-d="1" aria-label="다음 '+unit+'">'+chev(1)+'</button></div>';
  h+='<div class="dows">'+DOW.map(d=>'<span>'+d+'</span>').join("")+'</div><div class="grid">';
  for(let i=0;i<cells;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);const k=keyOf(d),s=stats[k],hn=holName(k);
    const cls=["day","d"+d.getDay()];
    if(hn)cls.push("hol");
    if(S.calMode==="month"&&d.getMonth()!==c.getMonth())cls.push("out");
    if(k===today)cls.push("today");if(k===S.sel)cls.push("sel");
    const lab=(d.getMonth()+1)+"월 "+d.getDate()+"일"+(k===today?" 오늘":"")+(hn?" "+hn:"")+(s?", 할 일 "+s.n+"개 중 "+s.d+"개 완료":"");
    h+='<button type="button" class="'+cls.join(" ")+'" data-act="pick" data-k="'+k+'" aria-label="'+esc(lab)+'"'+(k===S.sel?' aria-current="date"':'')+'><span class="num">'+d.getDate()+'</span>'+ring(s)+'</button>';
  }
  h+='</div><div class="calfoot"><button class="linkish" type="button" data-act="calmode">'+(S.calMode==="month"?"한 주 보기":"한 달 보기")+'</button></div>';
  morph($("#cal"),h);
  if(S.calDir&&!reduced){
    const g=$("#cal .grid");g.classList.remove("from-next","from-prev");void g.offsetWidth;
    const cl=S.calDir>0?"from-next":"from-prev";g.classList.add(cl);setTimeout(()=>g.classList.remove(cl),260);
  }
  S.calDir=0;
}

function chk(t){
  return '<button class="chk" type="button" role="checkbox" aria-checked="'+(!!t.done)+'" aria-label="'+esc(t.title)+' 완료" data-act="toggle" data-id="'+t.id+'"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 7.2l2.6 2.6L11 4.4" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
}
function dateChip(k){
  if(!k)return '<span class="chip">날짜 없음</span>';
  const r=relWord(k);
  if(k<today)return '<span class="chip late">'+(r||md(k))+' 지남</span>';
  return '<span class="chip'+(k===today?' today':'')+'">'+(r||md(k))+'</span>';
}
const addSvg='<svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 1.8v8.4M1.8 6h8.4" fill="none" stroke-width="1.9" stroke-linecap="round"/></svg>';
function ghostRow(t){
  const cat=catOf(t),meta=[];
  const sub=t.sub?subsOf(cat).find(s=>s.id===t.sub):null;
  if(t.time)meta.push('<span class="chip time">'+fmtRange(t.time,t.end)+'</span>');
  if(store&&store.push&&t.remind!=null&&t.time)meta.push('<span class="rmd">'+bellSvg+remindLabel(t.remind)+'</span>');
  meta.push('<span class="rep">'+repSvg+'매주 '+daysLabel(t.days)+'</span>');
  return '<li id="gh-'+t.id+'" class="task ghost" style="--cc:var(--'+cat.color+')">'+
    '<button class="chk gadd" type="button" data-act="tpladd" data-id="'+t.id+'" data-k="'+t.date+'" aria-label="'+esc(t.title)+' 할 일로 추가">'+addSvg+'</button>'+
    '<button class="ttl" type="button" data-act="tpl" data-id="'+t.id+'"><span class="tline"><span class="t">'+esc(t.title)+'</span>'+(sub?'<span class="tag">'+esc(sub.name)+'</span>':'')+'</span>'+
    '<span class="meta">'+meta.join("")+'</span></button></li>';
}
/* withDate: 날짜 칩 표시(완료 목록), withCat: 카테고리 이름 표시(전체 탭) */
function row(t,withDate,withCat){
  if(t.ghost)return ghostRow(t);
  const cat=catOf(t),meta=[];
  const sub=t.sub?subsOf(cat).find(s=>s.id===t.sub):null;
  if(withDate)meta.push(dateChip(t.date));
  if(t.time&&t.date)meta.push('<span class="chip time">'+fmtRange(t.time,t.end)+'</span>');
  if(withCat)meta.push('<span class="catl"><i></i>'+esc(cat.name)+'</span>');
  if(store&&store.push&&t.remind!=null&&t.time&&t.date&&!t.done)meta.push('<span class="rmd">'+bellSvg+remindLabel(t.remind)+'</span>');
  const subs=Array.isArray(t.subtasks)?t.subtasks:[];
  if(subs.length)meta.push('<span>세부 '+subs.filter(s=>s.done).length+'/'+subs.length+'</span>');
  if(t.note)meta.push('<span>메모</span>');
  return '<li id="tk-'+t.id+'" class="task'+(t.done?' done':'')+'" style="--cc:var(--'+cat.color+')">'+chk(t)+
    '<button class="ttl" type="button" data-act="edit" data-id="'+t.id+'"><span class="tline"><span class="t">'+esc(t.title)+'</span>'+(sub?'<span class="tag">'+esc(sub.name)+'</span>':'')+'</span>'+
    (meta.length?'<span class="meta">'+meta.join("")+'</span>':'')+'</button></li>';
}
const plusSvg='<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
function group(cat,items,withDate){
  const subs=subsOf(cat);
  const real=items.filter(t=>!t.ghost);
  const cnt=!real.length?"":withDate?String(real.length):real.filter(t=>t.done).length+"/"+real.length;
  let h='<section id="g-'+cat.id+'" class="grp" style="--cc:var(--'+cat.color+')"><div class="ghead"><span class="dot"></span><h3>'+esc(cat.name)+'</h3><span class="cnt">'+cnt+'</span>'+
    '<button class="plus" type="button" data-act="add" data-cat="'+cat.id+'" aria-label="'+esc(cat.name)+'에 할 일 추가">'+plusSvg+'</button></div>';
  /* 목록과 입력 줄은 형제로 둔다: 할 일이 늘어도 입력 줄이 DOM에서 옮겨지지 않아 포커스·키보드가 유지된다 */
  h+='<ul class="tasks">'+items.slice().sort(inCatOrder(cat,withDate)).map(t=>row(t,withDate)).join("")+'</ul>';
  if(S.adding===cat.id){
    const cur=subs.find(s=>s.id===S.addSub);
    h+='<div class="addrow" id="addrow-'+cat.id+'"><input id="add-'+cat.id+'" type="text" data-cat="'+cat.id+'" value="'+esc(S.addDraft)+'" placeholder="할 일 입력" autocomplete="off" enterkeyhint="done" aria-label="새 할 일">';
    if(subs.length)h+='<div class="addsubs" role="group" aria-label="소분류"><button class="pill" type="button" data-keep data-act="addsub" data-sub="" aria-pressed="'+(!cur)+'">없음</button>'+subs.map(s=>'<button class="pill" type="button" data-keep data-act="addsub" data-sub="'+s.id+'" aria-pressed="'+(!!cur&&cur.id===s.id)+'">'+esc(s.name)+'</button>').join("")+'</div>';
    h+='</div>';
  }
  return h+'</section>';
}

function renderDay(){
  const k=S.sel,d=parse(k),r=relWord(k),hn=holName(k);
  const vis=visibleTasks();
  const list=vis.filter(t=>t.date===k).sort(byTime);
  const n=list.length,dn=list.filter(t=>t.done).length;
  let h='<div class="dayhead"><p class="eyebrow"><span>'+DOW[d.getDay()]+'요일</span>'+(r?'<span class="rel'+(k===today?' now':'')+'">'+r+'</span>':'')+(hn?'<span class="holn">'+esc(hn)+'</span>':'')+'</p>'+
    '<h1>'+(d.getMonth()+1)+'월 '+d.getDate()+'일</h1>';
  if(S.mode==="loading")h+='<div class="prog"></div>';
  else if(!n)h+='<div class="prog">할 일 없음</div>';
  else h+='<div class="prog"><div class="bar"><i style="width:'+Math.round(dn/n*100)+'%"></i></div><span>'+(dn===n?'모두 완료':dn+'/'+n+' 완료')+'</span></div>';
  h+='</div>';
  if(k===today){
    const od=vis.filter(t=>t.date&&t.date<today&&!t.done);
    if(od.length)h+='<div class="carry"><span>밀린 할 일 <b>'+od.length+'개</b></span><button class="small" type="button" data-act="carry">오늘로 옮기기</button></div>';
  }
  if(S.mode!=="loading"&&!vis.length)h+='<p class="hint">＋로 추가하고, 할 일을 누르면 시간·메모를 넣을 수 있어요</p>';
  const gh=S.mode==="loading"?[]:ghostsFor(k);
  h+='<div class="groups">'+active().map(c=>group(c,list.concat(gh).filter(t=>catOf(t).id===c.id),false)).join("")+'</div>';
  morph($("#main"),h);
}

/* 전체 탭: 날짜(일)별로 묶고, 하루 안에서는 시간 → 카테고리 순서 → 소분류 순서 → 가나다 */
function allOrder(){
  const ci=new Map(S.cats.map((c,i)=>[c.id,i]));
  const sr=t=>{const i=subsOf(catOf(t)).findIndex(x=>x.id===t.sub);return i<0?1e6:i;};
  return (a,b)=>{
    const x=a.date&&a.time||"",y=b.date&&b.time||"";
    if(!x!==!y)return x?-1:1;
    if(x!==y)return x<y?-1:1;
    return (ci.get(catOf(a).id)-ci.get(catOf(b).id))||(sr(a)-sr(b))||KO.compare(a.title||"",b.title||"")||byCreated(a,b);
  };
}
function addAllRow(){
  const cat=S.cats.find(c=>c.id===S.addCat&&!c.archived)||active()[0],subs=subsOf(cat),cur=subs.find(x=>x.id===S.addSub);
  const dates=[["","날짜 없음"],[today,"오늘"],[addDays(today,1),"내일"]];
  let h='<div class="addrow top" id="addrow-all" style="--cc:var(--'+cat.color+')"><input id="add-all" type="text" data-cat="all" value="'+esc(S.addDraft)+'" placeholder="할 일 입력" autocomplete="off" enterkeyhint="done" aria-label="새 할 일">';
  h+='<div class="addsubs" role="group" aria-label="카테고리">'+active().map(c=>'<button class="pill cpill" style="--cc:var(--'+c.color+')" type="button" data-keep data-act="addcat" data-cat="'+c.id+'" aria-pressed="'+(c.id===cat.id)+'"><i></i>'+esc(c.name)+'</button>').join("")+'</div>';
  if(subs.length)h+='<div class="addsubs" role="group" aria-label="소분류"><button class="pill" type="button" data-keep data-act="addsub" data-sub="" aria-pressed="'+(!cur)+'">소분류 없음</button>'+subs.map(x=>'<button class="pill" type="button" data-keep data-act="addsub" data-sub="'+x.id+'" aria-pressed="'+(!!cur&&cur.id===x.id)+'">'+esc(x.name)+'</button>').join("")+'</div>';
  h+='<div class="addsubs dates" role="group" aria-label="날짜">'+dates.map(d=>'<button class="pill" type="button" data-keep data-act="adddate" data-k="'+d[0]+'" aria-pressed="'+((S.addDate||"")===d[0])+'">'+d[1]+'</button>').join("")+'</div>';
  return h+'</div>';
}
function dsecHead(k,n){
  if(!k)return '<div class="ghead"><h3>날짜 없음</h3><span class="cnt">'+n+'</span></div>';
  const d=parse(k),r=relWord(k),hn=holName(k);
  const lab=(d.getMonth()+1)+'월 '+d.getDate()+'일 <small class="d'+d.getDay()+(hn?' hol':'')+'">'+DOW[d.getDay()]+'</small>';
  const rel=k<today?'<span class="rel late">'+(r||"")+(r?" ":"")+'지남</span>':r?'<span class="rel'+(k===today?' now':'')+'">'+r+'</span>':'';
  return '<div class="ghead"><button class="dlink" type="button" data-act="goday" data-k="'+k+'"><h3>'+lab+'</h3></button>'+rel+(hn?'<span class="holn">'+esc(hn)+'</span>':'')+'<span class="cnt">'+n+'</span></div>';
}
function renderAll(){
  const q=(S.query||"").trim().toLowerCase();
  const hit=t=>{if(!q)return true;const c=catOf(t),sb=subsOf(c).find(x=>x.id===t.sub);return [t.title,t.note,c.name,sb&&sb.name].some(v=>v&&String(v).toLowerCase().includes(q));};
  const vis=visibleTasks().filter(hit);
  const open=vis.filter(t=>!t.done);
  const done=vis.filter(t=>t.done).sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));
  const by=new Map();
  for(const t of open){const k=t.date||"";if(!by.has(k))by.set(k,[]);by.get(k).push(t);}
  const keys=[...by.keys()].filter(Boolean).sort();if(by.has(""))keys.push("");
  const cmp=allOrder();
  let h='<div class="dayhead"><p class="eyebrow"><span>날짜순</span></p><div class="hrow"><h1>전체</h1>'+
    '<button class="plus big" type="button" data-act="add" data-cat="all" aria-label="할 일 추가">'+plusSvg+'</button></div>'+
    (S.mode==="loading"?'<div class="prog"></div>':'<div class="prog">'+(q?'찾은 할 일 '+open.length+'개':open.length?open.length+'개 남음':'남은 할 일 없음')+'</div>')+'</div>';
  h+='<div class="search"><input class="field-soft" id="q" type="search" value="'+esc(S.query||"")+'" placeholder="할 일 찾기" autocomplete="off" enterkeyhint="search" aria-label="할 일 찾기"></div>';
  if(S.adding==="all")h+=addAllRow();
  h+='<div class="groups">'+keys.map(k=>'<section class="grp dsec'+(k&&k<today?' past':'')+'" id="ds-'+(k||"none")+'">'+dsecHead(k,by.get(k).length)+
    '<ul class="tasks">'+by.get(k).sort(cmp).map(t=>row(t,false,true)).join("")+'</ul></section>').join("")+'</div>';
  if(!keys.length&&S.mode!=="loading")h+='<p class="hint">'+(q?'찾는 할 일이 없어요':'남은 할 일이 없어요')+'</p>';
  if(done.length){
    h+='<div class="donebox"><button class="linkish" type="button" data-act="showdone">'+(S.showDone?'완료 접기':'완료 '+done.length+'개 보기')+'</button>';
    if(S.showDone)h+='<section class="grp" style="--cc:var(--c8);margin-top:8px"><ul class="tasks">'+done.slice(0,150).map(t=>row(t,true,true)).join("")+'</ul></section>';
    h+='</div>';
  }
  morph($("#main"),h);
}

/* ---------- 시간표: 한 주, 시간이 정해진 할 일과 반복 일정 ---------- */
function weekStart(k){const d=parse(k);d.setDate(d.getDate()-((d.getDay()+6)%7));return keyOf(d);}
function layLanes(items){
  items.sort((a,b)=>a.s-b.s||b.e-a.e);
  let cl=[],end=-1;
  const flush=()=>{const cols=[];for(const it of cl){let c=cols.findIndex(x=>x<=it.s);if(c<0){c=cols.length;cols.push(0);}cols[c]=it.e;it.col=c;}for(const it of cl)it.n=cols.length;cl=[];};
  for(const it of items){if(cl.length&&it.s>=end){flush();end=-1;}cl.push(it);end=Math.max(end,it.e);}
  if(cl.length)flush();
  return items;
}
function renderWeek(){
  const ws=S.week||(S.week=weekStart(S.sel));
  const days=[0,1,2,3,4,5,6].map(i=>addDays(ws,i));
  const vis=S.mode==="loading"?[]:visibleTasks();
  const items={};
  for(const k of days){
    const list=vis.filter(t=>t.date===k&&t.time).map(t=>({t,ghost:false}))
      .concat((S.mode==="loading"?[]:ghostsFor(k)).filter(r=>r.time).map(r=>({t:r,ghost:true})));
    items[k]=list.map(x=>{const s0=mins(x.t.time),e0=okEnd(x.t.time,x.t.end)?mins(x.t.end):s0+60;return Object.assign(x,{s:s0,e0,e:Math.max(e0,s0+30)});});
  }
  const wide=window.matchMedia&&window.matchMedia("(min-width: 700px)").matches;
  const cols=wide||items[days[5]].length||items[days[6]].length?days:days.slice(0,5);
  const all=cols.flatMap(k=>items[k]);
  let h0=9,h1=18;
  for(const x of all){h0=Math.min(h0,Math.floor(x.s/60));h1=Math.max(h1,Math.ceil(Math.min(x.e,1440)/60));}
  const now=new Date(),nowM=now.getHours()*60+now.getMinutes();
  if(cols.includes(today)&&nowM>=h0*60-30&&nowM<=h1*60+30){h0=Math.min(h0,Math.floor(nowM/60));h1=Math.max(h1,Math.ceil(nowM/60));}
  h1=Math.min(24,Math.max(h1,h0+1));
  const H=wide?48:40,px=m=>((m-h0*60)/60*H).toFixed(1);
  const mainW=($("#main")&&$("#main").clientWidth)||Math.min(window.innerWidth,1060)-24;
  const colW=(mainW-(wide?40:30))/cols.length;
  const a=parse(days[0]),b=parse(days[6]);
  const title=(a.getMonth()+1)+'월 '+a.getDate()+'일 – '+(a.getMonth()===b.getMonth()?'':(b.getMonth()+1)+'월 ')+b.getDate()+'일';
  const thisWeek=weekStart(today);
  const rel=ws===thisWeek?"이번 주":ws===addDays(thisWeek,7)?"다음 주":ws===addDays(thisWeek,-7)?"지난주":"";
  let h='<div class="dayhead"><p class="eyebrow"><span>시간표</span>'+(rel?'<span class="rel'+(rel==="이번 주"?' now':'')+'">'+rel+'</span>':'')+'</p>'+
    '<div class="hrow"><h1>'+title+'</h1><span class="navs">'+(ws!==thisWeek?'<button class="small" type="button" data-act="wtoday">이번 주</button>':'')+
    '<button class="icon" type="button" data-act="wnav" data-d="-1" aria-label="이전 주">'+chev(-1)+'</button><button class="icon" type="button" data-act="wnav" data-d="1" aria-label="다음 주">'+chev(1)+'</button></span></div></div>';
  h+='<div class="tt" style="--cols:'+cols.length+';--hh:'+H+'px">';
  h+='<div class="tthead"><span></span>'+cols.map(k=>{const d=parse(k),hn=holName(k);
    return '<button type="button" class="tth d'+d.getDay()+(hn?' hol':'')+(k===today?' today':'')+'" data-act="goday" data-k="'+k+'" aria-label="'+(d.getMonth()+1)+'월 '+d.getDate()+'일 하루 보기"><small>'+DOW[d.getDay()]+'</small><b>'+d.getDate()+'</b></button>';}).join("")+'</div>';
  h+='<div class="ttbody" style="height:'+((h1-h0)*H)+'px"><div class="ttgut">';
  for(let hr=h0+1;hr<h1;hr++)h+='<span style="top:'+((hr-h0)*H)+'px">'+hr+'</span>';
  h+='</div>';
  for(const k of cols){
    h+='<div class="ttcol'+(k===today?' today':'')+'">';
    for(const x of layLanes(items[k])){
      const t=x.t,cat=catOf(t),hgt=Math.max(20,(Math.min(x.e,1440)-x.s)/60*H-2);
      const pos='top:'+px(x.s)+'px;height:'+hgt.toFixed(1)+'px;left:calc('+(100*x.col/x.n).toFixed(3)+'% + 1px);width:calc('+(100/x.n).toFixed(3)+'% - 2px)';
      const thin=colW/x.n<34;
      const inner=thin?'':'<span class="bt">'+esc(t.title)+'</span>'+(hgt>=34?'<span class="bm">'+fmtRange(t.time,t.end).replace(/^오[전후] /,"")+'</span>':'');
      const lab=' aria-label="'+esc(t.title)+' '+fmtRange(t.time,t.end)+'" title="'+esc(t.title)+'"';
      if(x.ghost)h+='<button type="button" class="blk ghost'+(thin?' thin':'')+'"'+lab+' style="--cc:var(--'+cat.color+');'+pos+'" data-act="tpladdw" data-id="'+t.id+'" data-k="'+k+'">'+inner+'</button>';
      else h+='<button type="button" class="blk'+(t.done?' done':'')+(thin?' thin':'')+'"'+lab+' style="--cc:var(--'+cat.color+');'+pos+'" data-act="edit" data-id="'+t.id+'">'+inner+'</button>';
    }
    if(k===today&&nowM>=h0*60&&nowM<=h1*60)h+='<i class="nowline" style="top:'+px(nowM)+'px"></i>';
    h+='</div>';
  }
  h+='</div></div>';
  if(S.mode!=="loading"&&!all.length)h+='<p class="hint tthint">이번 주에 시간을 정한 할 일이 없어요. 할 일에 시간을 넣거나 반복 일정을 만들면 여기 보여요.</p>';
  else if(all.some(x=>x.ghost))h+='<p class="hint tthint">점선은 아직 추가하지 않은 반복 일정이에요. 누르면 그날 할 일로 추가돼요.</p>';
  morph($("#main"),h);
  if(S.calDir&&!reduced){const g=$("#main .tt");if(g){const cl=S.calDir>0?"from-next":"from-prev";g.classList.add(cl);setTimeout(()=>g.classList.remove(cl),260);}}
  S.calDir=0;
}

/* ---------- 시트 공통: 뒤로가기·아래로 밀기로 닫히고, 닫을 때 저장 ---------- */
const dlg=$("#dlg"),sheet=$("#sheet");
const grab='<div class="grab" aria-hidden="true"><i></i></div>';
function drawSheet(html){morph(sheet,grab+html);}
let sheetClosing=false;
function openSheet(kind,draw){
  sheetClosing=false;S.sheet=kind;draw();
  if(!dlg.open){dlg.classList.remove("closing");dlg.style.transform="";dlg.showModal();try{history.pushState({sheet:1},"");}catch(e){}}
}
function hideDlg(){
  if(!dlg.open||dlg.classList.contains("closing"))return;
  if(reduced){dlg.close();return;}
  dlg.classList.add("closing");
  setTimeout(()=>{dlg.classList.remove("closing");dlg.style.transform="";if(dlg.open)dlg.close();},160);
}
function closeDlg(){
  if(!dlg.open)return;
  sheetClosing=true;
  if(history.state&&history.state.sheet){history.back();}else hideDlg();
}
window.addEventListener("popstate",()=>{if(dlg.open)hideDlg();});
dlg.addEventListener("cancel",ev=>{ev.preventDefault();closeDlg();});
let downOut=false;
const outside=e=>{const r=dlg.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
dlg.addEventListener("pointerdown",e=>{downOut=e.target===dlg&&outside(e);});
dlg.addEventListener("click",e=>{const ok=downOut&&e.target===dlg&&outside(e);downOut=false;if(ok)closeDlg();});
dlg.addEventListener("close",()=>{
  if(S.sheet==="edit")commitEdit();
  else if(S.sheet==="tpl")commitTpl();
  else if(S.sheet==="cats")commitCats();
  if(history.state&&history.state.sheet){try{history.back();}catch(e){}}
  S.sheet=null;S.editing=null;S.edit=null;S.editGone=false;S.catDraft=null;S.importData=null;S.tplSrc=null;
  sheet.innerHTML="";sheetClosing=false;
  if(toastEl.parentNode===dlg)placeToast();
});
(function(){/* 손잡이를 아래로 밀어 닫기 */
  let y0=null,dy=0;
  dlg.addEventListener("touchstart",e=>{if(!e.target.closest(".grab"))return;y0=e.touches[0].clientY;dy=0;dlg.style.transition="none";},{passive:true});
  dlg.addEventListener("touchmove",e=>{if(y0==null)return;dy=Math.max(0,e.touches[0].clientY-y0);dlg.style.transform="translateY("+dy+"px)";},{passive:true});
  dlg.addEventListener("touchend",()=>{if(y0==null)return;y0=null;dlg.style.transition="";
    if(dy>80)closeDlg();else dlg.style.transform="";},{passive:true});
})();

/* ---------- 메뉴 ---------- */
function drawMenu(){
  let h='<h2>설정</h2><div class="menu">'+
    '<button type="button" data-act="cats">카테고리 관리<small>순서 · 색 · 소분류 · 보관</small></button>'+
    '<button type="button" data-act="tpls">반복 일정<small>'+(S.tpls.size?[...S.tpls.values()].filter(r=>!tplOff(r)).length+'개 사용 중':'매주 같은 요일에 꺼내 쓰는 할 일')+'</small></button>'+
    (store.push?'<button type="button" data-act="notify">알림<small id="m-notify">'+NSTATE[S.pushState||"..."]+'</small></button>':'')+
    '<button type="button" data-act="export">내보내기<small>백업 텍스트 복사</small></button>'+
    '<button type="button" data-act="import">가져오기<small>백업 텍스트 붙여넣기</small></button>';
  if(store.signOut)h+='<button type="button" data-act="logout">로그아웃<small>'+esc(store.email||"")+'</small></button>';
  h+='</div><p class="ver">또박 '+VERSION+'</p>';
  drawSheet(h);
}
const NSTATE={"on":"이 기기에서 받는 중","off":"이 기기에서 꺼짐","denied":"차단됨","ios-install":"홈 화면 앱에서만 가능","unsupported":"이 브라우저는 지원 안 함","...":"확인 중…"};
function refreshPush(then){if(!store.push)return;store.push.state().then(st=>{S.pushState=st;if(then)then(st);},()=>{});}
function drawNotify(){
  const st=S.pushState||"...";
  const msg={"on":"이 기기에서 알림을 받고 있어요. 할 일마다 '몇 분 전'을 정해 두면 그때 알려줘요.",
    "off":"켜면 할 일마다 정해 둔 시간에 이 기기로 알려줘요. 기기마다 따로 켜야 해요.",
    "denied":"알림이 차단돼 있어요. 폰은 설정 > 애플리케이션 > 또박(또는 Chrome) > 알림에서, PC는 주소창 왼쪽 아이콘 > 알림에서 허용해 주세요.",
    "ios-install":"아이폰은 Safari에서 홈 화면에 추가한 앱으로 열어야 알림을 받을 수 있어요.",
    "unsupported":"이 브라우저는 알림을 지원하지 않아요.","...":"확인 중…"}[st];
  let h='<h2>알림</h2><p>'+msg+'</p><div class="err" id="n-err"></div><div class="actions">';
  if(st==="on")h+='<button class="btn ghost" type="button" data-act="pushoff">이 기기에서 끄기</button><span class="sp"></span><button class="btn pri" type="button" data-act="pushtest">테스트 알림</button>';
  else if(st==="off")h+='<span class="sp"></span><button class="btn pri" type="button" data-act="pushon">이 기기에서 켜기</button>';
  drawSheet(h+'</div>');
}
function tplList(){
  const ci=new Map(S.cats.map((c,i)=>[c.id,i])),first=r=>{const s=sortDays(r.days);return s.length?WEEK.indexOf(s[0]):9;};
  return [...S.tpls.values()].sort((a,b)=>(ci.get(catOf(a).id)-ci.get(catOf(b).id))||(first(a)-first(b))||((a.time||"99")<(b.time||"99")?-1:(a.time||"99")>(b.time||"99")?1:0)||KO.compare(a.title||"",b.title||""));
}
const tplOff=r=>!!(r.archived||(r.until&&r.until<today));
function drawTpls(){
  const list=tplList(),on=list.filter(r=>!tplOff(r)),off=list.filter(tplOff);
  const rowH=r=>{const c=catOf(r);
    const st=r.archived?'보관함':r.until&&r.until<today?'끝남':r.until?'~'+md(r.until).replace(/ \(.\)/,""):'';
    return '<button type="button" class="tplrow'+(c.archived||tplOff(r)?' arc':'')+'" style="--cc:var(--'+c.color+')" data-act="tpl" data-id="'+r.id+'"><span class="dot"></span><span class="nm">'+esc(r.title)+'</span>'+
      '<span class="when">'+daysLabel(r.days)+(r.time?' · '+fmtRange(r.time,r.end):'')+(st?' · '+st:'')+(c.archived?' · 카테고리 보관됨':'')+'</span></button>';};
  let h='<h2>반복 일정</h2><p>정한 요일마다 할 일 목록과 시간표에 흐리게 나타나요. 누르면 그날 할 일로 추가돼요.</p>';
  if(on.length)h+='<div class="tpllist">'+on.map(rowH).join("")+'</div>';
  else h+='<p class="empty">'+(off.length?'쓰고 있는 반복 일정이 없어요':'아직 반복 일정이 없어요. 할 일 편집 화면의 ‘매주 반복 일정으로 만들기’로도 만들 수 있어요')+'</p>';
  if(off.length)h+='<div class="archive"><span class="lbl">보관함 · 끝난 일정 '+off.length+'</span><div class="tpllist">'+off.map(rowH).join("")+'</div></div>';
  h+='<div class="actions"><span class="sp"></span><button class="btn pri" type="button" data-act="tplnew">+ 반복 일정</button></div>';
  drawSheet(h);
}
function exportJSON(){
  return JSON.stringify({app:"ttobak",version:1,exportedAt:new Date().toISOString(),cats:S.cats,tasks:[...S.tasks.values()],tpls:[...S.tpls.values()]});
}
function drawExport(){
  drawSheet('<h2>내보내기</h2><p>할 일 '+S.tasks.size+'개 · 카테고리 '+S.cats.length+'개'+(S.tpls.size?' · 반복 일정 '+S.tpls.size+'개':'')+'. 다른 기기의 가져오기에 붙여넣으면 그대로 옮겨져요.</p>'+
    '<textarea class="inp code" id="x-out" readonly aria-label="내보낸 데이터">'+esc(exportJSON())+'</textarea>'+
    '<div class="actions"><span class="sp"></span><button class="btn pri" type="button" data-act="copy">복사</button></div>');
}
function clean(t){
  const s=v=>typeof v==="string"?v:"";
  return {title:s(t.title).slice(0,500)||"제목 없음",note:s(t.note).slice(0,5000),
    date:DATE_RE.test(t.date)?t.date:null,time:TIME_RE.test(t.time)?t.time:null,
    cat:s(t.cat)||null,sub:s(t.sub)||null,done:!!t.done,doneAt:typeof t.doneAt==="number"?t.doneAt:null,
    createdAt:typeof t.createdAt==="number"?t.createdAt:Date.now(),
    remind:TIME_RE.test(t.time)&&Number.isInteger(t.remind)&&t.remind>=0&&t.remind<=10080?t.remind:null,
    end:TIME_RE.test(t.time)&&okEnd(t.time,t.end)?t.end:null,
    subtasks:Array.isArray(t.subtasks)?t.subtasks.filter(x=>x&&typeof x.t==="string").slice(0,100).map(x=>({id:/^[A-Za-z0-9_-]{1,40}$/.test(x.id)?x.id:uid8("s"),t:x.t.slice(0,300),done:!!x.done})):[],
    ...(typeof t.tpl==="string"&&/^r_[A-Za-z0-9_-]{1,60}$/.test(t.tpl)?{tpl:t.tpl}:{})};
}
function cleanTpl(r){
  const c=clean(r);
  return {title:c.title,note:c.note,time:c.time,end:c.end,remind:c.remind,cat:c.cat,sub:c.sub,createdAt:c.createdAt,
    until:DATE_RE.test(r.until)?r.until:null,archived:!!r.archived,
    days:sortDays((Array.isArray(r.days)?r.days:[]).filter(d=>Number.isInteger(d)&&d>=0&&d<=6)),
    subtasks:c.subtasks.map(x=>({id:x.id,t:x.t,done:false}))};
}
function parseImport(text){
  let d;try{d=JSON.parse(text);}catch(e){return {err:"내보내기 텍스트가 아니에요"};}
  if(!d||!Array.isArray(d.tasks))return {err:"내보내기 텍스트가 아니에요"};
  const tasks=d.tasks.filter(t=>t&&typeof t.id==="string"&&/^t_[A-Za-z0-9_-]{1,60}$/.test(t.id)).map(t=>Object.assign({id:t.id},clean(t)));
  let cats=null;
  if(Array.isArray(d.cats)&&d.cats.length)cats=d.cats.filter(c=>c&&typeof c.id==="string"&&/^[A-Za-z0-9_-]{1,40}$/.test(c.id)).slice(0,40).map(c=>{
    const o={id:c.id,name:String(c.name||"이름 없음").slice(0,24),color:COLORS.includes(c.color)?c.color:"c8",
      subs:Array.isArray(c.subs)?c.subs.filter(s=>s&&typeof s.id==="string"&&/^[A-Za-z0-9_-]{1,40}$/.test(s.id)).slice(0,60).map(s=>({id:s.id,name:String(s.name||"").slice(0,20)||"이름 없음"})):[]};
    if(c.archived)o.archived=true;return o;});
  if(cats&&(!cats.length||cats.every(c=>c.archived)))cats=null;
  const tpls=(Array.isArray(d.tpls)?d.tpls:[]).filter(r=>r&&typeof r.id==="string"&&/^r_[A-Za-z0-9_-]{1,60}$/.test(r.id)).slice(0,200).map(r=>Object.assign({id:r.id},cleanTpl(r)));
  return {tasks,cats,tpls};
}
function drawImport(){
  const d=S.importData;
  drawSheet('<h2>가져오기</h2><p>내보내기로 복사한 텍스트를 붙여넣어 주세요. 같은 할 일은 덮어써요.</p>'+
    '<textarea class="inp code" id="i-in" placeholder="여기에 붙여넣기" aria-label="가져올 데이터"></textarea><div class="err" id="i-err"></div>'+
    (d?'<p id="i-sum">할 일 <b>'+d.tasks.length+'개</b>'+(d.cats?' · 카테고리 <b>'+d.cats.length+'개</b>':'')+(d.tpls.length?' · 반복 일정 <b>'+d.tpls.length+'개</b>':'')+'</p>':'')+
    '<div class="actions"><span class="sp"></span><button class="btn pri" type="button" data-act="'+(d?'importgo':'importcheck')+'">'+(d?'가져오기':'확인')+'</button></div>');
}

/* ---------- 편집 시트 ---------- */
function openEdit(id){
  const t=S.tasks.get(id);if(!t)return;
  const cat=catOf(t);
  S.editing=id;S.editGone=false;
  S.edit={title:t.title,note:t.note||"",date:t.date||"",time:t.time||"",end:okEnd(t.time,t.end)?t.end:"",nodate:!t.date,cat:cat.id,
    sub:subsOf(cat).some(s=>s.id===t.sub)?t.sub:null,subDraft:"",remind:t.remind==null?null:t.remind,
    subtasks:(t.subtasks||[]).map(s=>({id:s.id,t:s.t,done:!!s.done}))};
  openSheet("edit",drawEdit);
}
function syncEdit(){
  const e=S.edit;if(!e)return;
  const g=id=>document.getElementById(id);
  if(g("e-title"))e.title=g("e-title").value;
  if(g("e-note"))e.note=g("e-note").value;
  if(g("e-date"))e.date=g("e-date").value;
  if(g("e-time")){const ti=g("e-time");if(ti.type==="time")e.time=ti.value;else{const p=parseTime(ti.value);e.timeRaw=ti.value;e.timeBad=p===null;if(p!==null)e.time=p;}}
  if(g("e-end")){const ti=g("e-end");if(ti.type==="time")e.end=ti.value;else{const p=parseTime(ti.value);e.endRaw=ti.value;e.endBad=p===null;if(p!==null)e.end=p;}}
  if(g("e-until"))e.until=g("e-until").value;
  if(g("e-nodate"))e.nodate=g("e-nodate").checked;
  e.subtasks.forEach(s=>{const i=g("s-"+s.id),c=g("sc-"+s.id);if(i)s.t=i.value;if(c)s.done=c.checked;});
  const n=g("s-new");if(n)e.subDraft=n.value;
}
/* 반복 템플릿 편집: 할 일 편집 시트를 같이 쓰고, 날짜 대신 요일을 고른다 */
function openTpl(id,seed){
  const r=id?S.tpls.get(id):null;if(id&&!r)return;
  const src=r||seed||{};
  const cat=src.cat&&S.cats.some(c=>c.id===src.cat)?catOf(src):active()[0];
  S.editing=id||null;S.editGone=false;S.tplSrc=seed&&seed.from||null;
  S.edit={tpl:true,title:src.title||"",note:src.note||"",date:"",time:src.time||"",end:okEnd(src.time,src.end)?src.end:"",nodate:false,cat:cat.id,
    until:r&&r.until||"",archived:!!(r&&r.archived),
    sub:subsOf(cat).some(s=>s.id===src.sub)?src.sub:null,subDraft:"",remind:src.remind==null?null:src.remind,
    days:r?sortDays(r.days):[parse(seed&&seed.date||S.sel).getDay()],
    subtasks:(src.subtasks||[]).map(s=>({id:s.id,t:s.t,done:false}))};
  openSheet("tpl",drawEdit);
  if(!id&&!seed){const ti=$("#e-title");if(ti)ti.focus();}
}
function oneTime(id,val,raw,bad,dis,ph,lab,prev){
  if(fine)return '<span class="timebox"><input class="inp" id="'+id+'" type="text" inputmode="numeric" maxlength="5" autocomplete="off" placeholder="'+ph+'" value="'+esc(bad?raw:val)+'" aria-label="'+lab+' (24시간제, 예: 2359)"'+(dis?' disabled':'')+'>'+
    '<span class="tprev'+(bad||prev.bad?' bad':'')+'" id="'+id+'-p">'+(dis?'':bad?'잘못된 시간':prev.text)+'</span></span>';
  return '<input class="inp tm" id="'+id+'" type="time" value="'+esc(val)+'" aria-label="'+lab+'"'+(dis?' disabled':'')+'>';
}
/* 시작 ~ 끝 시간. 끝은 선택이고 시작보다 늦어야 한다 */
function timeInput(e,dis){
  const endWrong=!!(e.time&&e.end&&!e.endBad&&!okEnd(e.time,e.end));
  return '<span class="trange">'+oneTime("e-time",e.time,e.timeRaw,e.timeBad,dis,"0930","시작 시간",{text:e.time?fmtTime(e.time):"24시간제"})+
    '<span class="tilde">~</span>'+oneTime("e-end",e.end,e.endRaw,e.endBad,dis||!e.time,"끝",'끝나는 시간',{text:endWrong?"시작보다 늦게":e.end?fmtTime(e.end):"선택",bad:endWrong})+'</span>'+
    (e.time&&!dis?'<button class="linkish" type="button" data-act="notime">시간 지우기</button>':'')+
    (endWrong&&!fine?'<span class="tbad">끝나는 시간은 시작보다 늦어야 해요</span>':'');
}
function drawEdit(){
  const e=S.edit,cat=S.cats.find(c=>c.id===e.cat)||active()[0],subs=subsOf(cat),tp=!!e.tpl;
  const pick=S.cats.filter(c=>!c.archived||c.id===e.cat);
  let h=(tp?'<p class="eyebrow sheet-eb"><span>'+repSvg+(S.editing?'반복 일정':'새 반복 일정')+'</span></p>':'')+
    '<input class="inp big" id="e-title" type="text" value="'+esc(e.title)+'" placeholder="'+(tp?'매주 할 일 (예: 영어 수업)':'할 일')+'" autocomplete="off" enterkeyhint="done" aria-label="할 일">';
  h+='<div class="field"><span class="lbl">카테고리</span><div class="catpick">'+pick.map(c=>'<button type="button" style="--cc:var(--'+c.color+')" aria-pressed="'+(c.id===e.cat)+'" data-act="ecat" data-cat="'+c.id+'"><i></i>'+esc(c.name)+'</button>').join("")+'</div>';
  if(subs.length)h+='<div class="catpick" style="--cc:var(--'+cat.color+')">'+[{id:"",name:"소분류 없음"}].concat(subs).map(s=>'<button type="button" class="pill" aria-pressed="'+((s.id||null)===e.sub)+'" data-act="esub" data-sub="'+s.id+'">'+esc(s.name)+'</button>').join("")+'</div>';
  h+='</div>';
  if(tp){
    h+='<div class="field"><span class="lbl">매주'+(e.days.length?' · '+daysLabel(e.days):' · 요일을 골라야 목록에 나타나요')+'</span><div class="catpick days" role="group" aria-label="요일">'+
      WEEK.map(d=>'<button type="button" class="pill dw d'+d+'" aria-pressed="'+e.days.includes(d)+'" data-act="eday" data-d="'+d+'">'+DOW[d]+'</button>').join("")+'</div></div>';
    h+='<div class="field"><label for="e-time">시간</label><div class="row">'+timeInput(e,false)+'</div></div>';
    h+='<div class="field"><label for="e-until">끝나는 날'+(e.until?'':' · 비워 두면 계속')+'</label><div class="row"><input class="inp" id="e-until" type="date" value="'+esc(e.until)+'" min="'+today+'" style="max-width:170px">'+
      (e.until?'<button class="linkish" type="button" data-act="nountil">지우기</button>':'')+'</div></div>';
  }else{
    h+='<div class="field"><label for="e-date">날짜·시간</label><div class="row">'+
      '<input class="inp" id="e-date" type="date" value="'+esc(e.date||S.sel)+'" style="max-width:170px"'+(e.nodate?' disabled':'')+'>'+
      '<label class="opt"><input type="checkbox" id="e-nodate" data-act="nodate"'+(e.nodate?' checked':'')+'>날짜 없음</label></div>'+
      '<div class="row">'+timeInput(e,e.nodate)+'</div></div>';
  }
  if(store.push){
    const can=!e.nodate&&!!e.time&&!e.timeBad;
    h+='<div class="field"><span class="lbl">알림'+(can?'':' · 시간을 정하면 켤 수 있어요')+'</span><div class="catpick remind">'+REMIND.map(r=>'<button type="button" class="pill" aria-pressed="'+(can&&e.remind===r[0]||(!can&&r[0]===null))+'" data-act="eremind" data-m="'+(r[0]==null?"":r[0])+'"'+(can?'':' disabled')+'>'+r[1]+'</button>').join("")+'</div></div>';
  }
  if(!tp){
    const t=S.tasks.get(S.editing),r=t&&t.tpl&&S.tpls.get(t.tpl);
    h+='<div class="field"><span class="lbl">반복</span><div class="row"><button class="repbtn" type="button" data-act="tplfrom">'+repSvg+
      (r?'매주 '+daysLabel(r.days)+' 반복 일정 수정':'매주 반복 일정으로 만들기')+'</button></div></div>';
  }
  h+='<div class="field"><span class="lbl">세부 할 일</span><ul class="subs'+(tp?' plain':'')+'">'+e.subtasks.map(s=>{const i=esc(s.id);return '<li id="sl-'+i+'">'+(tp?'':'<input type="checkbox" id="sc-'+i+'"'+(s.done?' checked':'')+' aria-label="완료">')+'<input type="text" id="s-'+i+'" value="'+esc(s.t)+'" aria-label="세부 할 일"><button class="x" type="button" data-act="subdel" data-sid="'+i+'" aria-label="지우기">×</button></li>';}).join("")+
    '<li class="new"><input class="field-soft" type="text" id="s-new" value="'+esc(e.subDraft||"")+'" placeholder="세부 할 일 추가" autocomplete="off" enterkeyhint="done"></li></ul></div>';
  h+='<div class="field"><label for="e-note">메모</label><textarea class="inp" id="e-note" placeholder="메모">'+esc(e.note)+'</textarea></div>';
  if(tp){
    const ended=!!(e.until&&e.until<today);
    h+='<p class="tnote">'+(e.archived?'보관한 반복 일정이에요. 복원하면 다시 나타나요':ended?'끝난 반복 일정이에요':'고쳐도 이미 추가한 할 일은 그대로예요')+'</p><div class="actions">'+
      (S.editing?'<button class="btn dng" type="button" data-act="tpldel">삭제</button><button class="btn sec" type="button" data-act="'+(e.archived||ended?'tplunarc':'tplarc')+'">'+(e.archived||ended?'복원':'보관')+'</button>':'<button class="btn ghost" type="button" data-act="tplcancel">취소</button>')+
      '<span class="sp"></span><button class="btn pri" type="button" data-act="close">'+(S.editing?'완료':'저장')+'</button></div>';
  }
  else h+='<div class="actions"><button class="btn dng" type="button" data-act="del">삭제</button><button class="btn sec" type="button" data-act="tomorrow">내일로</button><span class="sp"></span><button class="btn pri" type="button" data-act="close">완료</button></div>';
  drawSheet(h);
}
const norm=t=>({title:t.title||"",note:t.note||"",date:t.date||null,time:t.time||null,end:t.end||null,remind:t.remind==null?null:t.remind,cat:t.cat||null,sub:t.sub||null,
  subtasks:(t.subtasks||[]).map(s=>({id:s.id,t:s.t,done:!!s.done}))});
function commitEdit(){
  syncEdit();const e=S.edit,id=S.editing,t=id&&S.tasks.get(id);
  if(!e||!t||S.editGone)return;
  const subtasks=e.subtasks.filter(s=>s.t.trim()).map(s=>({id:s.id,t:s.t.trim(),done:!!s.done}));
  if(e.subDraft&&e.subDraft.trim())subtasks.push({id:uid8("s"),t:e.subDraft.trim(),done:false});
  const date=e.nodate?null:(e.date||null);
  const tm=e.timeBad?(t.time||""):e.time;
  const time=date&&tm?tm:null;
  const en=e.endBad?(t.end||""):e.end;
  const next={title:e.title.trim()||t.title,note:e.note.trim(),date,time,end:okEnd(time,en)?en:null,remind:time&&e.remind!=null?e.remind:null,cat:e.cat,sub:e.sub||null,subtasks};
  if(JSON.stringify(norm(t))!==JSON.stringify(next))patchTask(id,next);
}
const normTpl=r=>({title:r.title||"",note:r.note||"",time:r.time||null,end:r.end||null,until:r.until||null,archived:!!r.archived,remind:r.remind==null?null:r.remind,cat:r.cat||null,sub:r.sub||null,
  days:sortDays(r.days),subtasks:(r.subtasks||[]).map(s=>({id:s.id,t:s.t}))});
function commitTpl(){
  syncEdit();const e=S.edit,id=S.editing,old=id&&S.tpls.get(id);
  if(!e||S.editGone||(id&&!old))return;
  const title=e.title.trim()||(old?old.title:"");
  if(!title)return;
  const subtasks=e.subtasks.filter(s=>s.t.trim()).map(s=>({id:s.id,t:s.t.trim()}));
  if(e.subDraft&&e.subDraft.trim())subtasks.push({id:uid8("s"),t:e.subDraft.trim()});
  const time=(e.timeBad?(old&&old.time)||"":e.time)||null;
  const en=e.endBad?(old&&old.end)||"":e.end;
  const body={title,note:e.note.trim(),time,end:okEnd(time,en)?en:null,until:DATE_RE.test(e.until)?e.until:null,archived:!!e.archived,
    remind:time&&e.remind!=null?e.remind:null,cat:e.cat,sub:e.sub||null,days:sortDays(e.days),subtasks};
  if(old){if(JSON.stringify(normTpl(old))!==JSON.stringify(body))patchTask(id,body);return;}
  const nid=uid8("r_");
  setTask(nid,Object.assign(body,{createdAt:Date.now()}));
  const src=S.tplSrc&&S.tasks.get(S.tplSrc);
  if(src&&!src.tpl)patchTask(src.id,{tpl:nid});
  toast(body.days.length?"매주 "+daysLabel(body.days)+"에 나타나요":"반복 일정을 저장했어요");
}
function addFromTpl(id,k){
  const r=S.tpls.get(id);if(!r)return null;
  const nid=uid8("t_");
  setTask(nid,{title:r.title,note:r.note||"",date:k,time:r.time||null,end:okEnd(r.time,r.end)?r.end:null,remind:r.time&&r.remind!=null?r.remind:null,
    cat:r.cat,sub:r.sub||null,done:false,doneAt:null,createdAt:Date.now(),
    subtasks:(r.subtasks||[]).map(s=>({id:uid8("s"),t:s.t,done:false})),tpl:r.id});
  return nid;
}

/* ---------- 카테고리 관리 시트 ---------- */
const upSvg='<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3.5 8.5L7 5l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const dnSvg='<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3.5 5.5L7 9l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function openCats(){S.catDraft=S.cats.map(c=>({id:c.id,name:c.name,color:c.color,archived:!!c.archived,subs:subsOf(c).map(s=>({id:s.id,name:s.name})),subNew:""}));S.catDelArm=null;S.catMoved=null;openSheet("cats",drawCats);}
function syncCats(){(S.catDraft||[]).forEach(c=>{const i=document.getElementById("cn-"+c.id);if(i)c.name=i.value;c.subs.forEach(s=>{const j=document.getElementById("sn-"+s.id);if(j)s.name=j.value;});const n=document.getElementById("snew-"+c.id);if(n)c.subNew=n.value;});}
function drawCats(){
  const counts={};for(const t of S.tasks.values()){const k=t.cat;counts[k]=(counts[k]||0)+1;}
  const act=S.catDraft.filter(c=>!c.archived),arc=S.catDraft.filter(c=>c.archived);
  const firstName=act[0]?act[0].name||"첫 카테고리":"";
  const delBtn=c=>'<button class="btn dng sm'+(S.catDelArm===c.id?' armed':'')+'" type="button" data-act="catdel" data-cat="'+c.id+'">'+(S.catDelArm===c.id?'삭제 확인':'삭제')+'</button>';
  const delNote=c=>S.catDelArm===c.id&&counts[c.id]?'<p class="note">할 일 '+counts[c.id]+'개는 \''+esc(firstName)+'\'(으)로 옮겨져요</p>':'';
  let h='<h2>카테고리 관리</h2><p>소분류는 할 일 옆에 태그로 표시돼요</p><div class="catlist">';
  h+=act.map((c,i)=>'<div class="catrow'+(S.catMoved===c.id?' moved':'')+'" id="cr-'+c.id+'" style="--cc:var(--'+c.color+')">'+
    '<div class="row"><input class="inp" id="cn-'+c.id+'" type="text" value="'+esc(c.name)+'" placeholder="카테고리 이름" aria-label="카테고리 이름" maxlength="24">'+
      '<button class="x mv" type="button" data-act="catup" data-cat="'+c.id+'" aria-label="위로"'+(i===0?' disabled':'')+'>'+upSvg+'</button>'+
      '<button class="x mv" type="button" data-act="catdown" data-cat="'+c.id+'" aria-label="아래로"'+(i===act.length-1?' disabled':'')+'>'+dnSvg+'</button></div>'+
    '<div class="sw" role="group" aria-label="색">'+COLORS.map(k=>'<button type="button" style="--cc:var(--'+k+')" aria-pressed="'+(k===c.color)+'" aria-label="색 '+k.slice(1)+'" data-act="catcolor" data-cat="'+c.id+'" data-color="'+k+'"></button>').join("")+'</div>'+
    '<div class="subl">'+(c.subs.length?'<span class="lbl">소분류</span>':'')+c.subs.map((s,j)=>'<span class="subitem'+(S.subMoved===s.id?' moved':'')+'" id="si-'+s.id+'"><input id="sn-'+s.id+'" type="text" value="'+esc(s.name)+'" aria-label="소분류 이름" maxlength="20">'+
      (c.subs.length>1?'<button class="x mv" type="button" data-act="subup" data-cat="'+c.id+'" data-sub="'+s.id+'" aria-label="위로"'+(j===0?' disabled':'')+'>'+upSvg+'</button><button class="x mv" type="button" data-act="subdown" data-cat="'+c.id+'" data-sub="'+s.id+'" aria-label="아래로"'+(j===c.subs.length-1?' disabled':'')+'>'+dnSvg+'</button>':'')+
      '<button class="x" type="button" data-act="subrm" data-cat="'+c.id+'" data-sub="'+s.id+'" aria-label="소분류 지우기">×</button></span>').join("")+
      '<input class="subnew" id="snew-'+c.id+'" data-cat="'+c.id+'" type="text" value="'+esc(c.subNew||"")+'" placeholder="+ 소분류" maxlength="20" autocomplete="off" enterkeyhint="done"></div>'+
    (act.length>1?'<div class="rowacts"><button class="btn ghost sm" type="button" data-act="catarc" data-cat="'+c.id+'">보관</button>'+delBtn(c)+'</div>'+delNote(c):'')+
    '</div>').join("");
  h+='</div>';
  if(arc.length){
    h+='<div class="archive"><span class="lbl">보관함 '+arc.length+'</span>'+arc.map(c=>'<div class="arcrow" id="ar-'+c.id+'" style="--cc:var(--'+c.color+')"><span class="dot"></span><span class="nm">'+esc(c.name||"이름 없음")+'</span>'+
      '<span class="cnt">'+(counts[c.id]?counts[c.id]+'개':'')+'</span>'+
      '<button class="btn ghost sm" type="button" data-act="catunarc" data-cat="'+c.id+'">복원</button>'+delBtn(c)+'</div>'+delNote(c)).join("")+'</div>';
  }
  h+='<div class="actions"><button class="btn sec" type="button" data-act="catadd">+ 카테고리</button><span class="sp"></span><button class="btn pri" type="button" data-act="close">완료</button></div>';
  drawSheet(h);
  if(S.subMoved){const id=S.subMoved;S.subMoved=null;setTimeout(()=>{const r=document.getElementById("si-"+id);if(r)r.classList.remove("moved");},500);}
  if(S.catMoved){const id=S.catMoved;S.catMoved=null;setTimeout(()=>{const r=document.getElementById("cr-"+id)||document.getElementById("ar-"+id);if(r)r.classList.remove("moved");},500);}
}
function moveCat(id,dir){
  const d=S.catDraft,act=d.filter(c=>!c.archived),i=act.findIndex(c=>c.id===id),j=i+dir;
  if(i<0||j<0||j>=act.length)return;
  const a=d.indexOf(act[i]),b=d.indexOf(act[j]);[d[a],d[b]]=[d[b],d[a]];
  S.catMoved=id;
}
function commitCats(){
  if(!S.catDraft)return;
  syncCats();
  const cats=S.catDraft.map(c=>{
    const subs=c.subs.filter(s=>s.name.trim()).map(s=>({id:s.id,name:s.name.trim()}));
    if(c.subNew&&c.subNew.trim())subs.push({id:uid8("b"),name:c.subNew.trim()});
    const o={id:c.id,name:c.name.trim()||"이름 없음",color:c.color,subs};if(c.archived)o.archived=true;return o;
  });
  const shape=list=>JSON.stringify(list.map(c=>({id:c.id,name:c.name,color:c.color,archived:!!c.archived,subs:subsOf(c).map(s=>({id:s.id,name:s.name}))})));
  if(shape(S.cats)===shape(cats))return;
  const byId=new Map(cats.map(c=>[c.id,c])),first=cats.find(c=>!c.archived)||cats[0];
  for(const t of S.tasks.values()){
    const cat=byId.get(t.cat)||first;
    const sub=t.sub&&cat.subs.some(s=>s.id===t.sub)?t.sub:null;
    if(cat.id!==t.cat||sub!==(t.sub||null))patchTask(t.id,{cat:cat.id,sub});
  }
  for(const r of S.tpls.values()){
    const cat=byId.get(r.cat)||first;
    const sub=r.sub&&cat.subs.some(s=>s.id===r.sub)?r.sub:null;
    if(cat.id!==r.cat||sub!==(r.sub||null))patchTask(r.id,{cat:cat.id,sub});
  }
  saveCats(cats);
}

/* ---------- 이벤트 ---------- */
document.addEventListener("mousedown",ev=>{if(ev.target.closest&&ev.target.closest("[data-keep]"))ev.preventDefault();});
document.addEventListener("click",ev=>{
  const b=ev.target.closest&&ev.target.closest("[data-act]");if(!b||b.disabled)return;
  const a=b.dataset.act;
  if(S.mode==="loading"&&/^(add|toggle|edit|menu|carry|tpl|tpladd|tpladdw)$/.test(a))return;
  switch(a){
    case"view":{const v=b.dataset.v;if(v==="week"&&S.view!=="week")S.week=weekStart(S.sel);S.view=v;pref.set("view",v);S.adding=null;window.scrollTo(0,0);render();break;}
    case"wnav":S.week=addDays(S.week||weekStart(S.sel),7*(+b.dataset.d));S.calDir=+b.dataset.d;render();break;
    case"wtoday":{const w=weekStart(today);S.calDir=w>S.week?1:-1;S.week=w;render();break;}
    case"goday":S.sel=b.dataset.k;S.cursor=b.dataset.k;S.view="day";pref.set("view","day");S.adding=null;window.scrollTo(0,0);render();break;
    case"addcat":S.addCat=b.dataset.cat;S.addSub=S.lastSub[S.addCat]||null;render();{const i=$("#add-all");if(i&&document.activeElement!==i)i.focus();}break;
    case"adddate":S.addDate=b.dataset.k;render();{const i=$("#add-all");if(i&&document.activeElement!==i)i.focus();}break;
    case"tpladdw":{const nid=addFromTpl(b.dataset.id,b.dataset.k);if(!nid)break;
      toast((relWord(b.dataset.k)||md(b.dataset.k))+"에 추가했어요",nid?{label:"되돌리기",fn:()=>delTask(nid)}:null);break;}
    case"tplarc":syncEdit();S.edit.archived=true;closeDlg();toast("반복 일정을 보관했어요");break;
    case"tplunarc":syncEdit();S.edit.archived=false;if(S.edit.until&&S.edit.until<today)S.edit.until="";closeDlg();toast("반복 일정을 복원했어요");break;
    case"nountil":{syncEdit();S.edit.until="";const u=$("#e-until");if(u)u.value="";drawEdit();break;}
    case"pick":S.sel=b.dataset.k;S.cursor=b.dataset.k;S.adding=null;render();break;
    case"today":{const d=S.cursor<today?1:S.cursor>today?-1:0;S.sel=today;S.cursor=today;S.calDir=d;render();break;}
    case"nav":navCal(+b.dataset.d);break;
    case"calmode":S.calMode=S.calMode==="month"?"week":"month";S.cursor=S.sel;pref.set("calMode",S.calMode);render();break;
    case"add":{const cat=b.dataset.cat;if(S.adding===cat){const i=document.getElementById("add-"+cat);if(i)i.focus();break;}S.adding=cat;S.addDraft="";
      if(cat==="all"){const c=S.cats.find(x=>x.id===S.addCat&&!x.archived)||active()[0];S.addCat=c.id;S.addSub=S.lastSub[c.id]||null;if(S.addDate==null)S.addDate="";}
      else S.addSub=S.lastSub[cat]||null;
      S.focusAdd=true;render();break;}
    case"addsub":S.addSub=b.dataset.sub||null;S.lastSub[S.adding==="all"?S.addCat:S.adding]=S.addSub;render();{const i=document.getElementById("add-"+S.adding);if(i&&document.activeElement!==i)i.focus();}break;
    case"toggle":{const t=S.tasks.get(b.dataset.id);if(!t)break;const done=!t.done;
      b.setAttribute("aria-checked",done);const li=b.closest(".task");if(li)li.classList.toggle("done",done);
      if(done&&!reduced){b.classList.add("pop");setTimeout(()=>b.classList.remove("pop"),320);}
      if(done&&navigator.vibrate)try{navigator.vibrate(8);}catch(e){}
      patchTask(t.id,{done,doneAt:done?Date.now():null});break;}
    case"edit":openEdit(b.dataset.id);break;
    case"carry":{let n=0;for(const t of visibleTasks())if(t.date&&t.date<today&&!t.done){patchTask(t.id,{date:today});n++;}toast(n+"개를 오늘로 옮겼어요");break;}
    case"showdone":S.showDone=!S.showDone;render();break;
    case"menu":openSheet("menu",drawMenu);refreshPush(()=>{if(S.sheet==="menu")drawMenu();});break;
    case"notify":openSheet("notify",drawNotify);refreshPush(()=>{if(S.sheet==="notify")drawNotify();});break;
    case"pushon":{b.disabled=true;b.textContent="켜는 중…";store.push.enable().then(()=>{S.pushState="on";if(S.sheet==="notify")drawNotify();toast("알림을 켰어요");},
      e=>{const c=e&&e.code;refreshPush(()=>{if(S.sheet==="notify"){drawNotify();const er=$("#n-err");if(er&&c!=="denied")er.textContent=c==="dismissed"?"알림 허용을 눌러야 켜져요":"켜지 못했어요. 인터넷 연결을 확인해 주세요";}});});break;}
    case"pushoff":{b.disabled=true;store.push.disable().then(()=>{S.pushState="off";if(S.sheet==="notify")drawNotify();toast("이 기기 알림을 껐어요");},()=>{b.disabled=false;});break;}
    case"pushtest":{b.disabled=true;b.textContent="보내는 중…";store.push.test().then(r=>{b.disabled=false;b.textContent="테스트 알림";toast(r&&r.sent?"보냈어요. 곧 알림이 와요":"보내지 못했어요. 끄고 다시 켜 주세요");},
      ()=>{b.disabled=false;b.textContent="테스트 알림";toast("보내지 못했어요. 인터넷 연결을 확인해 주세요");});break;}
    case"eremind":{syncEdit();S.edit.remind=b.dataset.m===""?null:+b.dataset.m;drawEdit();
      if(S.edit.remind!=null)refreshPush(st=>{if(st!=="on")toast(st==="off"?"이 기기는 알림이 꺼져 있어요":"이 기기에서는 알림을 받을 수 없어요",st==="off"?{label:"켜기",fn:()=>{openSheet("notify",drawNotify);}}:null);});break;}
    case"cats":openCats();break;
    case"tpls":openSheet("tpls",drawTpls);break;
    case"tplnew":openTpl(null,null);break;
    case"tpl":{const id=b.dataset.id;if(S.sheet==="tpls"||!dlg.open)openTpl(id);break;}
    case"tpladd":{const li=b.closest(".task");if(li)li.classList.add("adding");
      if(navigator.vibrate)try{navigator.vibrate(8);}catch(e){}
      addFromTpl(b.dataset.id,b.dataset.k);break;}
    case"tplfrom":{syncEdit();const t=S.tasks.get(S.editing),e=S.edit;if(!t)break;
      commitEdit();
      if(t.tpl&&S.tpls.has(t.tpl)){openTpl(t.tpl);break;}
      openTpl(null,{title:e.title.trim()||t.title,note:e.note,time:e.timeBad?(t.time||""):e.time,remind:e.remind,cat:e.cat,sub:e.sub,
        subtasks:e.subtasks.filter(s=>s.t.trim()),date:(!e.nodate&&e.date)||S.sel,from:t.id});break;}
    case"eday":{syncEdit();const d=+b.dataset.d,ds=S.edit.days;S.edit.days=ds.includes(d)?ds.filter(x=>x!==d):sortDays(ds.concat(d));drawEdit();break;}
    case"tpldel":{const id=S.editing,r=S.tpls.get(id);S.editGone=true;closeDlg();if(!r)break;
      const body=Object.assign({},r);delete body.id;delTask(id);
      toast("반복 일정을 지웠어요",{label:"되돌리기",fn:()=>setTask(id,body)});break;}
    case"tplcancel":S.editGone=true;closeDlg();break;
    case"export":openSheet("export",drawExport);break;
    case"copy":{const ta=$("#x-out");const sel=()=>{ta.focus();ta.select();toast("길게 눌러 복사해 주세요");};
      try{navigator.clipboard.writeText(ta.value).then(()=>toast("복사했어요"),sel);}catch(e){sel();}break;}
    case"import":S.importData=null;openSheet("import",drawImport);break;
    case"importcheck":{const txt=$("#i-in").value;const r=parseImport(txt);if(r.err){$("#i-err").textContent=r.err;break;}
      if(!r.tasks.length&&!r.cats&&!r.tpls.length){$("#i-err").textContent="가져올 할 일이 없어요";break;}
      S.importData=r;drawImport();break;}
    case"importgo":{const d=S.importData;if(!d)break;b.disabled=true;b.textContent="가져오는 중…";
      store.importAll(d).then(n=>{closeDlg();toast(n+"개를 가져왔어요");},e=>{onError(e);b.disabled=false;b.textContent="가져오기";});break;}
    case"logout":S.sheet=null;closeDlg();store.signOut();break;
    case"close":closeDlg();break;
    case"ecat":syncEdit();if(S.edit.cat!==b.dataset.cat){S.edit.cat=b.dataset.cat;S.edit.sub=null;}drawEdit();break;
    case"esub":syncEdit();S.edit.sub=b.dataset.sub||null;drawEdit();break;
    case"nodate":syncEdit();drawEdit();break;
    case"notime":{syncEdit();Object.assign(S.edit,{time:"",timeBad:false,end:"",endBad:false});for(const id of ["#e-time","#e-end"]){const ti=$(id);if(ti)ti.value="";}drawEdit();break;}
    case"subdel":syncEdit();S.edit.subtasks=S.edit.subtasks.filter(s=>s.id!==b.dataset.sid);drawEdit();break;
    case"del":{const id=S.editing;S.editGone=true;closeDlg();removeWithUndo(id);break;}
    case"tomorrow":{syncEdit();const base=(!S.edit.nodate&&S.edit.date)||today;const nd=addDays(base,1);S.edit.nodate=false;S.edit.date=nd;
      const de=$("#e-date");if(de){de.disabled=false;de.value=nd;}const nc=$("#e-nodate");if(nc)nc.checked=false;
      closeDlg();toast((relWord(nd)||md(nd))+"로 미뤘어요");break;}
    case"catcolor":syncCats();S.catDraft.find(c=>c.id===b.dataset.cat).color=b.dataset.color;drawCats();break;
    case"catup":case"catdown":syncCats();moveCat(b.dataset.cat,a==="catup"?-1:1);drawCats();break;
    case"catarc":{syncCats();S.catDelArm=null;const c=S.catDraft.find(x=>x.id===b.dataset.cat);if(S.catDraft.filter(x=>!x.archived).length>1)c.archived=true;drawCats();break;}
    case"catunarc":{syncCats();S.catDelArm=null;const c=S.catDraft.find(x=>x.id===b.dataset.cat);c.archived=false;
      S.catDraft=S.catDraft.filter(x=>x!==c);const lastAct=S.catDraft.reduce((k,x,i)=>x.archived?k:i,-1);S.catDraft.splice(lastAct+1,0,c);S.catMoved=c.id;drawCats();break;}
    case"catdel":syncCats();if(S.catDelArm!==b.dataset.cat){S.catDelArm=b.dataset.cat;}else{S.catDraft=S.catDraft.filter(c=>c.id!==b.dataset.cat);S.catDelArm=null;}drawCats();break;
    case"subup":case"subdown":{syncCats();const c=S.catDraft.find(x=>x.id===b.dataset.cat),i=c.subs.findIndex(x=>x.id===b.dataset.sub),j=i+(a==="subup"?-1:1);
      if(i>=0&&j>=0&&j<c.subs.length){[c.subs[i],c.subs[j]]=[c.subs[j],c.subs[i]];S.subMoved=b.dataset.sub;}drawCats();break;}
    case"subrm":{syncCats();const c=S.catDraft.find(x=>x.id===b.dataset.cat);c.subs=c.subs.filter(s=>s.id!==b.dataset.sub);drawCats();break;}
    case"catadd":{syncCats();const used=new Set(S.catDraft.map(c=>c.color));const color=COLORS.find(c=>!used.has(c))||COLORS[S.catDraft.length%8];const id=uid8("k");
      const lastAct=S.catDraft.reduce((k,x,i)=>x.archived?k:i,-1);S.catDraft.splice(lastAct+1,0,{id,name:"",color,subs:[],subNew:"",archived:false});drawCats();const i=document.getElementById("cn-"+id);if(i)i.focus();break;}
  }
});
/* 시간·날짜를 고르면 바로 반영 (시간 지우기 버튼 등) */
const editing=()=>S.sheet==="edit"||S.sheet==="tpl";
document.addEventListener("change",ev=>{const id=ev.target.id;if(editing()&&(id==="e-time"||id==="e-end"||id==="e-date"||id==="e-until")){syncEdit();drawEdit();
  if(id==="e-time"&&ev.target.type==="text"&&!S.edit.timeBad)ev.target.value=S.edit.time;
  if(id==="e-end"&&ev.target.type==="text"&&!S.edit.endBad)ev.target.value=S.edit.end;}});
document.addEventListener("input",ev=>{
  const el=ev.target;
  if(el.matches&&el.matches(".addrow input"))S.addDraft=el.value;
  else if(editing()&&(el.id==="e-time"||el.id==="e-end")){syncEdit();drawEdit();}
  else if(el.id==="q"){S.query=el.value;render();}
});
function navCal(d){
  if(S.calMode==="month"){const c=parse(S.cursor);S.cursor=keyOf(new Date(c.getFullYear(),c.getMonth()+d,1));}
  else{S.cursor=addDays(S.cursor,7*d);S.sel=addDays(S.sel,7*d);}
  S.calDir=d;render();
}
/* 시간표 좌우로 밀어서 주 넘기기 */
(function(){
  let x0=null,y0=0;const m=$("#main");
  m.addEventListener("touchstart",e=>{if(S.view!=="week"||!e.target.closest(".tt")){x0=null;return;}const t=e.touches[0];x0=t.clientX;y0=t.clientY;},{passive:true});
  m.addEventListener("touchend",e=>{if(x0==null)return;const t=e.changedTouches[0],dx=t.clientX-x0,dy=t.clientY-y0;x0=null;
    if(Math.abs(dx)>56&&Math.abs(dy)<40){const d=dx<0?1:-1;S.week=addDays(S.week||weekStart(S.sel),7*d);S.calDir=d;render();}},{passive:true});
})();
/* 달력 좌우로 밀어서 넘기기 */
(function(){
  let x0=null,y0=0;
  const cal=$("#cal");
  cal.addEventListener("touchstart",e=>{const t=e.touches[0];x0=t.clientX;y0=t.clientY;},{passive:true});
  cal.addEventListener("touchend",e=>{if(x0==null)return;const t=e.changedTouches[0],dx=t.clientX-x0,dy=t.clientY-y0;x0=null;
    if(Math.abs(dx)>48&&Math.abs(dy)<40)navCal(dx<0?1:-1);},{passive:true});
})();
document.addEventListener("submit",ev=>{
  if(ev.target.id!=="loginForm")return;
  ev.preventDefault();
  const email=$("#l-email").value.trim(),pw=$("#l-pw").value,err=$("#l-err"),btn=$("#l-btn");
  if(!email||!pw){err.textContent="이메일과 비밀번호를 입력해 주세요";return;}
  btn.disabled=true;btn.textContent="로그인 중…";err.textContent="";
  store.signIn(email,pw).catch(e=>{
    const c=e&&e.code||"";
    err.textContent=c.includes("invalid-credential")||c.includes("wrong-password")||c.includes("user-not-found")||c.includes("invalid-email")?"이메일 또는 비밀번호가 틀렸어요"
      :c.includes("too-many-requests")?"잠시 후 다시 시도해 주세요"
      :c.includes("network")?"인터넷 연결을 확인해 주세요":"로그인하지 못했어요 ("+c+")";
    btn.disabled=false;btn.textContent="로그인";
  });
});

/* 엔터 처리: 한글 조합 중 엔터는 조합이 끝난 뒤 한 번만 처리한다(안드로이드 키보드 대응) */
let pendingEnter=null;
function handleEnter(el){
  if(el.id==="add-all"){const v=el.value.trim();if(!v)return;addTask(S.addCat,S.addSub,v,S.addDate||null);S.addDraft="";el.value="";
    const dk=S.addDate||"none";toast((S.addDate?(relWord(S.addDate)||md(S.addDate)):"날짜 없음")+"에 추가했어요");setTimeout(()=>{const sec=document.getElementById("ds-"+dk);if(sec&&sec.scrollIntoView)sec.scrollIntoView({block:"nearest"});},60);}
  else if(el.matches(".addrow input")){addTask(el.dataset.cat,S.addSub,el.value,S.view==="day"?S.sel:null);S.addDraft="";el.value="";}
  else if(el.id==="e-title"){closeDlg();}
  else if(el.id==="e-time"||el.id==="e-end"){syncEdit();if(S.edit.timeBad||S.edit.endBad){drawEdit();return;}if(el.id==="e-time")el.value=S.edit.time;else el.value=S.edit.end;closeDlg();}
  else if(el.id==="s-new"){const v=el.value.trim();if(!v)return;syncEdit();S.edit.subtasks.push({id:uid8("s"),t:v,done:false});S.edit.subDraft="";el.value="";drawEdit();}
  else if(el.matches(".subnew")){const v=el.value.trim();if(!v)return;syncCats();const c=S.catDraft.find(x=>x.id===el.dataset.cat);c.subs.push({id:uid8("b"),name:v});c.subNew="";el.value="";drawCats();}
}
const enterTarget=el=>el.matches&&(el.matches(".addrow input,.subnew")||el.id==="e-title"||el.id==="s-new"||((el.id==="e-time"||el.id==="e-end")&&el.type==="text"));
document.addEventListener("keydown",ev=>{
  const el=ev.target;if(!enterTarget(el)){return;}
  if(ev.key==="Escape"&&el.matches(".addrow input")){ev.preventDefault();S.adding=null;render();return;}
  if(ev.key!=="Enter"&&ev.keyCode!==13)return;
  if(ev.isComposing||ev.keyCode===229){pendingEnter=el;return;}
  ev.preventDefault();pendingEnter=null;handleEnter(el);
});
document.addEventListener("compositionend",ev=>{
  const el=ev.target;if(pendingEnter!==el)return;
  setTimeout(()=>{if(pendingEnter===el){pendingEnter=null;handleEnter(el);}},40);
});
document.addEventListener("focusout",ev=>{
  const el=ev.target;
  if(el.matches&&el.matches(".addrow input")){
    setTimeout(()=>{const a=document.activeElement;if(S.adding===el.dataset.cat&&!(a&&a.matches&&a.matches(".addrow input"))&&!S.addDraft.trim()){S.adding=null;render();}},200);
  }
});

/* 알림 문구: 시트가 열려 있으면 시트 안(최상단 레이어)에 띄워서 가려지거나 눌리지 않는 일이 없게 한다 */
let tt;
const toastEl=$("#toast"),canPop=typeof toastEl.showPopover==="function";
function hideToast(){toastEl.hidden=true;if(canPop)try{toastEl.hidePopover();}catch(e){}}
function placeToast(){
  const host=dlg.open&&!sheetClosing?dlg:document.body;
  if(toastEl.parentNode!==host)host.appendChild(toastEl);
  if(canPop){try{toastEl.hidePopover();}catch(e){}if(!toastEl.hidden)try{toastEl.showPopover();}catch(e){}}
}
function toast(msg,action){
  const t=toastEl,b=$("#toastAct");
  $("#toastMsg").textContent=msg;
  b.hidden=!action;t.classList.toggle("has-act",!!action);
  b.onclick=action?()=>{hideToast();action.fn();}:null;
  if(action)b.textContent=action.label;
  t.hidden=true;void t.offsetWidth;t.hidden=false;placeToast();
  clearTimeout(tt);tt=setTimeout(hideToast,action?5000:2400);
}

function openDate(u){
  const m=/#d=(\d{4}-\d{2}-\d{2})/.exec(u||"");if(!m)return;
  S.view="day";S.sel=m[1];S.cursor=m[1];S.calDir=0;if(dlg.open)closeDlg();render();
  try{history.replaceState(history.state,"",location.pathname+location.search);}catch(e){}
}
if(navigator.serviceWorker)navigator.serviceWorker.addEventListener("message",e=>{if(e.data&&e.data.type==="open")openDate(e.data.url);});
function tick(){const k=keyOf(new Date());if(k!==today){if(S.sel===today){S.sel=k;S.cursor=k;}today=k;render();}else if(S.view==="week"&&!document.hidden&&S.mode==="live")render();}
document.addEventListener("visibilitychange",()=>{if(!document.hidden)tick();});
setInterval(tick,60000);

/* ---------- 메모리 저장소 (테스트용) ---------- */
function memoryStore(){
  const tasks=new Map();let cats=null,cb=null;
  const emit=()=>{if(!cb)return;const t=new Map(),r=new Map();for(const [k,v] of tasks)(k.startsWith("r_")?r:t).set(k,v);cb.onData({tasks:t,cats,tpls:r});};
  return {kind:"memory",
    start(c){cb=c;cb.onStatus("local");emit();},
    set(id,b){tasks.set(id,Object.assign({id},b));emit();return Promise.resolve();},
    update(id,p){const t=tasks.get(id);if(t)tasks.set(id,Object.assign({},t,p));emit();return Promise.resolve();},
    remove(id){tasks.delete(id);emit();return Promise.resolve();},
    saveCats(c){cats=c;emit();return Promise.resolve();},
    importAll(d){if(d.cats)cats=d.cats;d.tasks.concat(d.tpls||[]).forEach(t=>{const b=Object.assign({},t);delete b.id;tasks.set(t.id,Object.assign({id:t.id},b));});emit();return Promise.resolve(d.tasks.length);}};
}

window.TodoApp={
  memoryStore,
  boot(s){
    store=s;
    render();
    store.start({
      onData(d){S.tasks=d.tasks;S.tpls=d.tpls instanceof Map?d.tpls:new Map();if(Array.isArray(d.cats)&&d.cats.length)S.cats=d.cats;if(S.mode==="signedout"||S.mode==="config")return;render();},
      onStatus(m){if(m===S.mode)return;if(m==="live")setTimeout(()=>openDate(location.hash),0);if(m==="signedout"){S.tasks=new Map();S.cats=DEFAULT_CATS.slice();S.anim=false;if(dlg.open)dlg.close();}
        const out=x=>x==="signedout"||x==="config";
        if(out(m)!==out(S.mode))$("#main").innerHTML="";
        S.mode=m;render();
        if(m==="live"||m==="local")setTimeout(()=>{S.anim=true;},300);},
      onError
    });
  }
};
})();
