# RunningGround 출시 준비 최종 진단 — 2026-07-05

- **진단 방식**: 독립 감사 6개(성능 / 안정성·데이터손실 / 핵심 플로우 / 보안 / 백엔드 운영 / 스토어 제출) + 적대적 검증 패스(모든 P0 후보와 핵심 P1을 소스 레벨에서 반박 시도). **P0는 검증에서 CONFIRMED 판정을 받은 항목만** 집계.
- **감사 스냅샷**: `RunningGround-backend-deploy-countdown` 체크아웃 기준. 이후 커밋(Hermes 적용 등)은 미반영.
- 파일 경로는 repo 루트 기준 상대 경로.

---

## 1. 종합 판정

**조건부 GO.** 코드베이스의 방어선 — 서버 자가치유(스윕·톰스톤·DNF fallback), 저장 내구성(pending-finish 멱등 전달), 안티치트(속도캡·참가자 검증), 에러 처리 — 는 이미 출시 수준이다. 그러나 **출시 전 반드시 막아야 할 P0가 3건** 있고, 셋 다 S~M 규모라 이번 주 안에 해소 가능하다. P0를 막기 전에는 스토어 제출도, 공개도 하면 안 된다.

| 등급 | 건수 | 성격 |
|---|---|---|
| **P0 (출시 차단)** | **3** | 계정 탈취 · 데이터 영구손실 · Apple 심사 리젝 — 전부 검증 CONFIRMED |
| **P1 (출시 주간)** | **15** | 보안·정합성 3 / 용량 1 / 성능 4 / 플로우 3 / 스토어·빌드 4 (이 중 2건은 결함이 아닌 **결정 사항**) |
| **P2 (출시 후)** | **17** | 아래 5절 |

구조적 리스크 한 가지는 별도로 인지할 것: **1vCPU + whole-store 직렬화 상한(P1-4)**. 코드 패턴은 확실하고, "동시 4~8명에서 포화"라는 수치는 실측 lock-hold(200~350ms) 가정에 기반한 추정(PLAUSIBLE)이다. 두 대 폰 테스트로는 절대 재현되지 않고, 실사용자 수십 명이면 몇 주 내 드러난다. 완화책(아래) + #209(route side-table)를 출시 직후 최우선으로 잡으면 출시 자체를 막을 필요는 없다.

---

## 2. P0 목록 — 출시 차단 (3건, 전부 검증 CONFIRMED)

### P0-1. 비밀번호 재설정에 OTP가 없음 → 정적 PII만으로 계정 탈취
- **메커니즘**: `POST /api/auth/reset-password`가 `username + realName + phone + birthDate` 일치만으로 즉시 `setUserPassword` 실행. 전화번호는 소유 증명이 아니라 **문자열 매칭**으로만 쓰인다. 가입은 `phoneVerificationToken`을 요구하지만 재설정은 아님 — `PHONE_VERIFICATION_PURPOSES = {'signup'}`뿐이라 검증된 재설정 경로 자체가 존재하지 않는다. 레이트리밋은 무의미(정확한 PII면 1회 요청으로 성공). P1-1(find-username)과 체인되면 공격자는 실명+전화번호+생년월일 3개만 있으면 된다 — 한국에서 흔히 유출된 정적 PII.
- **근거**: `backend/src/routes/authLoginRoutes.mjs:60-75,161-203`, `backend/src/repositories/authRepository.mjs:256-278`, `postgresAuthRepository.mjs:434-476`(양쪽 리포지토리 모두 무검증 확인), `backend/src/phoneVerification.mjs:6`
- **정밀도 주석**: 임의 계정 원클릭 탈취가 아니라 **타깃형** 탈취다. 그래도 백엔드만으로 고칠 수 있는 전면 ATO라 P0 유지.
- **픽스**: `'reset'` purpose 추가 + reset 시 검증된 phone challenge 요구(가입의 `phoneVerificationToken` 게이트 미러링). 클라 재설정 화면은 이미 전화번호를 받으므로 OTP 단계 추가는 증분 작업.
- **규모/채널**: **M / 백엔드 배포 + 클라 OTA**(OTP UI 단계)

