# 또박 유지보수 인수인계

또박의 유지보수(기능 추가, 수정, 최적화)를 새 대화에서 이어 가기 위한 문서다.
처음 한 번 끝까지 읽고 시작한다. 마지막 갱신: 2026-10-14, **1.3.0** 배포 직후.

---

## 1. 한눈에

- **무엇**: 한 사람(사용자 본인)이 폰과 PC에서 같이 쓰는 할 일·시간표 PWA.
- **주소**: https://irmirumi.github.io/todo/ (GitHub Pages, 저장소 `irmirumi/todo`의 `main` 브랜치 루트)
- **저장**: Firebase. 로그인은 이메일·비밀번호, 데이터는 Firestore(프로젝트 `my-todo-e4949`). 무료 요금제다.
- **알림**: Cloudflare Workers 무료 플랜 + D1.
  - Worker 주소: `https://ttobak-reminder.irmirumi.workers.dev`
  - D1 데이터베이스: 이름 `ttobak`, Worker 변수 이름 `DB`
  - 크론: `* * * * *`
- **비용**: 0원이 조건이다. 사용자가 "추가 지불 없는 게 확실할 때만" 진행하라고 했다.
  - Firebase Blaze처럼 카드 등록이 필요한 방식은 쓰지 않는다.
  - Cloudflare는 카드 없이 쓰고 있어서, 한도를 넘으면 요청이 거절될 뿐 요금이 나가지 않는다.

## 2. 사용자와 일하는 방식

- **말투**: 반말, 편한 동료처럼. 맞장구만 치지 말고 이견이 있으면 말한다.
- **질문**:
  - 사용자만 알 수 있는 것(목적, 상황, 이미 정한 조건)만, 시작 전에 한 번, 고르기 쉬운 선택지로 묻는다.
  - 구조, 표현, 기술처럼 맡긴 것은 묻지 말고 정한 뒤, 갈렸던 선택만 끝에 한 줄로 알린다.
  - "이렇게 할까?" 같은 사전 확인, "더 필요한 거 있어?" 같은 마무리는 하지 않는다.
  - 사용자 조건이 틀렸다고 보이면 질문하지 말고 이견으로 말한 뒤, 사용자 조건대로 진행한다.
- **위임**: 사용자는 "유연하게, 합리적 판단 하에 알아서", "셀프 피드백도 해"를 자주 쓴다. 맡기면 스스로 점검하고 고칠 것까지 고친다.
- **개발 지식**: 사용자는 개발을 잘 모르고 영어 화면을 어려워한다. 외부 서비스(Cloudflare, Firebase, GitHub) 화면에서 뭔가를 시킬 때는 이렇게 한다.
  - 누를 곳을 화면 글자 그대로(영어) 굵게 적고, 무슨 뜻인지 한국어로 설명한다.
  - 막히면 화면을 캡처해서 보내 달라고 한다.
- **보고**: 끝나면 무엇이 바뀌었는지, 폰에서 무엇을 하면 되는지(보통 "1~2분 뒤 앱을 두 번 닫았다 열기"), 테스트에서 확인한 것과 못 한 것을 짧게 알린다.
- **디자인 피드백 기록** (같은 지적이 반복되지 않게)
  - 둥근 사각형의 **한쪽 면에만 테두리나 선을 넣지 않는다.** 두 번 지적받았다. 오늘 날짜 박스와 시간표 블록이었다.
  - 세로 정렬이 따로 노는 것에 민감하다. 크기가 다른 글자를 한 줄에 둘 때는 baseline으로 맞춘다.
  - 폰에서 여백을 너무 줄이면 "구려 보인다"고 한다. 글자만 살짝 줄이고 간격은 확보한다.
  - 페이드아웃 같은 촌스러운 연출은 싫어한다. 모션은 짧고 가볍게 한다.

## 3. 저장소 구조

