# PostgreSQL Transition Plan

## 목표
RUNNIGAPP은 지금 빠른 MVP 확인을 위해 JSON 파일 저장소를 쓰고 있다. 출시 후 장기 운영을 생각하면 회원, 기록, 친구, 랭킹, 마켓, 레이스 데이터는 PostgreSQL로 옮기는 편이 안전하다.

이번 전환의 목표는 한 번에 서버를 갈아엎는 것이 아니라, 앱이 계속 동작하는 상태에서 저장소만 단계적으로 바꿀 수 있게 만드는 것이다.

## 현재 저장소 구조
현재 `backend/src/server.mjs`는 `loadStore()`와 `mutateStore()`로 전체 JSON store를 읽고 수정한다.

관리 중인 주요 배열은 아래와 같다.

- `users`
- `sessions`
- `runs`
- `integrationImports`
- `friendships`
- `friendRequests`
- `marketCatalog`
- `rewardRedemptions`
- `offlineRaceEvents`
- `offlineRaceGuideSteps`
- `notices`
- `regionTree`

이 구조는 개발 속도는 빠르지만, 사용자가 늘어나면 동시 요청, 백업, 장애 복구, 데이터 조회 성능에서 한계가 생긴다.

## 저장소 분리 방향
`backend/src/storage/index.mjs`를 저장소 선택 지점으로 둔다. 지금은 `BACKEND_STORE_DRIVER=json`만 실제 지원하고, 서버 동작은 기존 JSON 저장소 그대로 유지한다.

나중에 PostgreSQL을 붙일 때는 서버 전체를 한 번에 바꾸지 않고 아래 repository 단위로 분리한다.

- `authRepository`: 회원가입, 로그인, 세션
- `profileRepository`: 프로필, 지역, 대학, 공개 태그
- `runsRepository`: 러닝 기록, 기록 가져오기, 중복 방지
- `friendsRepository`: 친구 요청, 친구 관계, 친구 랭킹
- `leagueRepository`: 지역/대학 랭킹
- `marketRepository`: 상품, 포인트 교환
- `raceRepository`: 실시간 오프라인 레이스 일정과 신청
- `adminRepository`: 공지, 운영 상태, 관리자 변경 작업

## 왜 전체 store adapter가 아니라 repository인가
PostgreSQL은 JSON 파일처럼 “전체 store를 읽고 통째로 저장”하는 방식이 맞지 않다. 그래서 최종 구조는 `loadStore/mutateStore`를 그대로 PostgreSQL에 흉내 내는 것이 아니라, 기능별 repository가 필요한 데이터만 SQL로 읽고 쓰는 구조가 좋다.

단기적으로는 `storage/index.mjs`를 통해 저장소 경계를 만들고, 중기적으로는 route handler 내부의 직접 배열 조작을 repository 호출로 옮긴다.

## 스키마 기준
목표 스키마 초안은 `backend/db/schema.sql`에 둔다.

초기 전환 기준:
- 기존 id 형식 보존을 위해 `text` primary key를 쓴다.
- `users.username`, `users.public_tag`는 unique로 관리한다.
- `runs(user_id, source_type, external_id)` partial unique index로 외부 기록 중복을 막는다.
- `external_id`가 없는 기록은 `user_id`, `source_type`, `run_date`, `distance_km`, `pace` fingerprint로 중복 후보를 찾는다.
- `route`, `connected_sources`, `notification_settings`, `distance_options`처럼 아직 형태가 자주 바뀌는 데이터는 우선 `jsonb`로 둔다.
- 실명, 전화번호, 생년월일, 상세 주소는 기본 응답에서 제외하는 private field로 분류한다.

## 단계별 실행 계획
### Phase 1. 안전한 경계 만들기
- 서버가 `backend/src/storage/index.mjs`를 통해 저장소를 import한다.
- JSON 저장소는 기존 동작을 유지한다.
- health 응답에 현재 `storeDriver`를 표시한다.

