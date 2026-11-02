/* 끄적(메모) 글 서식(3.0.0) — 마크다운 대신 쓰는 동안 그대로 보이는 블록 서식.
   사용자: "작성할 때 미리보기가 안 되는 게 불편" → 기호를 쓰지 않고, 쓰는 화면이 곧 보이는 화면.

   글(doc) = 블록 배열. 블록 {k, t, b?, d?}
     k: "p" 본문 · "h" 제목 · "l" 목록 · "c" 체크
     t: 글자(줄바꿈 없음)
     b: 굵게 구간 [시작, 끝, 시작, 끝, …] (Firestore는 배열 안 배열을 못 담아서 평평하게)
     d: 1이면 체크됨(c만)
   저장은 doc과 함께 text(같은 내용의 마크다운)도 쓴다. 예전 버전(2.x)이 남은 기기는 text만 읽고 고치므로,
   text가 doc에서 만든 것과 다르면 그 기기가 고친 것으로 보고 text를 읽는다(docOf).

   편집기는 contenteditable 하나에 블록마다 <div class="rb" data-k data-d>. 줄바꿈·지우기·붙여넣기는 직접 처리하고(beforeinput),
   글자 입력과 한글 조합은 브라우저에 맡긴 뒤 읽는다. 구조를 바꿀 땐 다시 그리고 커서를 (블록, 글자 위치)로 되돌린다. */
