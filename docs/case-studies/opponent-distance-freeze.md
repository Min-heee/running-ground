# 상대방 거리가 0.00km에서 얼어붙는다

**한 줄 요약** — 증상은 하나였지만 층은 둘이었다. 클라이언트에는 *재시도도 축출도 없는 keyed-slot 래치*(슬롯 획득에 한 번 실패하면 매치가 끝날 때까지 영구 침묵)가 네 군데 있었고, 마지막 발병의 실제 방아쇠는 그게 아니라 *서버의 단일 JSON blob 비대로 인한 progress POST 타임아웃*이었다. 6일 여덟 라운드가 걸렸다. 클라이언트만 판 앞의 일곱 라운드는 실재하는 결함을 고쳤지만, 마지막 날 화면에 보이던 증상의 원인은 아니었다.

---

## 증상

실시간 1:1 대결(듀얼) 중 **상대방 거리가 `0.00km / 측정 대기`에 고정**된다.

| 항목 | 관측 |
|---|---|
| 내 거리 | 정상적으로 증가 |
| 상대 거리 | `0.00km`, 라벨은 `측정 대기` |
| 지속 시간 | 90초 이상, 길게는 매치 내내 |
| 방향성 | **양방향** — 두 폰 모두 상대를 0.00으로 봄 |
| 결정적 단서 | **한쪽 폰 화면을 껐다 켜면 상대 거리가 즉시 나타남** |
| 재현 조건 | 두 폰 모두 화면 켠 채로 대결. 파티룸 1:1에서 특히 잘 남 |

기록 자체는 유실되지 않았다. 완주 저장·승패 판정은 항상 정상이었고 망가진 건 **라이브 표시**뿐이다. 완주 push(`sendPendingFinishPush`)는 문제의 게이트를 애초에 우회하도록 되어 있었기 때문에, 이 버그가 아무리 오래 살아 있어도 사용자의 러닝 기록은 위험하지 않았다. 이건 나중에 중요한 안전 마진이 된다.

"화면을 껐다 켜면 낫는다"는 이 사가 전체를 관통하는 지문이었다. 결국 이 한 줄이 첫 번째 진짜 단서였는데, 알아보는 데 하루가 걸렸다.

---

## 처음 의심한 것 (그리고 왜 틀렸나)

### 진단 시도 전체 흐름

| 회차 | 날짜 | 가설 | 어떻게 반증됐나 |
|---|---|---|---|
| 1 | 07-06 | **"대부분 정상 동작이다"** — 상대가 아직 자기 슬롯을 안 지나 push를 안 했을 뿐 | 다음날 실측이 뒤집음: 두 폰 다 화면 켠 채 90초+ 양방향 0.00 |
| 1b | 07-06 | 서버의 속도 기반 정규화가 초반 거리를 0으로 깎는다 | 클라가 실제로 보내는 slot-anchored elapsed로 시뮬 → 초반 거리를 **절반으로** 깎을 뿐, 0으로 **고정하지 않음** |
| 1c | 07-06 | 30초 체크포인트 표시 게이트가 실데이터를 숨긴다 | 보드 행이 raw live 값을 우선 읽는 게 코드로 확인됨 → 표시 게이트 아님 |
| 1d | 07-06 | 서버가 상대를 0으로 만들어 보낸다 | 실제 대결 참가자는 봇 전용 추정 스냅샷 경로를 타지 않음. 서버는 진짜 0을 정직하게 echo 중 |
| 2 | 07-06 | **렌더 기아** — 직전 성능 최적화(1Hz 티커 quiesce)가 폴러를 굶겼다 | 모든 폴 케이던스가 진짜 OS `setInterval`. 게다가 iOS는 렌더가 계속 돌고 있었는데도 0.00 |
| 2b | 07-06 | 응답 funnel이 mode/matchId를 떨군다 / monotonic guard 오염 / 스타트업 게이트 stuck | 셋 다 코드로 반증(아래) |
| **2c** | 07-06 | **재시도 없는 keyed-slot 래치** | 채택 → 수정 |
| 3 | 07-07 | 고쳤다고 생각했으나 파티런에서 재발 → 링크드 폴에도 같은 래치 | 채택 → 수정 (세 번째 조직) |
| 4 | 07-07 | "서버 공식 01:15 기준" 푸터가 90초 동결 = **내 push가 서버에 안 닿는다** → 하트비트 슬롯 래치 | 채택 → 수정 (네 번째 조직) |
| 5 | 07-08 | 재시도만으론 **살아 있는 침묵 홀더**를 못 이긴다 | 채택 → steal 추가 |
| 6 | 07-09 | 왜 슬롯을 놓치나? → `TrackRunExperience`가 탭+스택 **이중 마운트** | 채택 → 송신 lifeline |
| 7 | 07-10 | 송신 lifeline v1/v2가 실기기에서 **둘 다 실패** | 추측 중단. 온디바이스 진단 패널 투입 |
| 8 | 07-12 | 패널 판독: **클라 기계는 전부 정상, push가 전부 타임아웃** | 서버 store blob 비대 → 수정 |

