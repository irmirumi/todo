// 워커 단위 테스트: D1은 node:sqlite로 흉내, fetch는 가짜로 가로챔, 푸시 암호문은 http_ece로 복호화해 검증
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import ece from "http_ece";
import nodeCrypto from "node:crypto";

const src = readFileSync(new URL("../src/worker/worker.js", import.meta.url), "utf8") + "\nexport { handle, tick };\n";
writeFileSync("./w.mjs", src);
const { handle, tick, default: worker } = await import("./w.mjs");

// --- D1 흉내 ---
const sql = new DatabaseSync(":memory:");
const stmt = (q) => { let args = []; const o = {
  bind: (...a) => { args = a; return o; },
  first: async () => sql.prepare(q).get(...args) ?? null,
  all: async () => ({ results: sql.prepare(q).all(...args) }),
  run: async () => { sql.prepare(q).run(...args); return { success: true }; },
  _exec: () => /^\s*(select)/i.test(q) ? sql.prepare(q).all(...args) : sql.prepare(q).run(...args)
}; return o; };
const env = { DB: { prepare: stmt, batch: async (list) => list.map(s => s._exec()) } };

// --- Firebase 토큰 흉내: RSA 키로 서명 ---
const rsa = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const pubJwk = { ...(await crypto.subtle.exportKey("jwk", rsa.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
const b64u = b => Buffer.from(b).toString("base64url");
async function idToken(over = {}) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: "RS256", kid: "k1", typ: "JWT" }));
  const c = b64u(JSON.stringify({ aud: "my-todo-e4949", iss: "https://securetoken.google.com/my-todo-e4949", sub: "user1", iat: now, exp: now + 3600, ...over }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", rsa.privateKey, new TextEncoder().encode(h + "." + c));
  return h + "." + c + "." + b64u(sig);
}

// --- 가짜 fetch ---
const pushes = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.startsWith("https://www.googleapis.com/")) return new Response(JSON.stringify({ keys: [pubJwk] }), { headers: { "Cache-Control": "public, max-age=20000" } });
  if (url.startsWith("https://fcm.googleapis.com/fcm/send/")) { pushes.push({ url, headers: init.headers, body: new Uint8Array(init.body) }); return new Response(null, { status: url.includes("gone") ? 410 : 201 }); }
  throw new Error("unexpected fetch " + url);
};

// --- 브라우저 쪽 구독 흉내 (수신 기기 키) ---
const ua = nodeCrypto.createECDH("prime256v1"); ua.generateKeys();
const authSecret = nodeCrypto.randomBytes(16);
const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(authSecret) } };

const call = async (path, body, tok, method = "POST") => {
  const req = new Request("https://w.example.workers.dev" + path, { method, headers: { "Origin": "https://irmirumi.github.io", "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: method === "POST" ? JSON.stringify(body) : undefined });
  const res = await worker.fetch(req, env);
  return { status: res.status, cors: res.headers.get("Access-Control-Allow-Origin"), data: await res.text() };
};
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) process.exitCode = 1; };

const tok = await idToken();
ok((await call("/", null, null, "GET")).data.includes("OK"), "health");
const v = JSON.parse((await call("/vapid", null, null, "GET")).data);
ok(typeof v.key === "string" && Buffer.from(v.key, "base64url").length === 65, "vapid public key 65 bytes");
const v2 = JSON.parse((await call("/vapid", null, null, "GET")).data);
ok(v.key === v2.key, "vapid key stable");
ok((await call("/sync", { reminders: [] }, null)).status === 401, "no token → 401");
ok((await call("/sync", { reminders: [] }, await idToken({ aud: "other" }))).status === 401, "wrong project → 401");
ok((await call("/sync", { reminders: [] }, await idToken({ exp: 1 }))).status === 401, "expired → 401");
const bad = tok.slice(0, -4) + (tok.endsWith("AAAA") ? "BBBB" : "AAAA");
ok((await call("/sync", { reminders: [] }, bad)).status === 401, "bad signature → 401");
const s1 = await call("/subscribe", sub, tok); ok(s1.status === 200 && s1.cors === "https://irmirumi.github.io", "subscribe + CORS");
await call("/subscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/gone1", keys: sub.keys }, tok);

