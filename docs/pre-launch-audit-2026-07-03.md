# RunningGround 출시 전 진단 통합 펀치리스트

감사 5건(헤비코드/프로덕션 위생/보안/스토어/백엔드 견고성)을 중복 제거해 통합. 같은 근본 원인은 하나로 묶었고, 과대평가된 항목은 사유와 함께 강등함.

---

## P0 — 출시 차단

**P0-1. 스토어 전체 클론+동기 디스크쓰기 핫패스 — 매치 시간대 용량 붕괴 (감사 2건 통합: HEAVY#1+#2, ROBUST#1)**
- 설명: 매치 관련 모든 요청(순수 폴링 GET 포함)이 mutateStore 하에서 전체 스토어를 ~7회 직렬화 + 동기 파일쓰기 1~2회 수행. 런 저장마다 GPS 루트가 스토어에 축적되므로 2폰 테스트에선 멀쩡하다가 출시 후 며칠 내 붕괴하는 데이터량 시한폭탄. 진행 중인 Postgres 마이그레이션도 현재 whole-store-jsonb 형태로는 이 비용을 못 없앰(전역 row lock + O(store)/write).
- 근거: `backend/src/store.mjs:360-411`, `runningMatchProgressRoutes.mjs:58,89,127`, `runningMatchRoomRoutes.mjs:71,89`, `config.mjs:122` (프로덕션 backup-on-save 기본 true), `postgresStoreAdapter.mjs:130-156`
- Fix 모양 (스톱갭 4종, Postgres 완성 전 필수): ① pretty-print 제거 ② 변경 없으면 저장 스킵(폴링 GET이 파일 재작성 중단) ③ `BACKEND_STORE_BACKUP_ON_SAVE=false` 또는 60s 디바운스 ④ status 폴 read-only화. **+ 동일 배포에 묶기**: 참가자 프로필 per-request 메모(runs-by-userId Map 1회 구축, `matchSessionSnapshots.mjs:126-129`의 30명×2패스 중복 스캔 제거 — HEAVY#2, 노력 S).
- 노력: S–M | 필요: **백엔드 재배포만** (클라 무관, 기기테스트 불필요)
- 솔직 평가: HEAVY는 P1, ROBUST는 P0로 판정했는데 **P0가 맞음** — 30인 그룹매치가 광고 기능이고, 붕괴 조건이 "부하"가 아니라 "누적 데이터"라 회피 불가. 단, 스톱갭만으로 출시 헤드룸은 확보되므로 Postgres 완성 자체는 차단 요건이 아님.

**P0-2. 개인정보처리방침 URL 전부 죽음 — apex 도메인 DNS 레코드 없음 (STORE#1)**
- 설명: App Store 5.1.1(HealthKit 필수), Play Data safety, 그리고 Android 매니페스트에 구워진 Health Connect rationale URL이 전부 NXDOMAIN. 경로 불일치 보너스(`/privacy` vs `/privacy-policy`). HTML은 이미 `docs/`에 있고 호스팅만 없음.
- 근거: `src/config/legal.ts:11`, `plugins/withHealthAccess.js:36,333-340`, `dig running-ground.com` 무응답 (api. 서브도메인은 정상)
- Fix 모양: Cloudflare Pages/Workers로 `docs/privacy-policy.html` 서빙, **/privacy와 /privacy-policy 둘 다** 응답(한쪽 리다이렉트). ASC + Play Console에 URL 입력.
- 노력: S (~30분) | 필요: **DNS/호스팅만** — 두 경로를 다 서빙하면 앱 변경 불필요

**P0-3. SMS 인증 요청 무제한 — solapi 과금 폭탄 (SECURITY#1)**
- 설명: 비인증 request-code가 호출당 실 SMS 1건 발송, 유일한 스로틀은 동일번호 pending시 60s 쿨다운뿐. 신규 번호 순회 시 무제한 과금 + 단일 피해자 SMS 폭탄 가능. 출시 = 공개 API 노출 = 실돈 손실 경로.
- 근거: `backend/src/routes/authPhoneVerificationRoutes.mjs:90-125`, `backend/src/phoneVerification.mjs:52-97`, 백엔드 전체에 rate-limit 코드 0건
- Fix 모양: per-IP 토큰버킷 + 전역 일일 발송 상한 + per-IP 고유번호 캡 (인메모리 LRU면 충분).
- 노력: M | 필요: **백엔드 재배포만** (P0-1과 같은 배치에 실림)

---

## P1 — 출시 전 강력 권장

**P1-1. 비밀번호 재설정 = 알 수 있는 PII만으로 계정 탈취 (SECURITY#2)**
- 이름+전화+생일만으로 리셋 — 가입은 폰 OTP 필수인데 리셋은 우회. 근거: `authLoginRoutes.mjs:123-158`, `authRepository.mjs:256-278`. Fix: 기존 OTP 인프라에 `reset_password` purpose 추가, 클라 복구화면에 OTP 스텝. 노력 M | **백엔드 재배포 + OTA** (양쪽 배치에 각각 실림)

**P1-2. 테스트매칭 잔재: 프로덕션 API가 testMode:true 수용 + 테스트매치 LP 미제외 (HYGIENE#3)**
- 가짜상대 매치 생성 가능 + 그룹 테스트매치에서 `lpApplied` 설정 전 봇 lookup throw로 **LP 중복 지급 루프** 개연성. 근거: `runningMatchRequestRoutes.mjs:55,84,159`, `matchActionHandlers.mjs:66-69,107-117`. Fix: env 게이트 + LP early-return에 `isTestMatchSession` 추가 (사실상 2줄). 노력 S | **백엔드 재배포만**

**P1-3. 세션 소멸 매치의 404에 종결 신호 없음 — 좌초 기기가 ~2s 간격 무한 재시도 (ROBUST#3)**
- 404마다 서버는 전체 스토어 클론 비용을 그대로 지불, 클라는 명시적으로 백오프 없이 재시도(+네이티브 3s 재전송). 근거: `matchActionHandlers.mjs:287-292`, `backgroundMatchProgressSync.ts:565-567`. Fix: 서버 410/tombstone(카운트다운 작업의 tombstone 개념 재활용) + 클라 404/410시 업로더 정지. 노력 S+S | **백엔드 재배포 + OTA**

**P1-4. runtimeVersion이 package.json 버전 암묵 추종 — 스토어용 버전 범프가 전 설치 기기 OTA 채널 고아화 (STORE#2)**
- `ota:production`은 `ota:testflight`와 달리 EXPO_RUNTIME_VERSION 미고정 → 퍼블리시 시점 package.json에 따라 아무도 안 쓰는 런타임에 조용히 발행 가능. 이 팀은 OTA가 주력 배포 수단이라 치명적. 근거: `app.config.ts:82-83,157`, `package.json:40-41`. Fix: 모든 빌드 프로필+ota 스크립트에 런타임 명시 고정, "네이티브 릴리즈 후 N주 구버전 듀얼 퍼블리시" 런북 한 줄. 노력 S | **설정/스크립트만** (즉시 절반 효력, 나머지는 다음 네이티브 빌드)

**P1-5. OTA 채택 메커니즘 전무 — 업데이트 프롬프트/최소버전 게이트 0 (STORE#3)**
- fallbackToCacheTimeout 0 + 기본 백그라운드 체크 = 긴급 수정이 **콜드스타트 2회** 후 적용. 라이브 멀티플레이 프로토콜인데 구클라이언트 꼬리를 자를 방법이 없음. Fix: 포그라운드 진입 시 checkForUpdateAsync→비차단 "새 버전 적용" 프롬프트(현 바이너리의 expo-updates로 OTA 배포 가능). **런 중 reload 금지 가드 필수 → 기기테스트 필요.** 노력 S–M | **OTA + 기기테스트**

**P1-6. 릴리즈 핫패스의 무게이트 console.log — GPS 포인트당 [RG dist] 7곳 (HYGIENE#1 = HEAVY#3 통합)**
- 유일하게 게이트를 빠뜨린 트레이스 패밀리, 릴리즈에서 런 내내 초당 실행 + 거리게이트 내부값 로그 유출. 근거: `routeAccumulator.ts:47,202,269,309,322,346,360`. Fix: 기존 rgDiagLog 게이트로 라우팅. 노력 S | **OTA만** — 솔직 평가: 임팩트 자체는 P2(CPU 미미)지만 대기 중인 #205 OTA에 공짜로 실리므로 P1 유지.

**P1-7. 관리자 대시보드가 소비자 앱의 공개 딥링크 라우트 (HYGIENE#2)**
- `runningground://admin`이 비로그인 상태에서도 토큰 입력 UI 오픈. 서버는 requireAdmin으로 막혀 있어 데이터 구멍은 아니나, 스토어 심사에서 숨은 관리자 기능으로 걸릴 수 있고 x-admin-token 헤더를 광고함. 근거: `app/admin.tsx:1`, `rootAuthGate.ts:12,40`. Fix: `appVariant !== 'production'` 게이트. 노력 S | **OTA만**

**P1-8. JSON 스토어 시간기반 백업 전무 — 라이브 부하 시 복구 깊이 수 초 (ROBUST#2)**
- per-save 백업은 매치 중 매 저장이 바이트 변경이라 보존분 20개가 몇 초 커버; 야간 cron은 Postgres만 덤프; 스토어+백업이 같은 볼륨/같은 디스크 = 전체 유실 단일점. Fix: 드로플렛 cron으로 10~60분 스냅샷 + rclone 오프사이트(DO Spaces). 노력 S | **드로플렛 cron만** (최소 버전은 코드 변경 0)

**P1-9. testflight 프로필 = 프로덕션 번들ID의 스토어 배포용 preview-api 바이너리 (STORE#5)**
- ASC에서 "테스트하던 빌드 제출" 클릭 한 번이면 preview 백엔드가 실사용자에게 출시됨, 툴링이 안 잡음. 근거: `eas.json:47-62`. Fix: 런북 규칙("production 프로필 빌드만 제출") + testflight 빌드넘버 대역 분리(9xx). 노력 S | **문서/설정만**

**P1-10. Play 제출 배선 (기지 트래킹 — 계획 슬롯만)**
- submit.android 부재 + 콘솔측 필수 작업: 서비스 계정, 최초 AAB 수동 업로드, Data safety(위치+백그라운드위치+건강 선언), 백그라운드 위치 선언 영상(공개 고지 카피는 이미 존재 — 촬영만 하면 됨), 피처 그래픽 1024×500 부재. 노력 M | **네이티브 Android 빌드(AAB) + 콘솔 작업**

---

## P2 — 출시 후 (또는 예정된 배치에 무임승차)

| 항목 | 근거 | Fix/노력 | 편승처 |
|---|---|---|---|
| CORS 와일드카드 → 명시 오리진 | `config.mjs:113-115` | env만, S | 백엔드 배치 1 무임승차 |
| 시드 리셋 가드(스토어 파일 소실 시 조용히 초기화) + async mutator throw 가드 | `store.mjs:351-358,406-411` | 2개 가드, S | 백엔드 배치 1 무임승차 — 운영 사고를 "전체 데이터 소실처럼 보이는 200 OK"로 바꾸는 함정이라 개인적으로 P1.5 |
| 어드민 토큰 timingSafeEqual / SMS 실패 로그 전화번호 마스킹 / match-profile IDOR(지역 필드 제거) | SECURITY#3-6 | 각 S | 백엔드 배치 2 |
| scrypt 비동기화 + 인증 rate limit | `auth.mjs:22-54` | S | P0-3 SMS 리미터와 같은 미들웨어로 묶기 |
| 5s 크래시 스냅샷이 전체 루트 재직렬화(2h 런 ~700KB/5s) | `backgroundRunPersistence.ts:138-154` | 루트 tail 한정, S–M | **kill-restore 기기테스트 필요** → 기기 가능 시점 |
| #203 TEMP 로그의 미표기 형제 3곳(:535,:579,:581) | `backgroundMatchProgressSync.ts` | #203 정리 시 함께 스윕 | #203 |
| 포핏 디버그 부기 무게이트(프로드에서 null 패널에 emit) | `useTrackRunForfeitDiagnosticsSnapshot.ts:35-88` | early-return, S | OTA 배치 |
| 죽은 /district-personal 라우트+스크린+훅 (API 서비스는 유지) | `app/district-personal.tsx` | 삭제, S | OTA 배치 |
| 5탭 환경 디버그 카드 | `MyPageScreen.tsx:36-50` | **의도적 유지 권장**(TestFlight 지원 도구) — 결정만 문서화 | — |
| 크래시 화면 원시 스택 노출 | `RouteErrorBoundary.tsx:22-49` | Sentry #190 이후 | #190에 종속 |
| supportsTablet:false / 알림 스몰아이콘+색 / 스플래시 전용 로고 / 네이티브 Log.i 게이트 / 모션 권한 주석 정정 | STORE#7-8, HYGIENE#9 | 각 S | **7/1 네이티브 필터 포트 빌드에 전부 합승** — 알림 아이콘은 #204 락스크린 카드가 알림이라 그 전에 필수 |
| Android Maps 키 (기록상세 지도 placeholder) | 의도적 완화 상태 | 출시 기능 패리티 **의사결정 항목**, S–M | 네이티브 빌드 |
| audio UIBackgroundModes 심사 노트 + 데모 영상 | `app.json:17-20` | ASC 노트만, S | iOS 제출 시 |
| mock 트리 번들 데드웨이트 | 프로드 도달 불가 검증됨 | M | 출시 후 |
| per-request 메트릭 재계산(WeakMap이 클론 키라 절대 히트 불가) | `userStoreHelpers.mjs:11,37-42` | Postgres 관계형 핫패스와 함께 | Postgres 작업 |

**강등 판정 요약**: HYGIENE의 console.log P1은 임팩트 기준 P2이나 OTA 편승으로 P1 유지. 어드민 라우트는 서버 게이트가 건재해 "노출"이지 "구멍"이 아님(심사 리스크로 P1 유지). HEAVY가 P1로 본 스토어 문제는 ROBUST의 P0 판정이 옳음(데이터량 기반 붕괴라 회피 불가). 나머지 감사 P0/P1 중 부풀려진 것 없음 — 전반적으로 감사 품질이 정확했음.

---

## 실행 순서 (다음 3 작업 세션)

**세션 1 — "서버의 날": 백엔드 재배포 배치 #1 + DNS (기기 불필요, 전부 지금 가능)**
1. P0-2 프라이버시 호스팅: Cloudflare Pages에 docs/privacy-policy.html, /privacy·/privacy-policy 양쪽 서빙 (~30분, 즉시 완결)
2. P0-1 스토어 스톱갭 4종 + 프로필 메모 (HEAVY#2)
3. P0-3 SMS 리미터 + P2 인증 rate limit (같은 미들웨어)
4. P1-2 testMode 게이트 + LP 제외 (2줄)
5. P1-3 서버측 410/tombstone
6. 무임승차: CORS env, 시드 가드, async 가드, `BACKEND_STORE_BACKUP_ON_SAVE=false`
7. P1-8 드로플렛 백업 cron + 오프사이트
→ **재배포 1회**로 P0 3건 중 2.5건 + P1 3건 해소. 이 배치는 클라이언트 무관이라 기기테스트 없이 안전. 참고: 이미 커밋됐지만 미배포인 백엔드 변경분(메모리: deploy-batch)이 함께 나가므로 배포 전 diff 확인.

**세션 2 — "OTA 준비의 날": 클라이언트 변경 적재 + 설정 (배포는 보류)**
1. P1-6 [RG dist] rgDiagLog 게이팅 (+HYGIENE#4 형제 로그, 포핏 디버그 early-return, 죽은 라우트 삭제 — 전부 저위험)
2. P1-7 어드민 라우트 프로덕션 게이트
3. P1-3 클라측 404/410 업로더 정지
4. P1-5 업데이트 프롬프트 훅 (런 중 reload 가드 포함)
5. P1-1 비번 리셋 OTP — 백엔드 절반은 배치 #2로 적재, 클라 절반은 OTA 큐로
6. P1-4 runtimeVersion 고정 (스크립트+eas.json) + P1-9 런북 규칙
→ **퍼블리시는 하지 말 것.** 기존 #205(리팩터 3커밋)와 함께 기기 스모크가 풀리는 시점에 OTA 1회로 묶어 발사. 유일한 필수 기기 검증: 업데이트 프롬프트의 런 중 reload 가드, #205 스모크.

**세션 3 — "스토어의 날": 제출 트랙 + 네이티브 빌드 계획 확정**
1. P1-10 Play: 서비스 계정 → eas.json submit.android → production AAB 수동 1차 업로드 → Data safety + 백그라운드 위치 선언(영상은 기기 가능 시 촬영) + 피처 그래픽
2. iOS: audio 백그라운드 모드 심사 노트 + 테스트 계정 시나리오 작성, ASC 프라이버시 URL 입력
3. 7/1 네이티브 빌드 매니페스트 확정: 네이티브 거리 필터 포트(기존 계획) + supportsTablet:false + 알림 아이콘 + 스플래시 + Log.i 게이트 + Maps 키 의사결정 — **네이티브 빌드는 이 1회로 전부 합승**
4. 기기테스트 가능해지는 즉시: #205 스모크 → OTA 배치 발사 → 업데이트 프롬프트/kill-restore 검증

핵심 원칙: 백엔드 재배포 1회(세션 1)로 시한폭탄·과금·치트를 제거하고, OTA 1회(기기 스모크 후)로 클라 위생을 쓸어담고, 네이티브 빌드 1회(7/1)에 모든 바이너리 변경을 합승시킨다. P0 셋 중 어느 것도 기기테스트를 요구하지 않으므로 현재 제약(기기 불가)이 출시 차단 해소를 막지 않는다.