### 왜 1차 진단이 틀렸나 — "정상 동작"이라는 결론

첫 진단서의 결론은 이랬다:

> 초반 0.00은 대체로 **예상된 동작**이지 데이터 전달 버그가 아니다. 진짜 문제는 `0.00km + 측정 대기`가 **고장난 것처럼 읽힌다**는 것이다.

논리 자체는 견고했다. 실제 대결에서 각 기기는 상대가 자기 슬롯을 넘겨 첫 push를 하기 전까지 보여줄 데이터가 정말로 없고, 봇과 달리 실제 상대에게는 서버 측 추정치가 의도적으로 없다. 그래서 권고는 "문구를 고쳐라(`상대 준비 중`)"였다.

**뒤집은 건 사용자의 실측 한 줄이었다.** "두 폰 다 화면 켜놨는데 90초 넘게 양쪽 다 0.00, 근데 화면 껐다 켜니까 바로 뜬다." 이 문장에서 "화면 껐다 켜면 즉시"가 1차 진단을 통째로 무효화한다 — 데이터가 없어서 안 보이는 게 아니라, **데이터는 있는데 받아오는 루프가 멈춰 있었다**는 뜻이기 때문이다.

교훈은 이거다. 1차 진단은 코드를 정확하게 읽었지만 **실측 없이 "정상"으로 닫으려 했다.** 코드가 설명 가능한 상태와 기기가 실제로 있는 상태는 다르다.

### 왜 2차의 첫 가설(렌더 기아)이 매력적이었고 틀렸나

버그 발생 시점이 성능 최적화 커밋(1Hz 카운트다운 티커 quiesce, 07-03) 직후였다. "렌더를 죽였더니 렌더에 얹혀 있던 동기화가 죽었다"는 서사는 너무 그럴듯했다.

반증은 세 갈래였다:

1. **폴 케이던스는 렌더에 안 얹혀 있다.** 블로킹 폴·링크드 폴·하트비트 keep-alive 전부 실제 `setInterval`이고, 게이트도 `Date.now()` 기준이지 동기화된 렌더 시각 기준이 아니다. 돌고 있는 인터벌은 렌더를 필요로 하지 않는다.
2. **iOS는 렌더가 계속 돌았다.** 내 거리는 모델 상태를 통해 갱신되며 올라가고 있었는데도 상대는 0.00이었다. 렌더 기아만으로는 이 조합이 안 나온다.
3. 그럼에도 quiesce는 무관하지 않았다 — **총알이 아니라 증폭기**였다. quiesce 이전에는 주변 렌더가 우연히 dep을 흔들어 effect를 재실행시켰고, 그게 잃어버린 슬롯에 **우연한 재시도 기회**를 주고 있었다. 최적화가 우연한 복원력을 걷어낸 것이다.

같은 라운드에서 함께 죽은 가설들:

- **funnel이 mode/matchId를 떨군다** → progress POST 응답이 GET과 **같은 빌더**를 쓰는 걸로 확인. 응답에 opponent가 다 들어 있다.
- **monotonic guard 오염** → guard는 equal-or-newer를 허용하고 서버 스탬프만 ref를 전진시킨다. 게다가 오염됐다면 **resume GET도 거절됐어야 하는데** 그건 성공한다 — 결정적 단서와 모순.
- **스타트업 게이트 stuck** → 150ms 실제 타이머다.

### 왜 3~6차가 계속 "또 다른 근본"을 낳았나

2차 수정 이후 같은 증상이 계속 재발했다. 매번 새 조직(organ)이 하나씩 나왔다. **동일한 구조 결함이 네 곳에 복사되어 있었기 때문**이다. 하나를 고쳐도 나머지가 같은 증상을 낸다.

| 조직 | 위치 | 역할 |
|---|---|---|
| 1 | [`src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts`](../../src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts) | 매치 상태 블로킹/안전 폴 (수신) |
| 2 | 로비 스냅샷 폴러 + [`src/features/runs/sync/partyRunSync/useRoomPolling.ts`](../../src/features/runs/sync/partyRunSync/useRoomPolling.ts) | 방 스냅샷 폴 (게스트 카운트다운 입력) |
| 3 | [`src/features/runs/sync/partyRunSync/useLinkedMatchSync.ts`](../../src/features/runs/sync/partyRunSync/useLinkedMatchSync.ts) | 파티룸 링크드 매치 폴 (수신) |
| 4 | [`src/features/runs/sync/useMatchProgressSync.ts`](../../src/features/runs/sync/useMatchProgressSync.ts) | 하트비트 슬롯 (**송신**) |

