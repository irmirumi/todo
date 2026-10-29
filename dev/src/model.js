/* 또박 — 순수 계산 모음(화면·저장소를 모른다). ui.js와 push.js가 같이 쓴다.
   날짜 키 "YYYY-MM-DD", 시간 "HH:MM". 고정 일정의 발생(occurrences)도 여기서만 계산한다(화면과 알림이 다르게 계산하지 않게). */
(function(g){
"use strict";
const DOW=["일","월","화","수","목","금","토"];
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
const pad=n=>String(n).padStart(2,"0");
/* '일상으로', '공부로': 마지막 글자 받침(ㄹ 제외)이 있으면 '으로' */
const ro=w=>{const c=String(w||"").trim().slice(-1).charCodeAt(0)-0xAC00;return w+(c>=0&&c<11172&&c%28&&c%28!==8?"으로":"로");};
const keyOf=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const parse=k=>{const a=k.split("-").map(Number);return new Date(a[0],a[1]-1,a[2]);};
const addDays=(k,n)=>{const d=parse(k);d.setDate(d.getDate()+n);return keyOf(d);};
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/,TIME_RE=/^\d{2}:\d{2}$/;
/* 고정 일정의 요일·시간(2.3.0, 2.3.1에 다시 짬). slots: [{id,days,time,end}] — 같은 요일이 여러 줄에 있어도 된다(중간에 쉬는 수업 등).
   slots가 없으면 예전처럼 days·time·end 한 줄(id ""). 이 날만 바꾸기(ovr)·쉼(skips)의 키는 occKey: id ""인 줄은 날짜 그대로(예전과 같게), 나머지는 "날짜#id".
   days·time·end는 id ""인 줄(없으면 첫 줄)과 같게 저장해 둔다(예전 버전이 그 줄은 알아보게) */
const slotsOf=e=>Array.isArray(e.slots)&&e.slots.length?e.slots.map(x=>({id:x.id||"",days:Array.isArray(x.days)?x.days:[],time:x.time||null,end:x.end||null})):
  [{id:"",days:Array.isArray(e.days)?e.days:[],time:e.time||null,end:e.end||null}];
const occKey=(k,sid)=>sid?k+"#"+sid:k;
const KEY_RE=/^\d{4}-\d{2}-\d{2}(#[a-z0-9]{1,8})?$/;
/* 그 날 그 줄의 평소 모습 → evBase(sid 없으면 그 요일 첫 줄), 이 날만 바꾼 것까지 → evAt. 결과에 sid가 붙는다 */
function evBase(e,k,sid){const sl=slotsOf(e),w=k?parse(k).getDay():-1;
  const f=(sid!=null&&(sl.find(x=>x.id===sid&&x.days.includes(w))||sl.find(x=>x.id===sid)))||sl.find(x=>x.days.includes(w))||sl[0];
  return Object.assign({},e,{days:f.days,time:f.time,end:f.end,sid:f.id});}
function evAt(e,k,sid){const b=evBase(e,k,sid),o=k&&e.ovr&&e.ovr[occKey(k,b.sid)];return o?Object.assign(b,{time:o.time||b.time,end:o.time?o.end||null:b.end,place:o.place!=null?o.place:b.place}):b;}
const slotLine=x=>daysLabel(x.days)+(x.time?' '+fmtRange(x.time,x.end):'');
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
  let date=null,time=null,end=null,ap=null,week=null,amb=false;
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
        if(x&&y){time=x;end=y;used[i]=true;amb=!ap&&/^\d{1,2}(시.*)?$/.test(r[1]);continue;}}
      const x=qTime(t,ap);
      if(x){time=x;used[i]=true;amb=!ap&&/^\d{1,2}시/.test(t);if(toks[i+1]==="반"&&/시$/.test(t)){time=x.slice(0,3)+"30";used[i+1]=true;i++;}continue;}
    }
  }
  if(!date&&!time)return null;
  const title=toks.filter((t,i)=>!used[i]).join(" ");
  if(!title)return null;
  if(end&&!okEnd(time,end))end=null;
  /* amb: 오전·오후 없이 'n시'로 써서 앱이 짐작한 시간(1~6시는 오후, 7~12시는 그대로). 추가 알림에 반대쪽으로 바꾸기를 붙인다 */
  return {title,date,time,end,amb};
}
function monStart(k){const d=parse(k);d.setDate(d.getDate()-((d.getDay()+6)%7));return keyOf(d);}
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
/* 고정 일정 e가 날짜 k에 생기는 것들(시간대마다 하나). 보관·기간 밖·공휴일 쉼이면 없음. off = 이날만 쉼, chg = 이날만 바꿈 */
function occurrences(e,k,HOL){
  if(!e||e.archived)return[];
  if(e.from&&k<e.from||e.until&&k>e.until)return[];
  if(e.holOff!==false&&HOL&&HOL[k])return[];
  const w=parse(k).getDay(),out=[];
  for(const x of slotsOf(e)){if(!x.time||!x.days.includes(w))continue;const key=occKey(k,x.id);
    out.push({ev:evAt(e,k,x.id),key,sid:x.id,chg:!!(e.ovr&&e.ovr[key]),off:Array.isArray(e.skips)&&e.skips.includes(key)});}
  return out;
}
g.TodoModel={DOW,WEEK,sortDays,weekly,daysLabel,pad,ro,keyOf,parse,addDays,DATE_RE,TIME_RE,slotsOf,occKey,KEY_RE,evBase,evAt,slotLine,parseTime,mins,okEnd,night,endMins,plusHour,fmtRange,h24,fmt24,fmtTime,monStart,parseQuick,DURS,addMin,durOf,durWords,parseDur,occurrences};
})(globalThis);
