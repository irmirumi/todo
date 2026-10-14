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
// 이 날만 바꾸기: 10/16(금) 11:00 · 인문관
events.get("e_1").ovr = { "2026-10-16": { time: "11:00", end: null, place: "인문관" } };
const r2 = remindersFrom(new Map(), [], "https://x/todo/", now, events);
const f = r2.find(x => x.id === "e_1@2026-10-16");
assert.equal(new Date(f.at).toTimeString().slice(0, 5), "10:50");
assert.equal(f.body, "10분 후 · 오전 11:00 · 인문관");
// 알림 제목에 소분류
const r3 = remindersFrom(new Map([["t_s", { id: "t_s", title: "과제 3", date: "2026-10-06", time: "10:00", remind: 0, cat: "k2", sub: "b1" }]]),
  [{ id: "k2", name: "수업", color: "c5", subs: [{ id: "b1", name: "자료구조" }] }], "https://x/todo/", now, null);
assert.equal(r3[0].title, "자료구조 과제 3");
console.log("PASS");
