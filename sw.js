// 앱 껍데기를 한 버전 묶음으로 저장해 두고, 늘 그 묶음에서만 연다(2.5.0).
// 예전에는 파일마다 따로 최신을 받아서, 느린 연결에서 새 ui.js와 옛 app.js가 섞여 열릴 수 있었다.
// 새 버전은 뒤에서 통째로 받아 두고(install), 화면이 "새로고침"을 누르거나 앱을 완전히 닫았다 열 때 바뀐다.
const CACHE = "ttobak-2.5.0";
const LIB = "ttobak-lib-1"; // 글꼴 조각·Firebase 라이브러리: 버전과 상관없이 오래 쓴다
const SHELL = ["./", "./index.html", "./style.css", "./model.js", "./ui.js", "./app.js", "./firebase-config.js", "./reminder-config.js", "./push.js", "./archive.js",
  "./vendor/morphdom.min.js", "./holidays.js", "./fonts/WantedSansVariable.css", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/badge-96.png"];

self.addEventListener("install", e => {
  // cache: "reload" — 브라우저가 들고 있는 옛 사본(GitHub Pages 10분 캐시) 말고 서버에서 새로
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))));
});
self.addEventListener("message", e => { if (e.data && e.data.type === "skip") self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== LIB).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const put = (name, req, res) => { if (res.ok || res.type === "opaque") { const cp = res.clone(); caches.open(name).then(c => c.put(req, cp)); } return res; };
const fromShell = req => caches.open(CACHE).then(c => c.match(req, { ignoreSearch: true }).then(r => r || (req.mode === "navigate" ? c.match("./index.html") : undefined)));
const libFirst = req => caches.open(LIB).then(c => c.match(req)).then(r => r || fetch(req).then(res => put(LIB, req, res)));
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin === self.location.origin) {
    if (u.pathname.includes("/fonts/woff2/")) { e.respondWith(libFirst(req)); return; }
    // 껍데기에 있으면 그 묶음에서, 없으면(서버 파일 등) 네트워크로
    e.respondWith(fromShell(req).then(r => r || fetch(req)));
  } else if (u.hostname === "www.gstatic.com") {
    e.respondWith(libFirst(req));
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
