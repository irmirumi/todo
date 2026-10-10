// 알림: 이 기기의 푸시 구독 관리 + 앞으로 울릴 알림 목록을 알림 서버(Cloudflare Worker)와 맞추기
const LABEL = { 0: "지금", 5: "5분 후", 10: "10분 후", 30: "30분 후", 60: "1시간 후", 1440: "내일" };
const pad = n => String(n).padStart(2, "0");
const fmt = t => { const [h, m] = t.split(":").map(Number); return (h < 12 ? "오전 " : "오후 ") + ((h % 12) || 12) + ":" + pad(m); };
const unb64 = s => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };

/* 할 일 목록 → 서버에 보낼 알림 목록(완료·보관 카테고리·지난 알림 제외, 약 두 달 치) */
export function remindersFrom(tasks, cats, base, now = Date.now()) {
  const arch = new Set((cats || []).filter(c => c.archived).map(c => c.id));
  const max = now + 62 * 864e5, out = [];
  for (const t of tasks.values()) {
    if (t.done || t.remind == null || !t.date || !t.time || arch.has(t.cat)) continue;
    const [y, mo, d] = t.date.split("-").map(Number), [h, mi] = t.time.split(":").map(Number);
    const at = new Date(y, mo - 1, d, h, mi).getTime() - t.remind * 60000;
    if (!(at >= now - 60000 && at <= max)) continue;
    const lead = LABEL[t.remind] || (t.remind + "분 후");
    out.push({ id: t.id, at, title: t.title, body: lead + " · " + fmt(t.time), url: new URL("./#d=" + t.date, base).href });
  }
  out.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  return out.slice(0, 300);
}

export function createPush({ url, getToken, uidKey }) {
  const RURL = (url || "").replace(/\/+$/, "");
  if (!RURL) return null;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;

  async function api(path, body) {
    const tok = await getToken();
    const r = await fetch(RURL + path, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tok }, body: JSON.stringify(body || {}) });
    if (!r.ok) throw { code: "push_" + r.status };
    return r.json();
  }
  const reg = () => navigator.serviceWorker.ready;
  const sameKey = (sub, key) => { const a = sub.options && sub.options.applicationServerKey; if (!a) return false; const x = new Uint8Array(a), y = unb64(key); return x.length === y.length && x.every((v, i) => v === y[i]); };

  /* 앞으로 울릴 알림 목록 동기화: 바뀌었을 때만, 잠깐 모았다가 한 번에 */
  let timer = null, latest = null, retry = null;
  const hashKey = () => "ttobak.rem." + uidKey();
  function schedule(tasks, cats) {
    latest = { tasks, cats };
    clearTimeout(timer); timer = setTimeout(flush, 1200);
  }
  async function flush() {
    if (!latest || !navigator.onLine) return;
    const list = remindersFrom(latest.tasks, latest.cats, location.href);
    const hash = JSON.stringify(list);
    let prev = null; try { prev = localStorage.getItem(hashKey()); } catch (e) {}
    if (prev === hash) return;
    try { await api("/sync", { reminders: list }); try { localStorage.setItem(hashKey(), hash); } catch (e) {} clearTimeout(retry); }
    catch (e) { clearTimeout(retry); retry = setTimeout(flush, 60000); }
  }
  window.addEventListener("online", () => { clearTimeout(timer); timer = setTimeout(flush, 1500); });

  const push = {
    /* "on" | "off" | "denied" | "ios-install" | "unsupported" */
    async state() {
      if (ios && !standalone) return "ios-install";
      if (!supported) return "unsupported";
      if (Notification.permission === "denied") return "denied";
      const sub = await (await reg()).pushManager.getSubscription();
      return sub && Notification.permission === "granted" ? "on" : "off";
    },
    async enable() {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw { code: perm === "denied" ? "denied" : "dismissed" };
      const r = await reg();
      const { key } = await (await fetch(RURL + "/vapid")).json();
      let sub = await r.pushManager.getSubscription();
      if (sub && !sameKey(sub, key)) { await sub.unsubscribe(); sub = null; }
      if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64(key) });
      await api("/subscribe", sub.toJSON());
      try { localStorage.removeItem(hashKey()); } catch (e) {}
      flush();
    },
    async disable() {
      const sub = await (await reg()).pushManager.getSubscription();
      if (!sub) return;
      try { await api("/unsubscribe", { endpoint: sub.endpoint }); } catch (e) {}
      await sub.unsubscribe();
    },
    test() { return api("/test", {}); },
    schedule,
    /* 로그인 직후 한 번: 이 기기가 이미 구독 중이면 서버에 다시 알려 둔다(서버 쪽이 비었을 때 대비) */
    async refresh() {
      try { if (await push.state() !== "on") return; const sub = await (await reg()).pushManager.getSubscription(); await api("/subscribe", sub.toJSON()); } catch (e) {}
    }
  };
  return push;
}
