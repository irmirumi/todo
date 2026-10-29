// 테스트용 가짜 Firebase(앱·로그인·Firestore). 실제 app.js가 gstatic에서 불러오는 세 파일을 이걸로 바꿔 끼운다.
// Firestore 규칙 중 이 앱이 기대는 것만 흉내 낸다:
// - undefined 값은 거부, 없는 문서 updateDoc은 not-found
// - setDoc(merge:true)는 중첩 맵까지 합침, updateDoc(FieldPath, deleteField())는 중첩 키 삭제
// - writeBatch는 전부 되거나 전부 안 됨(검사 먼저, 적용은 한 번에)
// 데이터는 sessionStorage에 두어 새로고침해도 남는다. window.__fs로 들여다본다.
const KEY = "fakefs";
const load = () => { try { return new Map(JSON.parse(sessionStorage.getItem(KEY) || "[]")); } catch (e) { return new Map(); } };
const fs = window.__fs || (window.__fs = { docs: load(), listeners: new Set(), commits: 0 });
const save = () => sessionStorage.setItem(KEY, JSON.stringify([...fs.docs]));
const DEL = { __deleteField: true };
class ArrOp { constructor(kind, v) { this.kind = kind; this.v = v; } }
const clone = v => JSON.parse(JSON.stringify(v));
function noUndef(v, path) {
  if (v === undefined) throw { code: "invalid-argument", message: "undefined at " + path };
  if (v && typeof v === "object" && v !== DEL && !(v instanceof ArrOp)) for (const [k, x] of Object.entries(v)) noUndef(x, path + "." + k);
}
const isMap = v => v && typeof v === "object" && !Array.isArray(v) && v !== DEL && !(v instanceof ArrOp);
function merge(a, b) {
  const o = Object.assign({}, a);
  for (const [k, v] of Object.entries(b)) {
    if (v === DEL) delete o[k];
    else if (isMap(v) && isMap(o[k])) o[k] = merge(o[k], v);
    else o[k] = clone(v);
  }
  return o;
}
function setPath(o, segs, v) {
  const c = Object.assign({}, o); let cur = c;
  for (let i = 0; i < segs.length - 1; i++) { cur[segs[i]] = Object.assign({}, isMap(cur[segs[i]]) ? cur[segs[i]] : {}); cur = cur[segs[i]]; }
  const last = segs[segs.length - 1];
  if (v === DEL) delete cur[last];
  else if (v instanceof ArrOp) { const a = Array.isArray(cur[last]) ? cur[last] : []; cur[last] = v.kind === "union" ? a.concat(v.v.filter(x => !a.includes(x))) : a.filter(x => !v.v.includes(x)); }
  else cur[last] = clone(v);
  return c;
}
function emit() {
  for (const l of fs.listeners) setTimeout(() => {
    const list = [...fs.docs].filter(([p]) => p.startsWith(l.path + "/")).map(([p, d]) => ({ id: p.slice(l.path.length + 1), data: () => clone(d) }));
    l.next({ forEach: f => list.forEach(f), size: list.length, metadata: { fromCache: false, hasPendingWrites: false } });
  }, 0);
}
// 한 작업을 검사(prepare)하고 적용 함수를 돌려준다
function prep(kind, ref, a, b, rest) {
  const p = ref.col.path + "/" + ref.id;
  if (kind === "set") { noUndef(a, "data"); const opt = b || {}; return () => fs.docs.set(p, opt.merge ? merge(fs.docs.get(p) || {}, a) : clone(a)); }
  if (kind === "delete") return () => fs.docs.delete(p);
  if (!fs.docs.has(p)) throw { code: "not-found", message: "no document " + p };
  if (a instanceof FieldPath) { noUndef(b, "value"); if (rest.length) throw new Error("fake: one field only"); return () => fs.docs.set(p, setPath(fs.docs.get(p), a.segs, b)); }
  noUndef(a, "data");
  return () => { let d = fs.docs.get(p); for (const [k, v] of Object.entries(a)) d = setPath(d, k.split("."), v); fs.docs.set(p, d); };
}
const run = fns => { fns.forEach(f => f()); fs.commits++; save(); emit(); return Promise.resolve(); };
// window.__fs.failNext = "permission-denied" 이면 다음 쓰기 하나를 서버가 거절한 것처럼
const refuse = () => { const c = fs.failNext; if (!c) return null; fs.failNext = null; return Promise.reject({ code: c, message: "refused" }); };
const one = (...args) => { const r = refuse(); if (r) return r; try { return run([prep(...args)]); } catch (e) { return Promise.reject(e); } };

// firebase-app
export function initializeApp(cfg) { return { cfg }; }
// firebase-auth
const user = { uid: "u1", email: "me@example.com", getIdToken: () => Promise.resolve("tok") };
export function getAuth() { return { currentUser: user }; }
export function onAuthStateChanged(auth, cb) { setTimeout(() => cb(user), 0); return () => {}; }
export function signInWithEmailAndPassword() { return Promise.resolve(); }
export function signOut() { return Promise.resolve(); }
export function sendPasswordResetEmail() { return Promise.resolve(); }
// firebase-firestore
export class FieldPath { constructor(...segs) { this.segs = segs; } }
export function deleteField() { return DEL; }
export function arrayUnion(...v) { return new ArrOp("union", v); }
export function arrayRemove(...v) { return new ArrOp("remove", v); }
export function initializeFirestore() { return {}; }
export function persistentLocalCache() { return {}; }
export function persistentMultipleTabManager() { return {}; }
export function collection(db, ...path) { return { path: path.join("/") }; }
export function doc(col, id) { return { col, id }; }
export function setDoc(ref, data, opt) { return one("set", ref, data, opt, []); }
export function updateDoc(ref, a, b, ...rest) { return one("update", ref, a, b, rest); }
export function deleteDoc(ref) { return one("delete", ref, null, null, []); }
export function writeBatch() {
  const ops = [];
  const b = {
    set(ref, d, o) { ops.push(["set", ref, d, o, []]); return b; },
    update(ref, a, v, ...r) { ops.push(["update", ref, a, v, r]); return b; },
    delete(ref) { ops.push(["delete", ref, null, null, []]); return b; },
    commit() { const r = refuse(); if (r) return r; if (ops.length > 500) return Promise.reject({ code: "invalid-argument", message: "batch > 500" });
      try { const fns = []; for (const o of ops) fns.push(prep(...o)); return run(fns); } catch (e) { return Promise.reject(e); } }
  };
  return b;
}
export function onSnapshot(col, opts, next, err) {
  const l = { path: col.path, next, err }; fs.listeners.add(l); emit();
  return () => fs.listeners.delete(l);
}
