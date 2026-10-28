/* 또박 — 화면 코드. 저장소(store)는 TodoApp.boot(store)로 받는다.
   store: { kind, start(cb), set(id,body), update(id,patch), remove(id), saveCats(cats), importAll(data)→Promise<number>,
            signIn?(email,pw), signOut?(), email? }
   cb: { onData({tasks:Map, cats:Array|null, tpls:Map}), onStatus("loading"|"live"|"local"|"signedout"|"config"), onError(err) }
   카테고리: {id, name, color, subs:[{id,name}], archived?:true} — 배열 순서가 화면 순서.
   고정 일정(e_*): {title, place, color, days:[요일], time, end, from, until, holOff, remind, note, skips:[날짜], archived} — 수업처럼 매주 같은 시간. 시간표·캘린더에 보인다.
   반복 할 일(r_*): {title, note, time, remind, cat, sub, days:[요일 0~6], subtasks:[{id,t}]} — 그 요일에 흐리게 보이고 ＋로 할 일(tpl:id)이 된다. */
(function(){
"use strict";
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const DOW=["일","월","화","수","목","금","토"];
const COLORS=["c7","c1","c2","c3","c4","c5","c6","c8"];
const DEFAULT_CATS=[{id:"k1",name:"일상",color:"c7",subs:[]},{id:"k2",name:"업무·공부",color:"c5",subs:[]},{id:"k3",name:"건강",color:"c3",subs:[]}];
const HOL=window.TTOBAK_HOLIDAYS||{};
const REMIND=[[null,"끔"],[0,"시작할 때"],[5,"5분 전"],[10,"10분 전"],[30,"30분 전"],[60,"1시간 전"],[1440,"하루 전"]];
const remindLabel=m=>(REMIND.find(r=>r[0]===m)||[0,m+"분 전"])[1];
const VERSION="2.4.0";
const WEEK=[0,1,2,3,4,5,6]; /* 요일 순서: 일요일부터(캘린더·시간표와 같게) */
const sortDays=ds=>WEEK.filter(d=>Array.isArray(ds)&&ds.includes(d));
/* "매주 월·수", 매일이면 그냥 "매일" */
const weekly=ds=>{const l=daysLabel(ds);return l==="매일"?l:"매주 "+l;};
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
/* '일상으로', '공부로': 마지막 글자 받침(ㄹ 제외)이 있으면 '으로' */
const ro=w=>{const c=String(w||"").trim().slice(-1).charCodeAt(0)-0xAC00;return w+(c>=0&&c<11172&&c%28&&c%28!==8?"으로":"로");};
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

const S={tasks:new Map(),tpls:new Map(),events:new Map(),tplSrc:null,week:null,addCat:null,addDate:null,subMoved:null,cats:DEFAULT_CATS.slice(),view:pref.get("view","day"),sel:today,cursor:today,
  calMode:pref.get("calMode",narrow?"week":"month"),tt7:pref.get("tt7","")==="1",ttFirst:null,ttShow:pref.get("ttShow","all"),showDone:false,mode:"loading",anim:false,calDir:0,
  adding:null,addSub:null,addDraft:"",lastSub:{},focusAdd:false,
  sheet:null,editing:null,edit:null,editGone:false,catDraft:null,catDelArm:null,catMoved:null,importData:null};
let store=null;

const active=()=>S.cats.filter(c=>!c.archived);
const catOf=t=>S.cats.find(c=>c.id===t.cat)||active()[0]||S.cats[0];
const shown=t=>!catOf(t).archived;
const isOpen=t=>!t.done&&!t.skipped;
const visibleTasks=()=>[...S.tasks.values()].filter(shown);
const subsOf=c=>Array.isArray(c&&c.subs)?c.subs:[];
/* 이름 + 소분류 태그: 같은 '과제 제출'이라도 어느 과목 건지 늘 알 수 있게, 소분류가 있으면 이름 뒤에 태그로 함께 보여 준다.
   캘린더·전체 목록의 이름 + 태그와 같은 모양. 태그는 inline-block이라 완료 취소선이 태그에 그어지지 않는다 */
const subOf=t=>t&&t.sub?subsOf(catOf(t)).find(x=>x.id===t.sub)||null:null;
const tagH=t=>{const x=subOf(t);return x?'<span class="ntag">'+esc(x.name)+'</span>':'';};
/* 좁은 자리(칩·목록)에서는 이름만 줄어들고 태그는 늘 다 보이게: 부모를 flex로 두고 이름(.nt)에 말줄임 */
const nameH=t=>'<span class="nt">'+esc(t.title)+'</span>'+tagH(t);
const nameT=t=>{const x=subOf(t);return (t.title||"")+(x?' · '+x.name:'');};
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
/* 이 날의 고정 일정: 기간 안, 그 요일, 보관 안 됨, (공휴일 쉼이면) 공휴일 아님. off = 이 날만 쉼 */
/* 고정 일정의 요일·시간(2.3.0, 2.3.1에 다시 짬). slots: [{id,days,time,end}] — 같은 요일이 여러 줄에 있어도 된다(중간에 쉬는 수업 등).
   slots가 없으면 예전처럼 days·time·end 한 줄(id ""). 이 날만 바꾸기(ovr)·쉼(skips)의 키는 occKey: id ""인 줄은 날짜 그대로(예전과 같게), 나머지는 "날짜#id".
   days·time·end는 id ""인 줄(없으면 첫 줄)과 같게 저장해 둔다(예전 버전이 그 줄은 알아보게) */
const slotsOf=e=>Array.isArray(e.slots)&&e.slots.length?e.slots.map(x=>({id:x.id||"",days:Array.isArray(x.days)?x.days:[],time:x.time||null,end:x.end||null})):
  [{id:"",days:Array.isArray(e.days)?e.days:[],time:e.time||null,end:e.end||null}];
const occKey=(k,sid)=>sid?k+"#"+sid:k;
const KEY_RE=/^\d{4}-\d{2}-\d{2}(#[a-z0-9]{1,8})?$/;
/* 그 날 그 줄의 평소 모습 → evBase(sid 없으면 그 요일 첫 줄), 이 날만 바꾼 것까지 → evAt. 결과에 sid가 붙는다 */
function evBase(e,k,sid){const sl=slotsOf(e),w=k?parse(k).getDay():-1;
  const f=(sid!=null&&sl.find(x=>x.id===sid))||sl.find(x=>x.days.includes(w))||sl[0];
  return Object.assign({},e,{days:f.days,time:f.time,end:f.end,sid:f.id});}
function evAt(e,k,sid){const b=evBase(e,k,sid),o=k&&e.ovr&&e.ovr[occKey(k,b.sid)];return o?Object.assign(b,{time:o.time||b.time,end:o.time?o.end||null:b.end,place:o.place!=null?o.place:b.place}):b;}
const slotLine=x=>daysLabel(x.days)+(x.time?' '+fmtRange(x.time,x.end):'');
function eventsOn(k){
  const w=parse(k).getDay(),out=[];
  for(const e of S.events.values()){
    if(e.archived)continue;
    if(e.from&&k<e.from||e.until&&k>e.until)continue;
    if(e.holOff!==false&&HOL[k])continue;
    for(const x of slotsOf(e)){if(!x.time||!x.days.includes(w))continue;const key=occKey(k,x.id);
      out.push({ev:evAt(e,k,x.id),chg:!!(e.ovr&&e.ovr[key]),off:Array.isArray(e.skips)&&e.skips.includes(key)});}
  }
  return out.sort((a,b)=>a.ev.time<b.ev.time?-1:a.ev.time>b.ev.time?1:KO.compare(a.ev.title||"",b.ev.title||""));
}
const evOff=e=>!!(e.archived||(e.until&&e.until<today));
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
/* 끝 시간: 시작과 같지만 않으면 된다. 시작보다 이르면 다음 날 끝(자정 넘김, 2.1.0) */
const okEnd=(t,e)=>!!(t&&e&&TIME_RE.test(e)&&e!==t);
const night=(t,e)=>okEnd(t,e)&&mins(e)<mins(t);
const endMins=(t,e)=>okEnd(t,e)?mins(e)+(night(t,e)?1440:0):null;
const plusHour=t=>{const m=(mins(t)+60)%1440;return pad(Math.floor(m/60))+":"+pad(m%60);};
/* "오전 10:00–11:30", 오전·오후가 바뀌면 둘 다 표시 */
function fmtRange(t,e){if(!t)return"";const a=fmtTime(t);if(!okEnd(t,e))return a;const b=fmtTime(e);if(night(t,e))return a+"–다음 날 "+b;return a+"–"+(a.slice(0,2)===b.slice(0,2)?b.slice(3):b);}
/* 시간표 칸 안: 눈금(24시간제)과 맞춘 "9:00–10:15", "13:00–14:30" */
const h24=t=>String(+t.slice(0,2))+t.slice(2);
function fmt24(t,e){return h24(t)+(okEnd(t,e)?"–"+h24(e):"");}
function fmtTime(t){if(!t)return"";const [h,m]=t.split(":").map(Number);return (h<12?"오전 ":"오후 ")+((h%12)||12)+":"+pad(m);}
function holName(k){
  const a=HOL[k];if(!a)return"";
  return a.map(n=>n.indexOf("대체공휴일")===0?"대체공휴일":n==="1월 1일"?"신정":n==="기독탄신일"?"성탄절":n.replace("3ㆍ1절","삼일절").replace("전국동시지방선거","지방선거일")).join(" · ");
}

/* ---------- 한 줄 입력 해석: "내일 3시 과제 제출" → 제목 "과제 제출", 내일, 15:00 ----------
   낱말 단위로만 본다("3시간 공부"의 3시간은 안 건드림). 해석한 낱말을 빼고 남은 게 제목. 제목이 비면 해석 안 함.
   날짜: 오늘·내일·모레·글피, X요일(이번 주/다음 주), 10/20, 10월 20일, 20일
   시간: 3시, 3시 반, 3시30분, 오후 3시, 저녁 7시, 15:00, 3시-5시, 15:00~17:00 / 오전·오후 없이 1~6시는 오후로 */
const WDK={"일":0,"월":1,"화":2,"수":3,"목":4,"금":5,"토":6};
function qHour(h,m,ap){
  if(h>24||m>59)return null;
  if(ap==="pm"&&h<12)h+=12;else if(ap==="am"&&h===12)h=0;else if(!ap&&h>=1&&h<=6)h+=12;
  if(h===24)h=0;
  return pad(h)+":"+pad(m);
}
const AP={"오전":"am","아침":"am","새벽":"am","오후":"pm","낮":"pm","저녁":"pm","밤":"pm"};
function qTime(tok,ap){
  let m=tok.match(/^(오전|오후|아침|저녁|밤|새벽|낮)?(\d{1,2})시(?:(\d{1,2})분|반)?(?:까지|에)?$/);
  if(m)return qHour(+m[2],m[3]?+m[3]:/반/.test(tok)?30:0,AP[m[1]]||ap);
  m=tok.match(/^(오전|오후|아침|저녁|밤|새벽|낮)?(\d{1,2}):(\d{2})(?:까지|에)?$/);
  if(m){const h=+m[2];return h>24||+m[3]>59?null:AP[m[1]]||ap?qHour(h,+m[3],AP[m[1]]||ap):pad(h%24)+":"+m[3];}
  return null;
}
/* 범위의 끝: 24시간제(콜론)나 오전·오후를 붙였으면 그대로, "n시"면 시작에서 가장 가까운 쪽(3시-5시 → 17시, 밤 11시-1시 → 새벽 1시) */
function qEnd(tok,start){
  const m=tok.match(/^(오전|오후|아침|저녁|밤|새벽|낮)?(\d{1,2})시(?:(\d{1,2})분|반)?(?:까지)?$/);
  if(!m||m[1])return qTime(tok,null);
  const h=+m[2],mi=m[3]?+m[3]:/반/.test(tok)?30:0;if(h>24||mi>59)return null;
  const s0=mins(start),c=[h%12,h%12+12].map(x=>x*60+mi),best=c.sort((a,b)=>((a-s0+1440)%1440||1440)-((b-s0+1440)%1440||1440))[0];
  return pad(Math.floor(best/60)%24)+":"+pad(best%60);
}
function parseQuick(text,base){
  const toks=String(text||"").trim().split(/\s+/).filter(Boolean),used=toks.map(()=>false);
  let date=null,time=null,end=null,ap=null,week=null;
  const bd=parse(base).getDay();
  for(let i=0;i<toks.length;i++){
    const t=toks[i];let m;
    if(/^(오늘|내일|모레|글피)$/.test(t)&&!date){date=addDays(base,{"오늘":0,"내일":1,"모레":2,"글피":3}[t]);used[i]=true;continue;}
    if(/^(이번\s?주|다음\s?주|담주|다다음\s?주)$/.test(t)){week=/다다음/.test(t)?14:/다음|담/.test(t)?7:0;used[i]=true;continue;}
    if((m=t.match(/^([일월화수목금토])(?:요일|욜)$/))&&!date){const w=WDK[m[1]];
      date=week==null?addDays(base,(w-bd+7)%7):addDays(monStart(base),week+(w+6)%7);used[i]=true;continue;}
    if((m=t.match(/^(\d{1,2})[\/.](\d{1,2})$/))&&!date&&+m[1]>=1&&+m[1]<=12&&+m[2]>=1&&+m[2]<=31){date=base.slice(0,4)+"-"+pad(+m[1])+"-"+pad(+m[2]);used[i]=true;continue;}
    if((m=t.match(/^(\d{1,2})월$/))&&!date&&toks[i+1]&&/^(\d{1,2})일$/.test(toks[i+1])){const d=+toks[i+1].slice(0,-1);
      if(+m[1]>=1&&+m[1]<=12&&d>=1&&d<=31){date=base.slice(0,4)+"-"+pad(+m[1])+"-"+pad(d);used[i]=used[i+1]=true;i++;continue;}}
    if((m=t.match(/^(\d{1,2})월(\d{1,2})일$/))&&!date&&+m[1]>=1&&+m[1]<=12){date=base.slice(0,4)+"-"+pad(+m[1])+"-"+pad(+m[2]);used[i]=true;continue;}
    if((m=t.match(/^(\d{1,2})일$/))&&!date&&+m[1]>=1&&+m[1]<=31){let k=base.slice(0,8)+pad(+m[1]);
      if(k<base){const d=parse(base);k=keyOf(new Date(d.getFullYear(),d.getMonth()+1,+m[1]));}date=k;used[i]=true;continue;}
    if(AP[t]&&toks[i+1]&&(qTime(toks[i+1],AP[t])||/^\d{1,2}(시|:\d{2})(반|\d{1,2}분)?[-~]/.test(toks[i+1]))){ap=AP[t];used[i]=true;continue;}
    if(!time){
      const r=t.match(/^(.+?)[-~](.+)$/);
      if(r){let a=r[1],b2=r[2];if(/^\d{1,2}$/.test(a)&&/시/.test(b2))a+="시";const x=qTime(a,ap),y=x&&qEnd(b2,x);
        if(x&&y){time=x;end=y;used[i]=true;continue;}}
      const x=qTime(t,ap);
      if(x){time=x;used[i]=true;if(toks[i+1]==="반"&&/시$/.test(t)){time=x.slice(0,3)+"30";used[i+1]=true;i++;}continue;}
    }
  }
  if(!date&&!time)return null;
  const title=toks.filter((t,i)=>!used[i]).join(" ");
  if(!title)return null;
  if(end&&!okEnd(time,end))end=null;
  return {title,date,time,end};
}
/* 한 줄 입력 아래: 실제로 저장될 날짜·시간을 늘 보여 준다(인식 결과든, 제목으로만 쓸 때의 보고 있는 날이든) */
const qWhen=(date,time,end)=>[date?(relWord(date)||md(date)):"날짜 없음",time&&date?fmtRange(time,end):""].filter(Boolean).join(" · ");
function quickBase(){return S.adding==="all"?(S.addDate||null):S.view==="day"?S.sel:null;}
function quickHint(){
  if(!S.addDraft.trim())return "";
  const base=quickBase();
  if(S.addRaw)return '<span>입력한 글을 모두 제목으로 써요 · <b class="qv">'+esc(qWhen(base))+'</b></span><button class="linkish" type="button" data-keep data-act="qraw">날짜·시간 자동 인식</button>';
  const q=parseQuick(S.addDraft,today);
  return q?'<span>날짜·시간: <b class="qv">'+esc(qWhen(q.date||base,q.time,q.end))+'</b></span><button class="linkish" type="button" data-keep data-act="qraw">제목으로만 사용</button>':"";
}
function updQuick(){const el=document.querySelector(".addrow .qhint");if(el)el.innerHTML=quickHint();}

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
  if(c==="quota_exceeded"||c==="resource-exhausted")toast("오늘 사용 한도를 초과했어요");
  else if(c==="network"||c==="sync_retry")toast("다시 연결하고 있어요");
  else if(c==="not_ready")toast("아직 불러오는 중이에요. 잠시 뒤에 다시 해 주세요");
  else if(c==="permission-denied")toast("저장 권한이 없어요. 다시 로그인해 주세요");
  else if(c==="invalid_argument"||c==="invalid-argument")toast("입력 내용을 확인해 주세요. 저장하지 못했어요");
  else toast("저장하지 못했어요. 다시 해 주세요");
}
function addTask(cat,sub,title,date,time,end){
  title=title.trim();if(!title)return;
  time=date&&time?time:null;
  setTask(uid8("t_"),{title,note:"",date:date||null,time,end:time&&okEnd(time,end)?end:null,cat,sub:sub||null,done:false,doneAt:null,createdAt:Date.now(),subtasks:[]});
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
  const offline=S.mode!=="local"&&!out&&navigator.onLine===false;
  bn.hidden=S.mode!=="local"&&!offline;bn.classList.toggle("offline",offline);
  if(S.mode==="local")bn.textContent="로그인하지 않아 저장되지 않아요";
  else if(offline)bn.textContent="오프라인이에요. 연결되면 다른 기기에도 반영돼요";
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
const chev=d=>'<svg width="16" height="16" viewBox="0 0 16 16"><path d="'+(d===2?"M3 6l5 5 5-5":d<0?"M10 3L5 8l5 5":"M6 3l5 5-5 5")+'" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function renderCal(){
  const stats={};
  for(const t of visibleTasks()){if(!t.date||t.skipped)continue;const s=stats[t.date]||(stats[t.date]={n:0,d:0});s.n++;if(t.done)s.d++;}
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
  if(t.skipped)return '<button class="chk skp" type="button" aria-label="'+esc(t.title)+' 안 함 취소" data-act="unskip" data-id="'+t.id+'"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 6h6" fill="none" stroke-width="2" stroke-linecap="round"/></svg></button>';
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
  meta.unshift('<span class="chip pre">추가 전</span>');
  meta.push('<span class="rep">'+repSvg+weekly(t.days)+'</span>');
  return '<li id="gh-'+t.id+'" class="task ghost" style="--cc:var(--'+cat.color+')">'+
    '<button class="chk gadd" type="button" data-act="tpladd" data-id="'+t.id+'" data-k="'+t.date+'" aria-label="'+esc(t.title)+' 할 일로 추가">'+addSvg+'</button>'+
    '<button class="ttl" type="button" data-act="ginfo" data-id="'+t.id+'" data-k="'+t.date+'"><span class="tline"><span class="t">'+esc(t.title)+'</span>'+(sub?'<span class="tag">'+esc(sub.name)+'</span>':'')+'</span>'+
    '<span class="meta">'+meta.join("")+'</span></button></li>';
}
/* withDate: 날짜 칩 표시(완료 목록), withCat: 카테고리 이름 표시(전체 탭) */
function row(t,withDate,withCat){
  if(t.ghost)return ghostRow(t);
  const cat=catOf(t),meta=[];
  const sub=t.sub?subsOf(cat).find(s=>s.id===t.sub):null;
  if(withDate)meta.push(t.done||t.skipped?'<span class="chip">'+(t.date?relWord(t.date)||md(t.date):'날짜 없음')+'</span>':dateChip(t.date));
  if(t.time&&t.date)meta.push('<span class="chip time">'+fmtRange(t.time,t.end)+'</span>');
  if(withCat)meta.push('<span class="catl"><i></i>'+esc(cat.name)+'</span>');
  if(store&&store.push&&t.remind!=null&&t.time&&t.date&&!t.done)meta.push('<span class="rmd">'+bellSvg+remindLabel(t.remind)+'</span>');
  const subs=Array.isArray(t.subtasks)?t.subtasks:[];
  if(subs.length)meta.push('<span>세부 '+subs.filter(s=>s.done).length+'/'+subs.length+'</span>');
  if(t.note)meta.push('<span>메모</span>');
  /* 다시 추가한 횟수·원래 날짜는 정보 창으로(목록에선 실패 횟수처럼 읽히지 않게) */
  if(t.skipped)meta.unshift('<span class="chip skip">안 함'+(t.laterDate?' · 다시 추가: '+(relWord(t.laterDate)||md(t.laterDate)):'')+'</span>');
  else if(t.from&&!t.done)meta.unshift('<span class="chip again">다시 추가</span>');
  return '<li id="tk-'+t.id+'" class="task'+(t.done?' done':'')+(t.skipped?' skipped':'')+'" style="--cc:var(--'+cat.color+')">'+chk(t)+
    '<button class="ttl" type="button" data-act="edit" data-id="'+t.id+'"><span class="tline"><span class="t">'+esc(t.title)+'</span>'+(sub?'<span class="tag">'+esc(sub.name)+'</span>':'')+'</span>'+
    (meta.length?'<span class="meta">'+meta.join("")+'</span>':'')+'</button></li>';
}
const plusSvg='<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
function group(cat,items,withDate){
  const subs=subsOf(cat);
  const real=items.filter(t=>!t.ghost&&!t.skipped);
  const cnt=!real.length?"":withDate?String(real.length):real.filter(t=>t.done).length+"/"+real.length;
  let h='<section id="g-'+cat.id+'" class="grp" style="--cc:var(--'+cat.color+')"><div class="ghead"><span class="dot"></span><h3>'+esc(cat.name)+'</h3><span class="cnt">'+cnt+'</span>'+
    '<button class="plus" type="button" data-act="add" data-cat="'+cat.id+'" aria-label="'+esc(cat.name)+'에 할 일 추가">'+plusSvg+'</button></div>';
  /* 목록과 입력 줄은 형제로 둔다: 할 일이 늘어도 입력 줄이 DOM에서 옮겨지지 않아 포커스·키보드가 유지된다 */
  h+='<ul class="tasks">'+items.slice().sort(inCatOrder(cat,withDate)).map(t=>row(t,withDate)).join("")+'</ul>';
  if(S.adding===cat.id){
    const cur=subs.find(s=>s.id===S.addSub);
    h+='<div class="addrow" id="addrow-'+cat.id+'"><input id="add-'+cat.id+'" type="text" data-cat="'+cat.id+'" value="'+esc(S.addDraft)+'" placeholder="예: 내일 오후 3시 과제 제출" autocomplete="off" enterkeyhint="done" aria-label="새 할 일"><div class="qhint" aria-live="polite">'+quickHint()+'</div>';
    if(subs.length)h+='<div class="addsubs" role="group" aria-label="소분류"><button class="pill" type="button" data-keep data-act="addsub" data-sub="" aria-pressed="'+(!cur)+'">없음</button>'+subs.map(s=>'<button class="pill" type="button" data-keep data-act="addsub" data-sub="'+s.id+'" aria-pressed="'+(!!cur&&cur.id===s.id)+'">'+esc(s.name)+'</button>').join("")+'</div>';
    h+='</div>';
  }
  return h+'</section>';
}

function renderDay(){
  const k=S.sel,d=parse(k),r=relWord(k),hn=holName(k);
  const vis=visibleTasks();
  const list=vis.filter(t=>t.date===k).sort(byTime);
  const live=list.filter(t=>!t.skipped),n=live.length,dn=live.filter(t=>t.done).length;
  let h='<div class="dayhead"><p class="eyebrow"><span>'+DOW[d.getDay()]+'요일</span>'+(r?'<span class="rel'+(k===today?' now':'')+'">'+r+'</span>':'')+(hn?'<span class="holn">'+esc(hn)+'</span>':'')+'</p>'+
    '<h1>'+(d.getMonth()+1)+'월 '+d.getDate()+'일</h1>';
  if(S.mode==="loading")h+='<div class="prog"></div>';
  else if(!n)h+='<div class="prog">할 일 없음</div>';
  else h+='<div class="prog"><div class="bar"><i style="width:'+Math.round(dn/n*100)+'%"></i></div><span>'+(dn===n?'모두 완료':dn+'/'+n+' 완료')+'</span></div>';
  h+='</div>';
  if(k===today){
    const od=vis.filter(t=>t.date&&t.date<today&&isOpen(t));
    if(od.length)h+='<div class="carry"><span>밀린 할 일 <b>'+od.length+'개</b></span><button class="small" type="button" data-act="carry">모두 오늘로 옮기기</button></div>';
  }
  const evs=S.mode==="loading"?[]:eventsOn(k);
  if(evs.length)h+='<section class="evstrip" aria-label="고정 일정">'+evs.map(({ev,off,chg})=>'<button type="button" class="evrow'+(off?' off':'')+'" style="--cc:var(--'+(ev.color||"c5")+')" data-act="einfo" data-id="'+ev.id+'" data-k="'+k+'" data-s="'+(ev.sid||"")+'">'+
    '<span class="et">'+fmtRange(ev.time,ev.end)+'</span><span class="en">'+esc(ev.title)+'</span>'+(ev.place?'<span class="ep">'+esc(ev.place)+'</span>':'')+(off?'<span class="eo">쉼</span>':chg?'<span class="eo">이날만 변경</span>':'')+'</button>').join("")+'</section>';
  if(S.mode!=="loading"&&!vis.length)h+='<p class="hint">＋를 눌러 할 일을 추가해요. ‘내일 오후 3시’처럼 날짜·시간도 함께 쓸 수 있어요</p>';
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
  let h='<div class="addrow top" id="addrow-all" style="--cc:var(--'+cat.color+')"><input id="add-all" type="text" data-cat="all" value="'+esc(S.addDraft)+'" placeholder="예: 금요일 오후 2시 팀플" autocomplete="off" enterkeyhint="done" aria-label="새 할 일"><div class="qhint" aria-live="polite">'+quickHint()+'</div>';
  h+='<div class="addsubs" role="group" aria-label="카테고리">'+active().map(c=>'<button class="pill cpill" style="--cc:var(--'+c.color+')" type="button" data-keep data-act="addcat" data-cat="'+c.id+'" aria-pressed="'+(c.id===cat.id)+'"><i></i>'+esc(c.name)+'</button>').join("")+'</div>';
  if(subs.length)h+='<div class="addsubs" role="group" aria-label="소분류"><button class="pill" type="button" data-keep data-act="addsub" data-sub="" aria-pressed="'+(!cur)+'">소분류 없음</button>'+subs.map(x=>'<button class="pill" type="button" data-keep data-act="addsub" data-sub="'+x.id+'" aria-pressed="'+(!!cur&&cur.id===x.id)+'">'+esc(x.name)+'</button>').join("")+'</div>';
  h+='<div class="addsubs dates" role="group" aria-label="날짜">'+dates.map(d=>'<button class="pill" type="button" data-keep data-act="adddate" data-k="'+d[0]+'" aria-pressed="'+((S.addDate||"")===d[0])+'">'+d[1]+'</button>').join("")+'</div>';
  return h+'</div>';
}
function dsecHead(k,n){
  if(!k)return '<div class="ghead"><h3>날짜 없음</h3><span class="cnt">'+n+'</span></div>';
  const d=parse(k),r=relWord(k),hn=holName(k);
  return '<div class="ghead"><button class="dlink" type="button" data-act="goday" data-k="'+k+'"><h3>'+(d.getMonth()+1)+'월 '+d.getDate()+'일</h3>'+
    '<span class="dw d'+d.getDay()+(hn?' hol':'')+'">'+DOW[d.getDay()]+'</span>'+(r?'<span class="rel'+(k===today?' now':'')+'">'+r+'</span>':'')+(hn?'<span class="holn">'+esc(hn)+'</span>':'')+'</button><span class="cnt">'+n+'</span></div>';
}
const skipBtn=t=>'<button class="skipbtn" type="button" data-act="skip" data-id="'+t.id+'">넘기기</button>';
function renderAll(){
  const vis=visibleTasks();
  const open=vis.filter(isOpen);
  const cmp=allOrder();
  const past=open.filter(t=>t.date&&t.date<today).sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:cmp(a,b));
  const rest=open.filter(t=>!(t.date&&t.date<today));
  const done=vis.filter(t=>t.done).sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));
  const skipped=vis.filter(t=>t.skipped&&!t.done).sort((a,b)=>(b.skippedAt||0)-(a.skippedAt||0));
  const by=new Map();
  for(const t of rest){const k=t.date||"";if(!by.has(k))by.set(k,[]);by.get(k).push(t);}
  const keys=[...by.keys()].filter(Boolean).sort();if(by.has(""))keys.push("");
  let h='<div class="dayhead"><div class="hrow"><h1>전체</h1>'+
    '<button class="plus big" type="button" data-act="add" data-cat="all" aria-label="할 일 추가">'+plusSvg+'</button></div>'+
    (S.mode!=="loading"&&!rest.length&&!past.length?'<div class="prog">남은 할 일이 없어요</div>':'')+'</div>';
  if(S.adding==="all")h+=addAllRow();
  /* 지난 할 일: 위에 쌓이지 않게 한 줄로 접어 두고, 펼치면 날짜 최근 순 + '안 함'으로 정리 */
  if(past.length){
    h+='<section class="grp pastbox'+(S.showPast?' open':'')+'"><div class="ghead"><button class="pasthead" type="button" data-act="showpast" aria-expanded="'+!!S.showPast+'">'+
      '<span class="caret">'+chev(S.showPast?2:1)+'</span><h3>밀린 할 일</h3><span class="pcnt">'+past.length+'개</span></button>'+
      '<button class="small" type="button" data-act="carry">모두 오늘로 옮기기</button></div>';
    if(S.showPast){
      h+='<p class="pasthint">안 한 일은 ‘넘기기’에서 정리할 수 있어요</p><ul class="tasks">';
      let last="";
      for(const t of past){
        if(t.date!==last){last=t.date;const d=parse(t.date);h+='<li class="psub">'+(d.getMonth()+1)+'월 '+d.getDate()+'일 '+DOW[d.getDay()]+'</li>';}
        h+=row(t,false,true).replace(/<\/li>$/,skipBtn(t)+'</li>');
      }
      h+='</ul>';
    }
    h+='</section>';
  }
  h+='<div class="groups">'+keys.map(k=>'<section class="grp dsec" id="ds-'+(k||"none")+'">'+dsecHead(k,by.get(k).length)+
    '<ul class="tasks">'+by.get(k).sort(cmp).map(t=>row(t,false,true)).join("")+'</ul></section>').join("")+'</div>';
  if(done.length||skipped.length){
    /* 기록: 안 함과 완료를 따로. 목록은 최근 것만 그린다(개수는 전체) */
    const part=(name,list,max)=>list.length?'<li class="psub">'+name+' '+list.length+'개'+(list.length>max?' · 최근 '+max+'개 표시':'')+'</li>'+list.slice(0,max).map(t=>row(t,true,true)).join(""):'';
    h+='<div class="donebox"><h3 class="dbh">기록</h3><button class="linkish" type="button" data-act="showdone" aria-expanded="'+!!S.showDone+'">'+(S.showDone?'접기':'완료 '+done.length+'개'+(skipped.length?' · 안 함 '+skipped.length+'개':'')+' 보기')+'</button>';
    if(S.showDone)h+='<section class="grp" style="--cc:var(--c8);margin-top:8px"><ul class="tasks">'+part("안 함",skipped,100)+part("완료",done,150)+'</ul></section>';
    h+='</div>';
  }
  morph($("#main"),h);
}

