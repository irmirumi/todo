# 또박 — AI 에이전트 작업 메모 (Codex 등)

이 저장소는 개인 할 일 PWA "또박"의 배포본이다. `dev/`를 빌드한 결과가 GitHub Pages(https://irmirumi.github.io/todo/)로 나간다.
원본은 `dev/`에 있다. **작업 전에 `dev/HANDOFF.md`를 끝까지 읽는다.** 구조, 데이터 모양, 지금까지의 결정과 이유, 실수하기 쉬운 것이 모두 거기 있다.
(같은 저장소를 Claude도 고친다. Claude용 메모는 `CLAUDE.md`다.)

## 이 저장소에서 일하는 방식
- **`main`에 직접 올리지 않는다.** 새 브랜치에서 고치고 Pull Request로 낸다. Claude가 리뷰하고 합친다. `main`에 들어가면 GitHub Actions가 테스트를 돌리고 배포한다(`.github/workflows/deploy.yml`).
- **고치는 곳은 `dev/` 아래다.**
  - 원본: `dev/src/` — 순수 계산은 `model.js`, 화면은 `ui.js`, 모양은 `style.css`, 저장·알림은 `pwa/`
  - 테스트: `dev/tests/`(공용 도우미 `ttb.py`)
  - 문서: `dev/HANDOFF.md`
- **`dev/VERSION`과 README 버전 기록은 건드리지 않는다.** 합칠 때 Claude가 올린다. `ui.js`·`sw.js`의 `__VERSION__`은 빌드가 채우는 자리표시자다.
- 저장소 맨 위의 `index.html`, `ui.js` 같은 파일은 예전 배포본이다. 고치지 않는다.
- **비용 0원이 조건이다.** 유료 플랜이나 카드 등록이 필요한 서비스, 라이브러리, 방식은 쓰지 않는다.
- 앱 안 문구는 해요체로 짧게 쓴다. 용어는 HANDOFF 6장 '용어 통일'을 따른다.
- 디자인 규칙은 HANDOFF 6장에 있다. 둥근 상자의 한쪽에만 테두리를 넣지 않는다, 어설픈 페이드를 쓰지 않는다, 분홍 강조색은 '오늘'과 주요 버튼에만 쓴다.
- `dev/src/worker/worker.js`(알림 서버)는 자동 배포되지 않는다. 바꿨다면 PR 설명에 꼭 적는다.
- 데이터 모양(Firestore 문서 필드)을 바꿀 때는 예전 데이터도 읽히게 한다(HANDOFF 5.2).

## 확인
```bash
python3 dev/build.py              # dev/src → dev/dist/app
bash dev/tests/run_all.sh         # 빌드 + node 테스트 + Playwright 화면 테스트
```
- 준비물: Python `playwright`와 Chromium(`pip install playwright && python -m playwright install --with-deps chromium`), Node 22 이상, `cd dev/tests && npm install`
- 환경 때문에 테스트를 못 돌렸으면, PR 설명에 그렇다고 적는다. 리뷰할 때 Claude가 돌린다.
- 동작을 바꿨으면 `dev/tests/`에 확인하는 테스트를 더한다. `from ttb import check, serve, done` 후 `check(조건, "설명")` 모양(`test_v25.py` 참고). 출력만 하는 테스트는 만들지 않는다.

## PR 설명에 적을 것
- 무엇을 왜 바꿨는지(사용자 말로)
- 바뀐 화면 문구
- 돌린 테스트와 결과. 못 돌렸으면 못 돌렸다고
- 데이터 모양(Firestore 문서 필드)을 바꿨다면 그 내용과, 예전 데이터를 어떻게 읽는지
