# TestFlight Real Device QA

## 목적
이 문서는 iPhone TestFlight 빌드를 실제 기기에서 검증할 때 쓰는 실전 순서야.

목표는 세 가지다.
- 앱이 실행 직후 막히지 않는지 확인
- 로그인 이후 핵심 화면이 실제 preview 백엔드와 정상 연결되는지 확인
- 기록 가져오기, 친구/리그, 마켓/레이스처럼 출시 직전 리스크가 큰 흐름을 짧은 시간 안에 확인

기기 연동 조합까지 같이 볼 때는 아래 문서를 같이 열어두는 편이 좋다.
- [device-integration-qa-matrix.md](/docs/device-integration-qa-matrix.md)
- [match-real-device-qa.md](/docs/match-real-device-qa.md)

## 시작 전 준비
### 데스크탑 preview 상태 먼저 확인
Windows 데스크탑에서 아래 명령이 가장 강한 사전 점검이야.

```powershell
scripts\windows\status-preview-public-backend.cmd -RunPublicSmoke -RequireHealthy -RequireSmokeHealthy
```

이 명령이 통과하면 최소한 아래가 동시에 맞는 상태라고 보면 된다.
- preview backend process alive
- public HTTPS API alive
- admin status alive
- preview PostgreSQL ready
- public smoke account login and read flow alive

### 맥북에서 quick check
맥북에서는 아래 명령으로 같은 preview 주소를 빠르게 확인할 수 있어.

```bash
npm run preview:smoke
```

빌드 직전에는 아래 게이트 명령으로 env와 smoke를 한 번에 보는 편이 더 안전하다.

```bash
npm run release:gate:testflight -- --admin-token PREVIEW_ADMIN_TOKEN
```

관리자 상태까지 같이 보고 싶으면:

```bash
npm run preview:smoke -- --admin-token PREVIEW_ADMIN_TOKEN
```

### TestFlight 빌드가 오래된 것 같을 때
앱에서 `Network request failed` 가 뜨는데 preview smoke는 통과한다면 보통 아래 둘 중 하나다.
- TestFlight 빌드가 예전 preview 주소를 바라보고 있음
- EAS preview 환경값은 바뀌었지만 새 TestFlight 빌드가 아직 설치되지 않음

이 경우 순서는 아래가 안전하다.
1. `npm run preview:sync-eas-env`
2. `npm run build:ios:testflight`
3. `npm run submit:ios:testflight`
4. TestFlight 새 빌드 설치 후 다시 아래 QA를 시작

## 추천 QA 계정 구성
실기기 QA는 계정 두 종류로 나누면 편하다.

### 1. 신규 가입 계정
- 회원가입
- 첫 홈 진입
- 친구 없음 상태
- 연동 전 기본 화면

### 2. 기존 사용 계정
- 재로그인
- 기록 존재 상태
- 친구/리그 데이터 확인
- 연동 소스, 내 활동, 홈 요약 확인

가능하면 실기기 QA용 신규 계정은 smoke 계정과 분리하는 편이 좋다.
이유는 smoke 계정은 운영 점검용으로 계속 재사용되기 때문이다.

## 1차 게이트: 앱 열기와 로그인
### A. 앱 실행
확인할 것:
- 앱이 즉시 죽지 않는다.
- 흰 화면이나 무한 로딩에 갇히지 않는다.
- 로그인 또는 회원가입 진입이 자연스럽다.

실패하면 먼저 볼 곳:
- 데스크탑: `status-preview-public-backend.cmd -RunPublicSmoke -RequireHealthy -RequireSmokeHealthy`
- 맥북: `npm run preview:smoke`

### B. 신규 회원가입
순서:
1. 회원가입 화면 진입
2. 아이디 입력
3. 닉네임/이름/지역/대학 입력
4. 회원가입 완료
5. 홈 진입 확인

