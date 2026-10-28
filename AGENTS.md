# 또박 — AI 에이전트 작업 메모 (Codex 등)

이 저장소는 개인 할 일 PWA "또박"의 배포본이다. `main` 브랜치 루트가 그대로 GitHub Pages(https://irmirumi.github.io/todo/)로 나간다.
원본은 `dev/`에 있다. **작업 전에 `dev/HANDOFF.md`를 끝까지 읽는다.** 구조, 데이터 모양, 지금까지의 결정과 이유, 실수하기 쉬운 것이 모두 거기 있다.
(같은 저장소를 Claude도 고친다. Claude용 메모는 `CLAUDE.md`이고 내용은 같다.)

## 이 저장소에서 일하는 방식
- **`main`에 직접 올리지 않는다.** 새 브랜치에서 고치고 Pull Request로 낸다. 합치기와 배포는 Claude가 리뷰한 뒤에 한다.
- **고치는 곳은 `dev/` 아래뿐이다.**
  - 원본: `dev/src/`(화면은 `ui.js`, 모양은 `style.css`, 저장·알림은 `pwa/`)
  - 테스트: `dev/tests/`
  - 문서: `dev/HANDOFF.md`
- **루트의 배포본 파일(`index.html`, `ui.js`, `style.css`, `sw.js` 등)은 PR에서 건드리지 않는다.** 빌드한 결과를 루트로 복사하는 일, `VERSION`(ui.js)과 `CACHE`(sw.js) 올리기, README 버전 기록은 합칠 때 Claude가 한다.
- **루트의 `firebase-config.js`는 절대 바꾸지 않는다.** 사용자의 실제 Firebase 값이다. `dev/dist/app/`에 있는 같은 이름 파일은 자리표시자라서, 이걸로 덮어쓰면 앱이 멈춘다.
- **비용 0원이 조건이다.** 유료 플랜이나 카드 등록이 필요한 서비스, 라이브러리, 방식은 쓰지 않는다.
- 앱 안 문구는 해요체로 짧게 쓴다. 용어는 HANDOFF 6장 '용어 통일'을 따른다.
- 디자인 규칙은 HANDOFF 6장에 있다. 둥근 상자의 한쪽에만 테두리를 넣지 않는다, 어설픈 페이드를 쓰지 않는다, 분홍 강조색은 '오늘'과 주요 버튼에만 쓴다.
- `dev/src/worker/worker.js`(알림 서버)는 자동 배포되지 않는다. 바꿨다면 PR 설명에 꼭 적는다.

## 확인
```bash
python3 dev/build.py              # dev/src → dev/dist/app
bash dev/tests/run_all.sh         # 빌드 + node 테스트 + Playwright 화면 테스트
```
- 준비물: Python `playwright`와 Chromium(`pip install playwright && python -m playwright install --with-deps chromium`), Node, `cd dev/tests && npm install`
- 환경 때문에 테스트를 못 돌렸으면, PR 설명에 그렇다고 적는다. 리뷰할 때 Claude가 돌린다.
- 동작을 바꿨으면 `dev/tests/`에 assert로 확인하는 테스트를 더한다. `test_v24.py`처럼 `check(조건, "설명")` 모양을 쓴다.

## PR 설명에 적을 것
- 무엇을 왜 바꿨는지(사용자 말로)
- 바뀐 화면 문구
- 돌린 테스트와 결과. 못 돌렸으면 못 돌렸다고
- 데이터 모양(Firestore 문서 필드)을 바꿨다면 그 내용과, 예전 데이터를 어떻게 읽는지
