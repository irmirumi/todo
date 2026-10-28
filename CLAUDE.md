# 또박 — Claude 작업 메모

이 저장소는 개인 할 일 PWA "또박"의 배포본이다. 원본은 `dev/`에 있다.
**작업 전에 `dev/HANDOFF.md`를 끝까지 읽는다.** 사용자와 일하는 방식, 구조, 배포 절차, 실수하기 쉬운 것이 모두 거기 있다.

꼭 지킬 것:
- 원본(`dev/src/`)만 고치고 `python3 dev/build.py` → `dev/tests/run_all.sh` → `dev/dist/app/`를 루트에 복사한다.
- 복사할 때 루트의 `firebase-config.js`는 절대 덮어쓰지 않는다. 사용자의 실제 Firebase 값이다.
- 배포할 때마다 `VERSION`(ui.js)과 `CACHE`(sw.js)를 같이 올리고 README 버전 기록을 쓴다.
- 비용 0원이 조건이다. 유료 플랜이나 카드 등록이 필요한 방식은 쓰지 않는다.
- 사용자와는 반말, 앱 문구는 해요체로 쓴다.
- ChatGPT(Codex)도 이 저장소를 고친다. 규칙은 `AGENTS.md`. Codex는 `dev/` 아래만 고쳐 PR로 내고, 리뷰·테스트·합치기·루트 복사·버전 올리기는 Claude가 한다(HANDOFF '다른 AI와 함께 일하기').