통과 기준:
- 아이디 중복 오류가 자연스럽게 보인다.
- 회원가입 직후 홈으로 진입한다.
- 홈에서 빈 화면 대신 실제 카드/요약이 보인다.
- 뒤로 가기나 탭 이동에서 갇히지 않는다.

### C. 기존 계정 로그인
순서:
1. 로그아웃
2. 기존 계정 로그인
3. 홈 재진입

통과 기준:
- 로그인 실패 문구가 필요할 때만 보인다.
- 로그인 성공 시 홈이 정상 로드된다.
- 앱 재실행 후에도 세션이 이상하게 풀리지 않는다.

## 2차 게이트: 홈과 탭 이동
### 홈
확인할 것:
- 홈 헤더와 주요 카드가 보인다.
- 우리 지역 배틀 카드가 뜬다.
- 친구 랭킹 카드가 뜬다.
- 홈에서 눌러 이동한 화면이 중간이 아니라 상단부터 보인다.

### 탭 네비게이션
확인할 것 (왼쪽부터 이 순서여야 한다):
- 랭킹
- 러닝
- 홈
- 친구
- 기록
- 마이

통과 기준:
- iOS에서 탭 수와 명칭이 의도와 맞다 (레이스·마켓·스페이스는 탭바에 없다 — href: null 로 숨긴 라우트다).
- 탭 이동 후 뒤로가기에 갇히지 않는다.
- 같은 화면이 중복 푸시되지 않는다.

## 3차 게이트: 핵심 사용자 흐름
### 친구
확인할 것:
- 친구 랭킹 목록이 보인다.
- 친구 상세 진입 후 빠져나올 수 있다.
- 친구 활동/기록 화면에서 갇히지 않는다.
- 친구 추가와 내 태그 복사가 된다.

### 리그
확인할 것:
- 지역 리그 진입
- 하위 지역 drill-down
- 대학 리그 진입

통과 기준:
- 지역 이동 구조가 깨지지 않는다.
- 대학 리그 순위가 빈 배열이더라도 화면이 죽지 않는다.

### 마켓
확인할 것:
- 상품 목록 로드
- 포인트/재고 표기
- 상품 상세 없이도 핵심 정보가 보임

### 레이스
확인할 것:
- 해당 날짜 레이스 목록 로드
- 시간대별/거리별 구조가 깨지지 않음
- 빈 상태여도 안내 문구가 과하지 않음

## 4차 게이트: 기록 흐름
### 내 활동
확인할 것:
- 러닝 기록 목록이 열린다.
- 특정 기록 상세 진입 후 빠져나올 수 있다.
- source 표기가 예상과 맞다.

### iPhone 연동 흐름
현재 v1 기준 권장 경로:
1. NRC로 러닝 기록
2. Apple 건강 앱 반영 확인
3. 우리 앱에서 기록 가져오기 또는 동기화

기기/앱 조합별 더 자세한 체크는:
- [device-integration-qa-matrix.md](/docs/device-integration-qa-matrix.md)

통과 기준:
- 연동 관리 화면 설명이 현재 정책과 맞다.
- 이미 가져온 기록만 있을 때 중복 생성 대신 안내가 나온다.
- 새 기록이 있으면 최신 기록/내 활동/홈 요약에 반영된다.

### 러닝 기록 상세
확인할 것:
- 거리
- 페이스
- 포인트
- 주간 누적
- source 또는 sourceType

## 5차 게이트: 매칭 흐름
매칭은 별도 문서를 같이 보는 편이 가장 안전하다.

- [match-real-device-qa.md](/docs/match-real-device-qa.md)

핵심 확인 항목:
- 1대1 테스트 매칭
- 그룹 테스트 매칭
- 예약 매칭
- 시작 10분 전 카운트다운
- 시작 30초 전 오버레이
- 대결 시작 / 종료 / 결과 저장
- `테스트 대결 그만`