### P0-2. 드로플릿 소실 = 전체 데이터 영구 손실 (오프사이트 백업·복구 절차 전무)
- **메커니즘**: 야간 pg_dump 크론은 있으나 백업 디렉토리가 `postgres_data`와 **같은 드로플릿 디스크**(`backend/pg_backup.sh:35`, `deploy-production.sh:156`). repo+docs 전체에서 `rclone|s3|spaces|pg_restore` 구현 0건 — 직전 감사 P1-8의 "크론+rclone 오프사이트"는 크론 절반만 반영됐다. 런북에는 백업/복구 섹션이 아예 없어 장애 시 복구는 즉흥이 된다. 오늘 디스크/드로플릿이 죽으면 유저·러닝·랭크 전부 100% 소실. 백업 간격상 최대 24시간 유실 창.
- **전제 확인 1분**: DO 콘솔의 droplet backup이 켜져 있으면 최악 시나리오가 줄어든다(레포에서는 확인 불가). 켜져 있어도 오프사이트 dump + 복구 런북은 필요.
- **픽스**: (1) 크론에 rclone/s3cmd로 `backups/postgres/*.dump.gz` → DO Spaces 푸시 추가, (2) 런북에 검증된 `pg_restore` 명령 블록 1개, (3) 드로플릿에서 `crontab -l`로 7-05 재배포가 크론을 실제 설치했는지 확인.
- **규모/채널**: **S / 드로플릿 작업**(코드 거의 0)

### P0-3. 소셜 로그인 버튼이 살아있는데 Sign in with Apple 없음 + 키 미설정 → Apple 심사 리젝
- **메커니즘**: 카카오/네이버/구글 버튼이 로그인·가입 화면에 **무조건** 렌더(`src/features/auth/components/SocialLoginButtons.tsx:13-17`, `LoginScreen.tsx:67`, `SignupScreen.tsx:23`). Apple 옵션은 없고 `authSessionFacade.ts:70-72`는 apple에 하드 throw. 백엔드 OAuth 키는 파킹 상태(미발급)라 `socialAuthProviders.mjs:134-151`이 null → 503 — **리뷰어가 버튼을 누르면 에러**. 리젝 벡터 2개: 4.8(서드파티 로그인에 Apple 로그인 부재 — 확률적), **2.1(작동 안 하는 기능 — 키 꺼진 상태에선 사실상 확정)**.
- **픽스**: `SocialLoginButtons` 숨김/플래그 게이트(전화번호 로그인은 그대로). OAuth 완성 + Apple 로그인 추가는 L + 네이티브 빌드라 출시 주 작업이 아님.
- **핵심 제약**: **스토어 빌드의 JS 번들에 포함되어야 한다.** 심사 중 OTA 적용에 의존하지 말 것 — 빌드 전에 repo에 랜딩.
- **규모/채널**: **S / JS 변경(스토어 빌드 필수 탑승, OTA로도 병행 배포)**

---

## 3. P1 목록 — 출시 주간 (15건)

### 테마 A. 보안·데이터 정합성 (백엔드 배포 1회로 일괄 처리) — 전부 검증 CONFIRMED

**P1-1. `find-username` = 무인증·무제한 PII 오라클 (P0-1의 체인 완성)**
`authLoginRoutes.mjs:47-58,130-159` — `assertLoginRateLimit` 미적용(login/reset만 적용). 실명+전화+생년월일 → `{username, maskedPhone}` 무제한 반환. 계정 존재 확인 + reset에 필요한 username 제공. **픽스**: 동일 레이트가드 + (이상적으로) phone-verify 게이트. **S / 백엔드**. P0-1과 같은 배포에 묶는다.

**P1-2. `POST /runs/tracked` 멱등성 없음 → 타임아웃-재시도 시 이중 저장, 포인트·주간거리·전적 2배**
서버는 무조건 push/insert, 어떤 디듀프 키도 없음(`runsRepository.mjs:387-423`, `postgresRunsRepository.mjs:97-131`). 클라는 전체 GPS route를 **기본 10초 타임아웃**으로 전송(`src/lib/api/services/runs.ts:126-144`, `apiClient.ts:65`) — 정확히 1vCPU 느린 쓰기 경로에서 터지는 조합. 경쟁 정합성(랭킹·전적) 오염이라 P1. **픽스(스톱갭)**: 동일 (userId, startedAt) 존재 시 기존 run 반환 — **S / 백엔드만**. 추가로 tracked-run 저장 타임아웃 상향 — **S / OTA**. 정식 픽스(clientRunId)는 M, 출시 후.

