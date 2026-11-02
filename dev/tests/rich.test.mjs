// 3.0.0 끄적 글 서식(rich.js) 순수 함수: 옛 마크다운 읽기, 마크다운 사본, 고른 글(docOf), 검사, 보기 HTML 이스케이프
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const ctx = { globalThis: {} }; ctx.window = undefined;
vm.runInNewContext(readFileSync(new URL("../src/rich.js", import.meta.url), "utf8"), ctx);
const R = ctx.globalThis.TtobakRich;
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log("ok", m); };
const plain = x => JSON.parse(JSON.stringify(x));

// 옛 마크다운 → 블록
const md = "# 자료구조 3주차\n- 스택은 **LIFO**\n- [ ] 과제 범위 확인\n- [x] 슬라이드\n1. 첫째\n> 인용\n`code` 그리고 [링크](https://a.b/c)\n\n끝";
const d = plain(R.fromMd(md));
ok(d[0].k === "h" && d[0].t === "자료구조 3주차", "제목");
ok(d[1].k === "l" && d[1].t === "스택은 LIFO" && JSON.stringify(d[1].b) === "[4,8]", "목록 + 굵게 구간 " + JSON.stringify(d[1]));
ok(d[2].k === "c" && !d[2].d && d[3].k === "c" && d[3].d === 1, "체크·체크됨");
ok(d[4].k === "l" && d[4].t === "첫째", "번호 목록은 목록으로");
ok(d[5].k === "p" && d[5].t === "인용", "인용은 본문으로");
ok(d[6].t === "code 그리고 링크 (https://a.b/c)", "코드·링크 기호는 글자로 " + d[6].t);
ok(d[7].t === "" && d[8].t === "끝", "빈 줄 유지");
ok(!d.some(x => x.b && x.b.some(v => Array.isArray(v))), "굵게 구간은 평평한 숫자 배열(Firestore)");

// 마크다운 사본과 되읽기(왕복)
const back = plain(R.fromMd(R.toMd(d)));
ok(JSON.stringify(back) === JSON.stringify(d), "toMd → fromMd 왕복이 같음");

// docOf: doc이 있고 text가 그 사본이면 doc, 옛 버전이 text를 고쳤으면 text
const m1 = { doc: d, text: R.toMd(d) };
ok(JSON.stringify(plain(R.docOf(m1))) === JSON.stringify(d), "docOf: doc 사용");
const m2 = { doc: d, text: R.toMd(d) + "\n- 옛 기기에서 추가" };
ok(plain(R.docOf(m2)).at(-1).t === "옛 기기에서 추가", "docOf: 옛 버전이 고친 text를 읽음");
ok(plain(R.docOf({ text: "그냥 글" }))[0].t === "그냥 글", "docOf: 옛 메모(text만)");
ok(plain(R.docOf({}))[0].t === "" && R.isEmpty(R.docOf({})), "docOf: 빈 메모");

// 검사
const c = plain(R.clean([{ k: "x", t: "a\nb", b: [0, 9, 3, 1, -1, 2] }, { k: "c", t: "체크", d: true }, null, "s"]));
ok(c[0].k === "p" && c[0].t === "a b" && JSON.stringify(c[0].b) === "[0,3]", "모르는 모양은 본문, 줄바꿈은 공백, 구간은 글자 안으로 " + JSON.stringify(c[0]));
ok(c[1].d === 1 && c.length === 2, "체크 값·이상한 항목 버림");
ok(R.clean([]).length === 1 && R.clean("x") === null, "빈 글은 빈 줄 하나, 배열 아니면 null");
ok(R.clean(Array.from({ length: 3000 }, () => ({ k: "p", t: "x" }))).length === 2000, "블록 2000개 한도");

// 보기 HTML: 이스케이프, 링크, 체크칸
const h = R.toHtml(R.clean([{ k: "p", t: "<img src=x onerror=alert(1)> https://ex.am/p?q=1" }, { k: "c", t: "할 것", d: 1 }, { k: "l", t: "하나" }]), { check: true });
ok(!/<img/.test(h) && h.includes("&lt;img") && h.includes('<a href="https://ex.am/p?q=1"'), "HTML은 글자로, 주소는 링크");
ok(h.includes('data-act="mcheck" data-line="1"') && h.includes('class="mcb on"') && h.includes("<ul><li>하나</li></ul>"), "체크칸(줄 번호)·목록");
ok(R.title(R.clean([{ k: "p", t: "  " }, { k: "h", t: " 제목 " }])) === "제목", "제목은 첫 글자 있는 줄");
const tg = plain(R.toggle(d, 2));
ok(tg[2].d === 1 && R.toggle(d, 0) === null, "체크 뒤집기(체크 줄만)");
console.log("PASS", n);
