/* 또박 알림 서버 — Cloudflare Workers (무료 플랜) + D1
   이 파일 전체를 Cloudflare Worker 편집기에 그대로 붙여넣으면 됩니다. 고칠 곳 없음.
   필요한 연결: D1 데이터베이스를 변수 이름 DB 로 연결, 크론 트리거 "* * * * *" (매분).

   하는 일
   - POST /sync         로그인한 사람의 앞으로 울릴 알림 목록을 통째로 교체
   - POST /subscribe    이 기기의 푸시 구독 저장
   - POST /unsubscribe  이 기기의 푸시 구독 삭제
   - POST /test         이 사람의 모든 기기로 테스트 알림
   - GET  /vapid        푸시용 공개키(처음 요청 때 자동으로 만들어 D1에 보관)
   - 매분: 시간이 된 알림을 Web Push(암호화, VAPID 서명)로 보냄
   모든 요청은 Firebase 로그인 토큰(이 프로젝트)으로 확인하고, 처음 쓴 계정 하나만 받습니다(주인 고정). */

const FIREBASE_PROJECT_ID = "my-todo-e4949";
const APP_URL = "https://irmirumi.github.io/todo/";
const ALLOWED_ORIGINS = ["https://irmirumi.github.io"];
const MAX_PUSHES_PER_RUN = 4;     // 무료 플랜 CPU 한도(실행당 10ms) 안에서 넉넉히. 넘치면 다음 분에
const RETRY_MS = 10 * 60 * 1000;
const DROP_IF_LATE_MS = 60 * 60 * 1000; // 1시간 넘게 밀린 알림은 보내지 않고 버림
// 브라우저 푸시 서비스 주소만 받는다(크롬·안드로이드, 아이폰·맥, 파이어폭스, 엣지)
const PUSH_HOSTS = /^https:\/\/(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;

/* ---------------- 공용 ---------------- */
const enc = new TextEncoder();
const b64u = buf => { let s = ""; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = str => { str = str.replace(/-/g, "+").replace(/_/g, "/"); while (str.length % 4) str += "="; const s = atob(str); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };
const concat = (...parts) => { const n = parts.reduce((a, p) => a + p.length, 0); const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

function cors(req) {
  const o = req.headers.get("Origin") || "";
  const ok = ALLOWED_ORIGINS.includes(o) || /^http:\/\/localhost(:\d+)?$/.test(o);
  return ok ? { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Max-Age": "86400", "Vary": "Origin" } : {};
}
const json = (req, data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors(req) } });

/* ---------------- D1 ---------------- */
let ready = false;
async function init(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS subs (endpoint TEXT PRIMARY KEY, uid TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created INTEGER NOT NULL)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS subs_uid ON subs(uid)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS rem (uid TEXT NOT NULL, id TEXT NOT NULL, at INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, url TEXT NOT NULL, PRIMARY KEY (uid, id))"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS rem_at ON rem(at)")
  ]);
  ready = true;
}

/* ---------------- VAPID 키(처음 한 번 만들어 보관) ---------------- */
let vapidCache = null;
async function vapid(env) {
  if (vapidCache) return vapidCache;
  const row = await env.DB.prepare("SELECT v FROM kv WHERE k = 'vapid'").first();
  let data;
  if (row) data = JSON.parse(row.v);
  else {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const priv = await crypto.subtle.exportKey("jwk", kp.privateKey);
    const pub = b64u(await crypto.subtle.exportKey("raw", kp.publicKey));
    data = { priv, pub };
    await env.DB.prepare("INSERT OR IGNORE INTO kv (k, v) VALUES ('vapid', ?)").bind(JSON.stringify(data)).run();
    const again = await env.DB.prepare("SELECT v FROM kv WHERE k = 'vapid'").first();
    data = JSON.parse(again.v); // 동시에 두 번 만들어진 경우 먼저 저장된 것을 쓴다
  }
  const key = await crypto.subtle.importKey("jwk", data.priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  vapidCache = { key, pub: data.pub, jwts: new Map() };
  return vapidCache;
}
async function vapidHeader(env, endpoint) {
  const v = await vapid(env);
  const aud = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const c = v.jwts.get(aud);
  if (c && c.exp - now > 3600) return `vapid t=${c.jwt}, k=${v.pub}`;
  const exp = now + 12 * 3600;
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(enc.encode(JSON.stringify({ aud, exp, sub: APP_URL })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, v.key, enc.encode(head + "." + body));
  const jwt = head + "." + body + "." + b64u(sig);
  v.jwts.set(aud, { jwt, exp });
  return `vapid t=${jwt}, k=${v.pub}`;
}

/* ---------------- Web Push 내용 암호화 (RFC 8291, aes128gcm) ---------------- */
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8));
}
async function encryptPayload(p256dhB64, authB64, payload) {
  const uaPub = unb64u(p256dhB64), authSecret = unb64u(authB64);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode("WebPush: info\0"), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = concat(enc.encode(payload), new Uint8Array([2]));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, plain));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}
