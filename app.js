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
      if (unsub) { unsub(); unsub = null; }
      if (!user) { col = null; store.email = null; cb.onStatus("signedout"); return; }
      store.email = user.email;
      col = fb.collection(db, "users", user.uid, "items");
      if (store.push) store.push.refresh();
      cb.onStatus("loading");
      let first = true;
      unsub = fb.onSnapshot(col, { includeMetadataChanges: true }, snap => {
        const tasks = new Map(), tpls = new Map(); let cats = null;
        snap.forEach(d => {
          const v = d.data();
          if (d.id === "meta") cats = v.cats;
          else if (d.id.startsWith("t_")) tasks.set(d.id, Object.assign({ id: d.id }, v));
          else if (d.id.startsWith("r_")) tpls.set(d.id, Object.assign({ id: d.id }, v));
        });
        cb.onData({ tasks, cats, tpls });
        // 기기에 남아 있던 옛 사본으로 서버의 알림 목록을 덮어쓰지 않도록, 서버에서 받은 것일 때만 맞춘다
        if (store.push && !snap.metadata.fromCache) store.push.schedule(tasks, cats);
        if (first) { first = false; cb.onStatus("live"); }
      }, fail);
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