(function (g) {
  "use strict";
  const KINDS = ["p", "h", "l", "c"];
  const MAX_BLOCKS = 2000, MAX_T = 5000;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- 굵게 구간 ---------- */
  // 평평한 [s,e,s,e] ↔ [[s,e]] 정리: 겹치거나 붙은 구간 합치기, 글자 밖은 자르기
  function normB(b, len) {
    const r = [];
    if (Array.isArray(b)) for (let i = 0; i + 1 < b.length; i += 2) {
      const s = Math.max(0, Math.min(len, b[i] | 0)), e = Math.max(0, Math.min(len, b[i + 1] | 0));
      if (e > s) r.push([s, e]);
    }
    r.sort((x, y) => x[0] - y[0]);
    const out = [];
    for (const x of r) { const l = out[out.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push(x.slice()); }
    return out.flat();
  }
  const blk = (k, t, b, d) => { const o = { k: KINDS.includes(k) ? k : "p", t: String(t || "").slice(0, MAX_T) }; const nb = normB(b, o.t.length); if (nb.length) o.b = nb; if (o.k === "c" && d) o.d = 1; return o; };
  // 글자와 굵게를 "조각"(runs: [{s, b}])으로 → 자르고 붙이기 쉽게
  function runsOf(x) {
    const t = x.t, b = x.b || [], out = []; let p = 0;
    for (let i = 0; i + 1 < b.length; i += 2) { if (b[i] > p) out.push({ s: t.slice(p, b[i]), b: false }); out.push({ s: t.slice(b[i], b[i + 1]), b: true }); p = b[i + 1]; }
    if (p < t.length) out.push({ s: t.slice(p), b: false });
    return out;
  }
  function fromRuns(k, runs, d) {
    let t = "", b = [];
    for (const r of runs) { if (!r.s) continue; if (r.b) b.push(t.length, t.length + r.s.length); t += r.s; }
    return blk(k, t, b, d);
  }
  function splitRuns(runs, at) {
    const a = [], z = []; let p = 0;
    for (const r of runs) {
      const e = p + r.s.length;
      if (e <= at) a.push(r); else if (p >= at) z.push(r);
      else { a.push({ s: r.s.slice(0, at - p), b: r.b }); z.push({ s: r.s.slice(at - p), b: r.b }); }
      p = e;
    }
    return [a, z];
  }

  /* ---------- 검사(가져오기·저장) ---------- */
  function clean(doc) {
    if (!Array.isArray(doc)) return null;
    const out = [];
    for (const x of doc.slice(0, MAX_BLOCKS)) {
      if (!x || typeof x !== "object") continue;
      const b = Array.isArray(x.b) ? x.b.filter(n => Number.isInteger(n) && n >= 0) : [];
      out.push(blk(KINDS.includes(x.k) ? x.k : "p", typeof x.t === "string" ? x.t.replace(/[\r\n]/g, " ") : "", b, x.d === 1 || x.d === true));
    }
    return out.length ? out : [blk("p", "")];
  }

  /* ---------- 마크다운 ↔ 글 ---------- */
  // 예전 메모(2.8~2.10의 마크다운)를 읽는다. 링크는 "글 (주소)", 코드·기울임·취소선 기호는 뗀다
  function inlineFromMd(s) {
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)").replace(/`([^`]+)`/g, "$1").replace(/~~([^~]+)~~/g, "$1");
    const runs = []; const re = /\*\*([^*]+)\*\*|__([^_]+)__/g; let p = 0, m;
    while ((m = re.exec(s))) { if (m.index > p) runs.push({ s: s.slice(p, m.index), b: false }); runs.push({ s: m[1] || m[2], b: true }); p = re.lastIndex; }
    if (p < s.length) runs.push({ s: s.slice(p), b: false });
    return runs.map(r => ({ s: r.b ? r.s : r.s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1$2").replace(/(^|[\s(])_([^_\s][^_]*)_/g, "$1$2"), b: r.b }));
  }
  function fromMd(text) {
    const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n"), out = [];
    let fence = false;
    for (const L of lines) {
      if (/^\s*```/.test(L)) { fence = !fence; continue; }
      if (fence) { out.push(blk("p", L)); continue; }
      let m;
      if ((m = /^\s*#{1,3}\s+(.*)$/.exec(L))) out.push(fromRuns("h", inlineFromMd(m[1])));
      else if ((m = /^\s*[-*+]\s+\[( |x|X)\]\s?(.*)$/.exec(L))) out.push(fromRuns("c", inlineFromMd(m[2]), m[1] !== " "));
      else if ((m = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(L))) out.push(fromRuns("l", inlineFromMd(m[1])));
      else if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(L)) out.push(blk("p", ""));
      else if ((m = /^\s*>\s?(.*)$/.exec(L))) out.push(fromRuns("p", inlineFromMd(m[1])));
      else out.push(fromRuns("p", inlineFromMd(L)));
    }
    while (out.length > 1 && !out[out.length - 1].t && out[out.length - 1].k === "p") out.pop();
    return out.length ? out.slice(0, MAX_BLOCKS) : [blk("p", "")];
  }
  // 글 → 마크다운(예전 버전 호환용 text 칸). 글자 속 기호는 그대로 둔다(읽을 때 다시 굵게가 될 수 있어도 내용은 같다)
  function toMd(doc) {
    return (doc || []).map(x => {
      const s = runsOf(x).map(r => r.b && r.s.trim() ? "**" + r.s + "**" : r.s).join("");
      return x.k === "h" ? "# " + s : x.k === "l" ? "- " + s : x.k === "c" ? "- [" + (x.d ? "x" : " ") + "] " + s : s;
    }).join("\n");
  }
  const toPlain = doc => (doc || []).map(x => x.t).join("\n");
  // 저장된 메모에서 글 읽기: doc이 있고 text가 doc과 같으면 doc, 아니면(옛 메모, 옛 버전이 고친 메모) text에서
  function docOf(m) {
    const d = m && Array.isArray(m.doc) ? clean(m.doc) : null;
    if (d && toMd(d) === String(m.text || "")) return d;
    return fromMd(m && m.text);
  }
  const title = doc => { const x = (doc || []).find(y => y.t.trim()); return x ? x.t.trim().slice(0, 60) : ""; };
  const isEmpty = doc => !(doc || []).some(x => x.t.trim());

  /* ---------- 보기(카드·보드) ---------- */
  const linkify = s => s.replace(/(^|[\s(])(https?:\/\/[^\s<"')]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  const inlineHtml = (x, links) => runsOf(x).map(r => { const s = links ? linkify(esc(r.s)) : esc(r.s); return r.b ? "<b>" + s + "</b>" : s; }).join("");
  // 보기도 편집기와 같은 블록 모양(.rb[data-k])이라 쓰는 화면과 보는 화면이 똑같다(3.1.0). check: 체크칸을 누를 수 있게(data-act="mcheck" data-line=블록 번호)
  function toHtml(doc, opt) {
    const o = opt || {};
    return (doc || []).map((x, i) => {
      const s = inlineHtml(x, true);
      const box = x.k !== "c" ? "" : o.check
        ? '<button type="button" class="mcb' + (x.d ? " on" : "") + '" data-act="mcheck" data-line="' + i + '" role="checkbox" aria-checked="' + !!x.d + '" aria-label="' + esc(x.t || "체크") + '"></button>'
        : '<span class="mcb' + (x.d ? " on" : "") + '"></span>';
      return '<div class="rb" data-k="' + x.k + '"' + (x.k === "c" && x.d ? ' data-d="1"' : "") + ">" + box + (s || "<br>") + "</div>";
    }).join("");
  }

  /* ---------- 편집기 ---------- */
  const edHtml = doc => (doc || [blk("p", "")]).map(x => '<div class="rb" data-k="' + x.k + '"' + (x.k === "c" && x.d ? ' data-d="1"' : "") + ">" + (x.t ? inlineHtml(x, false) : "<br>") + "</div>").join("");
  const BOLD = el => el.nodeName === "B" || el.nodeName === "STRONG" || (el.style && /^(bold|[6-9]00)$/.test(el.style.fontWeight));
  // 편집기 DOM → 글. 블록이 아닌 것(붙여넣기·브라우저가 만든 것)도 정리한다
  function read(ed) {
    const out = [];
    let cur = null;
    const start = (k, d) => { cur = { k, d, runs: [] }; out.push(cur); };
    const walk = (n, bold, k, d) => {
      if (n.nodeType === 3) { if (!cur) start(k, d); if (n.data) cur.runs.push({ s: n.data.replace(/[\r\n]/g, " ").replace(/​/g, ""), b: bold }); return; }
      if (n.nodeType !== 1) return;
      if (n.nodeName === "BR") { if (n.nextSibling || (n.parentNode !== ed && n.parentNode.lastChild !== n)) start(k, k === "c" ? 0 : d); return; }
      const isBlock = /^(DIV|P|LI|H[1-6]|UL|OL|BLOCKQUOTE|PRE)$/.test(n.nodeName);
      if (isBlock && n.nodeName !== "UL" && n.nodeName !== "OL") {
        const nk = n.dataset && KINDS.includes(n.dataset.k) ? n.dataset.k : /^H/.test(n.nodeName) ? "h" : n.nodeName === "LI" ? "l" : k;
        const nd = n.dataset && n.dataset.k ? n.dataset.d === "1" : d;
        start(nk, nd);
        for (const c of [...n.childNodes]) walk(c, bold || BOLD(n), nk, nd);
        cur = null;
        return;
      }
      for (const c of [...n.childNodes]) walk(c, bold || BOLD(n), k, d);
    };
    for (const c of [...ed.childNodes]) { walk(c, false, "p", false); if (c.nodeType === 1 && /^(DIV|P|LI|H[1-6])$/.test(c.nodeName)) cur = null; }
    const doc = out.map(x => fromRuns(x.k, x.runs, x.d));
    return doc.length ? doc.slice(0, MAX_BLOCKS) : [blk("p", "")];
  }
  /* 커서: (블록 번호, 그 블록 안 글자 위치) */
  const blocks = ed => [...ed.children].filter(n => n.classList && n.classList.contains("rb"));
  function blockOf(ed, node) { while (node && node.parentNode !== ed) node = node.parentNode; return node; }
  function offsetIn(blockEl, node, off) {
    if (!blockEl) return 0;
    if (node === blockEl) { let n = 0; for (let i = 0; i < off && i < node.childNodes.length; i++) n += node.childNodes[i].textContent.length; return n; }
    const r = document.createRange(); r.selectNodeContents(blockEl);
    try { r.setEnd(node, off); } catch (e) { return 0; }
    return r.toString().length;
  }
  function pos(ed, node, off) {
    const b = blockOf(ed, node), bs = blocks(ed);
    if (!b) return node === ed ? { i: Math.min(off, bs.length - 1), o: 0 } : { i: 0, o: 0 };
    return { i: Math.max(0, bs.indexOf(b)), o: offsetIn(b, node, off) };
  }
  function getSel(ed) {
    const s = window.getSelection(); if (!s || !s.rangeCount || !ed.contains(s.anchorNode)) return null;
    const a = pos(ed, s.anchorNode, s.anchorOffset), f = pos(ed, s.focusNode, s.focusOffset);
    const fw = a.i < f.i || (a.i === f.i && a.o <= f.o);
    return { a, f, s: fw ? a : f, e: fw ? f : a, collapsed: s.isCollapsed };
  }
  function point(ed, p) {
    const b = blocks(ed)[Math.min(p.i, blocks(ed).length - 1)]; if (!b) return [ed, 0];
    let left = p.o; const tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); let n, last = null;
    while ((n = tw.nextNode())) { last = n; if (left <= n.data.length) return [n, left]; left -= n.data.length; }
    return last ? [last, last.data.length] : [b, 0];
  }
  function setSel(ed, a, f) {
    const s = window.getSelection(); if (!s) return;
    const [an, ao] = point(ed, a), [fn, fo] = point(ed, f || a);
    try { s.setBaseAndExtent(an, ao, fn, fo); } catch (e) {}
  }
  /* 되돌리기: 글자 입력은 잠깐 멈출 때마다, 구조 바꾸기는 바로 전에 찍어 둔다 */
  function snap(st, ed, force) {
    const now = Date.now(), cur = JSON.stringify(read(ed));
    if (st.undo.length && st.undo[st.undo.length - 1].doc === cur) return;
    if (!force && now - st.lastSnap < 900 && st.undo.length) { st.undo[st.undo.length - 1] = { doc: cur, sel: getSel(ed) }; return; }
    st.undo.push({ doc: cur, sel: getSel(ed) }); if (st.undo.length > 80) st.undo.shift(); st.lastSnap = now; st.redo = [];
  }
  function render(ed, doc, a, f) { ed.innerHTML = edHtml(doc); if (a) setSel(ed, a, f); }

  function mount(ed, doc, opt) {
    const o = opt || {};
    const st = { undo: [], redo: [], lastSnap: 0, composing: false, onChange: o.onChange || (() => {}) };
    ed._rich = st;
    ed.classList.add("rich");
    ed.contentEditable = "true";
    ed.spellcheck = false;
    ed.setAttribute("role", "textbox"); ed.setAttribute("aria-multiline", "true");
    if (o.label) ed.setAttribute("aria-label", o.label);
    if (o.placeholder) ed.dataset.ph = o.placeholder;
    render(ed, doc && doc.length ? doc : [blk("p", "")]);
    const empty = () => ed.classList.toggle("empty", isEmpty(read(ed)) && read(ed).length === 1 && read(ed)[0].k === "p");
    empty();
    st.undo.push({ doc: JSON.stringify(read(ed)), sel: null });
    const changed = () => { empty(); st.onChange(); };
    // 구조를 바꾸는 일: 지금 글을 읽고 → 고치고 → 다시 그리고 → 커서
    const edit = fn => { snap(st, ed, true); const d = read(ed), sel = getSel(ed) || { s: { i: d.length - 1, o: d[d.length - 1].t.length } }; sel.e = sel.e || sel.s;
      const r = fn(d, sel); if (!r) return false; render(ed, r.doc, r.a, r.f); snap(st, ed, true); changed(); return true; };
    st.edit = edit;
    ed.addEventListener("compositionstart", () => { st.composing = true; });
    ed.addEventListener("compositionend", () => { st.composing = false; setTimeout(() => { tidy(); changed(); }, 0); });
    // 선택한 글 지우기(여러 블록에 걸치면 앞 블록에 뒤 블록 나머지를 붙임)
    const cut = (d, sel) => {
      const { s, e } = sel; if (s.i === e.i && s.o === e.o) return d;
      const A = d[s.i], B = d[e.i];
      const left = splitRuns(runsOf(A), s.o)[0], right = splitRuns(runsOf(B), e.o)[1];
      d.splice(s.i, e.i - s.i + 1, fromRuns(A.k, left.concat(right), A.d));
      return d;
    };
    ed.addEventListener("beforeinput", ev => {
      const t = ev.inputType;
      if (t === "historyUndo" || t === "historyRedo") { ev.preventDefault(); (t === "historyUndo" ? undo : redo)(); return; }
      if (st.composing || ev.isComposing) return; // 조합 중엔 브라우저에 맡기고 끝나면 정리
      if (t === "insertParagraph" || t === "insertLineBreak") {
        ev.preventDefault();
        edit((d, sel) => {
          cut(d, sel); const s = sel.s, x = d[s.i];
          if ((x.k === "l" || x.k === "c" || x.k === "h") && !x.t) { d[s.i] = blk("p", ""); return { doc: d, a: { i: s.i, o: 0 } }; } // 빈 목록 줄에서 엔터: 목록 끝
          const [a, z] = splitRuns(runsOf(x), s.o);
          const nk = x.k === "h" ? "p" : x.k;
          d.splice(s.i, 1, fromRuns(x.k, a, x.d), fromRuns(nk, z, false));
          return { doc: d, a: { i: s.i + 1, o: 0 } };
        });
        return;
      }
      if (t === "deleteContentBackward" || t === "deleteContentForward") {
        const sel = getSel(ed); if (!sel) return;
        const d0 = read(ed);
        if (!sel.collapsed && sel.s.i !== sel.e.i) { ev.preventDefault(); edit((d, se) => ({ doc: cut(d, se), a: se.s })); return; }
        if (!sel.collapsed) return;
        if (t === "deleteContentBackward" && sel.s.o === 0) {
          ev.preventDefault();
          edit((d, se) => {
            const i = se.s.i, x = d[i];
            if (x.k !== "p") { d[i] = fromRuns("p", runsOf(x)); return { doc: d, a: { i, o: 0 } }; } // 목록·제목·체크 표시 먼저 떼기
            if (i === 0) return null;
            const pv = d[i - 1], L = pv.t.length;
            d.splice(i - 1, 2, fromRuns(pv.k, runsOf(pv).concat(runsOf(x)), pv.d));
            return { doc: d, a: { i: i - 1, o: L } };
          });
          return;
        }
        if (t === "deleteContentForward" && sel.s.o === d0[sel.s.i].t.length && sel.s.i < d0.length - 1) {
          ev.preventDefault();
          edit((d, se) => { const i = se.s.i, x = d[i], nx = d[i + 1]; d.splice(i, 2, fromRuns(x.k, runsOf(x).concat(runsOf(nx)), x.d)); return { doc: d, a: se.s }; });
        }
        return;
      }
      if (t === "insertFromPaste" || t === "insertFromDrop") {
        const text = ev.dataTransfer && ev.dataTransfer.getData("text/plain");
        if (t === "insertFromDrop") { ev.preventDefault(); return; }
        if (text == null) return;
        ev.preventDefault();
        pasteText(text);
      }
    });
    function pasteText(text) {
      edit((d, sel) => {
        cut(d, sel); const s = sel.s, x = d[s.i];
        const add = /\n/.test(text) ? fromMd(text) : [blk("p", text)];
        const [a, z] = splitRuns(runsOf(x), s.o);
        const first = add[0], last = add[add.length - 1];
        if (add.length === 1) {
          const runs = a.concat(runsOf(first)); const L = runs.reduce((n, r) => n + r.s.length, 0);
          d[s.i] = fromRuns(x.k, runs.concat(z), x.d); return { doc: d, a: { i: s.i, o: L } };
        }
        const mid = add.slice(1, -1), endRuns = runsOf(last), L = last.t.length;
        d.splice(s.i, 1, fromRuns(x.k === "p" ? first.k : x.k, a.concat(runsOf(first)), x.d), ...mid, fromRuns(last.k, endRuns.concat(z), last.d));
        return { doc: d, a: { i: s.i + add.length - 1, o: L } };
      });
    }
    st.pasteText = pasteText;
    // 줄 맨 앞에 "- " "[] " "# " "1. "을 치면 그 모양으로(기호는 지움). 마크다운에 익숙한 손을 위한 지름길
    const AUTO = [[/^[-*•]\s/, "l"], [/^\[\s?\]\s/, "c"], [/^\[[xX]\]\s/, "c", 1], [/^#{1,3}\s/, "h"], [/^1[.)]\s/, "l"]];
    function tidy() {
      const d = read(ed), sel = getSel(ed);
      let hit = false;
      if (sel && sel.collapsed) {
        const x = d[sel.s.i];
        if (x && x.k === "p") for (const [re, k, dd] of AUTO) { const m = re.exec(x.t); if (m && sel.s.o >= m[0].length) {
          const rest = splitRuns(runsOf(x), m[0].length)[1]; d[sel.s.i] = fromRuns(k, rest, dd); hit = { i: sel.s.i, o: sel.s.o - m[0].length }; break; } }
      }
      // 브라우저가 블록 밖에 글자를 두거나 블록을 겹쳐 만들었으면(붙여넣기·조합 뒤) 바른 모양으로 다시 그림
      const canon = edHtml(d);
      if (hit || ed.innerHTML !== canon) {
        const s2 = hit ? { s: hit, e: hit } : sel;
        snap(st, ed, true); render(ed, d, s2 && s2.s, s2 && s2.e);
      }
    }
    ed.addEventListener("input", () => { if (st.composing) { changed(); return; } tidy(); snap(st, ed, false); changed(); });
    // 체크칸(블록 왼쪽 ::before)을 누르면 체크
    ed.addEventListener("pointerdown", ev => {
      const b = ev.target.closest && ev.target.closest(".rb[data-k=c]"); if (!b || b.parentNode !== ed) return;
      const r = b.getBoundingClientRect(); if (ev.clientX - r.left > 26) return;
      ev.preventDefault();
      const i = blocks(ed).indexOf(b), sel = getSel(ed);
      snap(st, ed, true);
      const d = read(ed); d[i] = blk("c", d[i].t, d[i].b, !d[i].d);
      render(ed, d); if (sel && document.activeElement === ed) setSel(ed, sel.a, sel.f);
      snap(st, ed, true); changed();
    });
    ed.addEventListener("keydown", ev => {
      if ((ev.ctrlKey || ev.metaKey) && !ev.altKey) {
        const k = ev.key.toLowerCase();
        if (k === "b" && !ev.shiftKey) { ev.preventDefault(); cmd(ed, "b"); }
        else if (k === "z") { ev.preventDefault(); (ev.shiftKey ? redo : undo)(); }
        else if (k === "y") { ev.preventDefault(); redo(); }
      }
    });
    function undo() {
      snap(st, ed, true); if (st.undo.length < 2) return;
      st.redo.push(st.undo.pop()); const u = st.undo[st.undo.length - 1];
      render(ed, JSON.parse(u.doc), u.sel && u.sel.a, u.sel && u.sel.f); changed();
    }
    function redo() {
      const r = st.redo.pop(); if (!r) return; st.undo.push(r);
      render(ed, JSON.parse(r.doc), r.sel && r.sel.a, r.sel && r.sel.f); changed();
    }
    st.undoFn = undo; st.redoFn = redo;
    return ed;
  }
  /* 꾸미기 버튼: h·l·c는 선택한 줄들(커서 줄)의 모양을 바꾸고 이미 그 모양이면 본문으로, b는 선택한 글을 굵게(이미 다 굵으면 뗌) */
  function cmd(ed, k) {
    const st = ed._rich; if (!st) return;
    if (k === "undo") return st.undoFn();
    if (k === "redo") return st.redoFn();
    if (document.activeElement !== ed) { ed.focus(); }
    st.edit((d, sel) => {
      const { s, e } = sel;
      if (k === "b") {
        if (s.i === e.i && s.o === e.o) return null; // 선택한 글이 없으면 아무것도(폰 키보드의 굵게 상태 흉내는 헷갈려서 안 함)
        let all = true;
        for (let i = s.i; i <= e.i; i++) { const x = d[i], a = i === s.i ? s.o : 0, z = i === e.i ? e.o : x.t.length;
          if (z > a && !splitRuns(splitRuns(runsOf(x), z)[0], a)[1].every(r => r.b || !r.s.trim())) all = false; }
        for (let i = s.i; i <= e.i; i++) { const x = d[i], a = i === s.i ? s.o : 0, z = i === e.i ? e.o : x.t.length; if (z <= a) continue;
          const [l, rest] = splitRuns(runsOf(x), a), [m, r] = splitRuns(rest, z - a);
          d[i] = fromRuns(x.k, l.concat(m.map(q => ({ s: q.s, b: !all })), r), x.d); }
        return { doc: d, a: sel.a, f: sel.f };
      }
      let all = true; for (let i = s.i; i <= e.i; i++) if (d[i].k !== k) all = false;
      for (let i = s.i; i <= e.i; i++) d[i] = blk(all ? "p" : k, d[i].t, d[i].b, all ? 0 : d[i].d);
      return { doc: d, a: sel.a, f: sel.f };
    });
  }
  // 지금 커서가 있는 줄의 모양(꾸미기 막대에 눌린 상태로 보여 주기)
  function state(ed) {
    const sel = getSel(ed); if (!sel) return null;
    const d = read(ed), x = d[sel.s.i]; if (!x) return null;
    return { k: x.k };
  }
  /* 체크 하나 뒤집기(보기 화면에서 메모를 열지 않고) */
  function toggle(doc, i) { const d = clean(doc); if (!d[i] || d[i].k !== "c") return null; d[i] = blk("c", d[i].t, d[i].b, !d[i].d); return d; }

  g.TtobakRich = { KINDS, clean, fromMd, toMd, toPlain, docOf, title, isEmpty, toHtml, mount, read, cmd, state, toggle, edHtml, _runsOf: runsOf };
})(typeof window !== "undefined" ? window : globalThis);
