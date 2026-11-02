"""src/ 에서 웹앱(PWA) 폴더 dist/app 을 만든다.
글꼴·morphdom·공휴일은 dev/assets/ 에 있는 것을 쓴다(원본 패키지가 있으면 그걸로 새로 만든다).
버전은 dev/VERSION 한 곳에만 쓰고, 빌드가 ui.js(VERSION)·sw.js(CACHE)·README 첫 줄에 넣는다.
배포는 GitHub Actions(.github/workflows/deploy.yml)가 main에 올라온 dev/를 빌드·테스트해서 Pages에 올린다."""
import os, shutil, glob, re
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
DIST = os.path.join(ROOT, "dist")
APP = os.path.join(DIST, "app")
VENDOR = "/tmp/claude-0/-home-claude/62be5dd6-b52f-515d-a539-b187e27b180a/scratchpad/ws"
DEPLOYED = os.path.join(ROOT, "assets")  # 글꼴·morphdom·공휴일 저장본
VERSION = open(os.path.join(ROOT, "VERSION"), encoding="utf-8").read().strip()
assert re.fullmatch(r"\d+\.\d+\.\d+", VERSION), "dev/VERSION 은 1.2.3 꼴"
rd = lambda p: open(os.path.join(SRC, p), encoding="utf-8").read()

PINK = (217, 70, 124, 255)       # --accent (light)
BG = "#F4F4F2"
BG_DARK = "#121212"

shutil.rmtree(DIST, ignore_errors=True)
os.makedirs(os.path.join(APP, "icons"))
os.makedirs(os.path.join(APP, "vendor"))

style, markup, ui = rd("style.css"), rd("markup.html"), rd("ui.js")
RESET = (":root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}\n"
         "body{margin:0}img{max-width:100%}[hidden]{display:none!important}\n")
open(os.path.join(APP, "style.css"), "w", encoding="utf-8").write(RESET + style)
assert '"__VERSION__"' in ui, "ui.js 의 VERSION 자리표시자가 없다"
open(os.path.join(APP, "ui.js"), "w", encoding="utf-8").write(ui.replace('"__VERSION__"', '"' + VERSION + '"'))
shutil.copy(os.path.join(SRC, "model.js"), os.path.join(APP, "model.js"))
def page(title, pre="", app=None, manifest="manifest.webmanifest", icon="icon-192.png", touch="apple-touch-icon.png", hol=True, vp=""):
    """앱 입구 HTML. 공용 파일은 앱 폴더에 두고 입구만 한 단계 아래 폴더에서 연다(2.9.1): 또박은 app/, 메모 앱은 memo/(pre="../").
    폰은 설치 범위(scope)가 겹치면 두 앱을 따로 설치하지 못해서 입구를 나란한 폴더로 나눴다"""
    return ('<!doctype html>\n<html lang="ko"' + (f' data-app="{app}"' if app else '') + '>\n<head>\n<meta charset="utf-8">\n'
        f'<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover{vp}">\n'
        f'<title>{title}</title>\n'
        f'<meta name="theme-color" media="(prefers-color-scheme: light)" content="{BG}">\n'
        f'<meta name="theme-color" media="(prefers-color-scheme: dark)" content="{BG_DARK}">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n'
        '<meta name="mobile-web-app-capable" content="yes">\n'
        f'<meta name="apple-mobile-web-app-title" content="{title}">\n'
        '<meta name="apple-mobile-web-app-status-bar-style" content="default">\n'
        f'<link rel="manifest" href="{manifest}">\n'
        f'<link rel="icon" type="image/png" sizes="192x192" href="{pre}icons/{icon}">\n'
        f'<link rel="apple-touch-icon" href="{pre}icons/{touch}">\n'
        f'<link rel="stylesheet" href="{pre}fonts/WantedSansVariable.css">\n'
        f'<link rel="stylesheet" href="{pre}style.css">\n</head>\n<body>\n' + markup +
        f'<script src="{pre}vendor/morphdom.min.js"></script>\n' + (f'<script src="{pre}holidays.js"></script>\n' if hol else '') +
        f'<script src="{pre}model.js"></script>\n<script src="{pre}ui.js"></script>\n'
        f'<script type="module" src="{pre}app.js"></script>\n</body>\n</html>\n')
# 앱 폴더 맨 위(예전 주소)는 또박으로 넘겨주기만: 홈 화면의 옛 또박·알림·북마크가 그대로 열리게(#d= 같은 뒤 주소도 넘김)
open(os.path.join(APP, "index.html"), "w", encoding="utf-8").write(
    '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<title>또박</title>\n'
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
    '<link rel="manifest" href="manifest.webmanifest">\n'
    '<script>location.replace("app/"+location.search+location.hash)</script>\n</head>\n'
    '<body><p><a href="app/">또박 열기</a></p></body>\n</html>\n')
