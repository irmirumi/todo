# 2.5.0 검토용 재현

기준 `066fce4`. 앱 원본을 수정하지 않고 실제 함수를 추출하거나 app.js를 가짜 서비스와 연결한다. 계정·운영 데이터·비밀값은 필요 없다. 이 폴더는 `run_all.sh` 자동 테스트 대상이 아니다.

```bash
node dev/tests/repro/races.mjs
node dev/tests/repro/edge_cases.mjs
python3 dev/build.py
python3 dev/tests/repro/initial_auto.py
python3 dev/tests/repro/capture_review.py
python3 dev/tests/repro/contrast.py
```

Python 화면 스크립트에는 Playwright와 Chromium이 필요하다. 이 검토에서는 Node 24.19.0, Python 3.12.14, Playwright 1.62, 시스템 Chromium 154.0.8037.57을 사용했다. 환경 helper로 Playwright의 launch 경로를 시스템 Chromium에 연결했다. 일반 Playwright Chromium 설치 환경에서는 helper가 필요 없다.

| 파일 | 확인하는 것 | 결과의 한계 |
|---|---|---|
| races.mjs | 늦은 자동 생성이 편집/완료를 덮음, 복원 뒤 오래된 purge, 없는 날짜 파싱 | 실제 UI 함수+조건 없는 저장 순서 모델. Firestore 네트워크 재현 아님. |
| edge_cases.mjs | 변경하지 않은 메모도 patch, 백업 새 필드/날짜 이상값, 401번째 ovr 정리, push 실패 후 예약 삭제 | 실제 함수+명시적 stub. 실제 D1·SDK 사용 안 함. |
| initial_auto.py | app.js가 첫 server snapshot을 mode=loading일 때 전달하면 자동 추가 누락 | 기존 fake_firebase가 server-first를 발생시킴. 실제 SDK의 캐시/서버 순서는 미검증. |
| capture_review.py | 합성 일주일/빈 화면, 두 크기×두 테마, 첫 입력→알림→고정→시간표 | 로그인·권한 모의. 자동 이미지 비교 검사는 아님. |
| contrast.py | CSS 토큰/색 혼합의 대비 | 화면 전체 WCAG 감사·색각/실기기 검사는 아님. |

Node 재현과 initial_auto의 assertion은 **현재 문제 행동이 나타나는지** 확인한다. 향후 수정되면 assertion이 실패할 수 있다. 그대로 제품 회귀 검사로 편입하지 말고, 기대하는 정상 결과로 바꾸고 상태 계약을 갖춘 테스트로 옮긴다. 함수 추출은 현재 소스의 함수/주석 경계에 의존하므로 큰 구조 변경 뒤에는 갱신해야 한다.

2026-10-29 실행 결과: 두 Node 재현, initial_auto, capture(76회/중복 제외 68장), contrast 모두 완료. 기존 `bash dev/tests/run_all.sh`도 Node 3개 + Python 23개 전부 PASS(exit 0). 전체 테스트의 성공은 동시 기기 안전성·실제 Firebase 12.19.0·실 푸시·iOS PWA까지 보장하지 않는다.