/* ---------- 시간표: 한 주, 시간이 정해진 할 일과 반복 할 일 ---------- */
/* 시간표 한 주: 일요일 시작(캘린더와 같게) */
function weekStart(k){const d=parse(k);d.setDate(d.getDate()-d.getDay());return keyOf(d);}
function monStart(k){const d=parse(k);d.setDate(d.getDate()-((d.getDay()+6)%7));return keyOf(d);}
function layLanes(items){
  items.sort((a,b)=>a.s-b.s||b.e-a.e);
  let cl=[],end=-1,ci=0;
  const flush=()=>{const cols=[];for(const it of cl){let c=cols.findIndex(x=>x<=it.s);if(c<0){c=cols.length;cols.push(0);}cols[c]=it.e;it.col=c;}for(const it of cl){it.n=cols.length;it.cl=ci;}ci++;cl=[];};
  for(const it of items){if(cl.length&&it.s>=end){flush();end=-1;}cl.push(it);end=Math.max(end,it.e);}
  if(cl.length)flush();
  return items;
}
const xColor=x=>x.kind==="ev"?(x.t.color||"c5"):catOf(x.t).color;
/* 폰 3일 보기: 지난주·이번 주·다음 주(21일)를 3칸 폭으로 깔고 가로로 민다. 가장자리 주에 닿으면 기준 주를 옮겨 다시 깐다(끝없이 밀기) */
const isThree=()=>!(window.matchMedia&&window.matchMedia("(min-width: 700px)").matches)&&!S.tt7;
function renderWeek(){
  const ws=S.week||(S.week=weekStart(S.sel));
  const three=isThree();
  if(three&&!S.ttFirst)S.ttFirst=ws===weekStart(today)?today:ws;
  const days=three?Array.from({length:21},(_,i)=>addDays(ws,i-7)):[0,1,2,3,4,5,6].map(i=>addDays(ws,i));
  const ld=S.mode==="loading",vis=ld?[]:visibleTasks();
  /* 보기: 둘 다 / 고정 일정만 / 할 일만(반복 할 일 포함) */
  const show=S.ttShow,useT=show!=="ev",useE=show!=="task";
  const items={};
  for(const k of days){
    const list=(useT?vis.filter(t=>t.date===k&&t.time&&!t.skipped).map(t=>({t,kind:"task"})):[])
      .concat(useT&&!ld?ghostsFor(k).filter(r=>r.time).map(r=>({t:r,kind:"ghost"})):[])
      .concat(useE&&!ld?eventsOn(k).map(o=>({t:o.ev,kind:"ev",off:o.off,chg:o.chg})):[]);
    items[k]=list.map(x=>{const s0=mins(x.t.time),e0=okEnd(x.t.time,x.t.end)?endMins(x.t.time,x.t.end):s0+60;return Object.assign(x,{k,s:s0,e0,e:Math.max(e0,s0+30)});});
  }
  const wide=window.matchMedia&&window.matchMedia("(min-width: 700px)").matches;
  /* 폰 7일 보기: 주말에 아무것도 없으면 월~금만 */
  const cols=three||wide||items[days[0]].length||items[days[6]].length?days:days.slice(1,6);
  const all=cols.flatMap(k=>items[k]);
  let h0=9,h1=18;
  for(const x of all){h0=Math.min(h0,Math.floor(x.s/60));h1=Math.max(h1,Math.ceil(Math.min(x.e,1440)/60));}
  const now=new Date(),nowM=now.getHours()*60+now.getMinutes();
  if(cols.includes(today)&&nowM>=h0*60-30&&nowM<=h1*60+30){h0=Math.min(h0,Math.floor(nowM/60));h1=Math.max(h1,Math.ceil(nowM/60));}
  h1=Math.min(24,Math.max(h1,h0+1));
  const H=wide?48:40,px=m=>((m-h0*60)/60*H).toFixed(1);
  const mainW=($("#main")&&$("#main").clientWidth)||Math.min(window.innerWidth,1060)-24;
  const colW=three?Math.floor((mainW-2-30)/3.12*10)/10:(mainW-(wide?40:30))/cols.length;
  const first=three?S.ttFirst:days[0],{title,rel}=ttTitle(first,three);
  const thisWeek=weekStart(today);
  const seg=[["all","모두"],["ev","고정 일정"],["task","할 일"]];
  /* 보기 버튼: 폰은 위 줄 오른쪽, 넓은 화면은 주 넘기기 옆 */
  const segH='<div class="ttshow" role="group" aria-label="시간표에 보일 것">'+seg.map(x=>'<button type="button" data-act="ttshow" data-v="'+x[0]+'" aria-pressed="'+(show===x[0])+'">'+x[1]+'</button>').join("")+'</div>';
  let h='<div class="dayhead"><div class="ebrow"><p class="eyebrow"><span>시간표</span>'+(rel?'<span class="rel'+(rel==="이번 주"||rel==="오늘"?' now':'')+'">'+rel+'</span>':'')+'</p>'+(wide?'':segH)+'</div>'+
    '<div class="hrow"><h1 id="tttitle">'+title+'</h1><span class="navs">'+(wide?segH:'')+
    (three?'<button class="small" type="button" data-act="wtoday"'+(ttHasToday(first)?' hidden':'')+'>오늘</button>':ws!==thisWeek?'<button class="small" type="button" data-act="wtoday">이번 주</button>':'')+
    '<button class="icon" type="button" data-act="wnav" data-d="-1" aria-label="'+(three?'이전 3일':'이전 주')+'">'+chev(-1)+'</button><button class="icon" type="button" data-act="wnav" data-d="1" aria-label="'+(three?'다음 3일':'다음 주')+'">'+chev(1)+'</button></span></div></div>';
  h+='<div class="tt'+(three?' tt3':'')+'" style="--cols:'+cols.length+';--hh:'+H+'px'+(three?';--cw:'+colW.toFixed(1)+'px':'')+'">';
  h+='<div class="tthead"><span></span>'+cols.map(k=>{const d=parse(k),hn=holName(k);
    return '<button type="button" class="tth d'+d.getDay()+(hn?' hol':'')+(k===today?' today':'')+'" data-act="goday" data-k="'+k+'" aria-label="'+(d.getMonth()+1)+'월 '+d.getDate()+'일 달력에서 보기"'+(hn?' title="'+esc(hn)+'"':'')+'><small>'+DOW[d.getDay()]+'</small><b>'+d.getDate()+'</b></button>';}).join("")+'</div>';
  /* 시간 없는 할 일: 날짜 아래 한 줄에 작게(최대 2개 + 나머지 수) */
  const ao=allOrder();
  const untimed=cols.map(k=>useT?vis.filter(t=>t.date===k&&!t.time&&!t.skipped).sort((a,b)=>(a.done-b.done)||ao(a,b)):[]);
  /* 전날 시작해서 자정을 넘긴 것: 이 날 맨 위(종일 줄)에 "~1:00 이름"으로 이어서 보여 준다 */
  const carryOn=cols.map(k=>{const p=addDays(k,-1),o=[];
    if(useT){for(const t of vis)if(t.date===p&&t.time&&!t.skipped&&night(t.time,t.end))o.push({t,kind:"task"});
      if(!ld)for(const r of ghostsFor(p))if(r.time&&night(r.time,r.end))o.push({t:r,kind:"ghost"});}
    if(useE&&!ld)for(const x of eventsOn(p))if(!x.off&&night(x.ev.time,x.ev.end))o.push({t:x.ev,kind:"ev"});
    return o.map(x=>Object.assign(x,{p}));});
  const carryChip=(x,short)=>{const t=x.t,ev=x.kind==="ev",act=ev?'einfo':x.kind==="ghost"?'ginfo':'info';
    return '<button type="button" class="uchip ucarry'+(t.done?' done':'')+(x.kind==="ghost"?' gh':'')+'" style="--cc:var(--'+xColor(x)+')" data-act="'+act+'" data-id="'+t.id+'" data-k="'+x.p+'"'+(ev?' data-s="'+(t.sid||"")+'"':'')+' title="'+esc(ev?t.title:nameT(t))+' '+fmtRange(t.time,t.end)+'" aria-label="전날부터 이어짐: '+esc(ev?t.title:nameT(t))+', '+fmtTime(t.end)+'까지"><b>~'+h24(t.end)+'</b>'+(short?'':' '+(ev?esc(t.title):nameH(t)))+'</button>';};
  const allL='<span class="ttallL">'+(untimed.some(l=>l.length)?'시간 미정':'이어짐')+'</span>';
  if((untimed.some(l=>l.length)||carryOn.some(l=>l.length))&&colW<80){
    /* 좁을 때(폰 7일): 잘린 제목 대신 개수만. 누르면 그날 */
    h+='<div class="ttall">'+allL+untimed.map((l,i)=>{const cc=carryOn[i].map(x=>carryChip(x,true)).join("");if(!l.length)return '<div class="ttallC">'+cc+'</div>';
      const open=l.filter(t=>!t.done).length,d=parse(cols[i]);
      return '<div class="ttallC">'+cc+'<button type="button" class="uchip ucount'+(open?'':' done')+'" data-act="goday" data-k="'+cols[i]+'" aria-label="'+(d.getMonth()+1)+'월 '+d.getDate()+'일 시간 미정 할 일 '+l.length+'개'+(open<l.length?', '+(l.length-open)+'개 완료':'')+'">'+(open?'할 일 '+open:'완료 '+l.length)+'</button></div>';}).join("")+'</div>';
  }else if(untimed.some(l=>l.length)||carryOn.some(l=>l.length)){
    h+='<div class="ttall">'+allL+untimed.map((l,i)=>'<div class="ttallC">'+carryOn[i].map(x=>carryChip(x,false)).join("")+l.slice(0,l.length>2?1:2).map(t=>'<button type="button" class="uchip'+(t.done?' done':'')+'" style="--cc:var(--'+catOf(t).color+')" data-act="info" data-id="'+t.id+'" title="'+esc(nameT(t))+'">'+nameH(t)+'</button>').join("")+
      (l.length>2?'<button type="button" class="uchip rest" data-act="goday" data-k="'+cols[i]+'" aria-label="'+cols[i]+' 시간 미정 할 일 '+l.length+'개">+'+(l.length-1)+'</button>':'')+'</div>').join("")+'</div>';
  }
  const bodyH=(h1-h0)*H;
  /* 자정 가까이 시작하는 칸은 최소 높이 때문에 아래로 넘쳐 잘린다 → 바닥에 맞춰 위로 올린다 */
  const topOf=(s,hgt)=>Math.max(0,Math.min((s-h0*60)/60*H,bodyH-hgt)).toFixed(1);
  h+='<div class="ttbody" style="height:'+bodyH+'px"><div class="ttgut">';
  for(let hr=h0;hr<h1;hr++)h+='<span'+(hr===h0?' class="first"':'')+' style="top:'+((hr-h0)*H)+'px">'+hr+'</span>';
  h+='</div>';
  S.ttGroups={};
  for(const k of cols){
    h+='<div class="ttcol'+(k===today?' today':'')+'" data-act="slot" data-k="'+k+'" data-h0="'+h0+'" data-hh="'+H+'">';
    /* 겹친 일정이 너무 좁아지면(폰) 한 덩어리로 묶어 "n개"로 보여 주고, 누르면 목록 */
    const laid=layLanes(items[k]),groups=new Map();
    for(const x of laid){if(!groups.has(x.cl))groups.set(x.cl,[]);groups.get(x.cl).push(x);}
    const merged=new Set();
    for(const [cid,g] of groups){
      if(g.length<2||colW/g[0].n>=34)continue;
      merged.add(cid);
      const s0=Math.min(...g.map(x=>x.s)),e0=Math.max(...g.map(x=>Math.min(x.e,1440))),hgt=Math.max(20,(e0-s0)/60*H-2);
      const sorted=g.slice().sort((a,b)=>a.s-b.s||(a.kind==="ev"?-1:0)-(b.kind==="ev"?-1:0));
      const dots=sorted.slice(0,4).map(x=>'<i style="--cc:var(--'+xColor(x)+')"'+(x.kind==="ghost"?' class="gh"':x.kind==="ev"?' class="ev"':'')+'></i>').join("");
      const lines=Math.max(0,Math.floor((hgt-24)/15));
      h+='<button type="button" class="blk grpb" style="top:'+topOf(s0,hgt)+'px;height:'+hgt.toFixed(1)+'px;left:1px;width:calc(100% - 2px)" data-act="tgroup" data-k="'+k+'" data-c="'+cid+'" aria-label="겹친 일정 '+g.length+'개">'+
        '<span class="gn"><b>'+g.length+'개</b><span class="dots">'+dots+'</span></span>'+sorted.slice(0,lines).map(x=>'<span class="gl'+(x.t.done||x.off?' done':'')+'">'+(x.kind==="ev"?esc(x.t.title):nameH(x.t))+'</span>').join("")+'</button>';
    }
    S.ttGroups[k]=groups;
    for(const x of laid){
      if(merged.has(x.cl))continue;
      const t=x.t,hgt=Math.max(20,(Math.min(x.e,1440)-x.s)/60*H-2);
      const pos='top:'+topOf(x.s,hgt)+'px;height:'+hgt.toFixed(1)+'px;left:calc('+(100*x.col/x.n).toFixed(3)+'% + 1px);width:calc('+(100/x.n).toFixed(3)+'% - 2px)';
      const thin=colW/x.n<34;
      /* 칸 높이에 맞춰 넣는다. 우선순위: 제목 → 소분류(할 일) → 시간 → 장소(고정 일정). 카테고리는 색으로 보이니 안 씀 */
      const sb=x.kind!=="ev"?subOf(t):null;
      /* 제목이 몇 줄 필요한지 칸 폭으로 어림(글자 약 11px). 좁은 칸은 제목에 두 줄까지 먼저 준다 */
      const LH=three?15:13,CH=three?12.2:11;
      const lines=Math.max(1,Math.floor((hgt-6)/LH)),bw=colW/x.n-2,cpl=Math.max(1,Math.floor((bw-10)/CH));
      /* 이름과 태그가 한 줄에 다 들어가면 나란히, 아니면 태그는 이름 아랫줄(이름이 눌리지 않게) */
      const tl=(t.title||"").length+(x.kind==="task"?1:0),fitsOne=!sb||tl+1+sb.name.length*.85<=cpl;
      const need=Math.ceil(tl/cpl);
      /* 줄 배분: 이름 첫 줄 → 소분류 태그(같은 이름을 구별하는 게 우선) → 이름 나머지 → 시간 → 장소 */
      let left=lines-1;
      const tagLine=!!sb&&(bw<70||!fitsOne),showS=tagLine&&left>0&&left-->0;
      left-=Math.max(0,Math.min(left,Math.min(bw<70?2:1,need)-1));
      const showT=left>0&&left-->0,showP=x.kind==="ev"&&!!t.place&&left>0&&left-->0;
      const cl=Math.max(1,Math.min(3,lines-(showS?1:0)-(showT?1:0)-(showP?1:0)));
      const ttl='<span class="bt" style="-webkit-line-clamp:'+cl+'">'+(x.kind==="task"?'<i class="tk'+(t.done?' on':'')+'"></i>':'')+esc(t.title)+'</span>';
      const inner=thin?'':(sb&&!tagLine?'<span class="btl">'+ttl+tagH(t)+'</span>':ttl+(showS?'<span class="btl">'+tagH(t)+'</span>':''))+
        (showT?'<span class="bm">'+fmt24(t.time,t.end)+'</span>':'')+(showP?'<span class="bm">'+esc(t.place)+'</span>':'');
      const lab=' aria-label="'+(x.kind==="ev"?'고정 일정 ':x.kind==="ghost"?'반복 할 일 ':'할 일 ')+esc(x.kind==="ev"?t.title:nameT(t))+' '+fmtRange(t.time,t.end)+(x.off?' 쉼':x.chg?' 이날만 변경':'')+'" title="'+esc(x.kind==="ev"?t.title:nameT(t))+'"';
      const st=' style="--cc:var(--'+xColor(x)+');'+pos+'"';
      if(x.kind==="ghost")h+='<button type="button" class="blk ghost'+(thin?' thin':'')+'"'+lab+st+' data-act="ginfo" data-id="'+t.id+'" data-k="'+k+'">'+inner+'</button>';
      else if(x.kind==="ev")h+='<button type="button" class="blk ev'+(x.off?' off':'')+(thin?' thin':'')+'"'+lab+st+' data-act="einfo" data-id="'+t.id+'" data-k="'+k+'" data-s="'+(t.sid||"")+'">'+inner+'</button>';
      else h+='<button type="button" class="blk tblk'+(t.done?' done':'')+(thin?' thin':'')+'"'+lab+st+' data-act="info" data-id="'+t.id+'">'+inner+'</button>';
    }
    if(k===today&&nowM>=h0*60&&nowM<=h1*60)h+='<i class="nowline" style="top:'+px(nowM)+'px"></i>';
    h+='</div>';
  }
  h+='</div></div>';
  /* 안내는 한 번에 하나만 */
  const span=three?'이 기간에는':'이번 주에는';
  const tip=S.mode!=="loading"&&!all.length?(show==="ev"?span+' 고정 일정이 없어요':show==="task"?span+' 시간이 정해진 할 일이 없어요':span+' 시간이 정해진 일정이 없어요. 수업처럼 매주 같은 건 ‘고정 일정’으로 넣어 두세요')
    :all.some(x=>x.kind==="ghost")?'빗금은 추가 전 반복 할 일이에요':'빈칸을 눌러 일정을 추가해요';
  h+='<div class="ttfoot"><p class="hint tthint">'+tip+'</p>'+
    '<div class="ttfacts">'+(wide?'':'<button class="linkish" type="button" data-act="tt7">'+(three?'7일 보기':'3일 보기')+'</button>')+
    '<button class="small" type="button" data-act="evs">고정 일정 관리</button></div></div>';
  morph($("#main"),h);
  if(three)placeTT3(days,colW,h0,H,nowM);
  if(S.calDir&&!reduced){const g=$("#main .tt");if(g){const cl=S.calDir>0?"from-next":"from-prev";g.classList.add(cl);setTimeout(()=>g.classList.remove(cl),260);}}
  S.calDir=0;
}