```
/ (배포본, GitHub Pages가 그대로 서빙)
  index.html style.css ui.js app.js push.js sw.js holidays.js
  firebase-config.js   ← 사용자 실제 값. 절대 덮어쓰지 말 것
  reminder-config.js   ← 알림 서버 주소
  manifest.webmanifest icons/ fonts/ vendor/ server/worker.js README.md
dev/
  src/        원본(여기만 고친다)
    ui.js         화면 전부(바닐라 JS, IIFE). store 어댑터를 받아서 동작
    style.css     전체 스타일(토큰, 컴포넌트, 1.x 추가분이 아래로 쌓여 있음)
    markup.html   body 뼈대
    pwa/app.js    Firebase 저장소 어댑터(ESM). Firebase SDK 10.12.2를 gstatic에서 동적 import
    pwa/push.js   웹 푸시 구독 + 앞으로 울릴 알림 목록 계산·서버 동기화
    pwa/sw.js     서비스 워커(캐시, push, notificationclick)
    pwa/README.md 사용자용 설치 가이드 + 버전 기록 → 배포 시 루트 README.md
    pwa/firebase-config.js  자리표시자(빌드 결과에 이게 들어감)
    worker/worker.js        Cloudflare Worker 원본 → 빌드가 server/worker.js로 복사
  build.py    dev/dist/app 생성
  tests/      테스트(아래 7장)
```

## 4. 빌드와 배포 절차 (매번 이 순서)

1. `dev/src/`의 원본만 고친다.
2. 버전을 올린다. 두 군데를 같이 바꾼다.
   - `dev/src/ui.js`의 `const VERSION="x.y.z"` (⋯ 메뉴 맨 아래에 표시)
   - `dev/src/pwa/sw.js`의 `const CACHE = "ttobak-x.y.z"`
   - 캐시 이름이 바뀌어야 폰이 새 파일을 받는다.
3. `dev/src/pwa/README.md` 맨 위에 버전 기록을 한 줄 넣는다.
4. `python3 dev/build.py`를 돌리면 `dev/dist/app`이 생긴다.
   - 글꼴, morphdom, 공휴일 원본이 없으면 저장소 루트의 배포본에서 가져온다(새 세션에서는 이 경로가 쓰인다).
   - 아이콘은 PIL로 매번 다시 그린다.
5. 테스트를 돌린다: `dev/tests/run_all.sh`
6. `dev/dist/app/` 내용을 저장소 루트에 덮어쓴다. **`firebase-config.js`만은 빼야 한다**:
   ```bash
   cp firebase-config.js /tmp/fbc.js && cp -r dev/dist/app/. ./ && cp /tmp/fbc.js firebase-config.js
   grep -c my-todo-e4949 firebase-config.js   # 3이면 정상
   ```
7. 커밋하고 `main`에 푸시한다. GitHub Pages가 1~2분 안에 반영된다.
   - 커밋 메시지는 한국어, "또박 x.y.z: 요약" 형식.
8. 사용자에게 "1~2분 뒤 앱을 완전히 닫았다 두 번 열기"를 안내한다. 서비스 워커가 교체되는 데 한 번 더 열어야 한다.

**알림 서버(`worker.js`)를 바꿨을 때만**: 사용자가 Cloudflare 대시보드의 Worker → **Edit code**에 파일 전체를 붙여넣고 **Deploy**해야 한다. 자동 배포는 없다. 파일을 보내고 그 절차를 안내한다.

**환경 제약** (이전 세션 기준):
- `gh api`의 Pages 상태 조회, git 태그 푸시, GitHub 릴리스 생성은 프록시나 권한에 막혔다. 버전 태그는 사용자가 원할 때 웹에서 직접 만들게 한다.
- 일반 `git push`는 된다.

## 5. 아키텍처와 데이터

