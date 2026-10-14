globalThis.window={TTOBAK_HOLIDAYS:{"2026-10-09":["한글날"]}};
const { remindersFrom } = await import(new URL("../src/pwa/push.js", import.meta.url));
const now=new Date(2026,9,5,8,0).getTime(); // Mon 10/5 08:00
const events=new Map([["e_1",{id:"e_1",title:"영어회화",place:"공학관",days:[1,5],time:"09:00",remind:10,holOff:true,skips:["2026-10-12"],until:"2026-10-31"}],
 ["e_2",{id:"e_2",title:"보관",days:[1],time:"09:00",remind:0,archived:true}]]);
const r=remindersFrom(new Map(),[], "https://x/todo/", now, events);
console.log(r.length, r.map(x=>x.id.split("@")[1]).join(","));
console.log(r[0].body, new Date(r[0].at).toTimeString().slice(0,5));
// 확인: 월·금, 한글날(금 10/9)은 공휴일 쉼, 10/12(월)는 이 날만 쉼, 10/31 이후 없음, 보관한 건 제외
import assert from "node:assert/strict";
assert.equal(r.length, 6);
assert.deepEqual(r.map(x => x.id.split("@")[1]), ["2026-10-05","2026-10-16","2026-10-19","2026-10-23","2026-10-26","2026-10-30"]);
assert.equal(r[0].body, "10분 후 · 오전 9:00 · 공학관");
assert.equal(new Date(r[0].at).toTimeString().slice(0, 5), "08:50");
// 마감 알림: 시간 있으면 그 시각 기준, 없으면 그날 9시 기준. 완료·알림 끔은 제외
const due = remindersFrom(new Map([
  ["t_a", { id: "t_a", title: "과제", due: "2026-10-07", dueTime: "15:00", dueRemind: 1440, cat: "k1" }],
  ["t_b", { id: "t_b", title: "리포트", due: "2026-10-09", dueTime: null, dueRemind: 60, cat: "k1" }],
  ["t_c", { id: "t_c", title: "끝남", due: "2026-10-09", dueRemind: 60, done: true, cat: "k1" }],
  ["t_d", { id: "t_d", title: "알림 없음", due: "2026-10-09", dueRemind: null, cat: "k1" }]]), [], "https://x/todo/", now, null);
assert.deepEqual(due.map(x => x.id), ["t_a#due", "t_b#due"]);
assert.equal(new Date(due[0].at).toString().slice(0, 21), new Date(2026, 9, 6, 15, 0).toString().slice(0, 21));
assert.equal(due[0].body, "내일 마감 · 오후 3:00");
assert.equal(new Date(due[1].at).getHours(), 8);
assert.ok(due[1].url.endsWith("#d=2026-10-09"));
console.log("PASS");
