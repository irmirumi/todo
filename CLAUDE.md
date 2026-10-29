# 또박 — Claude 작업 메모

이 저장소는 개인 할 일 PWA "또박"이다. 원본은 `dev/`에 있고, `main`에 푸시하면 GitHub Actions가 `dev/`를 빌드·테스트해서 Pages에 올린다(2.5.0~).
**작업 전에 `dev/HANDOFF.md`를 끝까지 읽는다.** 사용자와 일하는 방식, 구조, 배포 절차, 실수하기 쉬운 것이 모두 거기 있다.

꼭 지킬 것:
- 원본(`dev/src/`, `dev/assets/`)만 고친다. `python3 dev/build.py` → `bash dev/tests/run_all.sh`로 확인한 뒤 푸시한다.
- 배포할 때마다 `dev/VERSION`을 올리고 README 버전 기록(`dev/src/pwa/README.md`)을 쓴다. 푸시 뒤 Actions `deploy`가 성공했는지 확인한다(HANDOFF 4장).
- Pages 설정이 아직 'GitHub Actions'로 바뀌지 않았다면(HANDOFF 4장 '전환') `dev/dist/app/`을 루트에도 복사해서 함께 푸시한다.
- 비용 0원이 조건이다. 유료 플랜이나 카드 등록이 필요한 방식은 쓰지 않는다.
- 사용자와는 반말, 앱 문구는 해요체로 쓴다.
- ChatGPT(Codex)도 이 저장소를 고친다. 규칙은 `AGENTS.md`. Codex는 `dev/` 아래만 고쳐 PR로 내고, 리뷰·테스트·합치기·버전 올리기는 Claude가 한다(HANDOFF 5.5).