### 5.1 저장소 어댑터
`TodoApp.boot(store)` 하나로 화면이 뜬다. store 인터페이스는 `ui.js` 맨 위 주석에 있다.
- 메서드: `start(cb)`, `set(id,body)`, `update(id,patch)`, `remove(id)`, `saveCats(cats)`, `importAll(data)`, `signIn`, `signOut`, `email`, `push`
- `cb.onData`가 받는 것: `{tasks, cats, tpls, events}`. `tasks`, `tpls`, `events`는 Map이다.
- 테스트는 `TodoApp.memoryStore()`를 쓴다. 문서 id 접두어로 Map을 나눈다.

### 5.2 Firestore 경로
`users/{uid}/items/{docId}`, 보안 규칙은 본인만 읽고 쓰기(`firestore.rules`). 문서 종류는 id 접두어로 구분한다.

| 접두어 | 의미 | 주요 필드 |
|---|---|---|
| `t_` | 할 일 | `title, note, date(YYYY-MM-DD|null), time(HH:MM|null), end, remind(분|null), cat, sub, done, doneAt, skipped, skippedAt, createdAt, subtasks[{id,t,done}], tpl` |
| `r_` | 반복 할 일(매주 템플릿) | `title, note, time, end, remind, cat, sub, days[0-6], until, archived, subtasks[{id,t}], createdAt` |
| `e_` | 고정 일정(수업 등) | `title, place, color(c1~c8), days, time, end, from, until, holOff, remind, note, skips[날짜], archived, createdAt` |
| `meta` | 카테고리 | `cats: [{id, name, color, subs:[{id,name}], archived?}]` (배열 순서 = 화면 순서) |

- **Firestore는 `undefined` 필드를 거부한다.** 쓰는 객체에는 반드시 `null`이나 실제 값을 넣는다.
- 가져오기(import)는 `clean()`, `cleanTpl()`, events 정리 코드에서 id 패턴과 값을 검증한다. 세부 할 일 id 검증은 XSS를 막으려고 넣은 것이다.

### 5.3 화면 구조 (`ui.js`)
- **탭 3개**
  - **캘린더** (`view="day"`): 달력, 그날 고정 일정 줄, 카테고리별 카드. 반복 할 일은 흐린 줄로 보이고 ＋로 추가한다.
  - **시간표** (`view="week"`): 월요일 시작 주간. 고정 일정은 진한 칸, 할 일은 연한 칸, 반복 할 일은 빗금. 위에 종일(시간 없는 할 일) 줄이 있고, 빈칸을 누르면 할 일이나 고정 일정을 추가한다. 좁은 화면에서 겹치는 것들은 "n개" 묶음이 되고, 누르면 목록이 뜬다.
  - **전체** (`view="all"`): 지난 할 일은 접힌 한 줄이고 펼치면 '안 함'으로 정리할 수 있다. 나머지는 날짜별 카드, 그 뒤에 날짜 없음, 맨 아래 완료·안 함.
- **정렬**
  - 캘린더 카드 안: 소분류 순서 → 시간 있는 것(빠른 순) → 시간 없는 것(가나다). `inCatOrder`
  - 전체 탭 하루 안: 시간 → 카테고리 순서 → 소분류 순서 → 가나다. `allOrder`
- **시트** (`<dialog>` 하나를 돌려 씀): `S.sheet` 값은 아래와 같다.
  - 편집 계열: `edit`, `tpl`, `ev`. 닫힐 때 commit한다. `close` 이벤트에서 `commitEdit`, `commitTpl`, `commitEv`
  - 그 밖: `info`, `group`, `slot`, `cats`, `menu`, `tpls`, `evs`, `notify`, `export`, `import`
- **렌더링**: morphdom으로 바뀐 부분만 고친다. 입력 중인 칸과 포커스는 건드리지 않는다. 일시적인 애니메이션 클래스는 `TRANSIENT` 목록으로 유지한다.
- **이벤트**: `document` 클릭 위임 하나에서 `data-act` 값으로 `switch`한다. 로딩 중에는 쓰기 동작을 막는다(`S.mode==="loading"` 정규식).