1~3은 수신 측이라 "상대가 안 보인다"를 직접 만들고, 4는 송신 측이라 "**내가** 상대에게 안 보인다"를 만든다. 4번이 특히 악질이었던 이유는 뒤에서 설명한다.

### 6차의 반전 — 그리고 7차의 완패

6차에서 "왜 슬롯을 놓치나"의 답을 찾았다고 판단했다: `TrackRunExperience`가 **탭(RunningScreen)과 스택(TrackRunScreen)에서 두 번 마운트**되는데 레지스트리는 모듈 전역 싱글톤이고, `freezeOnBlur`가 탭 트리를 얼려버리면 그 인스턴스의 effect cleanup(= 슬롯 release)이 **영원히 실행되지 않는다.** 유령이 슬롯을 무기한 점유한다.

이 진단에 맞춰 "게이트와 싸우지 말고 우회한다"는 송신 lifeline을 냈다. **실기기에서 실패했다.** 보강판(v2)도 실패했다.

여기서 중요한 판단을 했다. **추측을 2연속 틀렸으면 추측을 멈춘다.** 매치 중 화면 하단에 임시 진단 패널을 띄워서 초당 1회 raw 상태를 그대로 렌더하게 만들었다.

```
DIAG v3  FG snap:running 0.13km
ctx:<armed matchId>   hb:ON <hb matchId>
slot:<owner> mine:<me> canSend:Y(1s)
push a:42 ok:40(2s) err:2 <last error>
LL t:80 fire:0(-) skip:normal-path
bgHb:41(2s)
```

판독 규칙을 미리 정해뒀다. `hb:OFF`면 하트비트 미무장, `LL skip:no-ctx`면 armed 컨텍스트 미생성, `slot≠mine`이면 유령 확정, `skip:normal-path`인데 상대가 안 오면 push는 나가는데 수신이 문제.

**실제 판독 결과는 준비해둔 어떤 칸에도 안 들어갔다.**

- 두 폰 다 `ctx` 매치 동일, `slot` = `mine` (유령 아님)
- `canSend:Y` (래치 아님)
- `LL skip:normal-path` (lifeline이 불필요하다고 판단 — 정상 경로가 건강하다는 뜻)
- 그런데 **push가 갤럭시 0/12, 아이폰 2/7 성공. 실패는 전부 "요청 시간이 초과됐어요"**

클라이언트 기계는 전부 정상이었다. 여섯 라운드 동안 고친 것들은 실재하는 결함이었지만, **그날 화면에 보이던 증상의 원인은 아니었다.**

---

## 진짜 근본 원인

이 사가에는 **층이 둘**이었다. 문서와 커밋으로 확정 가능한 범위에서 정직하게 나누면 이렇다.

### 층 A — 재시도 없는 keyed-slot 래치 (클라이언트, 구조적 결함, 코드로 확정)

포그라운드의 모든 매치 동기화 채널이 모듈 전역 keyed-slot 레지스트리를 경유한다. 중복 인스턴스가 같은 일을 두 번 하지 않도록 하는 단일 비행 장치다. 문제는 **진 쪽에게 주는 것**이었다.

```ts
// src/utils/rgKeyedRegistry.ts — acquire()
const activeSlot = activeSlots.get(key);
if (activeSlot) {
  onDuplicate?.({ activeSlot, detail, key, label });
  return {
    acquired: false,
    ownerId: activeSlot.ownerId,
    release: () => {},          // ← no-op. 나이 체크 없음. 축출 개념 자체가 없음
  };
}
```

`startedAtMs`는 기록되지만 **아무도 읽지 않는다.** 슬롯을 회수하는 경로는 오직 하나 — 승자 클로저의 `release()`가 실행되는 것뿐이다.

소비자 쪽은 이 실패 핸들을 그대로 "죽은 핸들"로 변환한다.

```ts
// src/utils/rgPollingRegistry.ts — startRgPollingInterval()
if (!pollingSlot.acquired) {
  return { acquired: false, ownerId: pollingSlot.ownerId, stop: pollingSlot.release };
}
// ↑ 타이머 없음, 재시도 없음. 아래 성공 경로만 setInterval을 건다.
```

그리고 훅들은 여기서 조용히 반환한다. 수정 전 하트비트 슬롯 분기는 문자 그대로 이랬다:

```ts
// src/features/runs/sync/useMatchProgressSync.ts (수정 전)
if (!heartbeatSlot.acquired) {
  return undefined;   // 끝. 마크도, 재시도도, 정리도 없다.
}
```

**여기까지는 "재시도가 없다" 뿐이다. 이걸 영구 침묵으로 만드는 건 세 가지 조합이다.**

