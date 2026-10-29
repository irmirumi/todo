// 웹앱용 저장소: Firebase 로그인(이메일·비밀번호) + Firestore(users/<uid>/items)
import { firebaseConfig } from "./firebase-config.js";
import { REMINDER_URL } from "./reminder-config.js";
import { createPush } from "./push.js";
import { expand, archiveOps, writeOps } from "./archive.js";

const V = "10.12.2";
const configured = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId && !/여기/.test(firebaseConfig.apiKey));
let cb = null, fb = null, auth = null, db = null, col = null, unsub = null;
const fail = e => { if (cb) cb.onError(e); };
const notReady = () => { fail({ code: "not_ready" }); return Promise.resolve(); };
const bodyOf = t => { const b = Object.assign({}, t); delete b.id; return b; };
// 묶음(archive.js) 상태: 지금 화면의 할 일과, 어떤 할 일이 어느 묶음 문서에 들어 있는지
let cur = { tasks: new Map(), arch: new Map(), sizes: new Map(), dups: new Map() };
/* 작업 목록 실행: 하나면 그대로, 여럿이면 한 번에(모두 되거나 모두 안 되게) */
function apply(ops) {
  if (!col) return notReady();
  for (const o of ops) if (o.op === "unarch") { cur.arch.delete(o.key); cur.dups.delete(o.key); } // 다음 스냅샷 전에 또 고쳐도 다시 풀지 않게
  const ref = id => fb.doc(col, id);
  if (ops.length === 1) {
    const o = ops[0];
    const p = o.op === "set" ? fb.setDoc(ref(o.id), o.data) : o.op === "merge" ? fb.setDoc(ref(o.id), o.data, { merge: true })
      : o.op === "update" ? fb.updateDoc(ref(o.id), o.data) : o.op === "delete" ? fb.deleteDoc(ref(o.id))
      : fb.updateDoc(ref(o.id), new fb.FieldPath("tasks", o.key), fb.deleteField());
    return p.catch(fail);
  }
  const b = fb.writeBatch(db);
  for (const o of ops) {
    if (o.op === "set") b.set(ref(o.id), o.data);
    else if (o.op === "merge") b.set(ref(o.id), o.data, { merge: true });
    else if (o.op === "update") b.update(ref(o.id), o.data);
    else if (o.op === "delete") b.delete(ref(o.id));
    else b.update(ref(o.id), new fb.FieldPath("tasks", o.key), fb.deleteField());
  }
  return b.commit().catch(fail);
}
/* 하루 한 번, 서버에서 받은 데이터로 오래된 기록을 묶는다 */
function maybeArchive(uid) {
  const k = "ttobak.arch." + uid, today = new Date().toDateString();
  try { if (localStorage.getItem(k) === today) return; } catch (e) {}
  const ops = archiveOps(cur.tasks, cur.arch, cur.sizes, Date.now(), cur.dups);
  try { localStorage.setItem(k, today); } catch (e) {}
  if (ops.length) apply(ops);
}

async function loadFirebase() {
  const base = "https://www.gstatic.com/firebasejs/" + V + "/";
  const [app, authM, fs] = await Promise.all([
    import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")
  ]);
  return Object.assign({}, app, authM, fs);
}

let retryT = null, retries = 0;
const stop = () => { clearTimeout(retryT); retryT = null; retries = 0; if (unsub) { unsub(); unsub = null; } cur = { tasks: new Map(), arch: new Map(), sizes: new Map(), dups: new Map() }; };
// 실시간 연결: 오류로 끊기면(서버 쪽 일시 오류 등) 잠시 뒤 다시 붙는다. 권한 오류는 다시 붙어도 소용없어서 알리기만 한다
function listen(uid) {
  let first = true;
  unsub = fb.onSnapshot(col, { includeMetadataChanges: true }, snap => {
    const docs = []; snap.forEach(d => docs.push({ id: d.id, data: d.data() }));
    const { tasks, tpls, events, cats, arch, sizes, dups } = expand(docs);
    cur = { tasks, arch, sizes, dups };
    cb.onData({ tasks, cats, tpls, events });
    // 기기에 남아 있던 옛 사본으로 서버의 알림 목록을 덮어쓰지 않도록, 서버에서 받은 것일 때만 맞춘다
    if (!snap.metadata.fromCache) {
      retries = 0;
      if (store.push) store.push.schedule(tasks, cats, events);
      if (!snap.metadata.hasPendingWrites) maybeArchive(uid);
    }
    if (first) { first = false; cb.onStatus("live"); }
  }, err => {
    if (unsub) { unsub(); unsub = null; }
    if (err && err.code === "permission-denied") { fail(err); return; }
    if (retries === 0) fail({ code: "sync_retry" });
    const wait = Math.min(60000, 2000 * 2 ** retries++);
    clearTimeout(retryT);
    retryT = setTimeout(() => { if (auth.currentUser && auth.currentUser.uid === uid && !unsub) listen(uid); }, wait);
  });
}

