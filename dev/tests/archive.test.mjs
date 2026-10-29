// 묶기 단위 테스트: 기록이 아주 많아도 쓰기 묶음 하나가 500개 한도를 넘지 않는지, 문서 하나가 너무 커지지 않는지
import assert from "node:assert/strict";
const { archiveOps, expand, writeOps } = await import(new URL("../src/pwa/archive.js", import.meta.url));
const day = 864e5, now = new Date(2026, 9, 15, 12).getTime();
const key = ms => { const d = new Date(ms); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const tasks = new Map();
for (let i = 0; i < 3000; i++) { const at = now - (61 + i % 400) * day; tasks.set("t_" + i, { id: "t_" + i, title: "x" + i, date: key(at), done: true, doneAt: at, subtasks: [] }); }
const ops = archiveOps(tasks, new Map(), new Map(), now, new Map());
assert.ok(ops.length <= 500, "ops " + ops.length);
assert.equal(ops.filter(o => o.op === "delete").length, 400);
const merged = ops.filter(o => o.op === "merge");
assert.ok(merged.every(o => /^a_\d{4}-\d{2}$/.test(o.id)));
// 경계: 정확히 60일 전은 안 묶고 61일 전은 묶는다
const edge = new Map([["t_a", { id: "t_a", date: key(now - 60 * day), done: true, doneAt: now - 60 * day }], ["t_b", { id: "t_b", date: key(now - 61 * day), done: true, doneAt: now - 61 * day }]]);
assert.deepEqual(archiveOps(edge, new Map(), new Map(), now, new Map()).filter(o => o.op === "delete").map(o => o.id), ["t_b"]);
// 묶음이 가득 찬 달은 더 넣지 않는다
assert.equal(archiveOps(edge, new Map(), new Map([["a_" + key(now - 61 * day).slice(0, 7), 1500]]), now, new Map()).length, 0);
// 묶인 할 일 고치기 = 원래 문서로 쓰고 묶음에서 빼기(둘이 한 묶음으로)
const ex = expand([{ id: "a_2026-01", data: { tasks: { t_z: { title: "z", done: true, note: "n" } } } }]);
assert.deepEqual(writeOps("update", "t_z", { done: false }, ex.arch, ex.tasks, ex.dups), [{ op: "set", id: "t_z", data: { title: "z", done: false, note: "n" } }, { op: "unarch", id: "a_2026-01", key: "t_z" }]);
assert.deepEqual(writeOps("remove", "t_z", null, ex.arch, ex.tasks, ex.dups), [{ op: "unarch", id: "a_2026-01", key: "t_z" }]);
// 크기 예산(2.7.0): 긴 메모가 많아도 한 달 묶음이 1MiB를 넘지 않게
{
  const big = new Map(), d0 = now - 90 * day;
  for (let i = 0; i < 400; i++) big.set("t_n" + i, { id: "t_n" + i, title: "x", note: "가".repeat(5000), date: key(d0), done: true, doneAt: d0 });
  const o = archiveOps(big, new Map(), new Map(), now, new Map());
  const m = o.filter(x => x.op === "merge");
  const sz = m.map(x => new TextEncoder().encode(JSON.stringify(x.data)).length);
  assert.ok(sz.every(n => n <= 720000), "merge bytes " + sz);
  assert.equal(o.filter(x => x.op === "delete").length, Object.keys(m[0].data.tasks).length, "넘치는 것은 안 묶고 남김");
  const ex2 = expand([{ id: "a_" + key(d0).slice(0, 7), data: m[0].data }]);
  assert.equal(archiveOps(new Map([["t_q", { id: "t_q", title: "q", note: "가".repeat(5000), date: key(d0), done: true, doneAt: d0 }]]), ex2.arch, ex2.sizes, now, ex2.dups, ex2.bytes).length, 0, "가득 찬 달 묶음엔 더 안 넣음");
}
console.log("PASS");
