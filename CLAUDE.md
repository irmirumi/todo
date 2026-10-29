# 또박 — Claude 작업 메모

이 저장소는 개인 할 일 PWA "또박"이다. 원본은 `dev/`에 있고, `main`에 푸시하면 GitHub Actions가 `dev/`를 빌드·테스트해서 Pages에 올린다(2.5.0~).
**작업 전에 `dev/HANDOFF.md`를 끝까지 읽는다.** 사용자와 일하는 방식, 구조, 배포 절차, 실수하기 쉬운 것이 모두 거기 있다.

Claude가 PM·시니어 개발자·UX/UI 디자이너를 함께 맡는다(2.6.0 뒤 사용자 결정). 다른 AI와의 협업은 끝났다. 지난 검토 기록은 `dev/reviews/`.

꼭 지킬 것:
- 원본(`dev/src/`, `dev/assets/`)만 고친다. `python3 dev/build.py` → `bash dev/tests/run_all.sh`로 확인한 뒤 푸시한다.
- 배포할 때마다 `dev/VERSION`을 올리고 README 버전 기록(`dev/src/pwa/README.md`)을 쓴다. 푸시 뒤 Actions `deploy`가 성공했는지 확인한다(HANDOFF 4장).
- 루트에는 앱 파일을 두지 않는다(배포본은 빌드가 만든다).
- 비용 0원이 조건이다. 유료 플랜이나 카드 등록이 필요한 방식은 쓰지 않는다.
- 사용자와는 반말, 앱 문구는 해요체로 쓴다.
- 알림 서버(`dev/src/worker/worker.js`)를 바꾸면 사용자가 Cloudflare에 붙여넣어야 한다. 파일을 보내고 단계를 알려 준다.