/* 반환: "ok" | "gone"(구독 만료, 지워야 함) | "fail" */
async function sendPush(env, sub, message) {
  try {
    const body = await encryptPayload(sub.p256dh, sub.auth, JSON.stringify(message));
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: { "Authorization": await vapidHeader(env, sub.endpoint), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", "TTL": "3600", "Urgency": "high" },
      body
    });
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "ok" : "fail";
  } catch (e) { return "fail"; }
}

/* ---------------- Firebase 로그인 토큰 확인 ---------------- */
let jwks = null, jwksExp = 0;
async function googleKeys() {
  if (jwks && Date.now() < jwksExp) return jwks;
  const res = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  const data = await res.json();
  const m = /max-age=(\d+)/.exec(res.headers.get("Cache-Control") || "");
  jwks = data.keys || []; jwksExp = Date.now() + (m ? +m[1] * 1000 : 3600 * 1000);
  return jwks;
}
async function verifyUser(req) {
  const h = req.headers.get("Authorization") || "";
  const tok = h.startsWith("Bearer ") ? h.slice(7) : "";
  const parts = tok.split(".");
  if (parts.length !== 3) return null;
  let head, claims;
  try { head = JSON.parse(new TextDecoder().decode(unb64u(parts[0]))); claims = JSON.parse(new TextDecoder().decode(unb64u(parts[1]))); } catch (e) { return null; }
  if (head.alg !== "RS256") return null;
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== FIREBASE_PROJECT_ID || claims.iss !== "https://securetoken.google.com/" + FIREBASE_PROJECT_ID) return null;
  if (!(claims.exp > now) || !(claims.iat <= now + 300) || typeof claims.sub !== "string" || !claims.sub) return null;
  const jwk = (await googleKeys()).find(k => k.kid === head.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, unb64u(parts[2]), enc.encode(parts[0] + "." + parts[1]));
  return ok ? claims.sub : null;
}

/* 주인 고정: 처음 로그인해서 쓴 계정만 받는다. 바꾸려면 D1 콘솔에서 DELETE FROM kv WHERE k='owner' */
let ownerCache = null;
async function isOwner(env, uid) {
  if (!ownerCache) {
    await env.DB.prepare("INSERT OR IGNORE INTO kv (k, v) VALUES ('owner', ?)").bind(uid).run();
    const row = await env.DB.prepare("SELECT v FROM kv WHERE k = 'owner'").first();
    ownerCache = row && row.v;
  }
  return ownerCache === uid;
}

