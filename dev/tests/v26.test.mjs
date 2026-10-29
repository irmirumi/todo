// 2.6.0 단위 확인(브라우저 없이 실제 함수를 꺼내 돌림): 실제 날짜 검증, 빠른 입력, 백업 새 필드, 이날만 바꾸기 개수 정리 없음, 알림 서버 재시도
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const read = p => fs.readFileSync(new URL("../src/" + p, import.meta.url), "utf8");
const ui = read("ui.js"), model = read("model.js"), worker = read("worker/worker.js");
const between = (s, a, b) => { assert(s.includes(a) && s.includes(b), "경계를 못 찾음: " + a); return s.slice(s.indexOf(a), s.indexOf(b)); };
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log("ok", m); };

const g = vm.createContext({ console, Date, Map, Set });
vm.runInContext(model, g);
const M = g.TodoModel;
ok(!M.DATE_RE.test("2026-02-31") && M.DATE_RE.test("2028-02-29") && !M.DATE_RE.test("2026-13-01"), "없는 날짜는 날짜가 아님");
ok(!M.TIME_RE.test("99:99") && !M.TIME_RE.test("24:00") && M.TIME_RE.test("23:59"), "없는 시각은 시각이 아님");
ok(!M.KEY_RE.test("2026-02-30#ab") && M.KEY_RE.test("2026-10-29#ab"), "일정 키도 실제 날짜만");
ok(M.parseQuick("2월31일 회의", "2026-01-01") === null, "빠른 입력: 없는 날짜는 제목으로 남김");
ok(M.parseQuick("31일 보고", "2026-02-10").date === "2026-03-31", "빠른 입력: 이번 달에 없는 31일은 그다음 31일이 있는 달");
ok(M.parseQuick("10/30 3시 회의", "2026-10-29").date === "2026-10-30", "빠른 입력: 날짜 그대로");

// 백업 정리(clean·cleanTpl)
const writes = [];
const c = vm.createContext({ console, Date, Map, Set, S: { tasks: new Map(), events: new Map() }, uid8: () => "testid", autoOn: r => r.auto !== false,
  syncEdit() {}, toast() {}, store: { fx: { del: () => ({ deleted: true }) } }, patchTask: (id, p) => writes.push({ id, p }) });
vm.runInContext(model + "\nconst {DATE_RE,TIME_RE,KEY_RE,sortDays,okEnd,evBase,occKey,addDays,keyOf}=TodoModel;\n" +
  between(ui, "function clean(t){", "function parseImport(") + between(ui, "function commitEvDay(){", "function openLater("), c);
const cl = vm.runInContext(`clean({title:'x',date:'2026-02-31',time:'99:99',deletedAt:-1})`, c);
ok(cl.date === null && cl.time === null && cl.deletedAt === undefined, "백업: 없는 날짜·시각·이상한 지운 시각은 받지 않음");
ok(vm.runInContext(`clean({title:'x',deletedAt:Date.now()-1000}).deletedAt>0`, c), "백업: 정상 지운 시각은 그대로");
ok(vm.runInContext(`cleanTpl({auto:"false"}).auto`, c) === false && vm.runInContext(`cleanTpl({}).auto`, c) === true, "백업: 자동 추가 끔은 문자열이어도 끔, 없으면 켬");
ok(vm.runInContext(`cleanTpl({madeUntil:"2099-01-01"}).madeUntil`, c) === undefined, "백업: 먼 미래의 만든 날 기록은 버림(자동 추가가 멈추지 않게)");

// 이날만 바꾸기: 400개가 넘어도 맵 통째로 쓰지 않고 그 칸만
const ovr = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10), { place: "옛 장소" }]));
c.S.events.set("e_one", { id: "e_one", title: "수업", days: [0, 1, 2, 3, 4, 5, 6], time: "09:00", end: "10:00", place: "원래 장소", ovr });
c.S.edit = { id: "e_one", k: "2029-01-01", sid: "", time: "09:00", end: "10:00", place: "새 장소" };
vm.runInContext("commitEvDay()", c);
const pt = writes.at(-1).p;
ok(Object.keys(pt).length === 1 && pt["ovr.2029-01-01"] && !pt.ovr, "401번째 이날 변경도 그 칸 하나만 씀(오래된 기록 유지)");

// 알림 서버: 한 기기에도 못 보냈으면 지우지 않고 다음 분에 다시, 10분 지나면 포기
const runTick = async (res, at) => {
  const log = [];
  const env = { DB: { prepare(sql) { return { bind(...a) { return { async run() { log.push({ sql, a }); }, async all() {
    return { results: sql.includes("FROM rem") ? [{ uid: "u1", id: "r1", at, title: "약속", body: "", url: "x" }] : [{ endpoint: "e1" }] }; } }; } }; } } };
  const w = vm.createContext({ Date, env, init: async () => {}, sendPush: async () => res, DROP_IF_LATE_MS: 3600000, MAX_PUSHES_PER_RUN: 4, RETRY_MS: 600000 });
  vm.runInContext(between(worker, "async function tick(env)", "export default"), w);
  await vm.runInContext("tick(env)", w);
  return log.some(x => x.sql.includes("id = ?") && x.a[1] === "r1");
};
ok(!(await runTick("fail", Date.now())), "알림 서버: 일시 실패면 예약을 남겨 다음 분에 다시");
ok(await runTick("fail", Date.now() - 11 * 60000), "알림 서버: 10분 넘게 실패하면 지움");
ok(await runTick("ok", Date.now()), "알림 서버: 보냈으면 지움");
ok(worker.includes("const RETRY_MS"), "RETRY_MS 정의");
console.log("checks:", n, "PASS");