const now = Date.now();
const r1 = await call("/sync", { reminders: [
  { id: "t_a", at: now + 5000, title: "과제 제출", body: "오후 3:00 · 10분 전", url: "https://irmirumi.github.io/todo/#d=2026-10-10" },
  { id: "t_b", at: now + 3600000, title: "나중", body: "x" },
  { id: "t_old", at: now - 2 * 3600000, title: "너무 늦음", body: "x" },
  { id: "t_past", at: now - 1000, title: "방금 지남", body: "x" }
] }, tok);
ok(JSON.parse(r1.data).count === 2, "sync stored 2 (past ones rejected)");
const row = sql.prepare("SELECT * FROM rem WHERE id='t_a'").get();
ok(row && row.title === "과제 제출" && row.at === now + 5000 && row.url.endsWith("#d=2026-10-10") && row.uid === "user1", "json_each insert keeps fields");
ok((await call("/sync", { reminders: [] }, await idToken({ sub: "intruder" }))).status === 403, "other account → 403 (owner lock)");
ok((await call("/subscribe", { endpoint: "https://evil.example.com/x", keys: sub.keys }, tok)).status === 400, "non-push host rejected");
await tick(env);
ok(pushes.length === 2, "tick sent to 2 subscriptions (one gone)");
const p = pushes.find(x => x.url.endsWith("/abc"));
ok(p && p.headers["Content-Encoding"] === "aes128gcm", "aes128gcm header");
const plain = ece.decrypt(Buffer.from(p.body), { version: "aes128gcm", privateKey: ua, dh: undefined, authSecret });
const msg = JSON.parse(plain.toString("utf8"));
ok(msg.title === "과제 제출" && msg.body === "오후 3:00 · 10분 전" && msg.tag === "t_a", "payload decrypts to the reminder (RFC 8291)");
// VAPID JWT 검증
const m = /vapid t=([^,]+), k=(.+)$/.exec(p.headers.Authorization);
const [h, c, sg] = m[1].split(".");
const pub = await crypto.subtle.importKey("raw", Buffer.from(m[2], "base64url"), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, Buffer.from(sg, "base64url"), new TextEncoder().encode(h + "." + c)), "VAPID JWT signature valid");
const claims = JSON.parse(Buffer.from(c, "base64url"));
ok(claims.aud === "https://fcm.googleapis.com" && claims.exp > now / 1000, "VAPID claims");
const left = sql.prepare("SELECT id FROM rem ORDER BY id").all().map(r => r.id);
ok(JSON.stringify(left) === '["t_b"]', "sent reminder removed, future kept: " + JSON.stringify(left));
// 보낸 직후(20초 일찍 보냄) 같은 알림이 /sync로 다시 와도 두 번 울리지 않음(2.7.0)
{
  const sentRow = sql.prepare("SELECT id, at FROM sent").all();
  ok(sentRow.length >= 1, "sent reminder recorded: " + JSON.stringify(sentRow));
  const again = sentRow.map(r => ({ id: r.id, at: r.at, title: "again", body: "" }));
  if (again[0].at > Date.now()) { await call("/sync", { reminders: again.concat([{ id: "t_b", at: Date.now() + 3600e3, title: "b", body: "" }]) }, tok);
    ok(!sql.prepare("SELECT id FROM rem").all().some(r => r.id === again[0].id), "already sent reminder is not re-added by /sync"); }
  else ok(true, "(sent reminder already in the past — skip re-add check)");
}
ok(sql.prepare("SELECT count(*) n FROM subs").get().n === 1, "gone subscription removed");
pushes.length = 0;
const t = JSON.parse((await call("/test", {}, tok)).data);
ok(t.sent === 1 && pushes.length === 1, "test push");
ok((await call("/unsubscribe", { endpoint: sub.endpoint }, tok)).status === 200 && sql.prepare("SELECT count(*) n FROM subs").get().n === 0, "unsubscribe");
const pre = await worker.fetch(new Request("https://w/sync", { method: "OPTIONS", headers: { Origin: "https://irmirumi.github.io" } }), env);
ok(pre.status === 204 && pre.headers.get("Access-Control-Allow-Headers").includes("Authorization"), "CORS preflight");
const evil = await call("/", null, null, "GET");
// CPU 대략치: 암호화+서명 1회 시간
const t0 = performance.now();
for (let i = 0; i < 20; i++) { await call("/subscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/x" + i, keys: sub.keys }, tok); }
sql.prepare("DELETE FROM rem").run();
await call("/sync", { reminders: Array.from({ length: 6 }, (_, i) => ({ id: "t" + i, at: Date.now() + 1000, title: "a", body: "b" })) }, tok);
const big = await call("/sync", { reminders: Array.from({ length: 400 }, (_, i) => ({ id: "b" + i, at: Date.now() + 864e5 + i, title: "x", body: "y" })) }, tok);
ok(JSON.parse(big.data).count === 300 && sql.prepare("SELECT count(*) n FROM rem").get().n === 300, "400 → capped at 300, two statements");
await call("/sync", { reminders: Array.from({ length: 6 }, (_, i) => ({ id: "t" + i, at: Date.now() + 1000, title: "a", body: "b" })) }, tok);
pushes.length = 0; const t1 = performance.now(); await tick(env); const t2 = performance.now();
console.log("tick with", pushes.length, "pushes took", (t2 - t1).toFixed(1), "ms wall (Node, incl. sqlite)");