1. **effect deps가 매치 내내 불변이다.** 하트비트 슬롯 effect의 deps는 `[activeHeartbeatMatchId, heartbeatEnabled]`. 매치가 `active`인 동안 두 값 모두 변하지 않는다. 즉 "effect가 다시 돌 때까지"는 사실상 "매치가 끝날 때까지"다.
2. **AppState 복귀도 effect를 재실행하지 않는다.** resume은 리렌더를 유발하지만 dep 값이 동일하면 effect는 건너뛴다.
3. **레지스트리에 liveness 개념이 없다.** 소유자를 갱신하는 것도, 죽은 소유자를 축출하는 것도 없다. (코드베이스에 12초 상수가 하나 있긴 한데 그건 **다른 레지스트리** — in-flight HTTP 요청용 단일 비행 레지스트리의 stale-inflight 지평이다. 슬롯 레지스트리와는 무관하다.)

**그럼 왜 화면을 껐다 켜면 나았나.** 이게 이 버그의 서명이었다. 두 경로만 슬롯 게이트를 안 거친다:

```
포그라운드 수신:  poll → [슬롯 게이트] → GET     ← 래치되면 여기서 영구 정지
포그라운드 송신:  hb   → [슬롯 게이트] → POST    ← 래치되면 여기서 영구 정지
─────────────────────────────────────────────
백그라운드 flush:        (게이트 없음) → POST    ← 화면 끄면 여기가 돈다
AppState resume:         (게이트 없음) → GET     ← 화면 켜면 여기가 한 번 돈다
완주 push:               (게이트 없음) → POST    ← 그래서 기록은 안전했다
```

화면 토글은 **치유가 아니라 우회**였다. 그래서 복귀 직후 다시 얼어붙었다.

**왜 한 폰만 꼬여도 양방향으로 보이나.** 래치된 폰은 GET도 POST도 안 한다. 그 폰 화면에서 상대는 당연히 0.00이다. 그런데 **건강한 폰 화면에서도 0.00**이다 — 상대가 진짜로 아무것도 안 보내고 있으니까. 즉 건강한 폰은 정직하게 진실을 표시하고 있었다. 이게 1차 진단의 "상대가 push를 안 한 것"이 절반은 맞았던 이유다.

**증폭기 하나 더.** 아레나는 상대의 raw 거리를 그대로 쓰지 않고 **공통 체크포인트**(참가자들의 서버 elapsed 중 최솟값)에 맞춰 비교한다. 공정성을 위한 설계다. 그런데 **내** push가 죽으면 내 서버 elapsed가 0에서 멈추고, 공통 체크포인트가 0에 고정되고, **GET이 아무리 건강해도 상대의 표시 거리가 0.00에 못 박힌다.** 송신 래치 하나가 수신이 멀쩡한 화면까지 얼려버리는 구조다.

**파티룸에서 유독 잘 났던 이유.** 큐 매칭 듀얼은 별도 키의 블로킹 폴이라는 두 번째 수신 채널을 계속 굴려서 push가 죽어도 어느 정도 버틴다. 파티룸은 그 채널이 꺼져 있어(`source !== 'party-room'`) 중복성이 적었다.

### 층 B — 서버 store blob 비대 → push 타임아웃 (마지막 발병의 실제 방아쇠)

진단 패널이 확정한 것.

백엔드는 애플리케이션 상태를 **단일 `jsonb` blob** 하나에 넣고 있었고, 모든 쓰기가 `mutateStore`를 통과했다. `mutateStore`는 `FOR UPDATE`로 blob 전체를 읽고, 통째로 재직렬화하고, 통째로 `UPDATE`한다. **progress push는 폴이 아니라 쓰기다.** 그래서 2.5초마다 오는 라이브 진행 보고 하나하나가 3MB 덩어리를 잠그고 통째로 다시 쓴다.

드롭릿에서 실측한 숫자:

| 항목 | 값 |
|---|---|
| `app_store` blob 크기 | 3,082 kB |
| 그중 GPS 경로 폴리라인 | 2,880 kB (**93%**) |
| 경로가 들어 있던 런 개수 | 156개 |
| 라이브 매치 push 주기 | 2.5초 |
| 클라이언트 요청 타임아웃 | 5초 |
| 서버 | 1 vCPU |

1 vCPU에서 락 convoy가 생기고, 라이브 매치 요청이 5초 클라이언트 타임아웃을 넘긴다.

**완화 배치는 왜 못 막았나.** 이미 배포돼 있던 완화책은 "직렬화 결과가 바이트 동일하면 `UPDATE`를 건너뛴다"였다. 직렬화 자체는 `FOR UPDATE` 안에서 여전히 두 번(전/후) 일어나고, progress push는 정의상 값을 바꾸므로 애초에 스킵 대상이 아니었다. 줄인 건 WAL이지 CPU가 아니었다.