**P1-3. compose가 store 드라이버를 `json`으로 기본 설정 — 조용한 빈 스토어 부팅 footgun**
`compose.public.yaml:32` `BACKEND_STORE_DRIVER:-json`. `.env.production`에서 이 변수 하나가 빠지거나 오타 나면 fresh seeded json 스토어로 부팅해 "전체 데이터 초기화"처럼 보이는 200을 서빙(PG 데이터는 무사하나 분기 쓰기 발생 가능). **픽스**: 기본값 postgres로 변경 또는 `BACKEND_POSTGRES_DATABASE_URL` 설정 시 json 드라이버면 부팅 실패(`storage/index.mjs:21-41`에 1줄 가드). **S / 백엔드**.

### 테마 B. 용량 (신뢰도: PLAUSIBLE — 유일한 미확정 P1, 그러나 아마 가장 큰 실질 리스크)

**P1-4. 1vCPU + `mutateStore` 전역 직렬화 → 동시 4~8명 로비/라이브에서 포화 추정, 상한은 매주 감소**
핫 매치 라우트 전부(`/rooms/my`, `/matches/status`, `/matches/progress`, `/matches/:id/result`)가 단일 `app_store` 행에 `FOR UPDATE` + 전체 jsonb 파싱 + 2회 전체 직렬화(`postgresStoreAdapter.mjs:130-175`). 실측 lock-hold 200~350ms 가정 시 전역 뮤테이션 처리량 약 3~5/s. 초과 시 pg 락 큐 → 풀 10개 소진 → 10s 대기 → 500 → 클라 재시도 증폭 → 붕괴. 쉐딩/서킷브레이커 전무. 저장된 run마다 GPS route(30~80KB)가 행에 붙어 lock-hold가 선형 증가. 코드 패턴은 확실, **수치는 실측 기반 추정**. **완화(보호 시스템 비접촉)**: (1) 스윕-온-폴 디듀프 — 스윕은 유지하되 N초당 1회, 사이엔 락 없는 `loadStore`로 폴 응답 — **M / 백엔드**; (2) in-flight 카운트 기반 load-shed: 폴 라우트만 503+Retry-After(progress/save는 절대 제외) — **S / 백엔드**. **진짜 픽스는 #209(route side-table) — 출시 직후 최우선.** 참고: read-flag 플립은 구조 레스큐가 안 됨(side table이 마이그레이션 시점 스테일 데이터라서).

### 테마 C. 성능 (OTA 배치로 처리 — #201 안드로이드 measuring 잭의 Stage-2 레버 포함)

**P1-5. `buildWeeklyHourlySlots` ×2가 런타임 모델 매 렌더마다 실행 (렌더당 Intl 호출 약 768회)**
`useMatchQueueActions.ts:12-14` 비메모이즈 2회 호출 → 8일×24h 슬롯 × `toLocaleDateString('ko-KR')` ×2 (`matchScheduling.ts:95-127`). 훅이 `TrackRunExperienceRuntimeModel` 안이라 티커뿐 아니라 하트비트/폴/GPS 플러시 렌더마다 지불. **픽스**: 시간(hour) 키 모듈 캐시 — 슬롯은 시간당만 변함. **S / OTA**. 양 플랫폼 공통 최대 가성비 레버.

**P1-6. iOS 매치는 여전히 1Hz+ 풀트리 리렌더 — Android quiesce가 전부 `Platform.OS==='android'` 게이트**
elapsed/cadence 커밋 스킵(`useTrackingSessionSnapshots.ts:150-152`)과 라이브 UI 스로틀(`:450-453`)이 Android 전용 + solo 제외. iOS 매치 ≈ 초당 1.5~2회 풀 렌더, 매번 P1-5 비용까지 지불. leaf metric store(`liveTrackingMetricStore.ts`)가 이미 값을 다 들고 있어 커밋 스킵의 iOS/solo 확장은 **display-state 전용, 보호된 카운트다운 퍼널 비접촉**. **M / OTA**.