### Phase 2. PostgreSQL 개발 환경 준비
- `backend/db/schema.sql` 기준으로 preview PostgreSQL 컨테이너를 띄운다.
- `backend/compose.postgres.yaml`과 `npm --prefix backend run db:up`으로 로컬 DB를 재현한다.
- `BACKEND_POSTGRES_DATABASE_URL` 또는 `DATABASE_URL`로 DB 주소를 준비한다.
- `npm --prefix backend run db:check`로 연결 상태를 가볍게 확인한다.
- 아직 production/TestFlight는 JSON store를 유지한다.

### Phase 3. Migration script
- JSON store 파일을 읽는다.
- 사용자, 세션, 기록, 친구, 마켓, 레이스 순서로 insert한다.
- 중복 기록은 `external_id`와 fingerprint 기준으로 건너뛴다.
- migration 후 smoke test로 로그인, 홈, 기록, 친구 랭킹을 확인한다.
- `npm --prefix backend run db:migrate:dry-run`으로 먼저 건수와 누락 필드를 확인한다.
- `npm --prefix backend run db:migrate:sql`로 PostgreSQL에 넣을 SQL 파일을 생성한다.

### Phase 4. Repository 전환
- 인증과 회원가입부터 PostgreSQL repository로 옮긴다.
- 다음으로 runs/imports를 옮겨 기록 중복 방지를 DB index로 강화한다.
- 랭킹은 SQL aggregate query로 계산한다.
- 마켓/레이스/공지 같은 운영 데이터는 마지막에 옮긴다.

현재 진행 상황:
- `backend/src/repositories/authRepository.mjs`로 인증 경계를 먼저 분리했다.
- `backend/src/repositories/postgresAuthRepository.mjs`로 PostgreSQL 인증 구현 초안을 추가했다.
- `backend/src/repositories/runsRepository.mjs`로 수동 기록, 앱 자체 측정 기록, 연동 import 큐, 중복 방지 동기화 흐름을 분리했다.
- `backend/src/repositories/postgresRunsRepository.mjs`로 PostgreSQL 기록/import 구현 초안을 추가했다.
- `backend/src/database/postgresDatabase.mjs`로 공용 PostgreSQL query/transaction adapter를 추가했다.
- `backend/src/bridges/sessionRunsBridge.mjs`로 세션 조회와 run 집계를 JSON/PostgreSQL 양쪽에서 읽을 수 있는 bridge helper를 추가했다.
- 로그인, 로그아웃, 아이디 중복 확인, 회원가입은 route layer에서 repository를 호출한다.
- 기록 관련 route layer는 입력 검증만 맡고, 저장/중복 판단은 repository가 맡는다.
- route layer는 sync/async repository를 모두 받을 수 있게 repository 호출을 `await`한다.
- `npm --prefix backend run test`로 JSON/PostgreSQL repository, bridge helper, DB adapter 동작을 함께 검증한다.
- 아직 runtime store driver는 JSON만 사용한다.
- auth/runs만 성급하게 PostgreSQL로 켜면 나머지 JSON 기반 토큰/랭킹 흐름과 어긋날 수 있어서, 런타임 전환은 route 단위로 더 천천히 진행한다.

### Phase 5. Preview 전환
- preview API만 PostgreSQL에 연결한다.
- TestFlight 앱에서 회원가입, 로그인, 기록 가져오기, 친구 랭킹을 확인한다.
- 문제가 없으면 production API 전환 후보로 올린다.

## 리스크와 방어선
- 데이터 손실 방지: migration 전 JSON backup을 반드시 만든다.
- 중복 기록 방지: DB unique index와 앱/서버 fingerprint 검사를 같이 둔다.
- 되돌리기: preview 전환 단계에서는 JSON store를 유지하고, 문제가 있으면 `BACKEND_STORE_DRIVER=json`으로 즉시 돌아간다.
- 개인정보: private field는 API 응답 builder에서 계속 제외한다.
- 운영 장애: PostgreSQL 전환 후에는 DB backup과 restore rehearsal을 별도 체크리스트로 둔다.

## 다음 구현 후보
1. smoke test에 PostgreSQL bridge read 케이스 추가
2. preview API에서 세션/런 read를 작은 전환 플래그로 켜보기
3. bridge helper를 실제 profile/home/runs read route에 연결하기
4. friends/league repository를 같은 방식으로 분리
