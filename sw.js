// 앱 껍데기를 저장해 두어 빠르게 열리고, 인터넷이 없어도 열리게 한다.
// 내 파일은 항상 최신을 먼저 받아 오고(실패하면 저장본), Firebase·폰트는 저장본을 먼저 쓴다.
const CACHE = "todo-notebook-v1";
const SHELL = ["./", "./index.html", "./style.css", "./ui.js", "./app.js", "./firebase-config.js", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html")))
    );
  } else if (u.hostname === "www.gstatic.com" || u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com") {
    e.respondWith(
      caches.match(req).then(r => r || fetch(req).then(res => {
        if (res.ok || res.type === "opaque") { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
        return res;
      }))
    );
  }
});