/* ---------------- 요청 처리 ---------------- */
const str = (v, n) => typeof v === "string" ? v.slice(0, n) : "";
async function handle(req, env) {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method === "GET" && url.pathname === "/") return new Response("또박 알림 서버 OK", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  await init(env);
  if (req.method === "GET" && url.pathname === "/vapid") return json(req, { key: (await vapid(env)).pub });
  if (req.method !== "POST") return json(req, { error: "not_found" }, 404);
  const uid = await verifyUser(req);
  if (!uid) return json(req, { error: "unauthorized" }, 401);
  if (!(await isOwner(env, uid))) return json(req, { error: "forbidden" }, 403);
  let data = {};
  try { data = await req.json(); } catch (e) { return json(req, { error: "bad_json" }, 400); }

  if (url.pathname === "/sync") {
    // 이미 지난 알림은 받지 않는다(보낸 직후 다시 동기화돼 두 번 울리는 것 방지)
    const now = Date.now(), rows = [];
    for (const r of Array.isArray(data.reminders) ? data.reminders.slice(0, 300) : []) {
      const id = str(r && r.id, 80), at = Math.round(Number(r && r.at));
      if (!id || !Number.isFinite(at) || at <= now) continue;
      rows.push({ id, at, title: str(r.title, 200) || "할 일", body: str(r.body, 200), url: /^https:\/\//.test(r.url) ? str(r.url, 300) : APP_URL });
    }
    // 무료 플랜의 실행당 쿼리 수 한도와 상관없게, 목록 전체를 쿼리 두 개로 교체한다
    await env.DB.batch([
      env.DB.prepare("DELETE FROM rem WHERE uid = ?").bind(uid),
      env.DB.prepare("INSERT OR REPLACE INTO rem (uid, id, at, title, body, url) SELECT ?, json_extract(value, '$.id'), json_extract(value, '$.at'), json_extract(value, '$.title'), json_extract(value, '$.body'), json_extract(value, '$.url') FROM json_each(?)")
        .bind(uid, JSON.stringify(rows))
    ]);
    return json(req, { ok: true, count: rows.length });
  }
  if (url.pathname === "/subscribe") {
    const ep = str(data.endpoint, 1000), p = str(data.keys && data.keys.p256dh, 200), a = str(data.keys && data.keys.auth, 100);
    if (!PUSH_HOSTS.test(ep) || !p || !a) return json(req, { error: "bad_subscription" }, 400);
    await env.DB.prepare("INSERT OR REPLACE INTO subs (endpoint, uid, p256dh, auth, created) VALUES (?, ?, ?, ?, ?)").bind(ep, uid, p, a, Date.now()).run();
    return json(req, { ok: true });
  }
  if (url.pathname === "/unsubscribe") {
    await env.DB.prepare("DELETE FROM subs WHERE endpoint = ? AND uid = ?").bind(str(data.endpoint, 1000), uid).run();
    return json(req, { ok: true });
  }
  if (url.pathname === "/test") {
    const { results } = await env.DB.prepare("SELECT * FROM subs WHERE uid = ? LIMIT 5").bind(uid).all();
    let sent = 0;
    for (const s of results) {
      const r = await sendPush(env, s, { title: "또박", body: "또박 테스트 알림이에요", tag: "test", url: APP_URL });
      if (r === "gone") await env.DB.prepare("DELETE FROM subs WHERE endpoint = ?").bind(s.endpoint).run();
      if (r === "ok") sent++;
    }
    return json(req, { ok: true, devices: results.length, sent });
  }
  return json(req, { error: "not_found" }, 404);
}

/* ---------------- 매분: 시간이 된 알림 보내기 ---------------- */
async function tick(env) {
  await init(env);
  const now = Date.now();
  await env.DB.prepare("DELETE FROM rem WHERE at < ?").bind(now - DROP_IF_LATE_MS).run();
  const { results: due } = await env.DB.prepare("SELECT * FROM rem WHERE at <= ? ORDER BY at LIMIT 10").bind(now + 20000).all();
  let pushes = 0;
  for (const r of due) {
    const { results: subs } = await env.DB.prepare("SELECT * FROM subs WHERE uid = ? LIMIT 5").bind(r.uid).all();
    if (pushes > 0 && pushes + subs.length > MAX_PUSHES_PER_RUN) break; // 나머지는 다음 분에
    let ok = 0, failed = 0;
    for (const s of subs) {
      const res = await sendPush(env, s, { title: r.title, body: r.body, tag: r.id, url: r.url });
      pushes++;
      if (res === "gone") await env.DB.prepare("DELETE FROM subs WHERE endpoint = ?").bind(s.endpoint).run();
      else if (res === "ok") ok++; else failed++;
    }
    // 2.6.0: 한 기기에도 못 보냈으면(푸시 서버 일시 오류 등) 지우지 않고 다음 분에 다시. 10분이 지나면 포기한다.
    // 한 기기라도 받았으면 지운다(다시 보내면 받은 기기에 두 번 울림)
    if (failed && !ok && r.at > now - RETRY_MS) continue;
    await env.DB.prepare("DELETE FROM rem WHERE uid = ? AND id = ? AND at = ?").bind(r.uid, r.id, r.at).run();
  }
}

export default {
  async fetch(req, env) {
    try { return await handle(req, env); }
    catch (e) { return json(req, { error: "server_error" }, 500); }
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(tick(env)); }
};