const store = {
  kind: "pwa",
  email: null,
  async start(c) {
    cb = c;
    if (!configured) { cb.onStatus("config"); return; }
    cb.onStatus("loading");
    try { fb = await loadFirebase(); }
    catch (e) { cb.onError({ code: "network" }); setTimeout(() => location.reload(), 5000); return; }
    const app = fb.initializeApp(firebaseConfig);
    auth = fb.getAuth(app);
    try {
      db = fb.initializeFirestore(app, { localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }) });
    } catch (e) {
      db = fb.initializeFirestore(app, {});
    }
    fb.onAuthStateChanged(auth, user => {
      stop();
      if (!user) { col = null; store.email = null; cb.onStatus("signedout"); return; }
      store.email = user.email;
      col = fb.collection(db, "users", user.uid, "items");
      if (store.push) store.push.refresh();
      cb.onStatus("loading");
      listen(user.uid);
    });
  },
  // 오프라인이어도 화면에는 바로 반영되고, 연결되면 서버로 올라간다.
  set(id, b) { return apply(writeOps("set", id, b, cur.arch, cur.tasks, cur.dups)); },
  update(id, p) { return apply(writeOps("update", id, p, cur.arch, cur.tasks, cur.dups)); },
  remove(id) { return apply(writeOps("remove", id, null, cur.arch, cur.tasks, cur.dups)); },
  saveCats(cats) { return col ? fb.setDoc(fb.doc(col, "meta"), { cats }).catch(fail) : notReady(); },
  async importAll(d) {
    if (!col) throw { code: "not_ready" };
    const ops = [];
    if (d.cats) ops.push(["meta", { cats: d.cats }]);
    // 묶음에 이미 있는 할 일을 새로 쓰면, 따로 있는 쪽이 이기고 다음 묶기 때 다시 합쳐진다
    d.tasks.forEach(t => ops.push([t.id, bodyOf(t)]));
    (d.tpls || []).forEach(r => ops.push([r.id, bodyOf(r)]));
    (d.events || []).forEach(e => ops.push([e.id, bodyOf(e)]));
    for (let i = 0; i < ops.length; i += 400) {
      const batch = fb.writeBatch(db);
      ops.slice(i, i + 400).forEach(([id, b]) => batch.set(fb.doc(col, id), b));
      await batch.commit();
    }
    return d.tasks.length;
  },
  signIn(email, pw) { return fb.signInWithEmailAndPassword(auth, email, pw); },
  signOut() { return fb.signOut(auth); }
};

store.push = createPush({ url: REMINDER_URL, getToken: () => auth.currentUser.getIdToken(), uidKey: () => (auth && auth.currentUser ? auth.currentUser.uid : "") });

window.TodoApp.boot(store);

// 서비스 워커: 새 버전을 뒤에서 받아 두면 화면에 "새 버전이 있어요 [새로고침]"을 띄운다
if ("serviceWorker" in navigator) {
  // 처음 설치될 때도 controllerchange가 오므로, '새로고침'을 눌렀을 때만 다시 연다
  let asked = false;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then(reg => {
      const ready = w => { if (w && navigator.serviceWorker.controller) window.TodoApp.updateReady(() => { asked = true; w.postMessage({ type: "skip" }); }); };
      const track = w => { if (w) w.addEventListener("statechange", () => { if (w.state === "installed") ready(w); }); };
      if (reg.waiting) ready(reg.waiting); else track(reg.installing);
      reg.addEventListener("updatefound", () => track(reg.installing));
      reg.update().catch(() => {}); // 열 때마다 새 버전이 있는지 확인(sw.js만 받아 비교한다)
      document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (asked && !reloaded) { reloaded = true; location.reload(); } });
  });
}
