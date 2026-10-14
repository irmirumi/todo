// 웹앱용 저장소: Firebase 로그인(이메일·비밀번호) + Firestore(users/<uid>/items)
import { firebaseConfig } from "./firebase-config.js";
import { REMINDER_URL } from "./reminder-config.js";
import { createPush } from "./push.js";

const V = "10.12.2";
const configured = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId && !/여기/.test(firebaseConfig.apiKey));
let cb = null, fb = null, auth = null, db = null, col = null, unsub = null;
const fail = e => { if (cb) cb.onError(e); };
const notReady = () => { fail({ code: "not_ready" }); return Promise.resolve(); };
const bodyOf = t => { const b = Object.assign({}, t); delete b.id; return b; };

async function loadFirebase() {
  const base = "https://www.gstatic.com/firebasejs/" + V + "/";
  const [app, authM, fs] = await Promise.all([
    import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")
  ]);
  return Object.assign({}, app, authM, fs);
}

let retryT = null, retries = 0;
const stop = () => { clearTimeout(retryT); retryT = null; retries = 0; if (unsub) { unsub(); unsub = null; } };
// 실시간 연결: 오류로 끊기면(서버 쪽 일시 오류 등) 잠시 뒤 다시 붙는다. 권한 오류는 다시 붙어도 소용없어서 알리기만 한다
function listen(uid) {
  let first = true;
  unsub = fb.onSnapshot(col, { includeMetadataChanges: true }, snap => {
    const tasks = new Map(), tpls = new Map(), events = new Map(); let cats = null;
    snap.forEach(d => {
      const v = d.data();
      if (d.id === "meta") cats = v.cats;
      else if (d.id.startsWith("t_")) tasks.set(d.id, Object.assign({ id: d.id }, v));
      else if (d.id.startsWith("r_")) tpls.set(d.id, Object.assign({ id: d.id }, v));
      else if (d.id.startsWith("e_")) events.set(d.id, Object.assign({ id: d.id }, v));
    });
    cb.onData({ tasks, cats, tpls, events });
    // 기기에 남아 있던 옛 사본으로 서버의 알림 목록을 덮어쓰지 않도록, 서버에서 받은 것일 때만 맞춘다
    if (!snap.metadata.fromCache) { retries = 0; if (store.push) store.push.schedule(tasks, cats, events); }
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
  set(id, b) { return col ? fb.setDoc(fb.doc(col, id), b).catch(fail) : notReady(); },
  update(id, p) { return col ? fb.updateDoc(fb.doc(col, id), p).catch(fail) : notReady(); },
  remove(id) { return col ? fb.deleteDoc(fb.doc(col, id)).catch(fail) : notReady(); },
  saveCats(cats) { return col ? fb.setDoc(fb.doc(col, "meta"), { cats }).catch(fail) : notReady(); },
  async importAll(d) {
    if (!col) throw { code: "not_ready" };
    const ops = [];
    if (d.cats) ops.push(["meta", { cats: d.cats }]);
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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("./sw.js").catch(() => {}); });
}