/* 제목: 7일 보기는 그 주, 3일 보기는 보이는 3일 */
function ttTitle(first,three){
  const last=three?addDays(first,2):addDays(first,6),a=parse(first),b=parse(last);
  const title=(a.getMonth()+1)+'월 '+a.getDate()+'일 – '+(a.getMonth()===b.getMonth()?'':(b.getMonth()+1)+'월 ')+b.getDate()+'일';
  const tw=weekStart(today);
  const rel=three?(ttHasToday(first)?"오늘":weekStart(first)===tw?"이번 주":weekStart(first)===addDays(tw,7)?"다음 주":weekStart(first)===addDays(tw,-7)?"지난주":"")
    :first===tw?"이번 주":first===addDays(tw,7)?"다음 주":first===addDays(tw,-7)?"지난주":"";
  return {title,rel};
}
const ttHasToday=first=>today>=first&&today<=addDays(first,2);
/* 3일 보기 자리 잡기: 보던 첫날이 왼쪽에 오게 가로 위치를 맞추고, 처음 열 때는 세로를 지금 시각(없으면 첫 일정) 근처로 */
function placeTT3(days,colW,h0,H,nowM){
  const tt=$("#main .tt3");if(!tt)return;
  const hd=tt.querySelector(".tthead");if(hd)tt.style.setProperty("--hdh",hd.offsetHeight+"px");
  const top=tt.getBoundingClientRect().top+window.scrollY,ft=$("#main .ttfoot"),fh=ft?ft.offsetHeight+12:0;
  tt.style.maxHeight=Math.max(300,window.innerHeight-Math.min(top,260)-fh-16)+"px";
  const i=Math.max(0,days.indexOf(S.ttFirst)),x=Math.round(i*colW);
  S.ttPlacing=true;
  if(Math.abs(tt.scrollLeft-x)>2)tt.scrollLeft=x;
  if(!tt.dataset.vy){tt.dataset.vy="1";const m=days.slice(i,i+3).includes(today)?nowM-90:h0*60;tt.scrollTop=Math.max(0,(m-h0*60)/60*H);}
  requestAnimationFrame(()=>{S.ttPlacing=false;});
  S.ttDays=days;S.ttColW=colW;
}
/* 밀 때: 제목을 보이는 3일로 바꾸고, 멈추면 가장자리 주에서 기준 주를 옮긴다 */
(function(){
  let raf=0,idle=0;
  document.addEventListener("scroll",ev=>{
    const tt=ev.target;if(!tt.classList||!tt.classList.contains("tt3")||S.ttPlacing||!S.ttDays)return;
    if(!raf)raf=requestAnimationFrame(()=>{raf=0;
      const i=Math.max(0,Math.min(S.ttDays.length-3,Math.round(tt.scrollLeft/S.ttColW)));S.ttFirst=S.ttDays[i];
      const {title,rel}=ttTitle(S.ttFirst,true),h1=$("#tttitle");if(h1&&h1.textContent!==title)h1.textContent=title;
      const eb=$("#main .ebrow .eyebrow");if(eb)eb.innerHTML='<span>시간표</span>'+(rel?'<span class="rel'+(rel==="오늘"||rel==="이번 주"?' now':'')+'">'+rel+'</span>':'');
      const tb=$("#main [data-act=wtoday]");if(tb)tb.hidden=ttHasToday(S.ttFirst);});
    clearTimeout(idle);idle=setTimeout(()=>{
      const i=S.ttDays.indexOf(S.ttFirst);
      if(i<5||i>S.ttDays.length-3-5){S.week=weekStart(S.ttFirst);render();}
    },180);
  },true);
})();
/* ---------- 시트 공통: 뒤로가기·아래로 밀기로 닫히고, 닫을 때 저장 ---------- */
const dlg=$("#dlg"),sheet=$("#sheet");
const grab='<div class="grab" aria-hidden="true"><i></i></div>';
function drawSheet(html){morph(sheet,grab+html);}
let sheetClosing=false;
/* 편집 시트는 '저장'을 눌러야만 저장한다. 고친 채로 닫으면(바깥·뒤로·아래로 밀기·Esc) 버리고 '다시 열기'를 띄운다 */
const EDIT_KINDS=["edit","tpl","ev","evday","cats"];
const snapOf=kind=>kind==="cats"?JSON.stringify((S.catDraft||[]).map(c=>[c.id,c.name,c.color,!!c.archived,c.subs.map(x=>[x.id,x.name]),c.subNew||""])):
  JSON.stringify(S.edit,(k,v)=>/^(timeRaw|endRaw|timeBad|endBad)$/.test(k)?undefined:v);