결정적으로 **이 비용은 런 히스토리에 비례해 자란다.** 그래서 예전에는 멀쩡했고, 데이터가 쌓이다 최근에 임계를 넘은 것이다. "왜 갑자기?"에 대한 답이 여기 있었다.

### 두 층의 관계 — 확정된 것과 확정 못 한 것

**확정된 것:**
- 층 A는 실재하는 구조적 결함이다. 코드로 검증됐다(레지스트리에 축출 없음, deps 불변, resume만 registry-free).
- 층 B는 마지막 발병(07-12)의 원인이다. 진단 패널이 층 A를 **직접 배제**하면서(slot=mine, canSend=Y, LL skip:normal-path) 남은 게 push 타임아웃이었고, 서버 측정이 그 이유를 확정했고, 수술 후 타임아웃이 0이 되면서 닫혔다.

**확정 못 한 것:**
- 07-06~07-09 각 발병이 층 A였는지 층 B였는지는 **사후 확정 불가**다. 그때는 계측이 없었다. 07-06 발병이 래치였다는 건 결정적 단서(registry-free 경로만 살아남음)로 강하게 뒷받침되지만, 1차 진단서 스스로 신뢰도를 "구조적 판정 HIGH(~85%), **어느 슬롯이 실제로 획득에 실패했는지는 MEDIUM(~55%)**"으로 명시했고 그 55%는 끝내 핀되지 않았다.

정직한 결론: **이 사가에는 층이 여럿이었고, 같은 화면 증상을 내는 원인이 최소 둘이었다.** "진짜 근본 원인은 결국 서버였다"고 요약하면 절반은 왜곡이다. 층 A를 안 고쳤어도 층 B를 고치면 그날은 나았을 것이고, 층 B가 없었어도 층 A는 언젠가 같은 화면을 만들었을 것이다.

---

## 해결

### 층 A — 세 가지 패턴, 네 곳에 적용

모든 수정은 **기존 성공 경로를 바이트 단위로 보존**하고 죽어 있던 분기만 건드리는 additive 방식이었다. 문제의 파일 중 상당수가 카운트다운 회귀 이력이 있는 "보호 파일"이라 이 제약이 필수였다.

**패턴 1 — lose branch 재시도 + 재획득 시 catch-up 1회**

```
획득 실패
  → lost-acquire 마크 1회
  → intervalMs 주기 재시도 타이머 무장
  → 재획득 성공 시: 성공 경로와 동일한 bookkeeping 설치 (owner ref 먼저!)
                    → catch-up tick 정확히 1회
                    → 재시도 타이머 정지
  → cleanup: 재시도 타이머든 획득된 핸들이든 살아 있는 쪽을 정지
```

`onReacquired`(bookkeeping)를 catch-up **앞**에 두는 순서가 load-bearing이다. 순서가 뒤집히면 catch-up이 자기 자신의 게이트에서 막힌다. 수신 폴용(`armBlockingMatchStatusPollRetry`)과 송신 슬롯용([`src/features/runs/sync/heartbeatSlotRetry.ts`](../../src/features/runs/sync/heartbeatSlotRetry.ts))이 형제 헬퍼로 갈라진 이유는 레지스트리 표면이 다르기 때문이다 — 폴은 타이머 `stop()`을 돌려주고, 슬롯은 `release()`를 돌려주며 승자는 **송신 전에** 게이트 bookkeeping을 설치해야 한다.

**패턴 2 — lifeline (레지스트리 우회 백스톱)**

재시도만으로는 "슬롯을 쥐고 있는 놈이 영원히 release를 안 하는" 경우를 못 이긴다. 그래서 **검증된 resume 경로를 타이머 모양으로 복제**했다. 레지스트리를 아예 안 거치므로 어떤 래치도 이걸 못 죽인다.

```ts
// src/features/runs/runtime/opponentSyncLifeline.ts
export const OPPONENT_SYNC_LIFELINE_INTERVAL_MS = 5_000;
export const OPPONENT_SYNC_LIFELINE_STALE_AFTER_MS = 8_000;

// 5초마다 ref만 읽는 tick. 백그라운드면 skip(백그라운드 applier 담당),
// 매치가 active가 아니면 skip, in-flight면 skip.
return nowMs - lastAppliedMs > OPPONENT_SYNC_LIFELINE_STALE_AFTER_MS;
```

스탬프는 **수락된 apply에서만** 찍는다. guard가 떨군 스냅샷은 스탬프를 안 찍으므로, funnel 드롭으로 인한 wedge도 lifeline이 잡는다. 건강한 상태에서는 모든 정상 케이던스가 8초 안에 스탬프를 갱신하므로 **요청 0, 렌더 0**이다.