os.makedirs(os.path.join(APP, "app")); os.makedirs(os.path.join(APP, "memo"))
open(os.path.join(APP, "app", "index.html"), "w", encoding="utf-8").write(page("또박", "../", manifest="../manifest.webmanifest"))
open(os.path.join(APP, "memo", "index.html"), "w", encoding="utf-8").write(page("또박 메모", "../", "memo", icon="memo-192.png", touch="memo-apple-touch-icon.png", hol=False, vp=",interactive-widget=resizes-content"))  # 폰 키보드가 올라오면 화면이 줄어 꾸미기 막대가 키보드 위에(2.10.0)
shutil.copy(os.path.join(SRC, "pwa", "memo.webmanifest"), os.path.join(APP, "memo", "manifest.webmanifest"))
# 2.9.0 서비스 워커가 남은 기기에서 app/을 처음 열 때 빠져나오는 길(rescue.js 맨 위 설명)
shutil.copy(os.path.join(SRC, "pwa", "rescue.js"), os.path.join(APP, "app", "app.js"))
for name in ["app.js", "push.js", "archive.js", "reminder-config.js", "firebase-config.js", "manifest.webmanifest", "firestore.rules"]:
    shutil.copy(os.path.join(SRC, "pwa", name), os.path.join(APP, name))
# 버전이 들어가는 파일
sw = rd("pwa/sw.js"); assert '"ttobak-__VERSION__"' in sw
import re as _re
_fa = _re.search(r'const V = "([\d.]+)"', rd("pwa/app.js")); _fs = _re.search(r'const FB = "([\d.]+)"', sw)
assert _fa and _fs and _fa.group(1) == _fs.group(1), "app.js V와 sw.js FB(Firebase 버전)가 달라요"
open(os.path.join(APP, "sw.js"), "w", encoding="utf-8").write(sw.replace("__VERSION__", VERSION))
readme = rd("pwa/README.md"); readme = re.sub(r"^# 또박 .*$", "# 또박 " + VERSION, readme, count=1, flags=re.M)
open(os.path.join(APP, "README.md"), "w", encoding="utf-8").write(readme)
print("version", VERSION)
open(os.path.join(APP, ".nojekyll"), "w").close()
os.makedirs(os.path.join(APP, "server"), exist_ok=True)
shutil.copy(os.path.join(SRC, "worker", "worker.js"), os.path.join(APP, "server", "worker.js"))

# 서드파티: morphdom(MIT), Wanted Sans 가변 글꼴(OFL, 필요한 글자 조각만 내려받는 분할본)
if os.path.isdir(VENDOR):
    shutil.copy(os.path.join(VENDOR, "md/package/dist/morphdom-umd.min.js"), os.path.join(APP, "vendor/morphdom.min.js"))
    shutil.copy(os.path.join(VENDOR, "md/package/LICENSE"), os.path.join(APP, "vendor/morphdom-LICENSE.txt"))
    shutil.copytree(os.path.join(VENDOR, "package/fonts/webfonts/variable/split"), os.path.join(APP, "fonts"))
else:
    for f in ["morphdom.min.js", "morphdom-LICENSE.txt"]:
        shutil.copy(os.path.join(DEPLOYED, "vendor", f), os.path.join(APP, "vendor", f))
    shutil.copytree(os.path.join(DEPLOYED, "fonts"), os.path.join(APP, "fonts"))
# 글꼴 CSS: 라이선스 주석은 두고 나머지 공백·주석만 줄인다
fcss = os.path.join(APP, "fonts", "WantedSansVariable.css")
css = open(fcss, encoding="utf-8").read()
if "\n@font-face {" in css or "\n    " in css:
    head, body = css.split("*/", 1)
    body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
    body = re.sub(r"\s*([{};:,])\s*", r"\1", body)
    body = re.sub(r"\s+", " ", body).replace(";}", "}")
    open(fcss, "w", encoding="utf-8").write(head + "*/\n" + body.strip() + "\n")

# 아이콘: 또박 — 핑크 바탕에 흰 체크 두 개. 앞은 반투명, 뒤는 진하게: 또박, 또박.
CK1 = [(6.5, 16.8), (10.9, 21.2), (17.4, 12.6)]
CK2 = [(14.2, 16.8), (18.6, 21.2), (25.4, 11.2)]

def stroke(d, pts, w, fill, s, ox, oy):
    P = [(ox + x * s, oy + y * s) for x, y in pts]
    d.line(P, fill=fill, width=int(w * s), joint="curve")
    r = w * s / 2
    for x, y in (P[0], P[-1]):
        d.ellipse([x - r, y - r, x + r, y + r], fill=fill)