function openSheet(kind,draw){
  sheetClosing=false;const was=S.sheet;S.sheet=kind;draw();
  if(EDIT_KINDS.includes(kind)&&was!==kind)S.snap=snapOf(kind);
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
  const kind=S.sheet;
  if(EDIT_KINDS.includes(kind)){
    if(S.saveReq){if(kind==="edit")commitEdit();else if(kind==="tpl")commitTpl();else if(kind==="ev")commitEv();else if(kind==="evday")commitEvDay();else commitCats();}
    else if(!S.editGone){if(kind==="cats")syncCats();else syncEdit();
      if(snapOf(kind)!==S.snap){const d={kind,snap:S.snap,editing:S.editing,edit:S.edit&&JSON.parse(JSON.stringify(S.edit)),newDraft:S.newDraft,tplSrc:S.tplSrc,catDraft:S.catDraft&&JSON.parse(JSON.stringify(S.catDraft))};
        setTimeout(()=>toast("변경 사항을 저장하지 않았어요",{label:"다시 열기",fn:()=>reopenDraft(d)}),0);}}
  }
  if(S.laterDraft&&!S.laterDone)dropDraft(S.laterDraft);
  if(S.parentDraft&&!(kind==="tpl"&&S.saveReq))dropDraft(S.parentDraft);
  S.laterDraft=null;S.laterDone=false;S.parentDraft=null;
  S.saveReq=false;
  if(history.state&&history.state.sheet){try{history.back();}catch(e){}}
  S.infoId=null;S.infoTpl=null;S.infoK=null;S.infoEv=null;S.newDraft=null;S.laterId=null;
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

function reopenDraft(d){
  if(dlg.open)return;
  if(d.editing&&!(d.kind==="ev"||d.kind==="evday"?S.events.get(d.editing):d.kind==="tpl"?S.tpls.get(d.editing):d.kind==="edit"?S.tasks.get(d.editing):true)){toast("편집 중인 항목이 삭제됐어요");return;}
  S.editing=d.editing;S.edit=d.edit;S.newDraft=d.newDraft;S.tplSrc=d.tplSrc;S.catDraft=d.catDraft;S.editGone=false;
  openSheet(d.kind,d.kind==="ev"?drawEv:d.kind==="evday"?drawEvDay:d.kind==="cats"?drawCats:drawEdit);
  S.snap=d.snap;
}
const saveDlg=()=>{S.saveReq=true;closeDlg();};
/* '저장' 버튼·엔터: 저장하기 전에 막을 것(시작=종료, 요일·시간 없는 고정 일정) */
function saveBlock(){
  const k=S.sheet,e=S.edit;if(!e)return"";
  if(k==="edit"||k==="tpl"||k==="evday"){syncEdit();if(e.time&&e.end&&!e.endBad&&!e.timeBad&&e.end===e.time&&!(k==="edit"&&e.nodate))return"시작 시간과 종료 시간이 같아요";}
  if(k==="ev"){syncEdit();if(e.slots.some(x=>x.time&&x.end&&x.end===x.time))return"시작 시간과 종료 시간이 같아요";
    if(!e.slots.some(x=>x.time&&x.days.length))return"요일과 시작 시간을 정해 주세요";}
  return"";
}
function saveChecked(){const m=saveBlock();if(m){toast(m);return;}saveDlg();}
/* 편집 창에서 '넘기기'·'반복 할 일로 등록'으로 넘어갈 때: 고치던 내용은 다음 창에서 확정할 때 함께 저장(취소하면 저장 안 함) */
function holdDraft(){syncEdit();return {kind:"edit",snap:S.snap,editing:S.editing,edit:JSON.parse(JSON.stringify(S.edit)),newDraft:null,tplSrc:null,catDraft:null,dirty:snapOf("edit")!==S.snap};}
function applyDraft(d){if(!d||!d.dirty)return null;const se=S.editing,sd=S.edit,sg=S.editGone;S.editing=d.editing;S.edit=d.edit;S.editGone=false;
  let r=null;try{r=commitEdit(true);}finally{S.editing=se;S.edit=sd;S.editGone=sg;}return r;}
function dropDraft(d){if(d&&d.dirty)setTimeout(()=>toast("변경 사항을 저장하지 않았어요",{label:"다시 열기",fn:()=>reopenDraft(d)}),0);}
/* ---------- 메뉴 ---------- */
function drawMenu(){
  let h='<h2>설정</h2><div class="menu">'+
    '<button type="button" data-act="cats">카테고리 관리<small>순서 · 색 · 소분류 · 숨김</small></button>'+
    '<button type="button" data-act="evs">고정 일정<small>'+(S.events.size?[...S.events.values()].filter(e=>!evOff(e)).length+'개 · ':'')+'수업처럼 매주 같은 시간에 있는 일정'+'</small></button>'+
    '<button type="button" data-act="tpls">반복 할 일<small>'+(S.tpls.size?[...S.tpls.values()].filter(r=>!tplOff(r)).length+'개 · ':'')+'정한 요일에 골라서 추가하는 할 일</small></button>'+
    (store.push?'<button type="button" data-act="notify">알림<small id="m-notify">'+NSTATE[S.pushState||"..."]+'</small></button>':'')+
    '<button type="button" data-act="export">백업 만들기<small>데이터를 텍스트로 복사</small></button>'+
    '<button type="button" data-act="import">백업 복원<small>복사해 둔 백업 불러오기</small></button>';
  if(store.signOut)h+='<button type="button" data-act="logout">로그아웃<small>'+esc(store.email||"")+'</small></button>';
  h+='</div><p class="ver">또박 '+VERSION+'</p>';
  drawSheet(h);
}
const NSTATE={"on":"이 기기에서 켜짐","off":"이 기기에서 꺼짐","denied":"차단됨","ios-install":"홈 화면 앱에서만 가능","unsupported":"이 브라우저는 지원 안 함","...":"확인 중…"};
function refreshPush(then){if(!store.push)return;store.push.state().then(st=>{S.pushState=st;if(then)then(st);},()=>{});}
function drawNotify(){
  const st=S.pushState||"...";
  const msg={"on":"이 기기에서 알림이 켜져 있어요. 할 일이나 고정 일정에서 알림 시간을 정해 주세요.",
    "off":"알림은 기기마다 따로 켜요. 폰과 PC에서 각각 설정해 주세요.",
    "denied":"알림이 차단돼 있어요. 기기나 브라우저 설정에서 또박의 알림을 허용해 주세요.",
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
    const st=r.archived?'숨김':r.until&&r.until<today?'종료':r.until?'~'+md(r.until).replace(/ \(.\)/,""):'';
    return '<button type="button" class="tplrow'+(c.archived||tplOff(r)?' arc':'')+'" style="--cc:var(--'+c.color+')" data-act="tpl" data-id="'+r.id+'"><span class="dot"></span><span class="nm">'+nameH(r)+'</span>'+
      '<span class="when">'+daysLabel(r.days)+(r.time?' · '+fmtRange(r.time,r.end):'')+(st?' · '+st:'')+(c.archived?' · 카테고리 숨김':'')+'</span></button>';};
  let h='<h2>반복 할 일</h2><p>정한 요일에 골라서 추가하는 할 일이에요. 달력의 ＋를 누르면 그날 할 일에 추가돼요. 추가하지 않은 날은 기록에 남지 않아요.</p>';
  if(on.length)h+='<div class="tpllist">'+on.map(rowH).join("")+'</div>';
  else h+='<p class="empty">'+(off.length?'사용 중인 반복 할 일이 없어요':'아직 반복 할 일이 없어요. 기존 할 일의 ‘반복 할 일로 등록’에서도 만들 수 있어요')+'</p>';
  if(off.length)h+='<div class="archive"><span class="lbl">숨김·종료 '+off.length+'</span><div class="tpllist">'+off.map(rowH).join("")+'</div></div>';
  h+='<div class="actions"><span class="sp"></span><button class="btn pri" type="button" data-act="tplnew">+ 반복 할 일</button></div>';
  drawSheet(h);
}
function exportJSON(){
  return JSON.stringify({app:"ttobak",version:1,exportedAt:new Date().toISOString(),cats:S.cats,tasks:[...S.tasks.values()],tpls:[...S.tpls.values()],events:[...S.events.values()]});
}
function drawExport(){
  drawSheet('<h2>백업 만들기</h2><p>할 일 '+S.tasks.size+'개 · 카테고리 '+S.cats.length+'개'+(S.tpls.size?' · 반복 할 일 '+S.tpls.size+'개':'')+(S.events.size?' · 고정 일정 '+S.events.size+'개':'')+'. 복사한 텍스트를 따로 보관해 주세요. ‘백업 복원’에서 다시 불러올 수 있어요.</p>'+
    '<textarea class="inp code" id="x-out" readonly aria-label="백업 텍스트">'+esc(exportJSON())+'</textarea>'+
    '<div class="actions"><span class="sp"></span><button class="btn pri" type="button" data-act="copy">백업 복사</button></div>');
}
function clean(t){
  const s=v=>typeof v==="string"?v:"";
  return {title:s(t.title).slice(0,500)||"제목 없음",note:s(t.note).slice(0,5000),
    date:DATE_RE.test(t.date)?t.date:null,time:TIME_RE.test(t.time)?t.time:null,
    cat:s(t.cat)||null,sub:s(t.sub)||null,done:!!t.done,doneAt:typeof t.doneAt==="number"?t.doneAt:null,
    createdAt:typeof t.createdAt==="number"?t.createdAt:Date.now(),
    remind:TIME_RE.test(t.time)&&Number.isInteger(t.remind)&&t.remind>=0&&t.remind<=10080?t.remind:null,
    end:TIME_RE.test(t.time)&&okEnd(t.time,t.end)?t.end:null,
    ...(t.skipped?{skipped:true,skippedAt:typeof t.skippedAt==="number"?t.skippedAt:Date.now()}:{}),
    subtasks:Array.isArray(t.subtasks)?t.subtasks.filter(x=>x&&typeof x.t==="string").slice(0,100).map(x=>({id:/^[A-Za-z0-9_-]{1,40}$/.test(x.id)?x.id:uid8("s"),t:x.t.slice(0,300),done:!!x.done})):[],
    ...(typeof t.tpl==="string"&&/^r_[A-Za-z0-9_-]{1,60}$/.test(t.tpl)?{tpl:t.tpl}:{}),
    ...(typeof t.from==="string"&&/^t_[A-Za-z0-9_-]{1,60}$/.test(t.from)?{from:t.from,fromDate:DATE_RE.test(t.fromDate)?t.fromDate:null,again:Number.isInteger(t.again)&&t.again>0&&t.again<100?t.again:1}:{}),
    ...(typeof t.later==="string"&&/^t_[A-Za-z0-9_-]{1,60}$/.test(t.later)&&DATE_RE.test(t.laterDate)?{later:t.later,laterDate:t.laterDate}:{})};
}
function cleanTpl(r){
  const c=clean(r);
  return {title:c.title,note:c.note,time:c.time,end:c.end,remind:c.remind,cat:c.cat,sub:c.sub,createdAt:c.createdAt,
    until:DATE_RE.test(r.until)?r.until:null,archived:!!r.archived,
    days:sortDays((Array.isArray(r.days)?r.days:[]).filter(d=>Number.isInteger(d)&&d>=0&&d<=6)),
    subtasks:c.subtasks.map(x=>({id:x.id,t:x.t,done:false}))};
}
function parseImport(text){
  let d;try{d=JSON.parse(text);}catch(e){return {err:"백업을 읽을 수 없어요. 복사한 내용이 빠지지 않았는지 확인해 주세요"};}
  if(!d||!Array.isArray(d.tasks))return {err:"백업을 읽을 수 없어요. 복사한 내용이 빠지지 않았는지 확인해 주세요"};
  const tasks=d.tasks.filter(t=>t&&typeof t.id==="string"&&/^t_[A-Za-z0-9_-]{1,60}$/.test(t.id)).map(t=>Object.assign({id:t.id},clean(t)));
  let cats=null;
  if(Array.isArray(d.cats)&&d.cats.length)cats=d.cats.filter(c=>c&&typeof c.id==="string"&&/^[A-Za-z0-9_-]{1,40}$/.test(c.id)).slice(0,40).map(c=>{
    const o={id:c.id,name:String(c.name||"이름 없음").slice(0,24),color:COLORS.includes(c.color)?c.color:"c8",
      subs:Array.isArray(c.subs)?c.subs.filter(s=>s&&typeof s.id==="string"&&/^[A-Za-z0-9_-]{1,40}$/.test(s.id)).slice(0,60).map(s=>({id:s.id,name:String(s.name||"").slice(0,20)||"이름 없음"})):[]};
    if(c.archived)o.archived=true;return o;});
  if(cats&&(!cats.length||cats.every(c=>c.archived)))cats=null;
  const tpls=(Array.isArray(d.tpls)?d.tpls:[]).filter(r=>r&&typeof r.id==="string"&&/^r_[A-Za-z0-9_-]{1,60}$/.test(r.id)).slice(0,200).map(r=>Object.assign({id:r.id},cleanTpl(r)));
  const events=(Array.isArray(d.events)?d.events:[]).filter(e=>e&&typeof e.id==="string"&&/^e_[A-Za-z0-9_-]{1,60}$/.test(e.id)).slice(0,200).map(e=>{
    const c=clean(e);return {id:e.id,title:c.title,place:typeof e.place==="string"?e.place.slice(0,60):"",color:COLORS.includes(e.color)?e.color:"c5",
      days:sortDays((Array.isArray(e.days)?e.days:[]).filter(x=>Number.isInteger(x)&&x>=0&&x<=6)),time:c.time,end:c.end,slots:cleanSlots(e.slots),
      from:DATE_RE.test(e.from)?e.from:null,until:DATE_RE.test(e.until)?e.until:null,holOff:e.holOff!==false,remind:c.remind,note:c.note,
      skips:(Array.isArray(e.skips)?e.skips:[]).filter(x=>KEY_RE.test(x)).slice(-400),archived:!!e.archived,createdAt:c.createdAt,
      ovr:Object.fromEntries(Object.entries(e.ovr&&typeof e.ovr==="object"?e.ovr:{}).filter(([k,o])=>KEY_RE.test(k)&&o&&(TIME_RE.test(o.time)||typeof o.place==="string")).slice(-400)
        .map(([k,o])=>[k,Object.assign(TIME_RE.test(o.time)?{time:o.time,end:okEnd(o.time,o.end)?o.end:null}:{},typeof o.place==="string"?{place:o.place.slice(0,60)}:{})]))};});
  return {tasks,cats,tpls,events};
}
function cleanSlots(v){
  if(!Array.isArray(v))return null;const ids=new Set();
  const out=v.slice(0,14).map(s=>{const time=s&&TIME_RE.test(s.time)?s.time:null;let id=s&&typeof s.id==="string"&&/^[a-z0-9]{1,8}$/.test(s.id)?s.id:"";
    if(ids.has(id))id=Math.random().toString(36).slice(2,6);ids.add(id);
    return {id,days:sortDays((Array.isArray(s&&s.days)?s.days:[]).filter(x=>Number.isInteger(x)&&x>=0&&x<=6)),time,end:time&&okEnd(time,s.end)?s.end:null};}).filter(s=>s.days.length&&s.time);
  return out.length>1||(out.length&&out[0].id)?out:null;
}
function drawImport(){
  const d=S.importData;
  drawSheet('<h2>백업 복원</h2><p>‘백업 만들기’에서 복사한 텍스트를 붙여넣어 주세요.</p>'+
    '<textarea class="inp code" id="i-in" placeholder="여기에 붙여넣기" aria-label="복원할 백업"></textarea><div class="err" id="i-err"></div>'+
    (d?'<p id="i-sum">할 일 <b>'+d.tasks.length+'개</b>'+(d.cats?' · 카테고리 <b>'+d.cats.length+'개</b>':'')+(d.tpls.length?' · 반복 할 일 <b>'+d.tpls.length+'개</b>':'')+(d.events.length?' · 고정 일정 <b>'+d.events.length+'개</b>':'')+'</p>'+
      '<p class="tnote">백업에 있는 기존 항목은 백업 내용으로 바뀌어요. 백업에 없는 할 일과 일정은 그대로 남아요.'+(d.cats?' <b>카테고리 목록은 백업으로 모두 바뀌어요.</b> 사라진 카테고리의 할 일은 첫 번째 카테고리에 표시돼요.':'')+'</p>':'')+
    '<div class="actions"><span class="sp"></span><button class="btn pri" type="button" data-act="'+(d?'importgo':'importcheck')+'">'+(d?'백업 복원하기':'확인')+'</button></div>');
}

/* ---------- 정보 시트(시간표에서 누를 때): 읽기 위주, 완료·세부 할 일 체크만 바로 ---------- */
function durText(t,e){if(!okEnd(t,e))return"";const m=endMins(t,e)-mins(t),h=Math.floor(m/60),r=m%60;return (h?h+"시간":"")+(h&&r?" ":"")+(r?r+"분":"");}
function infoBody(t,k,ghost){
  const cat=catOf(t),sub=t.sub?subsOf(cat).find(x=>x.id===t.sub):null,d=k?parse(k):null,r=k?relWord(k):"";
  const rows=[];
  rows.push(['날짜',d?(d.getMonth()+1)+'월 '+d.getDate()+'일 ('+DOW[d.getDay()]+')'+(r?' · '+r:''):'날짜 없음']);
  if(t.time)rows.push(['시간',fmtRange(t.time,t.end)+(durText(t.time,t.end)?' <small>'+durText(t.time,t.end)+'</small>':'')]);
  if(store.push&&t.time&&t.remind!=null)rows.push(['알림',remindLabel(t.remind)]);
  const rp=ghost?t:(t.tpl&&S.tpls.get(t.tpl));
  if(rp)rows.push(['반복',weekly(rp.days)+(rp.until?' · '+md(rp.until).replace(/ \(.\)/,"")+'까지':'')]);
  const subs=Array.isArray(t.subtasks)?t.subtasks:[];
  if(subs.length)rows.push(['세부 할 일','<ul class="isubs">'+subs.map(x=>ghost?'<li><span class="ib"></span>'+esc(x.t)+'</li>':
    '<li><button type="button" class="ib'+(x.done?' on':'')+'" data-act="isub" data-sid="'+esc(x.id)+'" role="checkbox" aria-checked="'+!!x.done+'" aria-label="'+esc(x.t)+'"></button><span class="'+(x.done?'dn':'')+'">'+esc(x.t)+'</span></li>').join("")+'</ul>']);
  if(!ghost&&t.from)rows.push(['이전 기록',(t.fromDate?md(t.fromDate):'날짜 없음')+(t.again>1?' <small>다시 추가 '+t.again+'회</small>':'')]);
  if(!ghost&&t.skipped&&t.laterDate)rows.push(['다시 추가',relWord(t.laterDate)?relWord(t.laterDate)+' <small>'+md(t.laterDate)+'</small>':md(t.laterDate)]);
  if(t.note)rows.push(['메모','<span class="inote">'+esc(t.note)+'</span>']);
  return '<p class="eyebrow sheet-eb icat" style="--cc:var(--'+cat.color+')"><span><i></i>'+esc(cat.name)+(ghost?' · 반복 할 일 · 추가 전':'')+(t.skipped?' · 안 함':'')+'</span></p>'+
    '<h2 class="ititle'+(t.done?' done':'')+'" style="--cc:var(--'+cat.color+')">'+nameH(t)+'</h2><dl class="info">'+rows.map(x=>'<div><dt>'+x[0]+'</dt><dd>'+x[1]+'</dd></div>').join("")+'</dl>';
}
function drawInfo(){
  if(S.infoEv){
    const e=S.events.get(S.infoEv),k=S.infoK;if(!e){closeDlg();return;}
    const b=evBase(e,k,S.infoS),key=k&&occKey(k,b.sid),x=evAt(e,k,b.sid),multi=slotsOf(e).length>1;
    const d=k?parse(k):null,r=k?relWord(k):"",off=!!(k&&Array.isArray(e.skips)&&e.skips.includes(key)),o=k&&e.ovr&&e.ovr[key];
    const tChg=o&&(x.time!==b.time||(x.end||null)!==(b.end||null)),pChg=o&&(x.place||"")!==(e.place||"");
    const rows=[];
    if(d)rows.push(['날짜',(d.getMonth()+1)+'월 '+d.getDate()+'일 ('+DOW[d.getDay()]+')'+(r?' · '+r:'')+(off?' · <b class="offt">쉼</b>':'')]);
    /* 묶음이 여럿이면 '시간'은 이 날 것, '매주'에 전부 */
    const wk=multi?fmtRange(b.time,b.end):weekly(b.days)+' · '+fmtRange(b.time,b.end);
    rows.push(['시간',tChg?'<b>'+fmtRange(x.time,x.end)+'</b> <small>이날만</small>':wk+(durText(b.time,b.end)?' <small>'+durText(b.time,b.end)+'</small>':'')]);
    if(tChg)rows.push(['평소',wk]);
    if(multi)rows.push(['매주',slotsOf(e).map(s=>'<span class="islot">'+slotLine(s)+'</span>').join("")]);
    if(x.place||pChg)rows.push(['장소',pChg?'<b>'+esc(x.place||"없음")+'</b> <small>이날만'+(e.place?' · 평소 '+esc(e.place):'')+'</small>':esc(x.place)]);
    if(e.from||e.until)rows.push(['기간',(e.from?md(e.from):'')+' ~ '+(e.until?md(e.until):'')]);
    rows.push(['공휴일',e.holOff!==false?'일정 없음':'일정 있음']);
    if(store.push&&e.remind!=null)rows.push(['알림',remindLabel(e.remind)]);
    if(e.note)rows.push(['메모','<span class="inote">'+esc(e.note)+'</span>']);
    drawSheet('<p class="eyebrow sheet-eb icat" style="--cc:var(--'+(e.color||"c5")+')"><span><i></i>고정 일정</span></p><h2 class="ititle'+(off?' done':'')+'">'+esc(e.title)+'</h2>'+
      '<dl class="info">'+rows.map(x=>'<div><dt>'+x[0]+'</dt><dd>'+x[1]+'</dd></div>').join("")+'</dl>'+
      '<div class="actions"><button class="btn sec" type="button" data-act="eedit">편집</button><span class="sp"></span>'+
      (k&&!off?'<button class="btn sec" type="button" data-act="evday">이날만 바꾸기</button>':'')+
      (k?'<button class="btn '+(off?'pri':'sec')+'" type="button" data-act="eskipday">'+(off?'쉼 취소':'이날만 쉼')+'</button>':'')+'</div>');
    return;
  }
  if(S.infoTpl){
    const r=S.tpls.get(S.infoTpl);if(!r){closeDlg();return;}
    drawSheet(infoBody(r,S.infoK,true)+'<p class="tnote">추가한 뒤부터 할 일로 집계돼요'+(r.time&&r.remind!=null?'. 알림도 추가한 뒤에 받을 수 있어요':'')+'</p><div class="actions"><button class="btn sec" type="button" data-act="itpl">편집</button><span class="sp"></span><button class="btn pri" type="button" data-act="iadd">이날 할 일에 추가</button></div>');
    return;
  }
  const t=S.tasks.get(S.infoId);if(!t){closeDlg();return;}
  drawSheet(infoBody(t,t.date,false)+'<div class="actions"><button class="btn sec" type="button" data-act="iedit">편집</button><span class="sp"></span>'+
    '<button class="btn '+(t.done?'sec':'pri')+'" type="button" data-act="toggle" data-id="'+t.id+'">'+(t.done?'완료 취소':'완료하기')+'</button></div>');
}
/* 시간표에서 묶인 일정 목록 */
function drawGroup(){
  const k=S.groupK,d=parse(k);
  const list=(S.groupList||[]).map(x=>({x,t:x.kind==="ghost"?S.tpls.get(x.id):x.kind==="ev"?(S.events.get(x.id)&&evAt(S.events.get(x.id),k,x.sid)):S.tasks.get(x.id)})).filter(o=>o.t);
  if(!list.length){closeDlg();return;}
  drawSheet('<p class="eyebrow sheet-eb"><span>'+(d.getMonth()+1)+'월 '+d.getDate()+'일 ('+DOW[d.getDay()]+')</span></p><h2>겹친 일정 '+list.length+'개</h2>'+
    '<div class="glist">'+list.map(({x,t})=>{const ev=x.kind==="ev",c=ev?null:catOf(t),col=ev?(t.color||"c5"):c.color;
      const what=ev?'고정 일정'+(t.place?' · '+esc(t.place):'')+(x.off?' · 이날 쉼':''):esc(c.name)+(x.kind==="ghost"?' · 반복 할 일':'')+(t.done?' · 완료':'');
      return '<button type="button" class="grow'+(t.done||x.off?' done':'')+(x.kind==="ghost"?' ghost':'')+(ev?' ev':'')+'" style="--cc:var(--'+col+')" data-act="'+(ev?'einfo':x.kind==="ghost"?'ginfo':'info')+'" data-id="'+t.id+'" data-k="'+k+'"'+(ev?' data-s="'+(t.sid||"")+'"':'')+'>'+
        '<span class="gt">'+fmtRange(t.time,t.end)+'</span><span class="gm"><span class="gtt">'+(ev?esc(t.title):nameH(t))+'</span><span class="gc"><i></i>'+what+'</span></span></button>';}).join("")+'</div>'+
    '<div class="actions"><span class="sp"></span><button class="btn sec" type="button" data-act="close">닫기</button></div>');
}
function openEvInfo(id,k,sid){if(!S.events.get(id))return;S.infoEv=id;S.infoK=k||null;S.infoS=sid==null?null:sid;S.infoId=null;S.infoTpl=null;openSheet("info",drawInfo);}
function openInfo(id){if(!S.tasks.get(id))return;S.infoId=id;S.infoTpl=null;S.infoEv=null;openSheet("info",drawInfo);}
function openGhostInfo(id,k){if(!S.tpls.get(id))return;S.infoTpl=id;S.infoK=k;S.infoId=null;S.infoEv=null;openSheet("info",drawInfo);}

/* ---------- 고정 일정: 목록·편집 ---------- */
function evList(){const f=r=>{const d=sortDays(slotsOf(r)[0].days);return d.length?WEEK.indexOf(d[0]):9;},t=r=>slotsOf(r)[0].time||"99";
  return [...S.events.values()].sort((a,b)=>f(a)-f(b)||(t(a)<t(b)?-1:t(a)>t(b)?1:0)||KO.compare(a.title||"",b.title||""));}
function drawEvs(){
  const list=evList(),on=list.filter(e=>!evOff(e)),off=list.filter(evOff);
  const rowH=e=>{const st=e.archived?'숨김':e.until&&e.until<today?'종료':e.until?'~'+md(e.until).replace(/ \(.\)/,""):'';
    return '<button type="button" class="tplrow'+(evOff(e)?' arc':'')+'" style="--cc:var(--'+(e.color||"c5")+')" data-act="eedit" data-id="'+e.id+'"><span class="dot sq"></span><span class="nm">'+esc(e.title)+'</span>'+
      (slotsOf(e).length>1?'<span class="when ms">'+slotsOf(e).map(x=>'<span>'+slotLine(x)+'</span>').join("")+(st?'<span>'+st+'</span>':'')+'</span>':
      '<span class="when">'+daysLabel(e.days)+(e.time?' · '+fmtRange(e.time,e.end):' · 시간 없음')+(st?' · '+st:'')+'</span>')+'</button>';};
  let h='<h2>고정 일정</h2><p>수업처럼 매주 같은 시간에 있는 일정이에요. 달력과 시간표에 표시되며 완료 체크는 하지 않아요.</p>';
  if(on.length)h+='<div class="tpllist">'+on.map(rowH).join("")+'</div>';
  else h+='<p class="empty">'+(off.length?'사용 중인 고정 일정이 없어요':'아직 고정 일정이 없어요. 시간표의 빈칸에서도 추가할 수 있어요')+'</p>';
  if(off.length)h+='<div class="archive"><span class="lbl">숨김·종료 '+off.length+'</span><div class="tpllist">'+off.map(rowH).join("")+'</div></div>';
  h+='<div class="actions"><span class="sp"></span><button class="btn pri" type="button" data-act="evnew">+ 고정 일정</button></div>';
  drawSheet(h);
}
/* 고정 일정 편집. 요일·시간은 줄(카드) 목록: 줄마다 요일 여러 개 + 시작~끝 + 길이. 같은 요일이 여러 줄에 있어도 된다 */
const newSid=e=>{let id;do id=Math.random().toString(36).slice(2,6);while(e.slots.some(x=>x.id===id));return id;};
function openEv(id,seed){
  const e=id?S.events.get(id):null;if(id&&!e)return;
  const src=e||seed||{};
  const used=new Set([...S.events.values()].map(x=>x.color));
  S.editing=id||null;S.editGone=false;
  const slots=e?slotsOf(e).map(s=>({id:s.id,days:sortDays(s.days),time:s.time||"",end:s.end||""})):[{id:"",days:src.days||[parse(S.sel).getDay()],time:src.time||"",end:src.end||(src.time?plusHour(src.time):"")}];
  S.edit={ev:true,title:src.title||"",place:src.place||"",note:src.note||"",color:src.color||COLORS.slice(1).find(c=>!used.has(c))||"c5",
    slots,time:"",end:"",days:[],from:src.from||"",until:src.until||"",
    holOff:src.holOff!==false,remind:src.remind==null?null:src.remind,archived:!!src.archived,date:"",nodate:false,subtasks:[],subDraft:""};
  openSheet("ev",drawEv);
  if(!id){const ti=$("#e-title");if(ti)ti.focus();}
}
const EVDURS=[30,45,60,75,90,120,150,180];
/* 두 줄이 같은 요일에 시간이 겹치나(자정 넘김은 그 날 안에서만 봄) */
function slotClash(a,b){if(!a.time||!b.time||!a.days.some(d=>b.days.includes(d)))return false;
  const r=x=>{const s0=mins(x.time);return [s0,okEnd(x.time,x.end)?endMins(x.time,x.end):s0+1];},[a0,a1]=r(a),[b0,b1]=r(b);return a0<b1&&b0<a1;}
function slotCard(e,x,i){
  const n=e.slots.length,d=durOf(x.time,x.end),endWrong=!!(x.time&&x.end&&!x.endBad&&x.end===x.time);
  const clash=e.slots.some((y,j)=>j!==i&&slotClash(x,y));
  const opts=(d==null?['<option value="">'+(x.time?'끝 없음':'—')+'</option>']:[]).concat(EVDURS.includes(d)||d==null?[]:['<option value="'+d+'" selected>'+durWords(d)+'</option>'],
    EVDURS.map(m=>'<option value="'+m+'"'+(m===d?' selected':'')+'>'+durWords(m)+'</option>')).join("");
  return '<div class="slot" data-i="'+i+'">'+
    '<div class="catpick days" role="group" aria-label="요일 '+(i+1)+'">'+WEEK.map(w=>'<button type="button" class="pill dw d'+w+'" aria-pressed="'+x.days.includes(w)+'" data-act="sday" data-i="'+i+'" data-d="'+w+'">'+DOW[w]+'</button>').join("")+'</div>'+
    '<span class="trange">'+oneTime("s-time-"+i,x.time,x.timeRaw,x.timeBad,false,"0930","시작 시간",{text:x.time?fmtTime(x.time):"24시간제"})+'<span class="tilde">~</span>'+
      oneTime("s-end-"+i,x.end,x.endRaw,x.endBad,!x.time,"종료","종료 시간",{text:endWrong?"시작 시간과 같아요":x.end?(x.time&&night(x.time,x.end)?"다음 날 ":"")+fmtTime(x.end):"선택",bad:endWrong})+'</span>'+
    '<div class="sfoot"><label class="sdur">소요 시간<select class="inp" id="s-dur-'+i+'"'+(x.time?'':' disabled')+' aria-label="소요 시간">'+opts+'</select></label><span class="sp"></span>'+
      (n>1?'<button class="linkish" type="button" data-act="slotdel" data-i="'+i+'" aria-label="시간대 '+(i+1)+' 삭제">시간대 삭제</button>':x.time?'<button class="linkish" type="button" data-act="notime">시간 지우기</button>':'')+'</div>'+
    (!x.days.length?'<p class="snote">요일을 골라 주세요</p>':clash?'<p class="snote bad">'+daysLabel(x.days.filter(w=>e.slots.some((y,j)=>j!==i&&y.days.includes(w))))+'에 다른 시간대와 겹쳐요</p>':
      !fine&&x.time&&night(x.time,x.end)?'<p class="snote">다음 날 '+fmtTime(x.end)+'에 끝나요</p>':'')+
    '</div>';
}
function drawEv(){
  const e=S.edit;
  let h='<p class="eyebrow sheet-eb"><span>'+(S.editing?'고정 일정':'새 고정 일정')+'</span></p>'+
    '<input class="inp big" id="e-title" type="text" value="'+esc(e.title)+'" placeholder="일정 이름 (예: 영어회화)" autocomplete="off" enterkeyhint="next" aria-label="일정 이름">'+
    '<input class="inp" id="e-place" type="text" value="'+esc(e.place)+'" placeholder="장소 (선택)" autocomplete="off" enterkeyhint="done" aria-label="장소">';
  h+='<div class="field"><span class="lbl">색</span><div class="sw" role="group" aria-label="색">'+COLORS.map(k=>'<button type="button" style="--cc:var(--'+k+')" aria-pressed="'+(k===e.color)+'" aria-label="색 '+k.slice(1)+'" data-act="evcolor" data-color="'+k+'"></button>').join("")+'</div></div>';
  const timed=e.slots.some(x=>x.time),ready=e.slots.some(x=>x.time&&x.days.length);
  h+='<div class="field"><span class="lbl">반복 요일·시간'+(ready?'':' · 요일과 시작 시간을 정해 주세요')+'</span><div class="slots">'+e.slots.map((x,i)=>slotCard(e,x,i)).join("")+'</div>'+
    '<button class="linkish slotadd" type="button" data-act="slotadd">+ 시간대 추가</button></div>';
  h+='<div class="field"><span class="lbl">기간</span><div class="row prow"><input class="inp" id="e-from" type="date" value="'+esc(e.from)+'" aria-label="시작일"><span class="tilde">~</span><input class="inp" id="e-until" type="date" value="'+esc(e.until)+'" aria-label="종료일"></div>'+
    '<p class="snote">시작일이 없으면 과거에도 표시돼요. 종료일이 없으면 계속 표시돼요</p>'+
    (e.from||e.until?'<button class="linkish" type="button" data-act="evnoperiod" style="align-self:flex-start">기간 지우기</button>':'')+
    '<label class="opt"><input type="checkbox" id="e-hol"'+(e.holOff?' checked':'')+'>공휴일에는 일정 없음</label></div>';
  if(store.push){
    const can=timed;
    h+='<div class="field"><span class="lbl">알림'+(can?'':' · 시간을 정하면 켤 수 있어요')+'</span><div class="catpick remind">'+REMIND.map(r=>'<button type="button" class="pill" aria-pressed="'+(can&&e.remind===r[0]||(!can&&r[0]===null))+'" data-act="eremind" data-m="'+(r[0]==null?"":r[0])+'"'+(can?'':' disabled')+'>'+r[1]+'</button>').join("")+'</div></div>';
  }
  h+='<div class="field"><label for="e-note">메모</label><textarea class="inp" id="e-note" placeholder="교수님 연락처, 준비물 등">'+esc(e.note)+'</textarea></div>';
  const ended=!!(e.until&&e.until<today);
  const re=S.editing&&(e.archived||ended);
  if(re)h+='<p class="tnote">'+(e.archived?'숨긴 일정이에요. 과거 일정도 달력과 시간표에 표시되지 않아요':'기간이 끝난 일정이에요')+'. '+reuseNote(e.archived,ended)+'</p>';
  else if(S.editing)h+='<p class="tnote">숨기면 과거와 앞으로의 일정이 모두 숨겨져요. 데이터는 지워지지 않아요. 과거 일정을 남기려면 종료일을 정해 주세요</p>';
  h+='<div class="actions">'+(S.editing?'<button class="btn dng" type="button" data-act="evdel">삭제</button><button class="btn sec" type="button" data-act="'+(re?'evunarc':'evarc')+'">'+(re?'다시 사용':'숨기기')+'</button>':'<button class="btn ghost" type="button" data-act="tplcancel">취소</button>')+
    '<span class="sp"></span><button class="btn pri" type="button" data-act="save">저장</button></div>';
  drawSheet(h);
}
const normSlots=e=>Array.isArray(e.slots)&&e.slots.length?slotsOf(e).map(x=>({id:x.id,days:sortDays(x.days),time:x.time,end:x.end})):null;
const normEv=e=>({title:e.title||"",place:e.place||"",color:e.color||"c5",days:sortDays(e.days),time:e.time||null,end:e.end||null,slots:normSlots(e),from:e.from||null,until:e.until||null,
  holOff:e.holOff!==false,remind:e.remind==null?null:e.remind,note:e.note||"",archived:!!e.archived});
function commitEv(){
  syncEdit();const e=S.edit,id=S.editing,old=id&&S.events.get(id);
  if(!e||S.editGone||(id&&!old))return;
  const title=e.title.trim()||(old?old.title:"");if(!title)return;
  /* 줄 정리: 요일·시간이 다 있는 줄만, 요일·시간 순. 하나도 없으면 첫 줄 그대로(시간 없는 일정) */
  const raw=e.slots.map(x=>({id:x.id||"",days:sortDays(x.days),time:TIME_RE.test(x.time)?x.time:null,end:x.end||null}));
  let sl=raw.filter(x=>x.days.length&&x.time).map(x=>Object.assign(x,{end:okEnd(x.time,x.end)?x.end:null}));
  sl.sort((a,b)=>WEEK.indexOf(a.days[0])-WEEK.indexOf(b.days[0])||(a.time<b.time?-1:a.time>b.time?1:0));
  if(!sl.length)sl=[Object.assign(raw[0],{end:raw[0].time&&okEnd(raw[0].time,raw[0].end)?raw[0].end:null})];
  const main=sl.find(x=>!x.id)||sl[0];
  let from=DATE_RE.test(e.from)?e.from:null,until=DATE_RE.test(e.until)?e.until:null;
  if(from&&until&&until<from){const x=from;from=until;until=x;}
  const body={title,place:e.place.trim().slice(0,60),color:COLORS.includes(e.color)?e.color:"c5",days:main.days,time:main.time,end:main.end,slots:sl.length>1||sl[0].id?sl:null,from,until,
    holOff:!!e.holOff,remind:sl.some(x=>x.time)&&e.remind!=null?e.remind:null,note:e.note.trim(),archived:!!e.archived};
  if(old){if(JSON.stringify(normEv(old))!==JSON.stringify(body))patchTask(id,body);return;}
  setTask(uid8("e_"),Object.assign(body,{skips:[],createdAt:Date.now()}));
  toast("고정 일정을 추가했어요");
}
/* 고정 일정 하나의 이 날만 시간·장소 바꾸기. 닫으면 저장, 원래와 같으면 변경을 지운다 */
function openEvDay(id,k,sid){
  const e0=S.events.get(id);if(!e0||!k)return;const e=evBase(e0,k,sid),o=e0.ovr&&e0.ovr[occKey(k,e.sid)];
  S.edit={evday:true,id,k,sid:e.sid,time:o&&o.time||e.time||"",end:o?(o.time?o.end||"":e.end||""):e.end||"",place:o&&o.place!=null?o.place:e.place||"",subtasks:[]};
  S.editing=id;S.editGone=false;openSheet("evday",drawEvDay);
}
function drawEvDay(){
  const e=S.edit,ev0=S.events.get(e.id);if(!ev0){closeDlg();return;}
  const ev=evBase(ev0,e.k,e.sid),d=parse(e.k),o=ev0.ovr&&ev0.ovr[occKey(e.k,e.sid)];
  let h='<p class="eyebrow sheet-eb icat" style="--cc:var(--'+(ev.color||"c5")+')"><span><i></i>'+esc(ev.title)+'</span><span>'+(d.getMonth()+1)+'월 '+d.getDate()+'일 ('+DOW[d.getDay()]+')</span></p><h2>이날만 바꾸기</h2>'+
    '<p>평소 '+fmtRange(ev.time,ev.end)+(ev.place?' · '+esc(ev.place):'')+'. 다른 날은 그대로예요</p>';
  h+='<div class="field"><label for="e-time">시간</label><div class="row">'+timeInput(e,false).replace(/<button class="linkish" type="button" data-act="notime">[^<]*<\/button>/,"")+'</div></div>';
  h+='<div class="field"><label for="e-place">장소</label><input class="inp" id="e-place" type="text" value="'+esc(e.place)+'" placeholder="장소" autocomplete="off" enterkeyhint="done"></div>';
  h+='<div class="actions">'+(o?'<button class="btn ghost" type="button" data-act="evdayreset">이날 변경 취소</button>':'<button class="btn ghost" type="button" data-act="tplcancel">취소</button>')+'<span class="sp"></span><button class="btn pri" type="button" data-act="save">저장</button></div>';
  drawSheet(h);
}
function commitEvDay(){
  syncEdit();const e=S.edit,ev0=e&&S.events.get(e.id);if(!e||!ev0||S.editGone)return;const ev=evBase(ev0,e.k,e.sid),key=occKey(e.k,ev.sid);
  const ovr=Object.assign({},ev.ovr||{}),prev=ovr[key];
  const time=!e.timeBad&&TIME_RE.test(e.time)?e.time:ev.time,end=!e.endBad&&okEnd(time,e.end)?e.end:null,place=(e.place||"").trim().slice(0,60);
  /* 바꾼 것만 기록한다: 시간(시작·끝)과 장소를 따로. 그래야 원본을 나중에 고쳤을 때 안 바꾼 쪽은 원본을 따른다 */
  const tSame=time===ev.time&&(end||null)===(okEnd(ev.time,ev.end)?ev.end:null),pSame=place===(ev.place||"");
  const same=e.reset||(tSame&&pSame);
  if(same){if(!prev)return;delete ovr[key];}
  else{const nv=Object.assign(tSame?{}:{time,end},pSame?{}:{place});if(prev&&JSON.stringify(prev)===JSON.stringify(nv))return;ovr[key]=nv;}
  /* 오래된 기록도 지우지 않는다(과거 화면이 실제와 같게). 문서가 너무 커지지 않게 최근 400개까지만 */
  const ks=Object.keys(ovr).sort();for(const k of ks.slice(0,Math.max(0,ks.length-400)))delete ovr[k];
  patchTask(ev.id,{ovr});S.events.set(ev.id,Object.assign({},ev0,{ovr}));
  toast(same?"이날 변경을 취소했어요":"이날만 바꿨어요");
}
/* '안 함'·'다른 날에': 고른 날에 같은 할 일을 새로 넣고, 원래 날은 '안 함'으로 남긴다(뒤늦게라도 하는 느낌, 기록도 남게)
   mode: "skip"(아직 안 정리한 할 일) | "again"(이미 안 함인 할 일). 닫으면 아무것도 안 바뀜 */
function openLater(id,mode){S.laterId=id;S.laterMode=mode;openSheet("later",drawLater);}
function drawLater(){
  const t=S.tasks.get(S.laterId);if(!t){closeDlg();return;}
  const opts=[[today,"오늘"],[addDays(today,1),"내일"],[addDays(today,2),"모레"]].filter(o=>o[0]!==t.date);
  const d=t.date?parse(t.date):null;
  let h='<p class="eyebrow sheet-eb icat" style="--cc:var(--'+catOf(t).color+')"><span><i></i>'+nameH(t)+'</span>'+(d?'<span>'+(relWord(t.date)||md(t.date))+'</span>':'')+'</p>'+
    (S.laterMode==="skip"?'<h2>이 할 일을 어떻게 할까요?</h2><p class="lsub">다른 날에 다시 추가</p><p>원래 할 일은 ‘안 함’으로 남고, 고른 날에 새 할 일이 생겨요</p>':
      '<h2>어느 날에 추가할까요?</h2><p>원래 기록은 그대로 두고 새 할 일로 추가해요</p>');
  h+='<div class="laterpick">'+opts.map(o=>'<button type="button" data-act="later" data-k="'+o[0]+'"><b>'+o[1]+'</b><small>'+md(o[0])+'</small></button>').join("")+'</div>';
  h+='<div class="field"><label for="l-date">다른 날</label><div class="row"><input class="inp" id="l-date" type="date" min="'+today+'" value="'+addDays(today,7)+'" style="max-width:170px"><button class="btn sec" type="button" data-act="later" data-k="pick">선택한 날에 추가</button></div></div>';
  h+='<div class="actions">'+(S.laterMode==="skip"?'<button class="btn ghost" type="button" data-act="laterskip">안 함으로 남기기</button>':'')+'<span class="sp"></span><button class="btn ghost" type="button" data-act="close">취소</button></div>';
  drawSheet(h);
}
function doLater(k){
  const t0=S.tasks.get(S.laterId),mode=S.laterMode;S.laterDone=true;const nx=applyDraft(S.laterDraft);closeDlg();if(!t0)return;
  const t=Object.assign({},t0,nx||{});
  const nid=uid8("t_"),now=Date.now();
  setTask(nid,{title:t.title,note:t.note||"",date:k,time:t.time||null,end:t.time&&okEnd(t.time,t.end)?t.end:null,remind:t.time&&t.remind!=null?t.remind:null,
    cat:t.cat,sub:t.sub||null,done:false,doneAt:null,createdAt:now,subtasks:(t.subtasks||[]).map(x=>({id:uid8("s"),t:x.t,done:!!x.done})),
    from:t.id,fromDate:t.date||null,again:(t.again||0)+1});
  const back=mode==="skip"?{skipped:false,skippedAt:null,later:null,laterDate:null}:{later:t.later||null,laterDate:t.laterDate||null};
  patchTask(t.id,Object.assign(mode==="skip"?{skipped:true,skippedAt:now}:{},{later:nid,laterDate:k}));
  toast((relWord(k)||md(k))+" · 새 할 일로 추가했어요",{label:"되돌리기",fn:()=>{delTask(nid);if(S.tasks.get(t.id))patchTask(t.id,back);}});
}
/* 시간표 빈칸을 눌렀을 때: 그 시간에 할 일 또는 고정 일정 */
function drawSlot(){
  const {k,time}=S.slot,d=parse(k);
  drawSheet('<p class="eyebrow sheet-eb"><span>'+(d.getMonth()+1)+'월 '+d.getDate()+'일 ('+DOW[d.getDay()]+') · '+fmtTime(time)+'</span></p><h2>무엇을 넣을까요?</h2>'+
    '<div class="slotpick"><button type="button" data-act="slottask"><b>할 일</b><small>이 날 이 시간에 한 번</small></button>'+
    '<button type="button" data-act="slotev"><b>고정 일정</b><small>매주 '+DOW[d.getDay()]+'요일 이 시간 (수업 등)</small></button></div>');
}
/* 새 할 일 초안(시간표 빈칸에서): 제목을 쓰고 닫으면 생긴다 */
function openNewTask(k,time){
  const cat=active()[0];
  S.editing=null;S.newDraft={date:k};S.editGone=false;
  S.edit={title:"",note:"",date:k,time:time||"",end:"",nodate:false,cat:cat.id,sub:null,subDraft:"",remind:null,subtasks:[]};
  if(time)S.edit.end=plusHour(time);
  openSheet("edit",drawEdit);const ti=$("#e-title");if(ti)ti.focus();
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
/* 시작·끝 입력칸 → o.time·o.end. 시작만 옮기면 길이를 지켜 끝도 같이 옮긴다(끝을 직접 고쳤으면 그대로) */
function readRange(o,ti,en,autoEnd){
  const ot=o.time,oe=o.end,od=durOf(ot,oe);
  if(ti){if(ti.type==="time")o.time=ti.value;else{const p=parseTime(ti.value);o.timeRaw=ti.value;o.timeBad=p===null;if(p!==null)o.time=p;}}
  if(en){if(en.type==="time")o.end=en.value;else{const p=parseTime(en.value);o.endRaw=en.value;o.endBad=p===null;if(p!==null)o.end=p;}}
  if(o.end===oe&&od&&o.time&&ot&&o.time!==ot&&!o.timeBad){o.end=addMin(o.time,od);o.endRaw="";o.endBad=false;}
  if(autoEnd&&!ot&&o.time&&!o.timeBad&&!o.end){o.end=addMin(o.time,60);o.endRaw="";o.endBad=false;}
}
function syncEdit(){
  const e=S.edit;if(!e)return;
  const g=id=>document.getElementById(id);
  if(g("e-title"))e.title=g("e-title").value;
  if(g("e-note"))e.note=g("e-note").value;
  if(g("e-date"))e.date=g("e-date").value;
  readRange(e,g("e-time"),g("e-end"),false);
  /* 고정 일정 줄마다. 끝이 거의 늘 있으니 처음 시작을 정하면 끝을 1시간 뒤로 채운다(할 일은 끝 없이도 많아서 그대로) */
  if(e.ev&&Array.isArray(e.slots))e.slots.forEach((x,i)=>readRange(x,g("s-time-"+i),g("s-end-"+i),true));
  if(g("e-until"))e.until=g("e-until").value;
  if(g("e-from"))e.from=g("e-from").value;
  if(g("e-place"))e.place=g("e-place").value;
  if(g("e-hol"))e.holOff=g("e-hol").checked;
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
    '<span class="tprev'+(bad||prev.bad?' bad':'')+'" id="'+id+'-p">'+(dis?'':bad?'시간을 확인해 주세요':prev.text)+'</span></span>';
  return '<input class="inp tm" id="'+id+'" type="time" value="'+esc(val)+'" aria-label="'+lab+'"'+(dis?' disabled':'')+'>';
}
/* 시작 ~ 끝 시간. 끝은 선택이고 시작보다 늦어야 한다 */
function timeInput(e,dis){
  const endWrong=!!(e.time&&e.end&&!e.endBad&&e.end===e.time);
  return '<span class="trange">'+oneTime("e-time",e.time,e.timeRaw,e.timeBad,dis,"0930","시작 시간",{text:e.time?fmtTime(e.time):"24시간제"})+
    '<span class="tilde">~</span>'+oneTime("e-end",e.end,e.endRaw,e.endBad,dis||!e.time,"종료",'종료 시간',{text:endWrong?"시작 시간과 같아요":e.end?(e.time&&night(e.time,e.end)?"다음 날 ":"")+fmtTime(e.end):"선택",bad:endWrong})+'</span>'+
    (endWrong&&!fine?'<span class="tbad">시작 시간과 종료 시간이 같아요</span>':'')+(!endWrong&&!fine&&e.time&&night(e.time,e.end)?'<span class="tnight">다음 날 '+fmtTime(e.end)+'에 끝나요</span>':'')+durRow(e,dis)+
    (e.time&&!dis?'<button class="linkish" type="button" data-act="notime">시간 지우기</button>':'');
}
/* 길이: 끝 시간 대신 '얼마 동안'으로도. 고르면 끝이 맞춰지고, 끝을 고치면 길이가 따라온다 */
const DURS=[[30,"30분"],[60,"1시간"],[90,"1시간 반"],[120,"2시간"],[180,"3시간"]];
const addMin=(t,m)=>{const x=((mins(t)+m)%1440+1440)%1440;return pad(Math.floor(x/60))+":"+pad(x%60);};
const durOf=(t,e)=>t&&okEnd(t,e)?endMins(t,e)-mins(t):null;
const durWords=m=>{const h=Math.floor(m/60),r=m%60;return (h?h+"시간":"")+(h&&r?" ":"")+(r?(r===30&&h?"반":r+"분"):"");};
/* "45분", "1시간 반", "2시간", "1:30", "1.5시간", "90"(분), "2"(시간) */
function parseDur(v){
  v=String(v||"").replace(/\s+/g,"").replace(/동안$/,"");if(!v)return null;let m=null,x;
  if((x=v.match(/^(\d{1,2}):(\d{2})$/)))m=+x[1]*60+ +x[2];
  else if((x=v.match(/^(\d+(?:\.\d+)?)(시간|h)$/i)))m=Math.round(parseFloat(x[1])*60);
  else if((x=v.match(/^(?:(\d{1,2})시간)?(반)?(?:(\d{1,3})분)?$/))&&(x[1]||x[3]))m=(+x[1]||0)*60+(x[2]?30:0)+(+x[3]||0);
  else if((x=v.match(/^(\d{1,4})$/)))m=+x[1]<=12?+x[1]*60:+x[1];
  return m&&m>=5&&m<1440?m:null;
}
function durRow(e,dis){
  if(dis||!e.time||e.timeBad)return"";
  const d=durOf(e.time,e.end),hit=DURS.some(x=>x[0]===d);
  return '<div class="durrow" role="group" aria-label="소요 시간"><span class="dlbl">소요 시간</span>'+DURS.map(x=>'<button type="button" class="pill" data-act="edur" data-m="'+x[0]+'" aria-pressed="'+(d===x[0])+'">'+x[1]+'</button>').join("")+
    '<input class="inp dur" id="e-dur" type="text" autocomplete="off" enterkeyhint="done" placeholder="직접" value="'+(d&&!hit?esc(durWords(d)):"")+'" aria-label="소요 시간 직접 입력 (예: 45분, 2시간 반)"></div>';
}
/* '다시 사용' 누르기 전 결과 안내: 숨김 해제 / 종료일 삭제 */
const reuseNote=(arc,ended)=>arc&&ended?'다시 사용하면 숨김을 해제하고 종료일을 지워요':ended?'다시 사용하면 종료일이 지워져요':'다시 사용하면 정한 요일에 표시돼요';
function drawEdit(){
  const e=S.edit,cat=S.cats.find(c=>c.id===e.cat)||active()[0],subs=subsOf(cat),tp=!!e.tpl;
  const pick=S.cats.filter(c=>!c.archived||c.id===e.cat);
  let h=(tp?'<p class="eyebrow sheet-eb"><span>'+repSvg+(S.editing?'반복 할 일':'새 반복 할 일')+'</span></p>':!S.editing?'<p class="eyebrow sheet-eb"><span>새 할 일</span></p>':'')+
    '<input class="inp big" id="e-title" type="text" value="'+esc(e.title)+'" placeholder="'+(tp?'할 일 이름 (예: 분리수거)':'할 일')+'" autocomplete="off" enterkeyhint="done" aria-label="할 일">';
  h+='<div class="field"><span class="lbl">카테고리</span><div class="catpick">'+pick.map(c=>'<button type="button" style="--cc:var(--'+c.color+')" aria-pressed="'+(c.id===e.cat)+'" data-act="ecat" data-cat="'+c.id+'"><i></i>'+esc(c.name)+'</button>').join("")+'</div>';
  if(subs.length)h+='<div class="catpick" style="--cc:var(--'+cat.color+')">'+[{id:"",name:"소분류 없음"}].concat(subs).map(s=>'<button type="button" class="pill" aria-pressed="'+((s.id||null)===e.sub)+'" data-act="esub" data-sub="'+s.id+'">'+esc(s.name)+'</button>').join("")+'</div>';
  h+='</div>';
  if(tp){
    h+='<div class="field"><span class="lbl">매주'+(e.days.length?' · '+daysLabel(e.days):' · 요일을 골라 주세요')+'</span><div class="catpick days" role="group" aria-label="요일">'+
      WEEK.map(d=>'<button type="button" class="pill dw d'+d+'" aria-pressed="'+e.days.includes(d)+'" data-act="eday" data-d="'+d+'">'+DOW[d]+'</button>').join("")+'</div></div>';
    h+='<div class="field"><label for="e-time">시간</label><div class="row">'+timeInput(e,false)+'</div></div>';
    h+='<div class="field"><label for="e-until">종료일'+(e.until?'':' · 없으면 계속 표시')+'</label><div class="row"><input class="inp" id="e-until" type="date" value="'+esc(e.until)+'" min="'+today+'" style="max-width:170px">'+
      (e.until?'<button class="linkish" type="button" data-act="nountil">종료일 지우기</button>':'')+'</div></div>';
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
  if(!tp&&S.editing){
    const t=S.tasks.get(S.editing),r=t&&t.tpl&&S.tpls.get(t.tpl);
    h+='<div class="field"><span class="lbl">반복</span><div class="row"><button class="repbtn" type="button" data-act="tplfrom">'+repSvg+
      (r?weekly(r.days)+' · 반복 설정 편집':'반복 할 일로 등록')+'</button></div></div>';
  }
  h+='<div class="field"><span class="lbl">세부 할 일</span><ul class="subs'+(tp?' plain':'')+'">'+e.subtasks.map(s=>{const i=esc(s.id);return '<li id="sl-'+i+'">'+(tp?'':'<input type="checkbox" id="sc-'+i+'"'+(s.done?' checked':'')+' aria-label="완료">')+'<input type="text" id="s-'+i+'" value="'+esc(s.t)+'" aria-label="세부 할 일"><button class="x" type="button" data-act="subdel" data-sid="'+i+'" aria-label="지우기">×</button></li>';}).join("")+
    '<li class="new"><input class="field-soft" type="text" id="s-new" value="'+esc(e.subDraft||"")+'" placeholder="세부 할 일 추가" autocomplete="off" enterkeyhint="done"></li></ul></div>';
  h+='<div class="field"><label for="e-note">메모</label><textarea class="inp" id="e-note" placeholder="메모">'+esc(e.note)+'</textarea></div>';
  if(tp){
    const ended=!!(e.until&&e.until<today);
    const re=S.editing&&(e.archived||ended);
    h+='<p class="tnote">'+(e.archived?'숨긴 반복 할 일이에요. 이미 추가한 할 일은 그대로 남아요':ended?'반복 기간이 끝났어요':S.editing?'변경 내용은 앞으로 추가할 할 일에만 적용돼요. 숨기면 추가 전 항목만 숨겨지고, 이미 추가한 할 일은 그대로 남아요':'변경 내용은 앞으로 추가할 할 일에만 적용돼요')+'</p>'+
      (re?'<p class="tnote">'+reuseNote(e.archived,ended)+'</p>':'')+'<div class="actions">'+
      (S.editing?'<button class="btn dng" type="button" data-act="tpldel">삭제</button><button class="btn sec" type="button" data-act="'+(re?'tplunarc':'tplarc')+'">'+(re?'다시 사용':'숨기기')+'</button>':'<button class="btn ghost" type="button" data-act="tplcancel">취소</button>')+
      '<span class="sp"></span><button class="btn pri" type="button" data-act="save">저장</button></div>';
  }
  else if(!S.editing)h+='<div class="actions"><button class="btn ghost" type="button" data-act="tplcancel">취소</button><span class="sp"></span><button class="btn pri" type="button" data-act="save">추가</button></div>';
  else{
    const t=S.tasks.get(S.editing),sk=!!(t&&t.skipped);
    const lt=sk&&t.later&&S.tasks.get(t.later);
    if(sk)h+='<p class="tnote">‘안 함’으로 남긴 할 일이에요. 달력과 전체 탭의 기록에서 볼 수 있어요'+(lt?'. 안 함을 취소해도 다시 추가한 할 일('+(lt.date?relWord(lt.date)||md(lt.date):"날짜 없음")+')은 그대로 남아요':'')+'</p>';
    /* 넘기기는 완료하지 않은 할 일만(완료이면서 안 함인 상태가 생기지 않게) */
    h+='<div class="actions"><button class="btn dng" type="button" data-act="del">삭제</button>'+(sk?'<button class="btn sec" type="button" data-act="elater">다른 날에 추가</button>':'<button class="btn sec" type="button" data-act="tomorrow">하루 뒤로</button>')+
      (sk?'<button class="btn sec" type="button" data-act="eunskip">안 함 취소</button>':t&&t.done?'':'<button class="btn sec" type="button" data-act="eskip">넘기기</button>')+'<span class="sp"></span><button class="btn pri" type="button" data-act="save">저장</button></div>';
  }
  drawSheet(h);
}
const norm=t=>({title:t.title||"",note:t.note||"",date:t.date||null,time:t.time||null,end:t.end||null,remind:t.remind==null?null:t.remind,cat:t.cat||null,sub:t.sub||null,
  subtasks:(t.subtasks||[]).map(s=>({id:s.id,t:s.t,done:!!s.done}))});
function commitEdit(noSync){
  if(!noSync)syncEdit();const e=S.edit,id=S.editing;
  if(!id&&S.newDraft&&e&&!S.editGone){
    const title=e.title.trim();if(!title)return;
    const date=e.nodate?null:(e.date||null),time=date&&!e.timeBad&&e.time?e.time:null;
    const subtasks=e.subtasks.filter(x=>x.t.trim()).map(x=>({id:x.id,t:x.t.trim(),done:!!x.done}));
    if(e.subDraft&&e.subDraft.trim())subtasks.push({id:uid8("s"),t:e.subDraft.trim(),done:false});
    setTask(uid8("t_"),{title,note:e.note.trim(),date,time,end:time&&!e.endBad&&okEnd(time,e.end)?e.end:null,remind:time&&e.remind!=null?e.remind:null,cat:e.cat,sub:e.sub||null,done:false,doneAt:null,createdAt:Date.now(),subtasks});
    return;
  }
  const t=id&&S.tasks.get(id);
  if(!e||!t||S.editGone)return;
  const subtasks=e.subtasks.filter(s=>s.t.trim()).map(s=>({id:s.id,t:s.t.trim(),done:!!s.done}));
  if(e.subDraft&&e.subDraft.trim())subtasks.push({id:uid8("s"),t:e.subDraft.trim(),done:false});
  const date=e.nodate?null:(e.date||null);
  const tm=e.timeBad?(t.time||""):e.time;
  const time=date&&tm?tm:null;
  const en=e.endBad?(t.end||""):e.end;
  const next={title:e.title.trim()||t.title,note:e.note.trim(),date,time,end:okEnd(time,en)?en:null,remind:time&&e.remind!=null?e.remind:null,cat:e.cat,sub:e.sub||null,subtasks};
  if(JSON.stringify(norm(t))!==JSON.stringify(next))patchTask(id,next);
  return next;
}
const normTpl=r=>({title:r.title||"",note:r.note||"",time:r.time||null,end:r.end||null,until:r.until||null,archived:!!r.archived,remind:r.remind==null?null:r.remind,cat:r.cat||null,sub:r.sub||null,
  days:sortDays(r.days),subtasks:(r.subtasks||[]).map(s=>({id:s.id,t:s.t}))});
function commitTpl(){
  syncEdit();const e=S.edit,id=S.editing,old=id&&S.tpls.get(id);
  if(S.parentDraft){const d=S.parentDraft;S.parentDraft=null;applyDraft(d);}
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
  toast("반복 할 일을 등록했어요");
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
  const delNote=c=>S.catDelArm===c.id&&counts[c.id]?'<p class="note">할 일 '+counts[c.id]+'개는 ‘'+esc(ro(firstName)).replace(/(으?로)$/,"’$1")+' 옮겨져요</p>':'';
  let h='<h2>카테고리 관리</h2><p>카테고리 안에서 소분류로 나눌 수 있어요. 숨긴 카테고리의 할 일은 모든 목록에서 숨겨지고, 데이터는 지워지지 않아요.</p><div class="catlist">';
  h+=act.map((c,i)=>'<div class="catrow'+(S.catMoved===c.id?' moved':'')+'" id="cr-'+c.id+'" style="--cc:var(--'+c.color+')">'+
    '<div class="row"><input class="inp" id="cn-'+c.id+'" type="text" value="'+esc(c.name)+'" placeholder="카테고리 이름" aria-label="카테고리 이름" maxlength="24">'+
      '<button class="x mv" type="button" data-act="catup" data-cat="'+c.id+'" aria-label="위로"'+(i===0?' disabled':'')+'>'+upSvg+'</button>'+
      '<button class="x mv" type="button" data-act="catdown" data-cat="'+c.id+'" aria-label="아래로"'+(i===act.length-1?' disabled':'')+'>'+dnSvg+'</button></div>'+
    '<div class="sw" role="group" aria-label="색">'+COLORS.map(k=>'<button type="button" style="--cc:var(--'+k+')" aria-pressed="'+(k===c.color)+'" aria-label="색 '+k.slice(1)+'" data-act="catcolor" data-cat="'+c.id+'" data-color="'+k+'"></button>').join("")+'</div>'+
    '<div class="subl">'+(c.subs.length?'<span class="lbl">소분류</span>':'')+c.subs.map((s,j)=>'<span class="subitem'+(S.subMoved===s.id?' moved':'')+'" id="si-'+s.id+'"><input id="sn-'+s.id+'" type="text" value="'+esc(s.name)+'" aria-label="소분류 이름" maxlength="20">'+
      (c.subs.length>1?'<button class="x mv" type="button" data-act="subup" data-cat="'+c.id+'" data-sub="'+s.id+'" aria-label="위로"'+(j===0?' disabled':'')+'>'+upSvg+'</button><button class="x mv" type="button" data-act="subdown" data-cat="'+c.id+'" data-sub="'+s.id+'" aria-label="아래로"'+(j===c.subs.length-1?' disabled':'')+'>'+dnSvg+'</button>':'')+
      '<button class="x" type="button" data-act="subrm" data-cat="'+c.id+'" data-sub="'+s.id+'" aria-label="소분류 지우기">×</button></span>').join("")+
      '<input class="subnew" id="snew-'+c.id+'" data-cat="'+c.id+'" type="text" value="'+esc(c.subNew||"")+'" placeholder="+ 소분류" maxlength="20" autocomplete="off" enterkeyhint="done"></div>'+
    (act.length>1?'<div class="rowacts"><button class="btn ghost sm" type="button" data-act="catarc" data-cat="'+c.id+'" aria-label="'+esc(c.name||"카테고리")+' 숨기기">숨기기</button>'+delBtn(c)+'</div>'+delNote(c):'')+
    '</div>').join("");
  h+='</div>';
  if(arc.length){
    h+='<div class="archive"><span class="lbl">숨긴 카테고리 '+arc.length+'</span>'+arc.map(c=>'<div class="arcrow" id="ar-'+c.id+'" style="--cc:var(--'+c.color+')"><span class="dot"></span><span class="nm">'+esc(c.name||"이름 없음")+'</span>'+
      '<span class="cnt">'+(counts[c.id]?counts[c.id]+'개':'')+'</span>'+
      '<button class="btn ghost sm" type="button" data-act="catunarc" data-cat="'+c.id+'" aria-label="'+esc(c.name||"카테고리")+' 다시 표시">다시 표시</button>'+delBtn(c)+'</div>'+delNote(c)).join("")+'</div>';
  }
  h+='<div class="actions"><button class="btn sec" type="button" data-act="catadd">+ 카테고리</button><span class="sp"></span><button class="btn pri" type="button" data-act="save">저장</button></div>';
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
  if(S.mode==="loading"&&/^(add|toggle|edit|menu|carry|tpl|tpladd|tpladdw|info|ginfo|skip|tgroup|einfo|slot|evs)$/.test(a)){if(!S.loadTold){S.loadTold=true;toast("불러오는 중이에요");setTimeout(()=>{S.loadTold=false;},2500);}return;}
  switch(a){
    case"view":{const v=b.dataset.v;if(v==="week"&&S.view!=="week"){S.week=weekStart(S.sel);S.ttFirst=S.sel;}S.view=v;pref.set("view",v);S.adding=null;window.scrollTo(0,0);render();break;}
    case"ttshow":S.ttShow=b.dataset.v;pref.set("ttShow",S.ttShow);render();break;
    case"wnav":{const d=+b.dataset.d;
      if(isThree()){const tt=$("#main .tt3");if(tt&&S.ttColW)tt.scrollBy({left:d*3*S.ttColW,behavior:reduced?"auto":"smooth"});break;}
      S.week=addDays(S.week||weekStart(S.sel),7*d);S.calDir=d;render();break;}
    case"wtoday":{if(isThree()){S.ttFirst=today;S.week=weekStart(today);const tt=$("#main .tt3");if(tt)delete tt.dataset.vy;render();break;}
      const w=weekStart(today);S.calDir=w>S.week?1:-1;S.week=w;render();break;}
    case"tt7":S.tt7=!S.tt7;pref.set("tt7",S.tt7?"1":"");if(!S.tt7)S.ttFirst=weekStart(S.week||today)===weekStart(today)?today:S.week;window.scrollTo(0,0);render();break;
    case"goday":S.sel=b.dataset.k;S.cursor=b.dataset.k;S.view="day";pref.set("view","day");S.adding=null;window.scrollTo(0,0);render();break;
    case"addcat":S.addCat=b.dataset.cat;S.addSub=S.lastSub[S.addCat]||null;render();{const i=$("#add-all");if(i&&document.activeElement!==i)i.focus();}break;
    case"adddate":S.addDate=b.dataset.k;render();{const i=$("#add-all");if(i&&document.activeElement!==i)i.focus();}break;
    case"tpladdw":{const nid=addFromTpl(b.dataset.id,b.dataset.k);if(!nid)break;
      toast((relWord(b.dataset.k)||md(b.dataset.k))+" · 할 일을 추가했어요",nid?{label:"되돌리기",fn:()=>delTask(nid)}:null);break;}
    case"tplarc":syncEdit();S.edit.archived=true;saveDlg();toast("반복 할 일을 숨겼어요");break;
    case"tplunarc":syncEdit();S.edit.archived=false;if(S.edit.until&&S.edit.until<today)S.edit.until="";saveDlg();toast("반복 할 일을 다시 사용해요");break;
    case"nountil":{syncEdit();S.edit.until="";const u=$("#e-until");if(u)u.value="";drawEdit();break;}
    case"pick":S.sel=b.dataset.k;S.cursor=b.dataset.k;S.adding=null;render();break;
    case"today":{const d=S.cursor<today?1:S.cursor>today?-1:0;S.sel=today;S.cursor=today;S.calDir=d;render();break;}
    case"nav":navCal(+b.dataset.d);break;
    case"calmode":S.calMode=S.calMode==="month"?"week":"month";S.cursor=S.sel;pref.set("calMode",S.calMode);render();break;
    case"add":{const cat=b.dataset.cat;if(S.adding===cat){const i=document.getElementById("add-"+cat);if(i)i.focus();break;}S.adding=cat;S.addDraft="";S.addRaw=false;
      if(cat==="all"){const c=S.cats.find(x=>x.id===S.addCat&&!x.archived)||active()[0];S.addCat=c.id;S.addSub=S.lastSub[c.id]||null;if(S.addDate==null)S.addDate="";}
      else S.addSub=S.lastSub[cat]||null;
      S.focusAdd=true;render();break;}
    case"addsub":S.addSub=b.dataset.sub||null;S.lastSub[S.adding==="all"?S.addCat:S.adding]=S.addSub;render();{const i=document.getElementById("add-"+S.adding);if(i&&document.activeElement!==i)i.focus();}break;
    case"toggle":{const t=S.tasks.get(b.dataset.id);if(!t)break;const done=!t.done;
      b.setAttribute("aria-checked",done);const li=b.closest(".task");if(li)li.classList.toggle("done",done);
      if(done&&!reduced){b.classList.add("pop");setTimeout(()=>b.classList.remove("pop"),320);}
      if(done&&navigator.vibrate)try{navigator.vibrate(8);}catch(e){}
      patchTask(t.id,t.skipped?{done,doneAt:done?Date.now():null,skipped:false}:{done,doneAt:done?Date.now():null});if(S.sheet==="info")drawInfo();break;}
    case"edit":openEdit(b.dataset.id);break;
    case"info":openInfo(b.dataset.id);break;
    case"einfo":openEvInfo(b.dataset.id,b.dataset.k,b.dataset.s);break;
    case"evs":openSheet("evs",drawEvs);break;
    case"evnew":openEv(null,null);break;
    case"eedit":{const id=b.dataset.id||S.infoEv;S.infoEv=null;openEv(id);break;}
    case"sday":{syncEdit();const x=S.edit.slots[+b.dataset.i],d=+b.dataset.d;if(!x)break;x.days=x.days.includes(d)?x.days.filter(y=>y!==d):sortDays(x.days.concat(d));drawEv();break;}
    case"slotadd":{syncEdit();const e=S.edit,l=e.slots[e.slots.length-1]||{};e.slots.push({id:newSid(e),days:[],time:l.time||"",end:l.end||""});drawEv();
      const c=document.querySelectorAll(".slot");if(c.length)c[c.length-1].scrollIntoView({block:"nearest",behavior:"smooth"});break;}
    case"slotdel":{syncEdit();const e=S.edit;if(e.slots.length<2)break;e.slots.splice(+b.dataset.i,1);drawEv();break;}
    case"evcolor":syncEdit();S.edit.color=b.dataset.color;drawEv();break;
    case"evnoperiod":{syncEdit();S.edit.from="";S.edit.until="";drawEv();break;}
    case"evarc":syncEdit();S.edit.archived=true;saveDlg();toast("고정 일정을 숨겼어요");break;
    case"evunarc":syncEdit();S.edit.archived=false;if(S.edit.until&&S.edit.until<today)S.edit.until="";saveDlg();toast("고정 일정을 다시 사용해요");break;
    case"evdel":{const id=S.editing,e=S.events.get(id);S.editGone=true;closeDlg();if(!e)break;const body=Object.assign({},e);delete body.id;delTask(id);
      toast("고정 일정을 삭제했어요",{label:"되돌리기",fn:()=>setTask(id,body)});break;}
    case"evday":{const id=S.infoEv,k=S.infoK,sid=S.infoS;S.infoEv=null;openEvDay(id,k,sid);break;}
    case"evdayreset":S.edit.reset=true;saveDlg();break;
    case"eskipday":{const e=S.events.get(S.infoEv),k0=S.infoK;if(!e||!k0)break;const k=occKey(k0,evBase(e,k0,S.infoS).sid);const sk=Array.isArray(e.skips)?e.skips.slice():[];const i=sk.indexOf(k);
      if(i<0)sk.push(k);else sk.splice(i,1);
      const keep=sk.sort().slice(-400);patchTask(e.id,{skips:keep});S.events.set(e.id,Object.assign({},e,{skips:keep}));drawInfo();toast(i<0?"이날은 쉬어요":"쉼을 취소했어요");break;}
    case"slot":{if(ev.target!==b)break;const r=b.getBoundingClientRect(),h0=+b.dataset.h0,H=+b.dataset.hh;
      let m=h0*60+Math.floor((ev.clientY-r.top)/H*2)*30;m=Math.max(0,Math.min(m,1410));
      S.slot={k:b.dataset.k,time:pad(Math.floor(m/60))+":"+pad(m%60)};openSheet("slot",drawSlot);break;}
    case"slottask":{const {k,time}=S.slot;openNewTask(k,time);break;}
    case"slotev":{const {k,time}=S.slot;openEv(null,{days:[parse(k).getDay()],time});break;}
    case"tgroup":{const g=S.ttGroups&&S.ttGroups[b.dataset.k]&&S.ttGroups[b.dataset.k].get(+b.dataset.c);if(!g)break;
      S.groupK=b.dataset.k;S.groupList=g.slice().sort((a,c)=>a.s-c.s||(a.kind==="ev"?-1:0)-(c.kind==="ev"?-1:0)).map(x=>({id:x.t.id,kind:x.kind,off:!!x.off,sid:x.t.sid}));openSheet("group",drawGroup);break;}
    case"ginfo":openGhostInfo(b.dataset.id,b.dataset.k);break;
    case"isub":{const t=S.tasks.get(S.infoId);if(!t)break;const subs=(t.subtasks||[]).map(x=>x.id===b.dataset.sid?Object.assign({},x,{done:!x.done}):x);patchTask(t.id,{subtasks:subs});
      S.tasks.set(t.id,Object.assign({},t,{subtasks:subs}));drawInfo();break;}
    case"iedit":{const id=S.infoId;S.infoId=null;openEdit(id);break;}
    case"itpl":{const id=S.infoTpl;S.infoTpl=null;openTpl(id);break;}
    case"iadd":{const nid=addFromTpl(S.infoTpl,S.infoK);closeDlg();if(nid)toast((relWord(S.infoK)||md(S.infoK))+" · 할 일을 추가했어요",{label:"되돌리기",fn:()=>delTask(nid)});break;}
    case"showpast":S.showPast=!S.showPast;render();break;
    case"skip":case"eskip":case"elater":{const id=a==="skip"?b.dataset.id:S.editing,t=S.tasks.get(id);if(!t)break;
      const d=a!=="skip"?holdDraft():null;if(d)S.editGone=true;
      openLater(id,t.skipped?"again":"skip");S.laterDraft=d;S.laterDone=false;break;}
    case"later":{const k=b.dataset.k==="pick"?($("#l-date")||{}).value:b.dataset.k;if(!DATE_RE.test(k||"")){const d=$("#l-date");if(d)d.focus();break;}doLater(k);break;}
    case"laterskip":{const id=S.laterId;S.laterDone=true;applyDraft(S.laterDraft);closeDlg();if(!S.tasks.get(id))break;
      patchTask(id,{skipped:true,skippedAt:Date.now()});toast("‘안 함’으로 남겼어요",{label:"되돌리기",fn:()=>patchTask(id,{skipped:false,skippedAt:null})});break;}
    case"unskip":case"eunskip":{const id=a==="eunskip"?S.editing:b.dataset.id;if(!S.tasks.get(id))break;
      if(a==="eunskip"){commitEdit();S.editGone=true;closeDlg();}
      patchTask(id,{skipped:false,skippedAt:null});toast("‘안 함’을 취소했어요");break;}
    case"carry":{const moved=[];for(const t of visibleTasks())if(t.date&&t.date<today&&isOpen(t)){moved.push([t.id,t.date]);patchTask(t.id,{date:today});}
      toast(moved.length+"개를 오늘로 옮겼어요",moved.length?{label:"되돌리기",fn:()=>{for(const [id,d] of moved)if(S.tasks.has(id))patchTask(id,{date:d});}}:null);break;}
    case"showdone":S.showDone=!S.showDone;render();break;
    case"menu":openSheet("menu",drawMenu);refreshPush(()=>{if(S.sheet==="menu")drawMenu();});break;
    case"notify":openSheet("notify",drawNotify);refreshPush(()=>{if(S.sheet==="notify")drawNotify();});break;
    case"pushon":{b.disabled=true;b.textContent="켜는 중…";store.push.enable().then(()=>{S.pushState="on";if(S.sheet==="notify")drawNotify();toast("알림을 켰어요");},
      e=>{const c=e&&e.code;refreshPush(()=>{if(S.sheet==="notify"){drawNotify();const er=$("#n-err");if(er&&c!=="denied")er.textContent=c==="dismissed"?"알림 권한을 허용해 주세요":"켜지 못했어요. 인터넷 연결을 확인해 주세요";}});});break;}
    case"pushoff":{b.disabled=true;store.push.disable().then(()=>{S.pushState="off";if(S.sheet==="notify")drawNotify();toast("이 기기에서 알림을 껐어요");},()=>{b.disabled=false;});break;}
    case"pushtest":{b.disabled=true;b.textContent="보내는 중…";store.push.test().then(r=>{b.disabled=false;b.textContent="테스트 알림";toast(r&&r.sent?"테스트 알림을 보냈어요":"테스트 알림을 보내지 못했어요. 알림을 껐다 켜 주세요");},
      ()=>{b.disabled=false;b.textContent="테스트 알림";toast("보내지 못했어요. 인터넷 연결을 확인해 주세요");});break;}
    case"eremind":{syncEdit();S.edit.remind=b.dataset.m===""?null:+b.dataset.m;redrawEdit();
      if(S.edit.remind!=null)refreshPush(st=>{if(st!=="on")toast(st==="off"?"이 기기는 알림이 꺼져 있어요":"이 기기에서는 알림을 받을 수 없어요",st==="off"?{label:"켜기",fn:()=>{openSheet("notify",drawNotify);}}:null);});break;}
    case"cats":openCats();break;
    case"edur":{syncEdit();if(!S.edit.time)break;Object.assign(S.edit,{end:addMin(S.edit.time,+b.dataset.m),endRaw:"",endBad:false});redrawEdit();break;}
    case"qraw":{S.addRaw=!S.addRaw;updQuick();const i=document.getElementById("add-"+S.adding);if(i&&document.activeElement!==i)i.focus();break;}
    case"tpls":openSheet("tpls",drawTpls);break;
    case"tplnew":openTpl(null,null);break;
    case"tpl":{const id=b.dataset.id;if(S.sheet==="tpls"||!dlg.open)openTpl(id);break;}
    case"tpladd":{const li=b.closest(".task");if(li)li.classList.add("adding");
      if(navigator.vibrate)try{navigator.vibrate(8);}catch(e){}
      addFromTpl(b.dataset.id,b.dataset.k);break;}
    case"tplfrom":{syncEdit();const t=S.tasks.get(S.editing),e=S.edit;if(!t)break;
      const d=holdDraft();
      if(t.tpl&&S.tpls.has(t.tpl)){openTpl(t.tpl);S.parentDraft=d;break;}
      openTpl(null,{title:e.title.trim()||t.title,note:e.note,time:e.timeBad?(t.time||""):e.time,end:e.endBad?(t.end||""):e.end,remind:e.remind,cat:e.cat,sub:e.sub,
        subtasks:e.subtasks.filter(s=>s.t.trim()),date:(!e.nodate&&e.date)||S.sel,from:t.id});S.parentDraft=d;break;}
    case"eday":{syncEdit();const d=+b.dataset.d,ds=S.edit.days;
      S.edit.days=ds.includes(d)?ds.filter(x=>x!==d):sortDays(ds.concat(d));redrawEdit();break;}
    case"tpldel":{const id=S.editing,r=S.tpls.get(id);S.editGone=true;closeDlg();if(!r)break;
      const body=Object.assign({},r);delete body.id;delTask(id);
      toast("반복 할 일을 삭제했어요",{label:"되돌리기",fn:()=>setTask(id,body)});break;}
    case"tplcancel":S.editGone=true;closeDlg();break;
    case"export":openSheet("export",drawExport);break;
    case"copy":{const ta=$("#x-out");const sel=()=>{ta.focus();ta.select();toast("길게 눌러 복사해 주세요");};
      try{navigator.clipboard.writeText(ta.value).then(()=>toast("복사했어요"),sel);}catch(e){sel();}break;}
    case"import":S.importData=null;openSheet("import",drawImport);break;
    case"importcheck":{const txt=$("#i-in").value;const r=parseImport(txt);if(r.err){$("#i-err").textContent=r.err;break;}
      if(!r.tasks.length&&!r.cats&&!r.tpls.length&&!r.events.length){$("#i-err").textContent="가져올 할 일이 없어요";break;}
      S.importData=r;drawImport();break;}
    case"importgo":{const d=S.importData;if(!d)break;b.disabled=true;b.textContent="복원 중…";
      store.importAll(d).then(n=>{closeDlg();toast("백업을 복원했어요");},e=>{onError(e);b.disabled=false;b.textContent="백업 복원하기";});break;}
    case"logout":S.sheet=null;closeDlg();store.signOut();break;
    case"close":closeDlg();break;
    case"save":saveChecked();break;
    case"ecat":syncEdit();if(S.edit.cat!==b.dataset.cat){S.edit.cat=b.dataset.cat;S.edit.sub=null;}drawEdit();break;
    case"esub":syncEdit();S.edit.sub=b.dataset.sub||null;drawEdit();break;
    case"nodate":syncEdit();drawEdit();break;
    case"notime":{syncEdit();if(S.edit.ev){Object.assign(S.edit.slots[0],{time:"",end:"",timeBad:false,endBad:false,timeRaw:"",endRaw:""});drawEv();break;}
      Object.assign(S.edit,{time:"",timeBad:false,end:"",endBad:false});for(const id of ["#e-time","#e-end"]){const ti=$(id);if(ti)ti.value="";}redrawEdit();break;}
    case"subdel":syncEdit();S.edit.subtasks=S.edit.subtasks.filter(s=>s.id!==b.dataset.sid);drawEdit();break;
    case"del":{const id=S.editing;S.editGone=true;closeDlg();removeWithUndo(id);break;}
    case"tomorrow":{syncEdit();const base=(!S.edit.nodate&&S.edit.date)||today;const nd=addDays(base,1);S.edit.nodate=false;S.edit.date=nd;
      const de=$("#e-date");if(de){de.disabled=false;de.value=nd;}const nc=$("#e-nodate");if(nc)nc.checked=false;
      saveDlg();toast(ro(relWord(nd)||md(nd))+" 옮겼어요");break;}
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
const editing=()=>S.sheet==="edit"||S.sheet==="tpl"||S.sheet==="ev"||S.sheet==="evday";
const redrawEdit=()=>S.sheet==="ev"?drawEv():S.sheet==="evday"?drawEvDay():drawEdit();
const SLOT_ID=/^s-(time|end|dur)-(\d+)$/;
document.addEventListener("change",ev=>{const id=ev.target.id,sm=SLOT_ID.exec(id);
  if(sm&&editing()&&S.edit&&S.edit.ev){syncEdit();const x=S.edit.slots[+sm[2]];if(!x)return;
    if(sm[1]==="dur"){const m=+ev.target.value;if(m&&x.time)Object.assign(x,{end:addMin(x.time,m),endRaw:"",endBad:false});}
    drawEv();
    if(sm[1]!=="dur"&&ev.target.type==="text"){const v=sm[1]==="time"?(!x.timeBad&&x.time):(!x.endBad&&x.end);if(v)ev.target.value=v;}
    return;}
  if(editing()&&(id==="e-time"||id==="e-end"||id==="e-date"||id==="e-until"||id==="e-from"||id==="e-dur")){syncEdit();
  if(id==="e-dur"){const m=parseDur(ev.target.value);if(m&&S.edit.time)Object.assign(S.edit,{end:addMin(S.edit.time,m),endRaw:"",endBad:false});else if(ev.target.value.trim())toast("소요 시간을 확인해 주세요 (예: 45분, 1시간 반)");}
  redrawEdit();
  if(id==="e-time"&&ev.target.type==="text"&&!S.edit.timeBad)ev.target.value=S.edit.time;
  if(id==="e-end"&&ev.target.type==="text"&&!S.edit.endBad)ev.target.value=S.edit.end;}});
document.addEventListener("input",ev=>{
  const el=ev.target;
  if(el.matches&&el.matches(".addrow input")){S.addDraft=el.value;updQuick();}
  else if(editing()&&(el.id==="e-time"||el.id==="e-end")){syncEdit();redrawEdit();}
  else if(editing()&&S.edit&&S.edit.ev&&/^s-(time|end)-\d+$/.test(el.id)){syncEdit();drawEv();}
});
function navCal(d){
  if(S.calMode==="month"){const c=parse(S.cursor);S.cursor=keyOf(new Date(c.getFullYear(),c.getMonth()+d,1));}
  else{S.cursor=addDays(S.cursor,7*d);S.sel=addDays(S.sel,7*d);}
  S.calDir=d;render();
}
/* 시간표 좌우로 밀어서 주 넘기기 */
(function(){
  let x0=null,y0=0;const m=$("#main");
  m.addEventListener("touchstart",e=>{if(S.view!=="week"||!e.target.closest(".tt")||isThree()){x0=null;return;}const t=e.touches[0];x0=t.clientX;y0=t.clientY;},{passive:true});
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
  const q=el.matches(".addrow input")&&!S.addRaw?parseQuick(el.value,today):null;
  const done=()=>{S.addDraft="";S.addRaw=false;el.value="";updQuick();};
  if(el.id==="add-all"){const v=el.value.trim();if(!v)return;const dk0=q&&q.date||S.addDate||null;
    addTask(S.addCat,S.addSub,q?q.title:v,dk0,q&&q.time,q&&q.end);done();
    const dk=dk0||"none";toast(dk0?(relWord(dk0)||md(dk0))+(q&&q.time?" "+fmtTime(q.time):"")+" · 할 일을 추가했어요":"날짜 없이 추가했어요");setTimeout(()=>{const sec=document.getElementById("ds-"+dk);if(sec&&sec.scrollIntoView)sec.scrollIntoView({block:"nearest"});},60);}
  else if(el.matches(".addrow input")){if(!el.value.trim())return;const base=S.view==="day"?S.sel:null,dk=q&&q.date||base;
    addTask(el.dataset.cat,S.addSub,q?q.title:el.value,dk,q&&q.time,q&&q.end);done();
    if(dk!==base)toast(dk?(relWord(dk)||md(dk))+(q&&q.time?" "+fmtTime(q.time):"")+" · 할 일을 추가했어요":"날짜 없이 추가했어요",{label:"보기",fn:()=>{S.sel=dk;S.cursor=dk;S.adding=null;render();}});}
  else if(el.id==="e-title"&&S.sheet==="ev"){const pl=$("#e-place");if(pl)pl.focus();}
  else if(el.id==="e-title"||el.id==="e-place"){saveChecked();}
  else if(el.id==="e-time"||el.id==="e-end"){syncEdit();if(S.edit.timeBad||S.edit.endBad){drawEdit();return;}if(el.id==="e-time")el.value=S.edit.time;else el.value=S.edit.end;saveChecked();}
  else if(el.id==="e-dur"||/^s-(time|end)-\d+$/.test(el.id)){el.blur();}
  else if(el.id==="s-new"){const v=el.value.trim();if(!v)return;syncEdit();S.edit.subtasks.push({id:uid8("s"),t:v,done:false});S.edit.subDraft="";el.value="";drawEdit();}
  else if(el.matches(".subnew")){const v=el.value.trim();if(!v)return;syncCats();const c=S.catDraft.find(x=>x.id===el.dataset.cat);c.subs.push({id:uid8("b"),name:v});c.subNew="";el.value="";drawCats();}
}
const enterTarget=el=>el.matches&&(el.matches(".addrow input,.subnew")||el.id==="e-title"||el.id==="e-place"||el.id==="s-new"||el.id==="e-dur"||((el.id==="e-time"||el.id==="e-end"||/^s-(time|end)-\d+$/.test(el.id))&&el.type==="text"));
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
  const sc=/#(add|week)$/.exec(u||"");
  if(sc){if(dlg.open)closeDlg();
    if(sc[1]==="week"){S.view="week";S.week=weekStart(today);S.ttFirst=today;}
    else{S.view="day";S.sel=today;S.cursor=today;const c=active()[0];S.adding=c.id;S.addDraft="";S.addRaw=false;S.addSub=S.lastSub[c.id]||null;S.focusAdd=true;}
    render();try{history.replaceState(history.state,"",location.pathname+location.search);}catch(e){}return;}
  const m=/#d=(\d{4}-\d{2}-\d{2})/.exec(u||"");if(!m)return;
  S.view="day";S.sel=m[1];S.cursor=m[1];S.calDir=0;if(dlg.open)closeDlg();render();
  try{history.replaceState(history.state,"",location.pathname+location.search);}catch(e){}
}
if(navigator.serviceWorker)navigator.serviceWorker.addEventListener("message",e=>{if(e.data&&e.data.type==="open")openDate(e.data.url);});
function tick(){const k=keyOf(new Date());if(k!==today){if(S.sel===today){S.sel=k;S.cursor=k;}today=k;render();}else if(S.view==="week"&&!document.hidden&&S.mode==="live")render();}
document.addEventListener("visibilitychange",()=>{if(!document.hidden)tick();});
setInterval(tick,60000);
/* 연결이 끊기고 돌아올 때 위 알림 줄 갱신 */
window.addEventListener("offline",()=>render());
window.addEventListener("online",()=>{render();if(S.mode==="live")toast("다시 연결됐어요");});
(function(){let w0=window.innerWidth,rz=null;
  window.addEventListener("resize",()=>{clearTimeout(rz);rz=setTimeout(()=>{const w=window.innerWidth;
    if(w===w0){if(S.view==="week"&&S.ttDays&&$("#main .tt3"))placeTT3(S.ttDays,S.ttColW,0,0,0);return;}
    w0=w;if(S.view==="week"&&S.mode!=="signedout"&&S.mode!=="config")render();},150);});
})();

/* ---------- 메모리 저장소 (테스트용) ---------- */
function memoryStore(){
  const tasks=new Map();let cats=null,cb=null;
  const emit=()=>{if(!cb)return;const t=new Map(),r=new Map(),e=new Map();for(const [k,v] of tasks)(k.startsWith("r_")?r:k.startsWith("e_")?e:t).set(k,v);cb.onData({tasks:t,cats,tpls:r,events:e});};
  return {kind:"memory",
    start(c){cb=c;cb.onStatus("local");emit();},
    set(id,b){tasks.set(id,Object.assign({id},b));emit();return Promise.resolve();},
    update(id,p){const t=tasks.get(id);if(t)tasks.set(id,Object.assign({},t,p));emit();return Promise.resolve();},
    remove(id){tasks.delete(id);emit();return Promise.resolve();},
    saveCats(c){cats=c;emit();return Promise.resolve();},
    importAll(d){if(d.cats)cats=d.cats;d.tasks.concat(d.tpls||[],d.events||[]).forEach(t=>{const b=Object.assign({},t);delete b.id;tasks.set(t.id,Object.assign({id:t.id},b));});emit();return Promise.resolve(d.tasks.length);}};
}

window.TodoApp={
  memoryStore,parseQuick,parseDur,
  boot(s){
    store=s;
    render();
    store.start({
      onData(d){S.tasks=d.tasks;S.tpls=d.tpls instanceof Map?d.tpls:new Map();S.events=d.events instanceof Map?d.events:new Map();if(Array.isArray(d.cats)&&d.cats.length)S.cats=d.cats;if(S.mode==="signedout"||S.mode==="config")return;render();if(S.sheet==="info"&&dlg.open&&!sheetClosing)drawInfo();else if(S.sheet==="group"&&dlg.open&&!sheetClosing)drawGroup();},
      onStatus(m){if(m===S.mode)return;if(m==="live")setTimeout(()=>openDate(location.hash),0);if(m==="signedout"){S.tasks=new Map();S.tpls=new Map();S.events=new Map();S.cats=DEFAULT_CATS.slice();S.anim=false;if(dlg.open)dlg.close();}
        const out=x=>x==="signedout"||x==="config";
        if(out(m)!==out(S.mode))$("#main").innerHTML="";
        S.mode=m;render();
        if(m==="live"||m==="local")setTimeout(()=>{S.anim=true;},300);},
      onError
    });
  }
};
})();