나중에 **송신 버전**도 추가했다. 2.5초 tick이 "active 타겟 있음 + 측정 중 + `canSend == false`(슬롯을 남이 쥠)"일 때만 게이트를 우회해 직접 push한다. `canSend == true`면 no-op(이중 전송 없음), `running`이 아니면 no-op(카운트다운/워밍업 안전), `finished`는 별도 재전송 경로가 담당.

**패턴 3 — stale-owner steal (3중 게이트)**

살아 있으면서 침묵하는 홀더는 재시도로도 못 이긴다. 그래서 레지스트리에 `evict(key)`를 additive로 추가하고, 재시도 tick이 **세 조건이 모두 성립할 때만** 슬롯을 뺏도록 했다.

1. 재시도가 무장된 지 12초 초과 (갓 무장한 상태에선 절대 안 뺏음)
2. 모듈 전역 push-activity 스탬프가 null이거나 12초 이상 오래됨 — **누군가 push 중이면 절대 안 뺏는다**
3. `isViableSender()` — 훔치려는 쪽이 지금 실제로 보낼 수 있어야 함

**3번이 급소다.** 이게 없으면 유령의 살아 있는 재시도 타이머가 *건강하지만 잠시 조용한* 주인의 슬롯을 훔친다. 주인은 성공 분기라 재시도 루프가 없으므로 그 침묵은 영구가 된다 — 정확히 우리가 고치려던 버그의 재생산이다. 게이트가 있으면 유령은 아무것도 못 훔치고, viable↔viable 탈취는 무해한 교대다(모든 인스턴스가 공유 모듈 스냅샷에서 같은 데이터를 보낸다). 최악 치유 시간 약 15.5초. `evict`가 안전한 이유는 `release()`가 ownerId로 신원 가드를 하기 때문이다 — 축출당한 옛 주인의 뒤늦은 release는 새 주인을 절대 못 풀어준다.

### 왜 "근본 치료"(이중 마운트 제거)를 안 골랐나

6차 진단은 진짜 근치가 뭔지 알고 있었다: **가시 인스턴스만 슬롯을 쥐도록 보장하고, `freezeOnBlur`를 뚫는 release를 붙인다**(effect cleanup이 아니라 navigation blur 리스너로). 안 골랐다.

- 그 수술은 **카운트다운 회귀 1순위 위험**이다. 이 코드베이스에는 게스트 카운트다운 스킵 회귀 이력이 여러 건 있고, 마운트/포커스 게이팅을 건드리는 건 정확히 그 지뢰밭이다.
- 방어층은 **원인을 몰라도 작동한다.** 재시도·lifeline·steal은 어느 슬롯이 왜 잃었는지 확정 안 해도 커버한다. 진단 신뢰도가 55%인 상태에서 이건 큰 장점이었다.
- 결과적으로 이 판단은 옳았다. 마지막 발병의 원인은 클라이언트가 아니었기 때문에, 이중 마운트를 위험하게 수술했어도 그날 증상은 안 나았을 것이다.

이중 마운트 자체는 **지금도 남아 있다.** 우회했지 없애지 않았다.

### 층 B — GPS 경로를 hot blob 밖으로

```
before:  app_store(jsonb) = { runs: [ {..., route: [수천 포인트] } × 156 ], ... }
         push/poll → mutateStore → SELECT FOR UPDATE 3MB → 재직렬화 → UPDATE 3MB

after:   app_store(jsonb) = { runs: [ {..., routeStored: true } × 156 ], ... }
         run_routes(run_id PK, user_id, route jsonb)                            ← 여기로 이사
```

- **쓰기**: `mutateStore`/`saveStore`가 mutator 실행 **후** `store.runs`에서 임베디드 경로를 쓸어내고, **같은 트랜잭션**에서 side table에 넣는다. 응답 페이로드는 여전히 경로를 들고 나간다.
- **읽기**: 경로를 반환하는 네 군데(기록 저장 POST — dedupe 재시도 2종 포함, 최근 런, 런 상세, 친구 런 상세)가 주입된 `getStoredRunRoute`로 재부착한다.

```js
// backend/src/lib/runHelpers.mjs
export async function attachStoredRunRoute(run, getStoredRunRoute) {
  if (
    !run
    || typeof run !== 'object'
    || Array.isArray(run.route)
    || run.routeStored !== true
    || typeof getStoredRunRoute !== 'function'
  ) {
    return run;   // 임베디드 경로(dev 드라이버 / 아직 안 옮긴 런)는 그대로 통과
  }

  const route = await getStoredRunRoute(run.id);
  return Array.isArray(route) ? { ...run, route } : run;
}
```

**설계에서 중요한 두 가지.**

