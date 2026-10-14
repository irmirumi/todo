globalThis.window={TTOBAK_HOLIDAYS:{"2026-10-09":["한글날"]}};
const { remindersFrom } = await import(new URL("../src/pwa/push.js", import.meta.url));
const now=new Date(2026,9,5,8,0).getTime(); // Mon 10/5 08:00
const events=new Map([["e_1",{id:"e_1",title:"영어회화",place:"공학관",days:[1,5],time:"09:00",remind:10,holOff:true,skips:["2026-10-12"],until:"2026-10-31"}],
 ["e_2",{id:"e_2",title:"보관",days:[1],time:"09:00",remind:0,archived:true}]]);
const r=remindersFrom(new Map(),[], "https://x/todo/", now, events);
console.log(r.length, r.map(x=>x.id.split("@")[1]).join(","));
console.log(r[0].body, new Date(r[0].at).toTimeString().slice(0,5));
