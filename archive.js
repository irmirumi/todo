// 오래된 기록 묶기: 끝난 지 오래된(완료·안 함) 할 일을 월별 문서 하나(a_YYYY-MM)에 모은다.
// 앱이 열릴 때 Firestore는 문서 수만큼 읽기로 세므로, 쌓이는 기록을 묶으면 읽기량이 "남은 할 일 + 개월 수"로 줄어든다.
// 화면은 묶였는지 모른다. 묶인 할 일을 고치거나 지우면 저장할 때 알아서 풀린다.
// 이 파일은 Firestore를 직접 부르지 않고 "할 작업 목록"만 만든다(테스트하기 쉽게). 작업 종류:
//   {op:"set", id, data}            문서 통째로 쓰기
//   {op:"merge", id, data}          문서에 합쳐 쓰기(중첩 맵도 합쳐짐)
//   {op:"update", id, data}         일부 필드 바꾸기
//   {op:"delete", id}               문서 지우기
//   {op:"unarch", id, key}          묶음 문서(id)에서 할 일 하나(key) 빼기

export const KEEP_DAYS = 60;          // 이보다 오래 지난 기록만 묶는다
const MAX_PER_DOC = 1500;             // 문서 하나 1MB 한도에 한참 못 미치게
const MAX_PER_RUN = 400;              // 한 번에 묶는 수(쓰기 묶음 하나 = 작업 500개 한도)
const pad = n => String(n).padStart(2, "0");
const keyOf = ms => { const d = new Date(ms); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
const bodyOf = t => { const b = Object.assign({}, t); delete b.id; return b; };

/* 스냅샷 문서들 → 화면에 줄 데이터 + 묶음 색인. docs: [{id, data}] */
export function expand(docs) {
  const tasks = new Map(), tpls = new Map(), events = new Map(), arch = new Map(), sizes = new Map(), dups = new Map(); let cats = null;
  const loose = [];
  for (const { id, data: v } of docs) {
    if (id === "meta") cats = v.cats;
    else if (id.startsWith("t_")) tasks.set(id, Object.assign({ id }, v));
    else if (id.startsWith("r_")) tpls.set(id, Object.assign({ id }, v));
    else if (id.startsWith("e_")) events.set(id, Object.assign({ id }, v));
    else if (id.startsWith("a_") && v && v.tasks && typeof v.tasks === "object") loose.push([id, v.tasks]);
  }
  // 묶음 안의 할 일: 같은 id가 따로 살아 있으면(다른 기기에서 되살린 경우) 따로 있는 쪽이 이긴다
  for (const [aid, map] of loose) {
    let n = 0;
    for (const [tid, body] of Object.entries(map)) {
      n++;
      if (!/^t_/.test(tid) || !body) continue;
      if (tasks.has(tid)) { dups.set(tid, aid); continue; } // 옛 사본: 묶기 때 지운다
      tasks.set(tid, Object.assign({}, body, { id: tid }));
      arch.set(tid, aid);
    }
    sizes.set(aid, n);
  }
  return { tasks, tpls, events, cats, arch, sizes, dups };
}

/* 묶을 할 일 고르기 → 작업 목록. now: ms */
export function archiveOps(tasks, arch, sizes, now, dups) {
  const cut = now - KEEP_DAYS * 864e5, cutKey = keyOf(cut);
  const groups = new Map(), counts = new Map(sizes || []);
  let picked = 0;
  const list = [...tasks.values()].filter(t => !arch.has(t.id) && (t.done || t.skipped))
    .sort((a, b) => (a.date || "") < (b.date || "") ? -1 : 1);
  for (const t of list) {
    if (picked >= MAX_PER_RUN) break;
    const ended = t.done ? t.doneAt : t.skippedAt;
    const old = t.date ? t.date < cutKey && (typeof ended !== "number" || ended < cut) : typeof ended === "number" && ended < cut;
    if (!old) continue;
    const month = (t.date || keyOf(ended)).slice(0, 7), aid = "a_" + month;
    if ((counts.get(aid) || 0) >= MAX_PER_DOC) continue;
    counts.set(aid, (counts.get(aid) || 0) + 1);
    if (!groups.has(aid)) groups.set(aid, {});
    groups.get(aid)[t.id] = bodyOf(t);
    picked++;
  }
  // 따로 되살아난 할 일의 옛 사본을 먼저 지운다(나중에 그 할 일을 지웠을 때 옛것이 다시 나타나지 않게)
  const ops = [...(dups || [])].map(([tid, aid]) => ({ op: "unarch", id: aid, key: tid }));
  for (const [aid, map] of groups) {
    ops.push({ op: "merge", id: aid, data: { tasks: map } });
    for (const tid of Object.keys(map)) ops.push({ op: "delete", id: tid });
  }
  return ops;
}

/* 화면의 저장 요청 → 작업 목록. 묶인 할 일이면 풀면서 저장한다 */
export function writeOps(kind, id, payload, arch, tasks, dups) {
  const aid = arch.get(id);
  if (!aid) {
    if (kind === "set") return [{ op: "set", id, data: payload }];
    if (kind === "update") return [{ op: "update", id, data: payload }];
    const old = dups && dups.get(id);
    return old ? [{ op: "delete", id }, { op: "unarch", id: old, key: id }] : [{ op: "delete", id }];
  }
  const un = { op: "unarch", id: aid, key: id };
  if (kind === "remove") return [un];
  const cur = tasks.get(id);
  const data = kind === "set" ? payload : Object.assign(bodyOf(cur || {}), payload);
  return [{ op: "set", id, data }, un];
}