- **API 응답이 byte-identical이다.** 패리티 테스트로 못 박았고, 덕분에 **클라이언트 변경이 0이었다** — OTA 없이 백엔드만 재배포하면 끝. 6일 동안 클라이언트를 아홉 번 건드린 사가의 마지막 수술이 클라이언트를 한 줄도 안 건드린 건 우연이 아니라 이 제약을 먼저 걸었기 때문이다.
- **부팅 시 멱등 마이그레이션**이 기존 경로들을 자동 이사시키고 슬림해진 blob을 한 번 저장한다. DDL은 런타임에 lazy하게 보장하고, 생성 실패 시 임베디드 경로로 graceful degrade.

---

## 검증

### 각 단계의 자동 테스트

| 단계 | 테스트 수 변화 |
|---|---|
| 조직 1 (블로킹 폴 + 수신 lifeline) | +11 |
| 조직 2 (로비/방 폴) | 1117 → 1127 (+10) |
| 조직 3 (링크드 폴) | 1127 → 1130 (+3) |
| 조직 4 (하트비트 슬롯) | 1130 → 1133 (+3) |
| steal | 1153 → 1160 (+7) |
| 송신 lifeline | 1197 pass |
| run_routes | 백엔드 전체 스위트 green + 실제 Postgres 16 e2e (저장 → 재부착 → dedupe 재시도 → 3회 재부팅 멱등) |

레지스트리 테스트는 목이 아니라 **실제 레지스트리**를 상대로 짰다(타이머만 주입): 좀비가 키를 쥔 상태 → 재시도 tick이 실패 → 좀비 release → 다음 tick에서 재획득 + catch-up **정확히 1회** + 재시도 타이머 정지 → 낙오 tick은 no-op → cleanup 후 타이머 0개.

### 실기기 최종 확증 (07-12, 두 폰 화면 켠 채, 4개 영상 판독)

| 지표 | 결과 |
|---|---|
| iPhone push | 55회 중 **48 성공** |
| Galaxy push | 26회 중 **20 성공** |
| **타임아웃** | **0** |
| 남은 실패(err) | 폰당 6~7회, 전부 출발 전 0거리 구간의 서버 검증 거절. 이동 시작 후 소멸 |
| 서버 공식 체크포인트 | 10초마다 전진 (00:50 → 01:00 → 01:10 → 01:20 → … → 02:50) |
| 두 기기 값 일치 | 내 값·상대 값 모두 일치 |
| 수신 lifeline | `fire:0`, `skip:normal-path` — **발동 0회. 정상 경로가 건강해서 필요가 없었다** |
| 완주 저장 | 정상 (대결 카드 결과 + 포인트/LP 반영, 결과 화면에서 상대 라이브 페이스 갱신) |
| blob 크기 | 3,082 kB → **204 kB** |

**직전 실패 라운드와 비교하면 push 성공률이 갤럭시 0/12 → 20/26, 아이폰 2/7 → 48/55다.** 그리고 실패 사유가 "타임아웃"에서 "출발 전 0거리 검증 거절"로 바뀌었다 — 성질이 완전히 다른, 무해한 실패다.

`LL fire:0 skip:normal-path`가 특히 좋은 신호다. lifeline이 발동해서 살린 게 아니라 **발동할 필요가 없었다**는 뜻이고, 이건 방어층이 아니라 원인이 제거됐다는 증거다.

확증 후 임시 진단 패널과 계측 기록기를 제거했다. **행동 방어층(재시도·steal·수신/송신 lifeline·stale-fallback)은 전부 유지했다** — 이번 발병의 원인은 아니었지만 각자 실제 커버리지가 있기 때문이다.

---

## 남은 것 / 배운 것

### 남은 것 (정직하게)

- **단일 blob 자체는 그대로다.** 이 백엔드는 의도적으로 "Postgres가 받쳐주는 whole-store" 구조다(라이브 매치 코어 전체를 출시 직전에 관계형으로 재작성하지 않기 위한 선택). GPS 경로를 뺀 건 **가장 크게 자라는 것을 뺀 것**이지 구조를 바꾼 게 아니다. 다음으로 히스토리에 비례해 자라는 필드가 생기면 같은 절벽을 만난다. 진짜 근치는 라이브 매치 상태를 hot blob에서 분리하는 것이고, 그건 아직 안 했다.
- **이중 마운트는 그대로다.** `TrackRunExperience`가 탭+스택에서 두 번 마운트되는 구조는 안 고쳤다. 방어층으로 우회했을 뿐이다. 언젠가 단일 소유자를 구조적으로 보장해야 하고, 그때 카운트다운 회귀 위험을 정면으로 다뤄야 한다.
- **출발 전 0거리 push가 매 런 6~7회 서버 검증에 거절된다.** 코스메틱이다. 서버가 0거리를 허용하거나 클라가 게이트하면 되는데, 급하지 않아 남겨뒀다.
- **07-06~07-09 발병의 층 귀속은 확정 불가다.** 계측이 없었다. 남은 기록으로는 여기까지가 정직한 한계다.
- **수신/송신 lifeline의 케이던스가 비대칭이다** (송신 2.5초 tick vs 수신 5초 tick·8초 stale 문턱). 의도한 것도 있고 그냥 안 맞춘 것도 있다.

