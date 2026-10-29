# 또박 2.5.0 검토 화면

모든 화면은 합성 데이터다. 실제 계정·개인정보를 담지 않았다. 원본 커밋 `066fce4`, 2026-10-29 정오 KST를 고정해 캡처했다.

- `390` = 390×844 폰 크기, `1280` = 1280×860 PC 크기.
- `light` / `dark` = OS 테마 모의 설정.
- `week` = 일주일 예시 70개 + 휴지통 1개, 카테고리 8색, 반복 3개, 고정 일정 3개. 고정 일정은 겹침 검사용으로 같은 시간에 배치했다.
- `empty` = 저장 항목 없음, 앱 기본 카테고리 3개. 이어서 첫 할 일을 만들고 알림·고정 일정·시간표까지 진행했다.
- 끝의 `day`, `all`, `week`, `menu`, `tpls`, `evs`, `trash`, `edit`, `later`는 캡처 시점의 화면이다.
- `empty-quick` → `edit-folded` → `edit-expanded` → `first-fixed` → `first-timetable`은 처음 쓰는 과업의 순서다.

[검토 문서](../UX-REVIEW-codex.md)에 대표 화면을 연결했다. 전체 68개 파일은 [manifest.json](manifest.json)에 있다. 메뉴를 여러 번 캡처해 실행 로그는 76회지만 중복 파일 이름은 한 장만 보관한다. 각 이미지는 전체 문서 길이가 아니라 지정한 viewport다. 시트가 길면 스크롤한 위치의 화면일 수 있다.

재생성:

```bash
python3 dev/build.py
python3 dev/tests/repro/capture_review.py
python3 dev/tests/repro/contrast.py > dev/ux-shots/contrast.json
```

Python Playwright와 Chromium이 필요하다. capture는 별도 로컬 서버를 열고 마지막에 닫는다. app.js를 memoryStore로 대체하고 서비스 워커는 차단한다. 실제 로그인·알림 권한은 모의 상태다. 이 이미지로 iOS Safari·푸시 전달·실제 폰 키보드·스크린리더 동작을 검증했다고 해석하지 않는다. 네이티브 날짜/시간 입력의 영문 형식도 이 Chromium 환경의 결과다.

`contrast.json`은 CSS 토큰을 sRGB로 계산한 결과다. 고정 일정 제목은 `style.css:548`의 `--cc 78% + --surface 22%`와 흰색을 비교했다. 보조 글자의 opacity, 안티앨리어싱, 완료 상태는 계산에 포함하지 않았다.
