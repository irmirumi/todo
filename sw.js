// 앱 껍데기를 저장해 두어 빠르게, 인터넷 없이도 열리게 한다.
// 내 코드 파일은 최신을 먼저 받아 오고(실패하면 저장본), 글꼴·Firebase 라이브러리는 저장본을 먼저 쓴다.
const CACHE = "ttobak-2.1.0";
const SHELL = ["./", "./index.html", "./style.css", "./ui.js", "./app.js", "./firebase-config.js", "./reminder-config.js", "./push.js", "./archive.js",
  "./vendor/morphdom.min.js", "./holidays.js", "./fonts/WantedSansVariable.css", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const put = (req, res) => { if (res.ok || res.type === "opaque") { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return res; };
// 최신 파일을 먼저 받되, 3초 안에 안 오면(지하철 등 느린 연결) 저장본으로 바로 연다. 받아 온 최신본은 다음에 쓴다.
const cached = req => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === "navigate" ? caches.match("./index.html") : undefined));
const netFirst = req => new Promise(resolve => {
  let done = false;
  const finish = r => { if (!done && r) { done = true; resolve(r); } };
  const timer = setTimeout(() => cached(req).then(finish), 3000);
  // no-cache: 브라우저가 들고 있는 사본을 그냥 쓰지 말고 서버에 "바뀌었나"만 묻는다(안 바뀌었으면 304라 가볍다).
  // 이게 없으면 GitHub Pages의 10분 캐시 때문에 새 버전이 한 번 더 열어야 들어온다
  const fresh = req.mode === "navigate" ? new Request(req.url, { cache: "no-cache", credentials: "same-origin" }) : new Request(req, { cache: "no-cache" });
  fetch(fresh).then(res => put(req, res))
    .then(r => { clearTimeout(timer); finish(r); })
    .catch(() => { clearTimeout(timer); cached(req).then(r => finish(r || Response.error())); });
});
const cacheFirst = req => caches.match(req).then(r => r || fetch(req).then(res => put(req, res)));
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin === self.location.origin) {
    if (u.pathname.includes("/fonts/") || u.pathname.includes("/vendor/")) { e.respondWith(cacheFirst(req)); return; }
    e.respondWith(netFirst(req));
  } else if (u.hostname === "www.gstatic.com") {
    e.respondWith(cacheFirst(req));
  }
});

// 알림 받기: 서버가 보낸 내용으로 알림을 띄우고, 누르면 그 날짜를 연다
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) {}
  e.waitUntil(self.registration.showNotification(d.title || "또박", {
    body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag,
    icon: "icons/icon-192.png", badge: "icons/badge-96.png", data: { url: d.url || "./" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope)) { c.postMessage({ type: "open", url }); return c.focus(); }
    return clients.openWindow(url);
  }));
});