### 배운 것

1. **레지스트리를 쓸 거면 lose-path와 liveness를 처음부터 같이 설계하라.** `acquire`만 있고 재시도도 축출도 없는 keyed-slot은 단일 비행 장치가 아니라 **영구 침묵 장치**다. `startedAtMs`를 기록해두고 아무도 안 읽고 있었다는 게 이 결함의 요약이다.

2. **deps가 안정적인 구간에서 effect는 재시도 기회가 아니다.** "언젠가 effect가 다시 돌겠지"는 dep이 실제로 변할 때만 참이다. 매치가 `active`인 동안 그 두 값은 절대 안 변한다 — 즉 "언젠가"는 "매치 끝"이었다.

3. **"화면을 껐다 켜면 낫는다"는 치유가 아니라 우회의 지문이다.** 이 증상을 보면 물어야 할 질문은 "무엇이 고쳤나"가 아니라 **"어느 경로가 게이트를 안 거치나"**다. 게이트를 안 거치는 경로를 찾으면 게이트가 범인이다.

4. **성능 최적화는 우연한 복원력을 걷어낸다.** 1Hz 렌더를 없앤 커밋은 버그를 만들지 않았지만, 버그가 자기를 숨기던 우연한 재시도 기회를 없앴다. 증폭기와 총알을 구분해서 서술하지 않았다면 그 커밋을 롤백하고 진짜 원인을 며칠 더 놓쳤을 것이다.

5. **추측이 2연속 틀리면 계측을 만들어라.** 송신 lifeline v1/v2가 실기기에서 연달아 실패한 시점이 이 사가의 전환점이었다. 화면에 raw 상태를 그리는 임시 패널 하나가, 그전 6일치 코드 추론보다 빨리 답을 냈다. **그리고 패널을 만들 때 판독 규칙을 먼저 써둔 게 결정적이었다** — 준비해둔 어떤 칸에도 안 들어갔다는 사실 자체가 정보였기 때문이다.

6. **증상이 클라이언트에 보인다고 원인이 클라이언트인 건 아니다.** 여섯 라운드를 클라이언트에서만 팠다. 최종 원인은 서버의 데이터 레이아웃이었고, 그것도 "코드가 틀려서"가 아니라 **데이터가 자라서** 발생했다. 히스토리에 비례해 커지는 hot path는 출시 직후엔 안 보이고 몇 달 뒤에 절벽을 넘는다.

7. **원인이 아니었던 방어층도 지울 필요는 없다.** 재시도·steal·lifeline은 그날의 범인이 아니었지만 각자 실재하는 실패 모드를 막는다. 지운 건 계측뿐이다. "원인이 아니었다"와 "쓸모없다"는 다르다.

8. **기록 안전과 표시 정확성을 분리해둔 설계가 6일을 벌어줬다.** 완주 push가 슬롯 게이트를 애초에 우회하도록 되어 있었기 때문에, 이 버그가 아무리 오래 살아 있어도 사용자의 러닝 기록은 한 건도 유실되지 않았다. 급한 불(데이터 유실)과 안 급한 불(라이브 표시)을 구조적으로 갈라놓으면, 디버깅에 쓸 시간이 생긴다.

---

### 관련 코드

- [`src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts`](../../src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts)
- [`src/features/runs/sync/partyRunSync/useRoomPolling.ts`](../../src/features/runs/sync/partyRunSync/useRoomPolling.ts)
- [`src/features/runs/sync/partyRunSync/useLinkedMatchSync.ts`](../../src/features/runs/sync/partyRunSync/useLinkedMatchSync.ts)
- [`src/features/runs/sync/useMatchProgressSync.ts`](../../src/features/runs/sync/useMatchProgressSync.ts)
- [`src/utils/rgKeyedRegistry.ts`](../../src/utils/rgKeyedRegistry.ts)
- [`src/utils/rgPollingRegistry.ts`](../../src/utils/rgPollingRegistry.ts)
- [`src/features/runs/sync/heartbeatSlotRetry.ts`](../../src/features/runs/sync/heartbeatSlotRetry.ts)
- [`src/features/runs/runtime/opponentSyncLifeline.ts`](../../src/features/runs/runtime/opponentSyncLifeline.ts)
- [`backend/src/lib/runHelpers.mjs`](../../backend/src/lib/runHelpers.mjs)