### 5.4 알림 흐름
1. 앱 `push.js`가 앞으로 62일 안에 울릴 알림을 계산해서(최대 300개) Worker `/sync`로 통째로 보낸다. 해시가 같으면 보내지 않는다.
   - 대상: 할 일, 고정 일정(요일·기간·공휴일·쉼 반영)
   - 빼는 것: 완료, 안 함, 보관된 카테고리, 이미 지난 알림
2. 서버에서 받은 스냅샷일 때만 보낸다(`fromCache` 제외). 화면이 가려지는 순간에는 `keepalive`로 바로 보낸다.
3. Worker가 매분 크론으로 20초 안에 울릴 알림을 찾아 Web Push로 보낸다. 실행당 최대 4개, 1시간 넘게 밀린 건 버린다.
4. Worker 보안
   - Firebase ID 토큰(RS256)을 검증한다.
   - 처음 쓴 계정 하나만 받는다(D1 `kv.owner`). 바꾸려면 D1 콘솔에서 `DELETE FROM kv WHERE k='owner'`
   - 푸시 서비스 호스트만 허용한다.
   - `/sync`는 쿼리 2개(`json_each`)로 처리한다. D1 무료 한도가 실행당 50쿼리라서다.
5. iOS는 16.4 이상, 홈 화면에 추가한 앱에서만 알림을 받는다.

## 6. 디자인 규칙

- **글꼴**: Wanted Sans Variable(분할 woff2를 직접 호스팅). 없으면 Pretendard, 그다음 시스템 글꼴.
- **색**
  - 무채색 바탕이 기본이다(따뜻한 회색 계열, 채도 낮게).
  - 핑크 `--accent #D9467C`는 **'오늘' 표시와 주요 버튼에만** 쓴다.
  - 진행률과 선택 상태는 `--ink-2`(진한 회색)로 칠한다.
  - 카테고리 색 `c1~c8`은 체크박스, 태그, 형광펜, 시간표 칸에만 쓴다.
  - 다크 모드 토큰이 따로 있다.
- **문구**: 앱 안에서는 해요체로, 짧게 쓴다(예: "안 함으로 정리했어요"). 사용자와 대화할 때는 반말이다.
- **폰 기준**
  - 560px 이하에서는 글자 14.5px, 여백 넉넉히.
  - 누르는 영역은 40px 이상(`::after`로 넓힘).
  - 입력칸은 16px 이상(iOS 확대 방지).
- **용어 통일**
  - 반복 할 일 = `r_`, 매주 꺼내 쓰는 할 일
  - 고정 일정 = `e_`, 수업처럼 매주 같은 시간에 있는 일정
  - 안 함 = 건너뛴 할 일

## 7. 테스트

`dev/tests/run_all.sh`가 빌드한 뒤 아래를 순서대로 돌린다. 마지막 확인 때 전부 통과했다.

- **준비물**
  - Python Playwright: 헤드리스 Chromium. 이전 환경에서는 `/opt/pw-browsers`에 미리 깔려 있었다.
  - `dev/tests`에서 `npm install`(`http_ece`)
- **`worker.test.mjs`**: Worker 단위 테스트 23개. `node:sqlite`로 D1을 흉내 내고, 푸시 암호문을 실제로 복호화해서 검증한다.
- **`push_events.test.mjs`**: 고정 일정 알림 계산(공휴일·쉼·기간·보관).
- **`test_*.py`**: 화면 테스트. 메모리 저장소를 주입하고, 폰(390px)과 PC(1280px) 크기에서 흐름을 확인한다. 스크린샷은 `dev/tests/out/`에 쌓이니까 **바뀐 화면은 직접 열어서 눈으로 확인한다.** 레이아웃 버그 대부분이 이 과정에서 잡혔다.
- **날짜 의존**: 테스트 데이터는 대부분 "오늘" 기준이라 실행하는 요일에 따라 결과가 달라질 수 있다. 실패하면 앱 버그인지 테스트 가정이 깨진 건지부터 본다.

