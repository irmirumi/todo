# 2.9.0 → 2.9.1 넘어가기: 2.9.0 서비스 워커가 남은 기기에서 새 주소 app/을 처음 열면, 옛 워커가 옛 화면을 내주고
# 그 화면은 CSS·코드를 app/ 아래에서 찾아 버튼만 남았다(사용자 폰에서 실제로 겪음). app/app.js(rescue.js)가 새 워커로 바꾸고 다시 연다.
# 옛 배치는 실제 2.9.0 빌드의 index.html·sw.js(fixtures/v2.9.0)로 만든다: 맨 위가 또박 화면, 워커 껍데기에 app/ 없음. 나머지 공용 파일은 지금 것
import os, shutil, tempfile
from playwright.sync_api import sync_playwright
from ttb import check, serve, done, APP as DIST, HERE
root = tempfile.mkdtemp(prefix="ttobak-up-"); OLD = os.path.join(root, "old"); NEW = os.path.join(root, "site")
CFG = 'export const firebaseConfig={apiKey:"여기에-붙여넣기",projectId:""};'
shutil.copytree(DIST, NEW); open(os.path.join(NEW, "firebase-config.js"), "w").write(CFG)
shutil.copytree(NEW, OLD); shutil.rmtree(os.path.join(OLD, "app"))
for f in ["index.html", "sw.js"]: shutil.copy(os.path.join(HERE, "fixtures", "v2.9.0", f), os.path.join(OLD, f))
site = os.path.join(root, "serve"); shutil.copytree(OLD, site)
srv = serve(8812, cwd=site)
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_context(viewport={"width": 390, "height": 700}).new_page()
    pg.goto("http://localhost:8812/"); pg.wait_for_function("!!navigator.serviceWorker.controller", timeout=15000); pg.wait_for_timeout(300)
    check("ttobak-2.9.0" in pg.evaluate("caches.keys()"), "옛(2.9.0) 워커가 맡은 기기")
    # 서버에 2.9.1이 올라옴. 제자리에 덮고(돌고 있는 서버가 지운 폴더를 보지 않게) 수정 시각은 지금으로(옛 시각이면 서버가 sw.js를 304로 답해 새 워커를 못 받는다)
    shutil.copytree(NEW, site, dirs_exist_ok=True, copy_function=shutil.copy)
    pg.goto("http://localhost:8812/app/")
    pg.wait_for_function("document.querySelector('#main h1') && getComputedStyle(document.body).fontFamily.includes('Wanted')", timeout=20000)
    check(pg.inner_text("#main h1") == "설정이 필요해요" and pg.evaluate("location.pathname") == "/app/", "app/을 처음 열어도 새 워커로 바뀌어 제대로 열림")
    check("ttobak-2.9.0" not in pg.evaluate("caches.keys()"), "옛 묶음은 지움")
    b.close()
shutil.rmtree(root, ignore_errors=True)
done(errs)