def icon(size, path, mark_ratio=1.0, rounded=True, transparent_corners=True):
    S = size * 4
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0) if transparent_corners else PINK)
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 9 / 32), fill=PINK)
    else:
        d.rectangle([0, 0, S, S], fill=PINK)
    s = S / 32 * mark_ratio
    # 마크의 시각적 중심(체크 묶음의 가운데)을 정중앙에 맞춘다
    cx, cy = 16.0, 16.4
    ox, oy = S / 2 - cx * s, S / 2 - cy * s
    white = (255, 255, 255, 255)
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    stroke(ImageDraw.Draw(layer), CK1, 3.1, white, s, ox, oy)
    layer.putalpha(layer.getchannel("A").point(lambda a: a * 150 // 255))
    im.alpha_composite(layer)
    stroke(d, CK2, 3.1, white, s, ox, oy)
    im.resize((size, size), Image.LANCZOS).save(path)

I = os.path.join(APP, "icons")
icon(192, os.path.join(I, "icon-192.png"))
icon(512, os.path.join(I, "icon-512.png"))
# 안드로이드 원형/물방울 마스크용: 꽉 찬 바탕, 마크는 안전 영역(가운데 80%) 안에
icon(512, os.path.join(I, "icon-maskable-512.png"), mark_ratio=0.78, rounded=False, transparent_corners=False)
icon(192, os.path.join(I, "icon-maskable-192.png"), mark_ratio=0.78, rounded=False, transparent_corners=False)
# iOS는 모서리를 알아서 둥글게 깎으므로 꽉 찬 사각형
icon(180, os.path.join(I, "apple-touch-icon.png"), mark_ratio=0.92, rounded=False, transparent_corners=False)
# 메모 앱 아이콘(2.9.0, 2.9.1에 청록): 청록 바탕에 흰 메모지(오른쪽 아래 접힘)와 글줄 두 개. ui.js의 memoMarkSvg와 같은 모양
TEAL = (23, 145, 127, 255)  # manifest background_color #17917F
def memo_icon(size, path, mark_ratio=1.0, rounded=True, transparent_corners=True):
    S = size * 4
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0) if transparent_corners else TEAL)
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 9 / 32), fill=TEAL)
    else:
        d.rectangle([0, 0, S, S], fill=TEAL)
    s = S / 32 * mark_ratio * 1.08; o = S / 2 - 16 * s  # 꽉 찬 모양이라 체크보다 작아 보여서 조금 크게
    P = lambda x, y: (o + x * s, o + y * s)
    white = (255, 255, 255, 255)
    # 메모지: 둥근 사각형에서 오른쪽 아래 모서리를 자른 모양
    d.rounded_rectangle([*P(8.5, 8.5), *P(23.5, 24)], radius=1.5 * s, fill=white)
    d.polygon([P(23.6, 18.6), P(23.6, 24.1), P(18.1, 24.1)], fill=TEAL)
    # 접힌 귀퉁이(연한 핑크)
    fold = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(fold).polygon([P(23.5, 18.6), P(18.1, 18.6), P(18.1, 24)], fill=TEAL[:3] + (115,))
    im.alpha_composite(fold)
    # 글줄
    for (x0, y, x1) in [(12.2, 13.2, 19.8), (12.2, 17.0, 16.8)]:
        d.line([P(x0, y), P(x1, y)], fill=TEAL, width=int(2 * s))
        r = s
        for x in (x0, x1):
            cx, cy = P(x, y); d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=TEAL)
    im.resize((size, size), Image.LANCZOS).save(path)

memo_icon(192, os.path.join(I, "memo-192.png"))
memo_icon(512, os.path.join(I, "memo-512.png"))
memo_icon(512, os.path.join(I, "memo-maskable-512.png"), mark_ratio=0.78, rounded=False, transparent_corners=False)
memo_icon(192, os.path.join(I, "memo-maskable-192.png"), mark_ratio=0.78, rounded=False, transparent_corners=False)
memo_icon(180, os.path.join(I, "memo-apple-touch-icon.png"), mark_ratio=0.92, rounded=False, transparent_corners=False)
# 안드로이드 상태 표시줄용 알림 배지: 투명 바탕에 흰 체크 두 개(단색)
def badge(size, path):
    S2 = size * 4; im = Image.new("RGBA", (S2, S2), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    s = S2 / 32 * 1.15; ox, oy = S2 / 2 - 16.0 * s, S2 / 2 - 16.4 * s
    stroke(d, CK1, 3.4, (255, 255, 255, 255), s, ox, oy); stroke(d, CK2, 3.4, (255, 255, 255, 255), s, ox, oy)
    im.resize((size, size), Image.LANCZOS).save(path)
badge(96, os.path.join(I, "badge-96.png"))
# 공휴일: @hyunbinseo/holidays-kr(MIT, 관보 기준) 데이터를 전역 객체로
import json
HOLSRC = "/tmp/claude-0/-home-claude-todo/62be5dd6-b52f-515d-a539-b187e27b180a/scratchpad/hol/package/dist"
if os.path.isdir(HOLSRC):
    hol = {}
    for f in sorted(glob.glob(os.path.join(HOLSRC, "20*.js"))):
        for k, v in re.findall(r'"(\d{4}-\d{2}-\d{2})":\s*\[(.*?)\]', open(f, encoding="utf-8").read()):
            if k >= "2024":
                hol[k] = re.findall(r'"(.*?)"', v)
    open(os.path.join(APP, "holidays.js"), "w", encoding="utf-8").write(
        "/* 한국 공휴일 — @hyunbinseo/holidays-kr (MIT) */\nwindow.TTOBAK_HOLIDAYS=" + json.dumps(hol, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("holidays:", min(hol), "~", max(hol), len(hol))
else:
    shutil.copy(os.path.join(DEPLOYED, "holidays.js"), os.path.join(APP, "holidays.js"))
print("built", APP)
