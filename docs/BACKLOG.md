# 러닝그라운드 백로그 (2026-07-27 정리)

현재 상태: iOS 1.0.2 라이브 (전화 + 카카오/네이버/구글/애플 로그인), Android 비공개 테스트 2차(versionCode 39),
프로덕션 드롭릿 1대 + Cloudflare DNS + DO Spaces 오프사이트 백업. 운영 브랜치는 `fix/countdown-local-tick`
(드롭릿/배포 스크립트가 이 이름을 참조 — main은 미러).

## 일정이 있는 것

- **8월 초 (~8/3): Android 프로덕션 액세스 신청** — 테스터 12명/14일 조건은 7/20 시작으로 충족됨.
  - 출시되면: 태그 공유 메시지와 `GET /download` 리다이렉트에 Play 링크 분기 추가 (`backend/src/routes/downloadRedirectRoutes.mjs`에 TODO 주석).

## 다음 네이티브 빌드에 묶을 것 (OTA 불가 항목)

- **expo-linear-gradient 추가** → 미드나잇 글래스 잔여: LP바/버튼 오로라 그라디언트 (보라→시안).
- **expo-av의 FGS_MEDIA_PLAYBACK 제거 검토** — expo-audio만 쓰면 Play 선언 자체를 없앨 수 있음.
- **iOS 네이티브 주기 업로더** — 화면 꺼짐 라이브 동기화 잔여 근본 수술 (memory: bgsync-residual-and-native-uploader).
- Sentry 소스맵 업로드 토큰 배선 (현재 SENTRY_DISABLE_AUTO_UPLOAD=true).
- **Android Google Maps API 키 배선** — 경찰과 도둑런 라이브 지도가 iOS는 애플 지도,
  Android는 레이더 폴백(#207 제약). 키 넣고 ChaseLiveMapView.android.tsx를 native 구현으로 교체.

## 경찰과 도둑런 2차 (1차 출시 2026-07-27, 라이브 지도 2026-07-28)

- 라이브 지도 1차 탑재됨(7/28): 10초 하트비트(지오펜스 게이트) + 참가자 지도(iOS)/레이더(Android),
  경기장은 일산 호수공원 단일 오픈 (나머지 18곳 DORMANT — chaseArenas.mjs에서 배열만 옮기면 활성화).
- 실시간 "주변에 러너!" 알림/진동 (지도는 봐야 보임 — 푸시형은 미탑재).
- 시작 실패/러닝 폐기 시 경기장 슬롯 즉시 반납 — 지금은 3h TTL 자연 소멸에 의존
  (같은 유저 재입장은 슬롯 교체라 실해는 점유 수 +1 표시뿐).
- 정원(capacity)은 정직한 클라이언트만 구속 — 저장 시 presence 보유 검증 추가 검토.
- 하루 상한(60P)이 기기 날짜(run.date) 기준 — 서버 날짜 클램프 보강 검토.
- 경기장 지오펜스 원형 → 폴리곤 (강변 선형 공원 정밀화), 어드민 CRUD API.

## 기능/개선 백로그 (우선순위 미정)

- 카카오 로그인 탈퇴 시 unlink 호출 (어드민 키 API, 저장 토큰 불필요 — 애플 철회와 대칭).
- 매치 중 재렌더 최적화 2~4단계 (memory: measuring-rerender-quiesce).
- 안티치트 3단계: 케이던스 단독 유죄 판정.
- 지역 트리 노드 ID의 위치 기반 취약성 — 카탈로그 순서가 바뀌면 드릴다운 중이던 클라가 일시적으로
  엉뚱한 보드를 봄 (행정구역 개편 때만 발생, 이름 기반 슬러그로 전환 검토).

## 인프라/부채

- **Postgres-primary 전환 (~35% 진행)** — whole-store 블롭 → 테이블 분리. 재개 시
  `db/migrate-json-to-postgres.mjs` 재실행이 지역 통합/수동기록 duration을 자동 반영하도록 이미 배선됨.
- matchSessions → 전용 테이블 분리.
- DO Spaces 백업 키 재발급 (채팅에 노출된 적 있음 — 로테이션 권장).
- postgres 계열 레포(dormant, 플래그 off)에 미러 안 된 신규 메서드: friends의
  createRequestByUserId/getUserRelation, auth의 updateSocialRefreshToken (전환 재개 때 함께).
- **postgres league 레포(dormant)의 buildRegionLeague는 여전히 저장된 트리 통계를 그대로 서빙** —
  json 레포는 요청 시 regionLiveStats로 재계산한다. seed 롤업 기준은 2026-07-31에 표시 기준
  (이번 달 전체 거리)으로 맞췄지만, 저장 시점 스냅샷이라 실시간은 아님. 전환 재개 때
  decorateRegionNodeWithLiveStats 미러 필수.
- 홈 포인트 게이지의 거리 사다리는 클라가 전체 러닝을 합산 — 서버 사다리는 차량 판정
  러닝을 제외하므로 치팅 판정된 기록이 있으면 게이지가 서버보다 살짝 높게 보인다
  (클라 run 타입에 integrity가 없어 미필터). 실사용 영향 미미, 필요 시 서버가 사다리
  거리를 내려주는 방식으로 정리.
- **postgres run 매퍼가 chase/integrity 필드를 모름** — postgresRunsRowMappers.mjs mapRunRow와
  postgresRunsRepository.createTrackedRun이 run.chase(+integrity)를 드랍. BACKEND_POSTGRES_ENABLE_RUN_READS
  켜기 전에 반드시 미러 (지금은 플래그 off라 미발동).

## 운영 메모

- 배포: 클라 = `npm run ota:production`(앱 재시작 2회 적용), 백엔드 = 드롭릿에서
  `git pull origin fix/countdown-local-tick && bash deploy-production.sh`.
- 심사 계정(reviewer01)과 BACKEND_REVIEW_LOGIN_* env는 다음 버전 심사에도 재사용 — 삭제 금지.
- postgres에서 pre-merge(7/26 이전) 백업을 복원하면 api 컨테이너 재시작 필요 (부트 스윕이 지역 통합 재적용).