**P1-7. `/api/me/activity`가 전체 러닝 무제한 반환 + 홈 포커스마다 재요청 + 무가상화 렌더**
`backend/src/lib/homeBuilders.mjs:65-79`(limit 없음, 친구도 동일 `:112-130`), `useHomeScreenModel.ts:53-66`(홈 포커스마다 6요청 중 하나로 전체 이력), `MyActivityScreen.tsx:146-148`(ScrollView map, FlatList 부재), `useFriendDetail.ts:54-62`(20초마다 친구 전체 이력). Health 임포트로 수백 행까지 자람 — 페이로드×백엔드 부하×렌더가 같이 스케일. **픽스**: `?limit=`/페이지네이션(백엔드) + FlatList(OTA). #209 전 드로플릿 부하도 직접 절감. **M / 백엔드+OTA**.

**P1-8. 콜드스타트가 네트워크 프로필 fetch에 블로킹 + 일시 실패가 세션을 파괴(출시일 로그아웃 사고)**
`sessionState.ts:87-95` — hydrate가 `fetchBackendProfile()`(10s)을 await, 그동안 스피너만. 더 나쁜 건 catch가 **모든 에러**에서 토큰 null+영속 — 비행기 모드/드로플릿 순단이면 조용히 로그아웃. 검증 패스에서 메커니즘 CONFIRMED(분류는 가용성/UX). **픽스**: 저장 스냅샷으로 즉시 ready, 백그라운드 재검증, **실제 401일 때만** 세션 클리어(ApiError status와 네트워크 에러 구분). **M / OTA**.

### 테마 D. 핵심 플로우 (낯선 첫 유저의 첫 경험)

