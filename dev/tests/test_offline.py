# 오프라인으로 열기 + 새 버전 안내(2.5.0): 껍데기는 한 버전 묶음에서만 열리고, 새 묶음이 준비되면 '새로고침' 안내
import os, re, shutil, subprocess, sys, time, tempfile
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "dist", "app")
APP = tempfile.mkdtemp(prefix="ttobak-off-")
shutil.rmtree(APP); shutil.copytree(SRC, APP)  # 사본에서 돌린다(버전을 바꿔 보려고)
CACHE = re.search(r'const CACHE = "([^"]+)"', open(os.path.join(APP, "sw.js")).read()).group(1)
VER = re.search(r'const VERSION="([^"]+)"', open(os.path.join(APP, "ui.js")).read()).group(1)
# 실제 Firebase에 붙지 않게 설정은 빈 값으로(설정 안내 화면이 뜬다)
open(os.path.join(APP, "firebase-config.js"), "w").write('export const firebaseConfig={apiKey:"여기에-붙여넣기",projectId:""};')
n = 0
def check(cond, msg):
    global n; n += 1
    assert cond, msg
    print("ok", msg)
def serve():
    return subprocess.Popen([sys.executable, "-m", "http.server", "8779"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
srv = serve(); time.sleep(1)
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 390, "height": 844}); pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("http://localhost:8779/"); pg.wait_for_selector("#main h1")
    check(pg.inner_text("#main h1") == "설정이 필요해요", "설정 없으면 안내 화면")
    pg.wait_for_function("!!navigator.serviceWorker.controller", timeout=10000); pg.wait_for_timeout(300)
    pg.reload(); pg.wait_for_timeout(800)
    keys = pg.evaluate("caches.keys()")
    cnt = pg.evaluate("caches.open('" + CACHE + "').then(c=>c.keys()).then(k=>k.length)")
    check(CACHE in keys and cnt >= 16, f"껍데기 묶음 저장: {keys} {cnt}개")
    check(pg.evaluate("!!navigator.serviceWorker.controller"), "서비스 워커가 화면을 맡음")
    # 오프라인(서버 끔)으로 다시 열기
    srv.terminate(); srv.wait(); time.sleep(.3)
    pg.reload(); pg.wait_for_selector("#main h1")
    check(pg.inner_text("#main h1") == "설정이 필요해요" and pg.evaluate("!!window.TodoApp"), "서버 없이도 열림")
    # 새 버전 올리기: 사본의 버전을 바꾸고 서버 다시 켬
    nv = VER + "-next"
    for f, a, b2 in [("sw.js", CACHE, "ttobak-" + nv), ("ui.js", 'const VERSION="' + VER + '"', 'const VERSION="' + nv + '"')]:
        s = open(os.path.join(APP, f), encoding="utf-8").read(); open(os.path.join(APP, f), "w", encoding="utf-8").write(s.replace(a, b2))
    print("FILE", re.search(r"ttobak-[^\"]+", open(os.path.join(APP, "sw.js")).read()).group(0))
    srv = serve(); time.sleep(1)
    pg.reload(); pg.wait_for_timeout(300)
    check(pg.evaluate("document.querySelector('script[src=\"ui.js\"]')&&1") == 1, "다시 열기")
    pg.wait_for_selector("#upd:not([hidden])", timeout=10000)
    check("새 버전이 있어요" in pg.inner_text("#upd"), "새 묶음이 준비되면 '새 버전이 있어요'")
    old = pg.evaluate("caches.keys()")
    check(CACHE in old, "누르기 전엔 옛 묶음 그대로(섞이지 않음)")
    with pg.expect_navigation(timeout=10000):
        pg.click("#upd [data-act=reload]")
    pg.wait_for_selector("#main h1"); pg.wait_for_timeout(500)
    keys = pg.evaluate("caches.keys()")
    check("ttobak-" + nv in keys and CACHE not in keys, f"새로고침 → 새 묶음으로 바뀌고 옛 묶음 지움: {keys}")
    b.close()
srv.terminate()
shutil.rmtree(APP, ignore_errors=True)
print("checks:", n, "errors:", errs)
assert not errs, errs
