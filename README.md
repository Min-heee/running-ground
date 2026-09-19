# 러닝그라운드 (RunningGround)

GPS로 러닝을 측정하고, 같은 시각에 같은 거리를 두고 **여러 대의 폰이 동시에 달리며 실시간으로 겨루는** iOS/Android 앱입니다. [App Store](https://apps.apple.com/kr/app/id6762328694)와 [Google Play](https://play.google.com/store/apps/details?id=com.minheee.runnigapp)에 출시해 운영하고 있습니다.

Claude Code 등 AI 코딩 툴과 함께 혼자 만들었습니다. 큰 변경은 병렬 에이전트 반박, 되돌려서 하는 테스트 확인, 실기기 측정으로 검증합니다([어떻게](#ai와-함께-만든-방식)).

<!-- 스크린샷 자리: 매치 아레나 / 실시간 상대 거리 / 결과 화면 / 크루 리그 -->

> 이 저장소는 러닝그라운드의 **전체 소스 코드와 커밋 이력**입니다. 운영에 쓰는 비공개 저장소의 `main` 이력을 옮기면서 회원 닉네임·실명과 키·서버 주소 같은 값만 바꾼 **공개 사본**입니다([무엇을 바꿨나](#공개-사본에-대해)). 처음 보신다면 [아키텍처 문서](docs/architecture.md)와 아래 [사례연구 4편](#엔지니어링-사례연구)부터 읽기를 권합니다. 로컬 실행 방법은 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)에 있습니다.

---

## 무엇을 만들었나

혼자 뛰는 기록 앱과 다른 점은 **두 기기 사이의 시간·거리 합의**가 제품의 본체라는 것입니다. 두 폰의 시계가 수백 ms 어긋나면 "한쪽은 이미 출발했는데 다른 쪽은 아직 3을 세고 있는" 상태가 되고, 거리 측정이 플랫폼마다 다르면 그건 표시 버그가 아니라 **판정 불공정**입니다.

지금 앱에서 쓸 수 있는 기능입니다(2026-09-19 기준, 탭바 순서: 랭킹 · 크루 · 러닝 · 홈 · 친구 · 기록 · 마이).

| 어디서 | 무엇을 |
| --- | --- |
| 러닝 | 혼자 달리기(페이스메이커, 자신과의 대결 포함), 1:1 대결, 그룹 대결(최대 30명), 파티런(친구 초대방, 방장 시작 또는 예약 시작) |
| 랭킹 | 지역 랭킹, LP 기반 랭크 사다리(입문 → 러너 → 페이서 → 레이서 → 엘리트), 월간 우승 별 |
| 크루 | 월간 크루 리그(크루대전). 크루의 월간 거리를 시즌 멤버 수로 나눈 인당 km로 겨룹니다 |
| 친구 | 친구 순위, 달리고 있는 친구를 지도로 보고 음성으로 응원하기, 그라운드(기간을 정해 친구와 포인트를 걸고 달리기) |
| 홈 · 기록 | 이번 달 요약, 주 연속 러닝 뱃지, 월별 러닝 타임라인과 주·월·년 그래프 |
| 공통 | 건강 앱(Apple 건강 · Health Connect) 기록 가져오기, iOS 잠금화면 카드(Live Activity), 부정행위 판정(속도 · 걸음 수 · 보폭) |

2026년 8월 20일 이후 추가한 것:

- **09-18** 크루대전(월간 크루 리그)과 크루 탭. 9·10월은 프리시즌이고, 우승 별은 11월 시즌부터 줍니다.
- **09-11** 기록 탭. 09-14에 월별 타임라인으로 다시 짰고, 09-16에 주·월·년 그래프를 홈에서 기록 탭으로 옮겼습니다.
- **09-10** 예약 파티런. 대기실에서 방장이 시작 시각을 정하고 게스트 전원이 수락하면 그 시각으로 예약 매칭됩니다.
- **09-09 ~ 09-10** 걸음 수 워치독(경고가 두 번 쌓이면 실격)과 보폭 판정(경고와 집계 제외, 실격은 아님). 서버의 차량 판정을 모든 순위표에 반영했습니다.
- **09-05** 주 연속 러닝 뱃지, 지역 우승 별 개편.
- **08-24** 완주 선언을 서버가 거리로 검증합니다. 러닝 도중 앱이 종료돼도, 다시 열면 네이티브가 잰 거리를 기록에 반영합니다.

앱 · 백엔드 · 자체 네이티브 모듈 · 배포 파이프라인이 모두 이 저장소 안에 있고([저장소 구조](#저장소-구조)), 혼자 AI 코딩 툴(주로 Claude Code)과 함께 만들었습니다.

규모 (이 저장소의 커밋 `bf086278` 기준, 2026-09-19, 트리에서 직접 계수):

| 항목 | 수치 |
| --- | --- |
| 커밋 | **1,456개** (2026-03-30 ~ 2026-09-19, 작성자 1인. 병합 커밋 제외 1,290개) |
| Claude 공동 작성 표기 | 병합 제외 1,290개 중 **646개**. 2026년 6월 이후로는 746개 중 **642개(86%)** |
| 테스트 | 파일 **302개**, 케이스 **2,064개** (`node:test`) |

<details>
<summary>코드 규모 자세히</summary>

| 항목 | 수치 |
| --- | --- |
| 앱 코드 | 1,178 파일 / 160,681줄 (`app/` + `src/`의 `.ts`/`.tsx`). 테스트 제외 958 파일 / 124,065줄 |
| └ 그중 `app/` 라우트 | 라우트 57개(관리자·숨은 화면 포함) + 레이아웃 2개 / **391줄**. 화면 구현은 전부 `src/features/*` |
| 백엔드 코드 | 260 파일 / 66,997줄 (`backend/**/*.mjs`). 테스트 제외 179 파일 / 38,404줄 |
| API 경로 / 라우트 모듈 | 107개 / 26개 |
| DB 테이블 | 16개 (PostgreSQL 16) |
| 백그라운드 추적 코드 | `src/features/runs/tracking/`에만 83 파일 |
| 네이티브 코드 | 14 파일 / 4,845줄 (Swift / Kotlin) |

탭바에서 내린 기능(3D 스페이스 탭, 마켓 · 레이스 탭, 경찰과 도둑 모드)의 코드도 저장소에 남아 있어 위 수치에 들어 있습니다.

</details>

상세: **[docs/architecture.md](docs/architecture.md)** — 시스템 구조도, 실시간 매치 시퀀스, 카운트다운 동기화, 백그라운드 위치 추적.

---

## AI와 함께 만든 방식

이 앱은 **AI 코딩 툴과 함께** 만들었습니다. 역할은 이렇게 나눴습니다.

| 누가 | 무엇을 |
| --- | --- |
| 저 | 무엇을 만들지, 어떤 판정이 공정한지, 무엇을 먼저 고칠지, 언제 배포할지. 실기기 측정과 최종 확인 |
| Claude Code | 2026년 5월 중순부터 주 도구. 구현, 원인 추적의 1차 분석, 테스트 작성, 관점별 적대 검증 |
| OpenAI Codex | 2026년 4~5월. 전체 코드 감사와 리팩터링 계획 |

커밋의 `Co-Authored-By: Claude` 표기는 2026년 5월 18일에 처음 붙였고, 6월부터는 거의 모든 커밋에 붙였습니다(6월 이후 병합 제외 746개 중 642개). 그 전 커밋에는 도구 표기가 없습니다. 규칙을 제가 정한 커밋에는 '오너'와 날짜를 적고, 검증 결과(`tsc`, 테스트 통과 수)도 커밋 메시지에 남깁니다. 이 표기는 공개 사본의 커밋 이력에도 그대로 남아 있어 `git log -i --grep="Co-Authored-By: Claude"`로 직접 확인할 수 있습니다.

### AI 결과물을 검증하는 순서

AI가 쓴 코드는 "테스트가 통과한다"에서 멈추지 않습니다. 큰 변경은 아래 세 단계를 거칩니다.

1. **병렬 에이전트 적대 검증.** Claude Code에서 여러 에이전트를 띄워 "이중 적립", "기록 손실", "래치", "회귀" 같은 관점(렌즈)별로 반박하게 하고, 재현되거나 코드로 추적된 지적만 반영합니다. 커밋 메시지에 적대 검증을 기록한 커밋이 97개입니다(첫 기록 2026-06-15). 한 번은 제기된 24건 중 5건만 확정됐습니다. 화면 꺼짐 기록 손실을 고칠 때는 30개 에이전트 검증이 **P0 2건을 포함해 19건**을 확정했고, 1차 설계를 버리고 판별 로직이 필요 없는 뺄셈 설계로 바꿨습니다. P0 중 하나는 쓰던 라이브러리 버전에 필요한 값(`nativeBuildVersion`)이 아예 없어 기능 전체가 조용히 꺼져 있던 문제로, 단위 테스트로는 잡을 수 없는 종류였습니다.
2. **테스트가 정말 지키는지 확인(변이 검증).** 고친 코드를 일부러 되돌려서 테스트가 실패하는지 봅니다. 한 번은 새로 넣은 테스트 3개가 **수정을 되돌려도 통과**했습니다. 두 타임스탬프가 같은 밀리초에 찍혀 잘못된 구현에서도 등식이 성립했던 것입니다. 테스트 속 시계를 명시적으로 고정해 다시 쓰고, 되돌리면 3개 중 2개가 실패하는 것까지 확인했습니다.
3. **실기기 확증.** 두 폰을 나란히 들고 같은 코스를 뛰어 측정값을 비교합니다. 출시한 뒤에도 부정행위 판정을 직접 우회해 봅니다. 걸음 수 판정을 낸 다음 날 자전거를 타 보니 걸음 수 판정을 통과했고, 그래서 보폭 판정(사람 보폭으로는 나올 수 없는 값이면 경고와 집계 제외)을 더했습니다.

### 처음 짐작이 틀렸던 기록

아래 사례연구 4편은 원인 추적을 Claude Code와 함께 했고, 무엇을 믿을지와 실기기 확인은 제가 했습니다. 4편 모두 **처음 의심한 것과 그게 왜 틀렸는지**를 먼저 적었습니다. 코드를 정확히 읽은 진단이 "정상 동작"으로 결론 내렸다가 기기 관찰 한 줄에 뒤집힌 일, "iOS는 OS 한계"라는 판단이 사실은 링크조차 안 된 코드를 근거로 서 있었던 일이 들어 있습니다. AI는 그럴듯한 가설을 빨리 만들어 주지만, 그 가설이 맞는지는 실측으로만 확인할 수 있었습니다.

### 작업 방식

git worktree로 여러 Claude Code 세션을 병렬로 돌리고, 세션 사이의 결정과 함정은 메모리 파일로 이어 붙이며, 판단 근거는 커밋 메시지에 남깁니다.

---

## 저장소 구조

| 경로 | 내용 |
| --- | --- |
| [`app/`](app/) | expo-router 라우트. 파일마다 거의 한 줄짜리 껍데기이고, 화면 구현은 `src/features/*`에 있습니다 |
| [`src/features/`](src/features/) | 기능 모듈 21개(러닝 · 매치 · 크루 · 친구 · 기록 등) |
| [`src/features/runs/tracking/`](src/features/runs/tracking/) | 백그라운드 위치 추적, 거리 원장, 화면꺼짐 구간 정산 |
| [`src/lib/api/`](src/lib/api/) | API 클라이언트(fetch 래퍼 + 타임아웃 + 응답 런타임 가드) |
| [`backend/src/`](backend/src/) | 프레임워크 없는 `node:http` 백엔드. `routes/` · `lib/`(순수 로직) · `repositories/` · `storage/` |
| [`backend/db/schema.sql`](backend/db/schema.sql) | PostgreSQL 스키마 |
| [`modules/`](modules/) | 자체 Expo 네이티브 모듈 3개(Swift/Kotlin) |
| [`targets/live-activity/`](targets/live-activity/) | iOS 잠금화면 카드(Live Activity) Widget Extension |
| [`docs/`](docs/) | 개발하면서 남긴 설계 · 진단 · 감사 문서. 아키텍처 개요는 [`docs/architecture.md`](docs/architecture.md), 사례연구는 [`docs/case-studies/`](docs/case-studies/) |

---

## 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| 앱 | TypeScript 5.9, Expo SDK 54, React Native 0.81.5, React 19.1, New Architecture 활성화 |
| 라우팅 | expo-router 6 (파일 기반), `typedRoutes` |
| 주요 SDK | expo-location, expo-task-manager, expo-sensors, expo-notifications, expo-secure-store, expo-updates, expo-apple-authentication, react-native-maps |
| 데이터 계층 | 자체 API 클라이언트 (fetch 래퍼 + 타임아웃 + 응답 런타임 가드). 외부 상태 관리 라이브러리 없음 |
| 백엔드 | Node.js ≥ 20, **프레임워크 없이 `node:http`** — 런타임 의존성 2개(`pg`, `solapi`) |
| DB / 스토리지 | PostgreSQL 16 + 드라이버 시임(`json` / `postgres` 동일 async 인터페이스) |
| 네이티브 | 자체 Expo 모듈 3개 + iOS Widget Extension (Swift/Kotlin 14파일) |
| 테스트 | `node:test` — 앱은 `tsx --test`, 백엔드는 `node --test` |
| 배포 | EAS Build / EAS Update(OTA), TestFlight · Play Console, Docker Compose(postgres + api + Caddy 자동 TLS) |
| 릴리스 게이트 | `release:check`, `release:gate:*`, `code:quality`, `perf:smells` npm 스크립트 |
| 모니터링 | Sentry |

---

## 엔지니어링 사례연구

코드를 읽기 전에 보면 좋은 문서입니다. 네 편 모두 **처음 의심한 것과 그게 왜 틀렸는지**를 먼저 적고, 그 다음에 진짜 원인을 씁니다. 오진 목록이 본문 분량의 절반을 넘습니다.

### [상대방 거리가 0.00km로 얼어붙는다](docs/case-studies/opponent-distance-freeze.md)
1:1 대결에서 양쪽 폰 모두 상대 거리를 `0.00km / 측정 대기`로 90초 넘게 표시했습니다. 결정적 단서는 "화면을 껐다 켜면 즉시 낫는다"였고, 이게 첫 진단서의 결론("데이터가 없어서 안 보이는 정상 동작")을 통째로 무효화했습니다. 클라이언트에는 **재시도도 축출도 없는 keyed-slot 래치**가 네 군데 있었고 — 슬롯 획득에 한 번 실패하면 매치가 끝날 때까지 영구 침묵 — 네 개를 순서대로 봉합했지만 네 번 다 재발했습니다. 6일 여덟 라운드, 그중 값비싼 실수 하나를 그대로 적었습니다.

관련 코드: [`rgKeyedRegistry.ts`](src/utils/rgKeyedRegistry.ts) · [`heartbeatSlotRetry.ts`](src/features/runs/sync/heartbeatSlotRetry.ts) · [`opponentSyncLifeline.ts`](src/features/runs/runtime/opponentSyncLifeline.ts)

### [진행률 전송이 타임아웃되던 진짜 이유](docs/case-studies/store-blob-gps-routes.md)
위 사가의 결말이자 서버 쪽 이야기입니다. 여섯 번을 고쳐도 증상이 그대로여서 추측을 중단하고 온디바이스 진단 패널을 넣었더니, **클라이언트 기계는 전부 정상이고 progress POST가 전부 타임아웃**이었습니다. 원인은 단일 jsonb "통짜 store" 행이 3MB까지 부푼 것 — 그 중 93%가 그 요청에서 **아무도 읽지 않는 GPS 경로**였고, 2.5초마다 나가는 진행률 POST가 전체 blob 재직렬화 + 행 잠금 뒤에 줄을 서고 있었습니다. 경로를 사이드 테이블로 분리해 닫았습니다.

관련 코드: [`postgresStoreAdapter.mjs`](backend/src/storage/postgresStoreAdapter.mjs) · [`runHelpers.mjs`](backend/src/lib/runHelpers.mjs)

### [화면을 끄면 기록이 사라진다](docs/case-studies/screen-off-record-loss.md)
한 사용자가 화면을 끄고 달렸고, 같은 코스를 이전보다 빨리 뛰고도 목표 5km에 못 미친 기록으로 끝났습니다. 거리 원장이 JS와 네이티브 둘로 갈라져 있었는데 **저장되는 기록은 100% JS 원장**이고, iOS는 화면이 꺼지면 JS 스레드를 재웁니다. 두 달에 걸쳐 다섯 번 오진했습니다 — 그중 하나는 "iOS는 OS 한계라 원래 안 된다"였는데, 나중에 보니 그 판단의 근거였던 네이티브 모듈은 podspec 배포 타깃이 어긋나 **애초에 링크조차 안 되고 있었습니다.**

관련 코드: [`screenOffGapReconcile.ts`](src/features/runs/tracking/background/screenOffGapReconcile.ts) · [`backgroundMatchProgressSync.ts`](src/features/runs/tracking/background/backgroundMatchProgressSync.ts) · [`MatchProgressUploaderModule.swift`](modules/match-progress-uploader/ios/MatchProgressUploaderModule.swift)

### [같은 코스를 나란히 뛴 두 폰이 다른 거리를 기록한다](docs/case-studies/cross-device-distance-parity.md)
안드로이드가 곡선 구간에서 **한 방향으로 일관되게** 짧게 기록했습니다. "필터 체인이 플랫폼마다 다를 것"이라는 가설은 `git grep "Platform.OS"` 한 번으로 죽었는데 — **그 출력 안에 진범이 이미 들어 있었습니다.** 필터가 아니라 그 앞단의 *수집 설정*(`distanceInterval: isIOS ? 0 : 4`)이 곡선을 현(弦)으로 잘라 먹고 있었고, 저는 그 줄을 "필터 분기 없음"의 반례로 세지 않고 눈으로 넘겼습니다. 좁게 정의한 가설이 정확히 그 좁힘 때문에 진범을 6주 더 살렸습니다.

관련 코드: [`locationTask.ts`](src/features/runs/tracking/background/locationTask.ts) · [`locationDistance.ts`](src/features/runs/tracking/background/locationDistance.ts)

---

## 설계에서 반복된 원칙

네 편을 다시 읽고, 실제로 반복된 것만 뽑았습니다.

**1. 코드가 설명 가능한 상태와 기기가 실제로 있는 상태는 다르다.**
네 편 중 세 편에서 첫 진단이 "정상 동작"이었고, 세 번 다 실기기 관측 한 줄이 뒤집었습니다. 코드를 정확히 읽는 것과 실측 없이 사건을 닫는 것은 별개입니다. 마지막 사가에서는 추측을 멈추고 온디바이스 진단 패널을 넣은 것이 결말이었습니다.

**2. 어떤 경로가 안 된다고 결론 내리기 전에, 그 코드가 실제로 실행되고 있는지부터 증명한다.**
"iOS는 OS 한계"라는 판단이 *링크조차 안 된 코드*를 근거로 서 있었습니다. 이후 네이티브 모듈 3개는 전부 `available` 플래그와 `typeof` 가드를 통과해야만 동작하고, 없으면 무동작으로 떨어집니다.

**3. 가설을 반증할 때, 반증한 범위를 정확히 적는다.**
"필터에 플랫폼 분기 없음"은 참이었지만 "거리 차이가 플랫폼 무관"은 거짓이었습니다. 좁은 반증을 넓은 무죄로 읽는 순간 진범이 살아남습니다. 같은 실수의 다른 형태 — "래치는 실재하는 결함"과 "래치가 이 증상의 원인"은 다른 문장인데, 네 번 고치는 동안 그걸 구분하지 않았습니다.

**4. 분기로 판별하지 말고, 산술이 저절로 맞게 만든다.**
화면꺼짐 갭 정산의 크레딧은 `포획한 네이티브 − 정산 시점의 JS`입니다. OS가 밀린 픽스를 재생하든 안 하든 빼는 쪽이 자동으로 맞춰지므로, **재생 여부를 판별할 필요 자체가 없습니다.** 두 원장 병합도 합이 아니라 `max`라서 이중 적립이 구조적으로 불가능합니다([`distanceAccumulatorController.ts`](src/features/runs/tracking/background/distanceAccumulatorController.ts)).

```ts
// src/features/runs/tracking/background/distanceAccumulatorController.ts
// FRESH JS → the fully-filtered JS chain is authoritative; native can never win an interval.
if (jsIsFresh) {
  return safeJsKm;
}
// STALE JS (screen off) → native fills the gap, additively from the last fresh JS baseline.
return Math.max(safeBaselineKm, safeNativeKm);
```

**5. 사용자의 기록은 어떤 버그보다 우선한다.**
판정 모듈이 죽어도 러닝 기록은 살아남도록 전 구간을 예외 포획해 미분류 저장으로 강등시킵니다. 저장 요청을 보내기 *전에* 페이로드를 디스크에 원자적으로 써두고 실패 시 다음 실행에 재전송하며, 서버는 같은 `(userId, startedAt)` 재전송을 중복이 아니라 기존 행 반환으로 처리합니다. 위 0.00km 버그가 6일을 살아 있는 동안에도 완주 저장과 승패 판정은 한 번도 깨지지 않았는데, 완주 push가 문제의 게이트를 애초에 우회하도록 되어 있었기 때문입니다.

**6. 되돌릴 수 있게 넣는다.**
네이티브 거리 병합에는 OTA로 끌 수 있는 킬스위치가 상수로 박혀 있고, 꺼지면 `max(jsKm, 0) === jsKm`이 되어 순수 JS 경로로 떨어집니다. Postgres 전환도 전체 재작성이 아니라 어댑터 교체로 처리해, 드라이버 하나를 바꿔 되돌릴 수 있는 상태를 유지했습니다.

---

## 공개 사본에 대해

운영 중인 서비스의 저장소라 그대로 열 수는 없어서, 비공개 원본의 `main` 이력(2026-09-19까지 커밋 1,460개)을 스크립트로 다시 써서 이 사본을 만들었습니다. 코드 · 문서 · 커밋 메시지 · 작성자 · 날짜는 원본과 같고, 아래 항목만 다릅니다. 그래서 커밋 해시는 원본과 다르고, 문서에 적힌 커밋 해시는 모두 이 저장소 기준입니다.

| 무엇을 | 어떻게 |
| --- | --- |
| 테스트 · 주석 · 커밋 메시지에 나온 회원 닉네임 · 실명 · 운영 사용자 ID, 테스트 속 생년월일 | `회원A` ~ `회원K`, `user-membera` 같은 가명과 임의 값으로 치환 |
| 운영 중 사고를 설명한 주석 · 커밋 메시지에서 특정 회원을 가리키는 부분 | 이름과 기록 수치를 빼고 일반적인 표현으로 바꿈 |
| 앱에 들어가는 클라이언트 키(Google Maps, Firebase)와 Sentry DSN | `<GOOGLE_MAPS_ANDROID_API_KEY>` 같은 자리표시자로 치환 |
| 서버 IP, Firebase 프로젝트 ID, 백업 버킷 이름, EAS 빌드 링크, preview 서버 점검 스크립트의 기본 비밀번호, 로컬 절대 경로 | 자리표시자로 치환 |
| 실측 GPS 좌표가 들어 있던 테스트 한 개 | 좌표 전체를 임의의 다른 위치로 평행이동(점 사이 간격은 유지) |
| `dist-demo/`(웹 빌드 산출물), `google-services.json`, 네이티브 모듈의 gradle 빌드 산출물 | 이력 전체에서 삭제 |

서버 비밀값(DB 비밀번호, SMS · 소셜 로그인 키, 관리자 토큰 등)은 처음부터 환경 변수로만 넣어서 이력에 들어간 적이 없습니다. 치환한 뒤에도 앱과 백엔드의 `npm test`, `tsc --noEmit` 결과는 원본과 같습니다. 이 저장소만으로는 운영 서버에 접속할 수 없고, 직접 빌드하려면 `.env*.example`을 참고해 자기 키를 넣어야 합니다. 앱은 위 스토어 링크에서 설치할 수 있습니다.

---

## 문서 목록

- [docs/architecture.md](docs/architecture.md) — 아키텍처·기능 개요
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — 로컬 개발 환경(원래 저장소 루트에 있던 README)
- [docs/case-studies/opponent-distance-freeze.md](docs/case-studies/opponent-distance-freeze.md) — 상대방 거리가 0.00km로 얼어붙는 문제
- [docs/case-studies/store-blob-gps-routes.md](docs/case-studies/store-blob-gps-routes.md) — 진행률 전송이 타임아웃되던 진짜 이유
- [docs/case-studies/screen-off-record-loss.md](docs/case-studies/screen-off-record-loss.md) — 화면을 끄면 기록이 사라지던 문제
- [docs/case-studies/cross-device-distance-parity.md](docs/case-studies/cross-device-distance-parity.md) — 두 폰이 같은 코스를 뛰었는데 거리가 다른 문제
- [docs/](docs/) — 개발하면서 남긴 설계 · 진단 · 감사 문서(작성 당시 그대로)