**P1-9. 첫 매치가 슬롯 시각에 백그라운드 위치 하드 게이트로 망가짐 (사전 요청 없음)**
비솔로 러닝은 GPS 시작 시 "항상 허용"을 **요구하고 없으면 throw**(`useStartTrackingAction.ts:93-97` → `useLocationTracking.ts:47-53`). 웰컴 투어 권한 단계는 스킵 가능이라, 낯선 유저는 카운트다운 다 보고 슬롯 시작 순간 OS 다이얼로그를 만난다 — 거절/설정행이면 상대는 이미 달리는 중. 자동 시작 재무장은 되지만 몇 분을 잃는다. **픽스**: 예약/대기실 진입 시 사전 요청(additive — #203 라이프라인 비접촉). **M / OTA**.

**P1-10. 매칭찾기가 출시 초기 거의 모든 유저에게 조용히 불발 (유동성 + 무통보 만료)**
페이스 갭 ±15s/km 필수(`matchConstants.mjs:11-15`) + 신규 계정 기본 페이스 5.5min/km 고정 → 7:00 페이스 러너는 신규 계정과 영원히 매칭 불가. 큐는 슬롯−30분에 조용히 정리(`matchQueueStoreHelpers.mjs:52`), 피드백은 일시적 notice뿐. **픽스(출시 레버 기존재)**: `BACKEND_MATCH_PACE_TOLERANCE_SECONDS` env를 60~120s로 확대 — **S / env+백엔드 재시작**. 만료 푸시 알림은 M, 후속.

**P1-11. 파티런 초대 링크가 앱 미설치자에겐 데드 링크, 로그아웃 유저에겐 유실**
`runningground://running?...` 생 스킴 공유(`matchConstants.mjs:56`, `useRoomInviteActions.ts:194-196`) — 미설치자는 무반응, 로그아웃 유저는 온보딩 리다이렉트에서 쿼리 유실(`rootAuthGate.ts:43-47`). 초대 코드 수동 입력이 있어 P0는 면함. **픽스(출시 주)**: 공유 메시지에 스토어 링크 줄 추가 — **S / OTA**. 유니버설 링크+랜딩은 L, 출시 후(P2-15).

### 테마 E. 스토어·빌드 (7월 네이티브 빌드에 동승)

**P1-12. Android/Play 제출 경로가 통째로 없음 (Android 출시만 게이트)** — 검증 CONFIRMED
`eas.json` submit에 android 블록 없음, `submit:android:*` 스크립트 없음, 런북 iOS 전용. 필요: 서비스 계정 JSON + Play Console 앱 생성 + 첫 수동 AAB 업로드 + **ACCESS_BACKGROUND_LOCATION 선언 폼+데모 영상**(expo-location이 bg 위치 활성화하므로 필수) + 데이터 안전 폼. **M~L / 콘솔 작업**. iOS 출시는 막지 않음 — 병렬 진행.

**P1-13. Android 알림 스몰 아이콘 부재 — 러닝 내내 상태바에 회색 블롭**
`app.json:38-40` expo-notifications 옵션 없음 + **매 러닝 내내 떠 있는** 업로드 FGS가 풀컬러 런처 아이콘을 스몰 아이콘으로 사용(`MatchUploadForegroundService.kt:190`). 리젝 사유는 아니고 품질 문제. **픽스**: 모노크롬 `ic_stat_*` 자산 + notification 설정 + FGS 교체. **M / 네이티브 빌드**.

**P1-14. `supportsTablet: true` — 첫 제출 전 결정해야 하는 원웨이 도어 [결함 아님, 결정]**
`app.json:15` + `app.config.ts:222`. 리젝 사유는 아니지만(검증 재분류) 13" iPad 스크린샷이 제출 필수가 되고, **첫 승인 후엔 제거 불가**. GPS 러닝 앱에 iPad는 순수 부채. **권장: `false`**. **S / 네이티브 빌드**.

**P1-15. Maps 키 결정 미결 [결정]**
Android 기록상세는 키 없는 placeholder(기존 #184 완화), iOS는 Apple Maps로 정상. 옵션: placeholder로 출시(0작업, 솔직함) 또는 키 추가(S 설정 + 네이티브 빌드 + GCP 과금). **결정만 내리고 런북에 기록.**

---

## 4. 실행 계획

**원칙**
- **보호 시스템 비접촉**: 카운트다운 퍼널(clockReady/맞추는중 홀드), #203 bg-sync 라이프라인(3s 업로더), pending-finish 5s 재전송, room polling registry. 아래 어떤 픽스도 이들을 건드리지 않는다(P1-6은 display-state 전용, 스윕 디듀프는 스윕 자체를 유지).
- **OTA는 배치로 2회만**(발행 자체가 비용) — 표준 권한대로 검증 green 후 바로 발행, 발행 사실만 보고.
- **백엔드 배포는 유저 실행** — 총 2회로 압축.

### 세션 1 — 오늘 저녁: "보안·백업" (백엔드 배포 #1 + 드로플릿)
1. **P0-2**: pg_backup.sh에 DO Spaces 오프사이트 푸시 + 런북에 pg_restore 블록 + 드로플릿 `crontab -l` 확인 + DO 콘솔 백업 여부 1분 확인.
2. **P0-1**: reset-password에 phone-verify 게이트('reset' purpose).
3. **P1-1** find-username 레이트리밋, **P1-2 스톱갭** (userId, startedAt) 서버 디듀프, **P1-3** 드라이버 fail-fast 가드.
4. 같은 배포에 편승(전부 S): P1-10 페이스 tolerance env 확대, /api/health 축소(P2-6), Solapi 실패 → 503 `sms_provider_down`(P2-8), compose 로그 로테이션(P2-7).
→ **유저 액션: 백엔드 배포 1회 + 드로플릿 크론/콘솔 확인.** (참고: OTP UI가 나가는 내일 OTA 전까지 구 JS에서 비번 재설정이 일시 불가 — 출시 전이라 무영향.)

### 세션 2 — 내일: 스토어 빌드 전 JS 확정 + OTA 배치 #1
1. **P0-3** 소셜 로그인 버튼 게이트 — **스토어 빌드 번들 포함 필수, 최우선 랜딩**.
2. **P0-1 클라 짝** 재설정 화면 OTP 단계.
3. **P1-5** 슬롯 시간별 캐시, **P1-8** 콜드스타트 스냅샷-우선 + 401만 클리어, **P1-2** 저장 타임아웃 상향, **P1-11** 공유 메시지 스토어 링크, 카피 2건(P2-12 취소 잠금 안내, P2-13 가입 재시도 안내).
→ **OTA #1 발행** (검증 green 후).

### 세션 3 — 이번 주: 7월 네이티브 빌드 (build 44) + 스토어 제출
- 버킷(기존 계획 그대로): **Sentry(#190) + P1-13 알림 아이콘 + P1-14 supportsTablet=false + P1-15 Maps 키 결정 + iOS 네이티브 거리 필터 포트 + Live Activity(bg-sync 검증 완료 시에만)** + P2-14 splash 로고 편승.
- ASC 심사 노트 작성: 백그라운드 위치 데모, `UIBackgroundModes: audio` = 러닝 중 페이스/갭 음성 코칭(P2-16), HealthKit read-only. supportsTablet=false면 iPad 스크린샷 불필요.
- **병렬**: P1-12 Play Console 셋업(서비스 계정, bg-location 선언 폼+데모 영상, 데이터 안전 폼) — iOS 제출을 기다리게 하지 말 것.

### 세션 4 — 출시 주간: OTA 배치 #2 + 백엔드 배포 #2
1. **OTA #2**: P1-6 iOS/솔로 커밋 스킵 패리티, P1-7 클라(FlatList + limit 사용), P1-9 권한 사전 요청, P2-9 route 증분 persist, P2-10 홈 시계 focus 게이트.
2. **백엔드 #2**: P1-7 `?limit=`, P1-4 완화(스윕 디듀프 + 폴 load-shed), P2-4 result-GET dirty-check, (선택) P2-11 홈 bootstrap 통합.
→ **유저 액션: 백엔드 배포 1회.**

### 출시 직후 최우선
**#209 route side-table** — P1-4의 진짜 해결. 완화책은 시간 벌기일 뿐이고 상한은 run이 쌓일수록 줄어든다.

---

## 5. P2 — 출시 후 (17건)

**데이터·안정성**
1. 솔로 러닝 프로세스-킬 영속성 없음(매치는 5s 스냅샷, 솔로는 0) — 검증에서 P1→**P2 하향**(하드 킬 한정, 솔로는 포그라운드 기대). `useStartTrackingAction.ts:82-83`. 합성 키(`solo:<startedAt>`)+복구 프롬프트, M/OTA.
2. 러닝 중 401 → 세션 해체로 미저장 러닝 표류. `app/_layout.tsx:36-50`. running 중 사인아웃 지연, S~M/OTA.

**보안·프라이버시**
3. 인증만 되면 전 유저 match-profile 열거 가능(순차 ID + 이름/구 단위 지역/랭크). `userRoutes.mjs:29-62`. S~M/백엔드.
4. `/matches/:id/result` GET이 폴마다 whole-store 쓰기(DoS 증폭). `runningMatchProgressRoutes.mjs:59-63`. dirty-check, M.
5. 공모 계정 LP 파밍(같은 슬롯 페어링 후 기권) — 탐지로 대응, L/출시 후.
6. `/api/health` 공개 + 전체 스토어 로드 + 인프라 설정 노출. `healthRoutes.mjs:8-12`. S(세션 1 편승).
7. 레거시 평문 비번 fallback 제거(`auth.mjs:41-48`, 마이그레이션 후 도달 불가) + 세션 토큰 secure storage 전환. Low.

**운영**
8. Solapi 장애 = 가입 전면 차단이 일반 500으로 위장, 무알림. `phoneVerification.mjs:74-91`. S(세션 1 편승).
9. (7=로그 로테이션은 세션 1 편승으로 처리)

**성능**
9. bg 영속화가 5초마다 전체 route JSON.stringify — 1시간 러닝 말미 O(N) 잭. `backgroundRunPersistence.ts:147-163`. 증분 세그먼트, S~M/OTA(#2 탑승).
10. 홈 1Hz 시계가 앱 세션 내내 미정지. `useHomeScreenModel.ts:143-146`. 1줄, S/OTA(#2 탑승).
11. 홈 포커스 = 6요청 버스트 → bootstrap 통합/TTL 캐시. S~M.

**UX·스토어**
12. 취소 잠금 ~70분 동안 안내 없음 → "슬롯 시작 N분 후 자동 정리" 문구. S(OTA #1 탑승).
13. 가입 성공-응답 유실 시 "이미 사용 중인 아이디"만 표시 → 로그인 유도 카피. S(OTA #1 탑승).
14. splash가 로고 대신 앱 아이콘 사용. S/네이티브(빌드 편승).
15. 초대 유니버설 링크 + 스토어 폴백 랜딩(정식 해결). L/네이티브+도메인.
16. `UIBackgroundModes: audio` 심사 노트(2.5.4 예방). S/ASC 메타데이터(세션 3에서 처리).
17. 매칭 큐 만료 푸시 알림(P1-10 후속). M.

---

## 6. 이미 괜찮은 것들 (이번 감사에서 검사 완료 — 출시 주에 시간 쓰지 말 것)

**직전 감사(7/3) P0 3건의 현재 상태**
- **SMS 과금**: 레이어드 가드(IP별/번호별/전역 1000/일, 한도 통과 후 지출) 코드로 재확인 — 해소 유지.
- **프라이버시**: 정책이 `/privacy`+`/privacy-policy` 양 경로 서빙 + 인앱 링크 + Health Connect Android-14 고지 URL까지 배선 완료 — 해소 유지.
- **스토어 필수요건**: 인앱 계정 삭제(Apple 5.1.1(v)) 실존, 권한 문구 구체성 통과, `ITSAppUsesNonExemptEncryption` 설정, 아이콘 자산 유효(알파 없음) — 해소 유지. (이번에 새로 잡힌 스토어 리스크는 P0-3 하나.)

**서버 자가치유** — "영원히 집계중/갇힘" 경로 없음: 큐 프루닝, 미시작 세션 10분 만료, 원-피니셔 듀얼 90s DNF 실링, 스윕 + 410 톰스톤(폴러 종료 보장), force-reset, wedged-loading 워치독(#198/#200), 호스트 이탈 시 이양+빈 방 삭제, #199 초대 갇힘 실질 방어.

**저장 내구성** — pending-finish 내구+멱등(서버 first-write-wins), goal freeze는 저장 성공/명시 폐기에만 해제, 기권 0km 저장 허용(저장 실패 트랩 봉쇄), 매치 스냅샷 30분/24h 복구 창.

**손상 데이터 방어** — 모든 영속 읽기가 try/catch + 형태 검증 + 버저닝(세션/pendingFinish/bg 스냅샷/goal freeze 등), OTA 신구 형태 드리프트는 기본값으로 강등(크래시 아님). 에러 바운더리 사실상 전역. 네트워크 실패 UX 일관(10s 캡 + 분류된 에러 + 재시도, 무한 스피너 없음, 손상 세션이 부팅을 못 막음).

**보안 통과 항목** — 매치 진행 스푸핑 방어(속도캡 12m/s + 단조 elapsed + 참가자 검증), 결과/친구 object-level auth, 번들 내 시크릿 없음, testMode 서버 게이트, 입력 캡(1MB, route 5000pt), 오픈 리다이렉트 `runningground://` 제한, admin/reset 엔드포인트 게이트.

**백엔드 위생** — 에러 응답에 스택/설정 누출 없음, uncaught → graceful shutdown + 자동 재시작, store-write 정합성(FOR UPDATE + 변경 감지 + 비동기 뮤테이터 가드), 세션 유저당 1개 캡, arm-delivery 트레이스 볼륨 바운디드.

**클라 위생** — 모든 폴이 focus/라이프사이클 게이트(보이지 않는 데이터를 위한 폴 0건), 이미지 로컬+명시 사이징, runtimeVersion 규율(0.1.0 고정 + 스크립트 핀 + 듀얼 퍼블리시 런북), 가입 반쪽-계정 불가(최종 register 호출에서만 계정 생성), 빈 상태(랭킹/친구/홈) 전부 처리.

---

## 신뢰도 요약

- **P0 3건**: 적대적 검증 CONFIRMED — 양쪽 리포지토리/설정 변형까지 반박 시도 후 유지. 단서: P0-1은 타깃형(익명 대량 아님), P0-2는 DO 콘솔 백업 미설정 가정(1분 확인 필요), P0-3은 2.1(고장 버튼)이 확정 벡터이고 4.8은 확률적.
- **P1 중 검증 CONFIRMED**: P1-1, P1-2, P1-3, P1-12. **PLAUSIBLE(실측 의존)**: P1-4의 "4~8명" 수치 — 패턴은 코드로 확실, 수치는 lock-hold 실측 가정. **감사자 코드 인용 기반(적대 검증 범위 밖)**: 성능 P1-5~8, 플로우 P1-9~11 — 전부 file:line 근거 확인됨.
- **검증이 바로잡은 것**: 솔로 영속성 P1→P2 하향(감사자 간 이견 판정), supportsTablet "리젝 위험" 표기는 오류(원웨이 도어 결정으로 재분류).
