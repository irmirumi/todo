// 2.9.0 → 2.9.1 넘어갈 때만 쓰인다(빌드가 app/app.js로 둔다).
// 2.9.0 서비스 워커는 처음 보는 주소 app/에 옛 화면(index.html)을 내주는데, 그 화면은 style.css·ui.js·app.js를 app/ 아래에서 찾아서
// CSS도 화면 코드도 없이 버튼만 보인다. 이 파일은 그 옛 화면이 부르는 app/app.js 자리에서 새 서비스 워커로 바꾸고 다시 연다.
// 새 화면(app/index.html)은 ../app.js를 부르므로 평소엔 이 파일을 받지 않는다.
(async () => {
  const sw = navigator.serviceWorker;
  if (!sw) return;
  let done = false;
  sw.addEventListener("controllerchange", () => { if (!done) { done = true; location.reload(); } });
  const reg = await sw.getRegistration(new URL("../", location.href).href);
  if (!reg) return;
  const go = w => w.postMessage({ type: "skip" });
  const track = w => { if (w) w.addEventListener("statechange", () => { if (w.state === "installed") go(w); }); };
  if (reg.waiting) { go(reg.waiting); return; }
  if (reg.installing) { track(reg.installing); return; }
  reg.addEventListener("updatefound", () => track(reg.installing));
  try { await reg.update(); } catch (e) {}
  // 새 워커가 이미 맡고 있는데(옛 워커가 화면을 내준 직후 바뀐 경우) 옛 화면이 남았으면 한 번만 다시 연다
  if (!reg.installing && !reg.waiting) {
    let last = 0; try { last = +sessionStorage.getItem("ttobak.rescue") || 0; } catch (e) {}
    if (Date.now() - last > 15000) { try { sessionStorage.setItem("ttobak.rescue", Date.now()); } catch (e) {} done = true; location.reload(); }
  }
})();
