# TestFlight QA Session Report

## 기본 정보
- 생성 시각: 2026-05-03 19:14
- TestFlight build: preview-device-pass
- 기기: iPhone + Galaxy
- 테스터: 오너
- 리포트 경로: docs/qa-sessions/match-device-qa-20260503.md

## 자동 수집된 preview 상태
- preview:smoke 결과: PASS
- preview API: https://preview-api.running-ground.com/api
- public base URL: https://preview-api.running-ground.com
- environment: preview
- smoke user: preview-smoke-user
- smoke user 생성 여부: 기존 계정 로그인
- latest run id: run-e11c0767
- admin status: SKIPPED
- admin counts: users=-, runs=-
- 친구 랭킹 항목 수: 1
- 지역 하위 노드 수: 17
- 대학 랭킹 항목 수: 10
- 마켓 상품 수: 11
- 레이스 이벤트 수: 0
- 연동 소스 수: 7

## 사전 점검 체크
- [x] `npm run preview:smoke`
- [ ] 관리자 상태 확인
- [ ] `scripts\windows\status-preview-public-backend.cmd -RunPublicSmoke -RequireHealthy -RequireSmokeHealthy`
- [ ] TestFlight 최신 빌드 설치 확인

## 1차 게이트
### 앱 열기와 로그인
- [ ] 앱 실행 직후 흰 화면/무한 로딩이 없다
- [ ] 기존 계정 로그인 성공
- [ ] 로그인 후 홈 진입 성공
- [ ] 앱 재실행 후 세션 유지 확인

### 신규 회원가입
- [ ] 아이디 중복 확인 동작
- [ ] 신규 회원가입 성공
- [ ] 회원가입 후 홈 진입 성공
- [ ] 뒤로 가기 또는 탭 이동에 갇히지 않음

## 2차 게이트
### 홈과 탭 이동
- [ ] 홈 헤더/주요 카드 정상 표시
- [ ] 우리 지역 배틀 카드 정상 표시
- [ ] 친구 랭킹 카드 정상 표시
- [ ] 홈에서 이동한 화면이 상단부터 표시
- [ ] 리그/친구/홈/레이스/마켓/마이 탭 이동 정상

## 3차 게이트
### 친구/리그
- [ ] 친구 랭킹 목록 정상
- [ ] 친구 상세 진입 후 정상 복귀
- [ ] 친구 활동/기록 화면에서 갇히지 않음
- [ ] 지역 리그 drill-down 정상
- [ ] 대학 리그 빈 상태에서도 화면 비정상 없음

### 마켓/레이스
- [ ] 마켓 상품 목록/포인트/재고 정상 표시
- [ ] 레이스 날짜별 목록 정상 표시
- [ ] 시간대/거리별 구조가 깨지지 않음

## 4차 게이트
### 기록 흐름
- [ ] 내 활동 목록 정상
- [ ] 러닝 상세 진입 후 정상 복귀
- [ ] 기록 source 표기 확인
- [ ] 기록 가져오기 또는 동기화 성공
- [ ] 이미 가져온 기록만 있을 때 중복 생성 없이 안내 표시
- [ ] 새 기록 반영 후 홈/내 활동/최신 기록 업데이트 확인

## 5차 게이트
### 매칭 흐름
- [ ] 1대1 테스트 매칭이 바로 시작 흐름으로 이어짐
- [ ] 그룹 테스트 매칭이 바로 시작 흐름으로 이어짐
- [ ] 예약 1대1 매칭 생성 성공
- [ ] 예약 그룹 매칭 생성 성공
- [ ] 시작 10분 전 카운트다운 표시 확인
- [ ] 시작 30초 전 오버레이 확인
- [ ] 대결 시작 후 `대결 보기 / 순위 보기 / 기록 보기` 확인
- [ ] 대결 종료 후 결과 저장 확인
- [ ] `테스트 대결 그만` 동작 확인

## 재현 메모
- 

## 실패/수정 필요 사항
- 

## 최종 판정
- [ ] 실기기 QA 1차 통과
- [ ] 수정 후 재검증 필요

## 원본 smoke 명령
```bash
/opt/homebrew/Cellar/node/23.11.0/bin/node <repo>/scripts/check-preview-public-api.mjs --json
```

## raw smoke JSON
```json
{
  "ok": true,
  "apiBaseUrl": "https://preview-api.running-ground.com/api",
  "publicBaseUrl": "https://preview-api.running-ground.com",
  "environment": "preview",
  "admin": {
    "checked": false,
    "ok": false,
    "users": null,
    "runs": null
  },
  "auth": {
    "username": "preview-smoke-user",
    "created": false
  },
  "latestRunId": "run-e11c0767",
  "counts": {
    "leaderboardRanks": 1,
    "regionChildren": 17,
    "universityRanks": 10,
    "marketItems": 11,
    "upcomingRaces": 0,
    "integrationSources": 7
  }
}
```
