// 웹앱용 저장소: Firebase 로그인(이메일·비밀번호) + Firestore(users/<uid>/items)
import { firebaseConfig } from "./firebase-config.js";

const V = "10.12.2";
const configured = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId && !/여기/.test(firebaseConfig.apiKey));
let cb = null, fb = null, auth = null, db = null, col = null, unsub = null;
const fail = e => { if (cb) cb.onError(e); };
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
      cb.onStatus("loading");
      let first = true;
      unsub = fb.onSnapshot(col, snap => {
        const tasks = new Map(); let cats = null;
        snap.forEach(d => {
          const v = d.data();
          if (d.id === "meta") cats = v.cats;
          else if (d.id.startsWith("t_")) tasks.set(d.id, Object.assign({ id: d.id }, v));
        });
        cb.onData({ tasks, cats });
        if (first) { first = false; cb.onStatus("live"); }
      }, fail);
    });
  },
  // 오프라인이어도 화면에는 바로 반영되고, 연결되면 서버로 올라간다.
  set(id, b) { return fb.setDoc(fb.doc(col, id), b).catch(fail); },
  update(id, p) { return fb.updateDoc(fb.doc(col, id), p).catch(fail); },
  remove(id) { return fb.deleteDoc(fb.doc(col, id)).catch(fail); },
  saveCats(cats) { return fb.setDoc(fb.doc(col, "meta"), { cats }).catch(fail); },
  async importAll(d) {
    const ops = [];
    if (d.cats) ops.push(["meta", { cats: d.cats }]);
    d.tasks.forEach(t => ops.push([t.id, bodyOf(t)]));
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

window.TodoApp.boot(store);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("./sw.js").catch(() => {}); });
}
