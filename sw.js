// 앱 껍데기를 저장해 두어 빠르게, 인터넷 없이도 열리게 한다.
// 내 코드 파일은 최신을 먼저 받아 오고(실패하면 저장본), 글꼴·Firebase 라이브러리는 저장본을 먼저 쓴다.
const CACHE = "ttobak-v3";
const SHELL = ["./", "./index.html", "./style.css", "./ui.js", "./app.js", "./firebase-config.js",
  "./vendor/morphdom.min.js", "./fonts/WantedSansVariable.css", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const put = (req, res) => { if (res.ok || res.type === "opaque") { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return res; };
const cacheFirst = req => caches.match(req).then(r => r || fetch(req).then(res => put(req, res)));
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin === self.location.origin) {
    if (u.pathname.includes("/fonts/") || u.pathname.includes("/vendor/")) { e.respondWith(cacheFirst(req)); return; }
    e.respondWith(
      fetch(req).then(res => put(req, res))
        .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html")))
    );
  } else if (u.hostname === "www.gstatic.com") {
    e.respondWith(cacheFirst(req));
  }
});