## 8. 실수하기 쉬운 것들 (실제로 겪음)

- **CSS 클래스 이름 충돌**
  - 전역 `.more`(헤더 ⋯ 버튼)와 `.now`(라벨)가 새 요소에 그대로 적용된 적이 있다. 새 클래스는 구체적인 이름으로 짓는다.
- **목록이 바뀔 때 포커스 유지**
  - `.tasks` ul과 입력 줄 `.addrow`는 반드시 형제로 둔다. 입력 줄이 목록 안에 있으면 목록이 바뀔 때 포커스가 빠진다.
- **한글 IME**
  - 조합 중의 엔터는 `compositionend`를 기다렸다가 처리한다(`pendingEnter`). 안 하면 안드로이드에서 추가가 안 되거나 두 번 된다.
- **시트 닫힘 판정**
  - 바깥을 누르고 뗀 경우에만 닫는다(pointerdown과 click 모두 바깥). 안 그러면 PC에서 시트 안을 드래그하다 밖에서 놓았을 때 닫힌다.
- **시트 위 토스트**
  - 모달 dialog 위에서는 토스트를 dialog 안으로 옮기고 popover로 띄운다. 안 그러면 가려지고 눌리지 않는다. 시트가 열려 있으면 위쪽에 표시한다.
- **큰 문자열 치환**
  - 파이썬으로 구간을 잘라 바꾸다가 다른 섹션(시트 공통 코드)까지 지운 적이 있다. 구간 치환 후에는 `grep`으로 주요 함수가 남았는지 확인한다.
- **배포 덮어쓰기**
  - `firebase-config.js`를 덮어쓰면 앱이 "설정이 필요해요" 화면으로 바뀐다(4장 6번).
- **공휴일 데이터**
  - 2024~2027년만 있다. 출처는 `@hyunbinseo/holidays-kr`(MIT, 관보 기준).
  - 2028년 데이터가 나오면 `holidays.js`를 갱신한다. 빌드 스크립트는 패키지의 `dist/20*.js`를 읽는 구조라, 원본이 없으면 배포본의 `holidays.js`를 쓴다.

## 9. 상태와 남은 일

- **확인 안 된 것**
  - 실제 폰에서 알림이 도착했는지 사용자 확인을 받지 못했다(테스트 알림 결과 보고 없음).
  - Firebase 콘솔에서 "가입(생성) 허용"을 껐는지도 확인받지 못했다.
- **알려진 한계**
  - 시간표 묶음은 칸이 좁을 때(주로 폰)만 묶는다. PC에서는 나란히 보여 준다(사용자 동의함).
  - 고정 일정은 매주 반복만 된다. 한 번만 있는 일정은 시간 있는 할 일로 처리한다.
- **사용자에게 제안했지만 아직 답 없는 아이디어**
  - 할 일 기한(마감일, D-3 표시)
  - 매일 아침 "오늘 할 일 n개" 요약 알림(현재 알림 서버로 추가 비용 없이 가능)

## 10. 버전 기록 요약

- **1.0.0**: 정식 버전 1.
  - 기능: 카테고리·소분류, 시간, 정렬, 공휴일, 반복 할 일, 알림, 오프라인
  - 보안 점검: 알림 서버 주인 고정, 가져오기 검증
- **1.1.0**: 시간표 탭, 전체 탭 날짜별 정렬, 끝나는 시간, 소분류 순서, 반복 할 일 끝나는 날·보관
- **1.2.0**: 탭 이름 '캘린더·시간표·전체', 지난 할 일 접기와 '안 함', 시간표 정보 시트·종일 줄, 폰 여백 복원
- **1.2.1**: 시간표 겹침 묶음
- **1.3.0**: 고정 일정(수업), 시간표 빈칸으로 추가, '반복 일정' 이름을 '반복 할 일'로 변경