## 권장 테스트 순서
시간이 적으면 아래 순서만 먼저 하면 된다.

1. 데스크탑 `status-preview-public-backend.cmd -RunPublicSmoke -RequireHealthy -RequireSmokeHealthy`
2. TestFlight 앱 실행
3. 기존 계정 로그인
4. 홈 진입
5. 친구 탭
6. 리그 탭
7. 내 활동
8. 연동 관리에서 기록 가져오기
9. 마켓
10. 레이스
11. 매칭 흐름 한 바퀴 확인
12. 마이페이지에서 `회원 탈퇴` 버튼 노출과 두 번 확인 동작 확인

시간이 충분하면 그다음에 신규 회원가입도 같이 본다.

## 실패 증상별 바로 볼 곳
### `Network request failed`
먼저 확인:
1. 데스크탑 status command
2. `npm run preview:smoke`
3. 현재 TestFlight 빌드가 최신인지

가장 흔한 원인:
- preview 서버가 내려감
- public URL 변경 후 옛 빌드를 보고 있음
- 데스크탑은 살아 있지만 TestFlight 빌드가 예전 주소를 들고 있음

### 로그인은 되는데 홈이 비어 있음
먼저 확인:
- `npm run preview:smoke`
- `status-preview-public-backend.cmd -RunPublicSmoke`

가능성:
- preview 데이터는 살아 있지만 특정 read route에서 예외
- 계정은 생성됐는데 홈 요약 응답이 비정상

### 친구/기록 상세에서 갇힘
이건 프론트 라우팅 이슈일 가능성이 크다.

확인:
- 재현 경로 기록
- 어떤 버튼으로 들어갔는지 기록
- 상단 back, 스와이프 back, 하단 탭 이동 모두 되는지 확인

### 기록 가져오기 중복
이건 백엔드 dedupe 또는 연동 source fingerprint 이슈일 가능성이 크다.

확인:
- 이미 가져온 기록인지
- 같은 외부 id 또는 같은 날짜/거리/페이스 조합인지
- “업데이트할 기록이 없다” 안내가 떠야 하는 상황인지

## QA 기록 템플릿
매번 손으로 템플릿을 복사하는 대신, 아래 명령으로 오늘 QA 리포트를 먼저 생성해도 된다.

```bash
npm run testflight:qa:report -- --build-label 1.0.0(15) --device "iPhone 16 Pro"
```

관리자 상태까지 같이 고정해서 남기고 싶으면:

```bash
npm run testflight:qa:report -- --build-label 1.0.0(15) --device "iPhone 16 Pro" --admin-token PREVIEW_ADMIN_TOKEN
```

기본 저장 위치는 `docs/qa-sessions/testflight-qa-YYYYMMDD-HHmm.md` 이고, `preview:smoke` 가 실패해도 실패 상태를 포함한 리포트는 남겨준다.

아래 형식으로 짧게 남기면 다음 번 수정 때 비교하기 좋다.

```text
[빌드]
- TestFlight build:
- QA 날짜:
- 기기:

[사전 점검]
- status-preview-public-backend:
- preview:smoke:

[실패/통과]
- 회원가입:
- 로그인:
- 홈:
- 친구:
- 리그:
- 내 활동:
- 기록 가져오기:
- 마켓:
- 레이스:

[메모]
- 
```

## 종료 기준
아래가 모두 맞으면 그 빌드는 “실기기 QA 1차 통과”로 봐도 된다.
- 앱 실행/로그인에서 막히지 않음
- 홈, 친구, 리그, 내 활동, 마켓, 레이스 진입 가능
- 기록 상세/친구 상세에서 갇히지 않음
- 기록 가져오기 또는 동기화 흐름이 깨지지 않음
- 매칭 테스트 / 예약 / 카운트다운 / 종료 흐름이 끝까지 이어짐
- preview smoke와 실기기 체감 흐름이 서로 모순되지 않음
