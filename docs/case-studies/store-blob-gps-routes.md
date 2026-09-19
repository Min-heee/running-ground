# 대결 중 상대 거리가 0.00km에서 얼어붙는다

**한 줄 요약** — 클라이언트 동기화 코드에도 진짜 결함이 있었지만, 여섯 번을 고쳐도 증상은 그대로였다. 진짜 원인은 서버였다 — 단일 jsonb "통짜 store" 행이 3MB까지 부풀었고 그 중 93%가 그 요청에서 아무도 읽지 않는 GPS 경로여서, 2.5초마다 나가는 진행률 POST가 전체 blob 재직렬화 + 행 잠금 뒤에 줄을 서다 타임아웃난 것이었다.

---

## 증상

RunningGround는 두 사람이 같은 거리를 동시에 달리며 실시간으로 서로의 진행 상황을 보는 대결 기능을 갖고 있다. 각 기기는 2.5초마다 자기 진행률을 서버에 POST하고(`LIVE_MATCH_SERVER_SYNC_INTERVAL_MS = 2500`, [`src/features/runs/sync/liveMatchCadence.ts`](../../src/features/runs/sync/liveMatchCadence.ts)), 서버는 그걸 공유 세션에 기록한 뒤 응답과 폴링으로 상대 값을 내려준다.

증상은 이랬다.

- 파티룸 1:1 대결에서 **두 폰 모두 화면을 켠 채**, 각자 자기 거리는 정상적으로 올라가는데 상대는 "측정 대기 0.00km"에 고정된다.
- **양방향**이다. A 화면에서도 B가 0.00, B 화면에서도 A가 0.00.
- 한쪽 폰 화면을 껐다 켜면 상대 값이 **한 번 튀어 오른 뒤 다시 얼어붙는다.**
- 대결 화면은 방-연동 플레이스홀더("대결 정보를 맞추는 중")에 머물고 공식 대결로 승격되지 않는다.

재현 조건은 끝내 "확정적"이 되지 못했다. 큐 매칭 대결에서는 잘 되다가 파티룸 대결에서 자주 났고, 어떤 날은 90초 넘게 얼었고 어떤 날은 멀쩡했다. 이 재현 불안정성은 나중에야 의미가 드러난다 — **원인이 클라이언트 상태가 아니라 서버에 쌓인 데이터의 양**이었기 때문이다.

이 버그는 2026-07-05에 처음 진단돼 2026-07-12에 닫혔다. 그 사이 배포한 수정이 일곱 번이고, 앞의 여섯 번은 전부 클라이언트를 고쳤고 전부 증상을 못 건드렸다.

---

## 처음 의심한 것 (그리고 왜 틀렸나)

### 오진 1 — "버그가 아니다. 상대가 진짜로 안 보내고 있다"

첫 진단의 결론은 "대부분 정상"이었다. 상대 행의 `liveUpdatedAt`이 `null`이니 서버는 정직하게 "아직 받은 게 없다"를 내려주고 있었고, 화면은 그걸 그대로 그리고 있었다.

**반증**: 다음 날 실기기 재현이 이걸 뒤집었다. 두 폰 다 화면을 켠 채 90초 넘게 양방향 0.00인데, 화면을 껐다 켜는 순간 즉시 상대 값이 들어왔다. 전송도 서버도 살아 있는데 포그라운드 수신 루프만 죽어 있다는 뜻이었다.

이 오진의 교훈은 그 자체로 쓸모가 있었다. "상대가 안 보냈다"는 **건강한 폰 입장에서는 참인 서술**이었다. 한 대만 고장 나도 양방향 증상이 나온다.

### 오진 2 — "렌더 기아다. 리렌더 정지 최적화가 회귀를 냈다"

직전에 매치 화면의 1Hz 전체 트리 리렌더를 걷어내는 최적화를 배포했다(`b32cbcd`, 7/3). 타이밍이 딱 맞았다. 렌더가 멈춰서 동기화 루프가 굶어 죽은 것 아닌가?

**반증**: 포그라운드 케이던스를 하나씩 다 열어봤더니 전부 진짜 OS 타이머였다. 블로킹 폴은 `rgPollingRegistry.ts`의 `setInterval`, 링크드 폴도 `setInterval`, 하트비트 킵얼라이브도 raw 1s `setInterval`이고 게이트는 `syncedNowMs`가 아니라 `Date.now()`로 판정한다. **한 번 걸린 인터벌은 렌더가 없어도 발화한다.** 결정타는 iOS였다. iOS는 리프 스토어 라우팅이 안드로이드 전용이라 런타임 모델이 계속 렌더되고 있었는데(자기 거리는 모델 상태로 올라갔다) 그럼에도 상대는 0.00이었다.

판정: **quiesce는 총알이 아니라 증폭기.** 이전에는 주변 렌더가 우연히 재시도 기회를 만들어주고 있었을 뿐이다.

### 오진 3 — "재시도 없는 슬롯 걸쇠(latch)"

포그라운드 수신 경로 전부가 모듈 전역 keyed-slot 레지스트리를 통과하는데, `acquire`에 실패하면 **타이머도 재시도도 없는 dead handle**을 돌려주고 있었다.

```ts
// src/utils/rgKeyedRegistry.ts — 실패 분기가 죽은 핸들을 반환한다
return { acquired: false, release: () => {} };
```

effect deps는 매치가 `active`인 동안 전부 불변이므로, "effect가 다시 돌 때까지"는 곧 "매치가 끝날 때까지"였다. 화면 껐다 켜기가 낫는 것처럼 보인 이유도 설명됐다 — AppState 복귀 경로만 레지스트리를 안 거치는 유일한 채널이었다.

이건 **실제로 존재하는 결함이었다.** 그래서 네 개의 "기관"을 순서대로 봉합했다.

| 커밋 | 봉합한 슬롯 | 결과 |
|---|---|---|
| `1e8e5ab2` (7/6) | 블로킹 상태 폴 + 수신 lifeline 신설 | 재발 |
| `9a11ceb7` (7/7) | 링크드 매치 폴의 lose branch | 재발 |
| `1a176a6e` (7/7) | 하트비트 슬롯 lose branch | 재발 |
| `9bfacfbd` (7/8) | 죽은 침묵 소유자로부터 슬롯 탈취(steal) | 재발 |

**반증**: 네 번 고쳤는데 네 번 다 재발했다. 이 시점에서 "걸쇠는 진짜지만 이 증상의 원인은 아니다"를 의심했어야 했는데, 매번 "이번엔 마지막 기관"이라는 서사가 그럴듯해서 계속 갔다. 이게 이 사가에서 내가 한 가장 값비싼 실수다.

### 오진 4 — "유령 인스턴스가 슬롯을 쥐고 있다"

7/9 진단은 꽤 정교했다. `TrackRunExperience`가 탭(`RunningScreen`)과 스택(`TrackRunScreen`) 양쪽에서 **두 번 마운트**되는데, 레지스트리는 모듈 전역 싱글톤이다. 탭→스택 전환 창에서 불필요한 탭 인스턴스가 `match-progress:<matchId>` 키를 선점하고, `freezeOnBlur`가 그 트리를 얼려버리면 effect cleanup(=release)이 영영 안 돈다. 보이는 인스턴스의 push는 전부 `duplicate-heartbeat-owner`로 막힌다.

파티룸에서만 유독 심한 이유까지 맞아떨어졌다. 큐 매칭 대결은 별도 키의 블로킹 폴이라는 두 번째 수신 채널이 있어서 push가 죽어도 버티는데, 파티룸은 그 채널이 꺼져 있다.

이 가설로 두 번 더 배포했다. 걸쇠와 싸우지 말고 **우회**하자는 발상이었다.

- `37ff93eb` — send lifeline v1: `canSend` 게이트를 무시하고 2.5초마다 직접 전송
- `22bd14bd` — send lifeline v2: armed 컨텍스트의 matchId로 보내 id 불일치까지 커버

**반증**: 둘 다 실기기에서 실패했다. 증상 패턴이 조금도 안 변했다.

### 여기서 추측을 중단했다

두 번 연속으로 "그럴듯한 구조적 근본 원인"을 찾아 고쳤는데 증상이 그대로였다. 문제는 가설이 아니라 **증거의 해상도**였다. 영상 녹화로는 체인의 어느 마디에서 죽는지 구분이 안 됐다.

- armed 컨텍스트가 아예 안 만들어진 건가?
- 보이는 인스턴스에 하트비트가 안 걸린 건가?
- 슬롯을 유령이 쥔 건가?
- lifeline이 스킵하는 건가, 스킵한다면 왜?
- push는 나가는데 에러가 나는 건가?

---

## 진짜 근본 원인

### 진단 패널을 만들어 붙였다 (`b7c8d08e`)

매치 중 화면 하단에 1초마다 갱신되는 임시 패널을 붙였다. 계측은 전부 fire-and-forget 모듈 스토어 쓰기라 동작에 영향이 없다(`src/features/runs/sync/matchSyncDiagnostics.ts`, 138줄). 패널은 props 없이 모듈만 읽고, 매치 밖에서는 `null`을 렌더하고, `pointerEvents="none"`이다.

```
DIAG v3 FG snap:running 0.13km
ctx:…8자리 hb:ON …8자리
slot:3 mine:3 canSend:Y(1s)
push a:42 ok:40(2s) err:2 <last error>
LL t:80 fire:0(-) skip:normal-path
bgHb:41(2s)
```

판독표를 미리 정해두고 실기기 테스트에 들어갔다. `hb:OFF`면 보이는 인스턴스가 매치를 인식 못 한 것, `LL skip:no-ctx`면 armed 컨텍스트 미생성, `slot≠mine`이면 유령 확정, `push err` 반복이면 HTTP 문제.

계측 자체도 최소 침습으로 짰다. push 성공/실패 카운터는 예외를 다시 던져 호출자 의미를 보존한다.

```ts
// src/features/runs/sync/useMatchProgressSync.ts (b7c8d08e에서 추가, 나중에 제거)
recordMatchSyncPushAttempt();
try {
  nextStatus = await heartbeatRequest.promise;
} catch (pushError) {
  recordMatchSyncPushErr(pushError instanceof Error ? pushError.message : String(pushError));
  throw pushError;   // 호출자의 에러 처리는 그대로
}
recordMatchSyncPushOk();
```

### 패널이 읽어준 것

| 지표 | 오진들이 예측한 값 | 실제 값 | 해석 |
|---|---|---|---|
| `ctx` vs `hb` matchId | 불일치 (v2 가설) | **동일** | id 발산 아님 |
| `slot` vs `mine` | 불일치 (유령 가설) | **동일** | 유령 아님, 슬롯 정상 소유 |
| `canSend` | `N` (걸쇠 가설) | **`Y`** | 게이트에 막힌 게 아님 |
| `LL skip` | `no-ctx` / `snap:*` | **`normal-path`** | lifeline이 불필요하다고 판단 = 정상 경로 건강 |
| `push a/ok/err` | ok 다수 | **갤럭시 0/12, 아이폰 2/7** | **여기다** |
| `last error` | — | **"요청 시간이 초과됐어요"** | 클라이언트가 아니라 서버 |

클라이언트 기계는 전부 정상 동작 중이었다. 진행률 POST가 그냥 **타임아웃**나고 있었다.

### 서버를 재보니

프로덕션 DB에서 직접 측정했다(커밋 `fb5aa08d` 메시지에 기록):

- `app_store` jsonb blob: **3082 kB**
- 그 중 **2880 kB (93%)** 가 **156개 런의 GPS 경로 폴리라인**

RunningGround 백엔드는 Postgres로 옮기는 중간 단계에서 "통짜 store" 모델을 쓰고 있었다. `app_store` 테이블의 **행 하나**에 users / sessions / runs / friendships / … 전부가 하나의 jsonb로 들어간다. 그리고 모든 쓰기는 이 경로를 지난다.

```js
// backend/src/storage/postgresStoreAdapter.mjs — 원래 mutateStore의 뼈대
const store = locked.rows[0].data;          // FOR UPDATE로 잠근 전체 blob
const result = mutator(store);

await client.query(
  'update app_store set data = $1, updated_at = now() where id = $2',
  [serializeStore(store), STORE_ROW_ID],     // 전체 blob 재직렬화 + 통째 UPDATE
);
```

7/3의 완화(`eac5c457`)가 여기에 변경 감지 비교를 덧대서 읽기 전용 폴은 UPDATE를 건너뛰게 됐지만, **실제로 값을 쓰는 진행률 POST는 여전히 이 경로를 그대로 지났다.**

연결하면 이렇게 된다.

```
러너 2명 × 2.5초마다 진행률 POST + 상태 폴 여러 개
        ↓
      mutateStore
        ↓
  BEGIN; SELECT ... FOR UPDATE      ← 전 요청이 이 한 행에 직렬화
        ↓
  JSON.parse / mutate / JSON.stringify(3MB)   ← 93%가 아무도 안 읽는 GPS 좌표
        ↓
  UPDATE app_store SET data = <3MB>           ← TOAST 재기록 + WAL 폭증
        ↓
  COMMIT
        ↓
  1vCPU에서 lock convoy → 클라이언트 HTTP 타임아웃(5s)
```

**왜 하필 그때 터졌나.** 이 비용은 러닝 히스토리에 비례해서 자란다. 156개 런이 쌓이면서 최근에 임계를 넘은 것이다. "예전엔 됐는데"가 참이었고, 그래서 코드 회귀를 찾던 나는 계속 헛다리를 짚었다. 데이터가 자라서 생긴 병은 diff에 안 나온다.

**경로가 왜 그렇게 큰가.** 6월에 이미 관련 사고가 있었다. 7km/40분 런 저장이 413(`요청 본문이 너무 커`)으로 실패해서, 클라이언트가 업로드 경로를 **최대 1500 포인트로 다운샘플**하도록 고쳤다(`90aeb7f7`). 다운샘플 뒤에도 상한을 꽉 채운 런은 약 200KB고, 156개의 평균은 런당 약 18kB다. 그게 누적된 결과가 2880 kB다.

**완화는 이미 배포돼 있었는데도 못 버텼다.**
- `6f42a1f4` (7/3, 사전 감사 P0 배치): json 스토어의 변경 감지 저장 스킵
- `eac5c457` (7/3): 같은 기법을 **실제 프로덕션 드라이버인 postgres 어댑터**로 이식. 첫 배포 후에야 프로덕션이 `BACKEND_STORE_DRIVER=postgres`로 돈다는 걸 확인했고, json 쪽만 고쳐놨었다는 걸 알았다.
- `ff686d0e` (7/4): 폴 읽기를 락 없이 — 배포 후 되돌림(`8eadd189`)

이 셋은 **UPDATE 횟수**를 줄였다. 하지만 blob 자체가 임계를 넘은 뒤에는, 쓰기 한 번의 비용이 이미 감당 범위 밖이었다. 줄이려던 것이 틀렸던 게 아니라, 줄여야 할 것이 하나 더 있었다.

### 이게 왜 '근본'인가

걸쇠도 진짜 결함이었는데 왜 blob을 근본으로 보는지 정리해 둔다.

- **판별 순간의 상태가 다르다.** 패널을 읽던 그 세션에서 걸쇠는 걸려 있지 않았다. 슬롯은 내 것이었고, `canSend:Y`였고, matchId도 일치했고, lifeline은 "정상 경로가 건강하다"고 보고했다. 클라이언트는 보낼 수 있었고 실제로 보냈다. **그런데 그 POST가 서버에서 타임아웃났다.**
- **고친 뒤 클라이언트를 더 안 건드렸다.** `fb5aa08d`은 서버 전용 커밋이고 클라이언트 변경이 0줄이다. 그 배포 하나로 타임아웃이 0이 됐다.
- **재현 불안정성이 설명된다.** 걸쇠 가설로는 "왜 어떤 날은 멀쩡한가"가 안 풀린다. 히스토리 누적으로 자라는 비용은 임계 근처에서 정확히 그렇게 행동한다.

정직하게 남는 confound 하나: 패널을 읽은 시점엔 이미 걸쇠 수정 네 건이 배포된 뒤였다. 그래서 "걸쇠는 원래 안 걸렸다"가 아니라 **"판별 시점에 걸쇠는 배제돼 있었고, 그 상태에서도 증상이 그대로였다"**가 정확한 서술이다. 걸쇠는 실재한 결함이었고, 이 증상의 원인은 아니었다.

---

## 해결

### 무엇을 바꿨나 — `run_routes` 사이드 테이블 (`fb5aa08d`)

핵심 관찰: **GPS 경로는 표시 전용이다.** 승패 판정, LP, 포인트 계산은 경로를 절대 읽지 않는다(코드로 확인). 거리·페이스·고도·케이던스는 전부 별도 필드로 저장되고, 백엔드는 경로에서 거리를 재계산하지 않는다(`validateTrackedRoute`는 검증만 한다). 즉 hot path가 매 요청마다 재직렬화하고 있던 2880 kB는 **그 요청 중 아무도 안 보는 데이터**였다.

그래서 경로만 별도 테이블로 뺐다.

```sql
-- backend/db/schema.sql
create table if not exists run_routes (
  run_id  text primary key,
  user_id text,
  route   jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists run_routes_user_idx on run_routes (user_id);
```

**쓰기 경로.** `mutateStore`/`saveStore`가 blob에 박힌 경로를 쓸어 담아 사이드 테이블에 넣고, 런에는 마커만 남긴다.

```js
// backend/src/storage/postgresStoreAdapter.mjs
extracted.push({ runId: run.id, userId: ..., route: run.route });
delete run.route;
run.routeStored = true;   // 다른 필드는 전부 그대로
```

순서가 중요하다. 스윕은 **mutator가 끝난 뒤**에 돈다. mutator가 방금 만든 응답 payload는 여전히 embedded 경로 배열을 참조하고 있어야 하기 때문이다. 그리고 insert와 blob UPDATE는 **같은 트랜잭션**에 있다.

```js
const extractedRoutes = routeSideTableReady ? extractEmbeddedRunRoutes(store) : [];
const afterSerialized = serializeStore(store);

if (extractedRoutes.length > 0) {
  await insertRunRoutes(client, extractedRoutes);   // 같은 트랜잭션
}
if (afterSerialized !== beforeSerialized) {         // eac5c457의 변경 감지 스킵은 유지
  await client.query('update app_store set data = $1, updated_at = now() where id = $2', ...);
}
```

이러면 크래시 창이 마커만 남기고 사이드 행을 잃는 상태를 만들 수 없다 — 둘 다 커밋되거나 둘 다 롤백된다.

**읽기 경로.** 경로를 실제로 돌려주는 표면은 네 곳뿐이다: 기록 저장 POST(중복 방지 재시도 2종 포함), `GET runs/latest`, `GET runs/:id`, 친구 기록 상세. 여기에만 주입된 `getStoredRunRoute`로 재부착한다.

**부팅 마이그레이션.** 기존 156개 경로는 서버 부팅 시 멱등 마이그레이션이 옮긴다. 요청을 받기 전에(모듈 초기화 top-level await) 한 번 돌고, 다시 돌면 뺄 게 없으니 UPDATE 자체가 안 나간다.

### 왜 이 방법인가 — 무중단 + 클라이언트 무변경이 제약이었다

이건 이미 출시 임박한 프로덕션 서버였고, 앱 스토어 심사를 거쳐야 하는 클라이언트를 건드리지 않는 게 절대 조건이었다. 그래서 설계 목표를 하나로 잡았다: **API 응답 바이트가 수술 전후로 동일할 것.**

까다로운 지점은 키 순서였다. 기록 저장 중복 방지 재시도 경로는 payload를 **동기 mutator 안에서** 조립하기 때문에 비동기 사이드 테이블 조회를 그 안에서 못 한다. 그래서 이미 만들어진 payload에 경로를 다시 끼워넣는 헬퍼를 따로 뒀는데, 단순히 스프레드로 붙이면 `route` 키가 끝으로 밀려서 직렬화 결과가 달라진다.

```js
// backend/src/lib/runHelpers.mjs — buildRunDetail의 정규 키 위치에 삽입한다
for (const [key, value] of Object.entries(runPayload)) {
  if (!inserted && (key === 'startedAt' || key === 'endedAt' || key === 'matchResult')) {
    rebuilt.route = route;   // 스탯 필드 다음, startedAt 앞
    inserted = true;
  }
  rebuilt[key] = value;
}
```

**고르지 않은 대안들.**

| 대안 | 왜 안 골랐나 |
|---|---|
| 경로를 아예 저장 안 함 | 기록 상세의 지도가 제품 핵심 화면 중 하나다. 기능 삭제는 답이 아니다 |
| 오래된 런의 경로만 만료 삭제 | 증상은 늦추지만 상한이 없다. 히스토리가 늘면 다시 임계를 넘는다 |
| 통짜 store 모델을 지금 해체 | 이게 진짜 정답이고 [`docs/postgres-transition-plan.md`](../../docs/postgres-transition-plan.md)에도 그렇게 적혀 있다. 하지만 repository 8개를 SQL로 재작성하는 일이라 출시 직전에 착수할 크기가 아니다 |
| 클라이언트 타임아웃을 늘림 | 증상만 가린다. 락 대기는 그대로 자란다 |
| 서버 스펙 업 | 비용이 히스토리에 비례해 계속 자라는 구조는 그대로다 |

**드라이버별 분기.** json 파일 드라이버(개발용)는 경로를 embedded로 유지한다. 분리는 postgres 드라이버에만 적용된다. 그리고 DDL 생성 실패는 **우아하게 퇴화**한다 — 사이드 테이블을 못 만들면 경로를 blob에 그대로 두고(수술 전 동작) 다음 호출에서 재시도한다. 테이블이 없다고 모든 쓰기가 실패하는 것보다 낫다.

---

## 검증

### 1. 응답 바이트 동일성 테스트

가장 중요한 테스트는 한 줄짜리다.

```js
// backend/src/repositories/runsRepository.test.mjs
const embedded   = buildRunDetail({ ...baseRun, route }, 12.3, undefined, metrics);
const slim       = buildRunDetail({ ...baseRun, routeStored: true }, 12.3, undefined, metrics);
const reattached = { ...slim, run: attachRouteToRunPayload(slim.run, route) };

assert.equal(JSON.stringify(reattached), JSON.stringify(embedded));
```

실제 `buildRunDetail`을 쓰고, `matchResult`·케이던스·고도까지 채운 런으로 돌린다. 이게 통과하는 한 클라이언트는 수술을 알아챌 방법이 없다.

### 2. blob에 좌표가 남아 있지 않다는 것을 직접 확인

```js
// backend/src/storage/postgresStoreAdapter.test.mjs
assert.doesNotMatch(database.state.appStoreData, /37\.5665/);  // 좌표가 blob에 없다
assert.equal(storedRun.routeStored, true);
assert.equal(storedRun.route, undefined);
assert.equal(storedRun.distanceKm, 5.2);                        // 다른 필드는 생존
```

마이그레이션 멱등성도 카운터로 못 박았다. 1회차 `migratedRuns: 2` + `updateCount: 1`, 2회차 `migratedRuns: 0` + `updateCount: 1` (증가 없음 = UPDATE가 안 나감). 승패 필드(`matchResult.resultTone`)가 스윕 후에도 살아 있는지도 별도로 검사한다.

### 3. 실 Postgres 16 e2e

저장 → 재부착 → 중복 방지 재시도 → 부팅 3회 멱등까지 실제 DB로 확인. 백엔드 전체 스위트 green.

### 4. 실기기 필드 테스트 (2026-07-12, 두 폰 4개 영상)

진단 패널을 **일부러 남겨둔 채로** 배포하고 재대결했다.

| 항목 | 수술 전 (7/10 판독) | 수술 후 (7/12 판독) |
|---|---|---|
| 아이폰 push 성공 | 7회 중 2회 | **55회 중 48회** |
| 갤럭시 push 성공 | 12회 중 0회 | **26회 중 20회** |
| 타임아웃 | 전부 | **0회** |
| 서버 공식 체크포인트 | 동결 | 10초마다 전진(00:50 → 01:00 → 01:10 → …) |
| 두 기기 표시값 일치 | 아니오 | 예 |
| lifeline | 발동 필요 | `fire:0 skip:normal-path` (정상 경로 건강) |
| 완주 저장 | — | 정상 (대결 카드 + 포인트/LP 정산) |

남은 실패는 기기당 6~7건이고 전부 **출발 전 0.00km 구간의 서버 검증 거절**("러닝 거리를 입력해줘")이었다. 이동 시작 후에는 사라지고 타임아웃과 무관하다.

blob 크기는 커밋 기준 "약 3MB → 수십 kB"로 기록됐고, 배포 직후 현장에서 확인한 값은 204 kB였다.

### 5. 계측 제거 (`eb0bec53`)

패널과 기록기를 전부 걷어냈다(-271줄). 방어층(슬롯 탈취, send lifeline, stale fallback)은 남겼다. 이번 발병의 원인은 아니었지만 각자 실제 커버리지가 있는 결함을 고친 것이기 때문이다.

---

## 남은 것 / 배운 것

### 남은 것 (정직하게)

- **통짜 store 모델 자체는 그대로다.** 경로를 뺀 건 가장 큰 덩어리 하나를 뺀 것이지, `app_store` 단일 행에 모든 쓰기가 직렬화되는 구조는 살아 있다. 다음 병목은 다음으로 큰 배열이 될 것이다. 바로 다음 날 스텝 사다리 부하 하네스(`c6b4e0cb`)로 재보니 무릎이 동시 대결 40개(로컬 M3 Pro 기준)였고, 80에서 붕괴 모드가 나왔다.
- **포화 시 실패 양상은 전면 장애였다.** 후속 수술(`88412817`)에서 확인한 바로는, 행 잠금을 기다리는 writer가 각자 커넥션 풀 슬롯을 쥐고 있어서 동시 러너 160명에서 홈·로그인·헬스체크까지 전부 10초 타임아웃(에러율 89%)이었다. Node 레벨 쓰기 뮤텍스로 waiter가 풀 슬롯을 안 쥐게 바꾸자 같은 조건에서 읽기 p95 25ms / 에러 0이 됐다. 이건 별개의 사례연구감이다.
- **백업 정책이 갈라졌다.** blob 파일 백업에는 이제 경로가 빠진다(표시 전용이고 `pg_dump`가 사이드 테이블을 커버한다). 구버전으로 롤백하면 기록 상세의 경로만 안 보인다 — 판정·포인트와는 무관하다.
- **출발 전 0거리 push가 매 런 6~7회 서버 검증에 거절당한다.** 코스메틱이고 급하지 않다. 손대려면 서버가 0거리를 허용하거나 클라이언트가 게이트를 걸어야 한다.

### 배운 것

**1. 증상이 클라이언트에서 보인다고 원인이 클라이언트에 있는 건 아니다.** 일주일 동안 여섯 번의 클라이언트 수술을 했고 어느 것도 이 증상을 고치지 못했다. 진단 패널이 붙은 지 이틀 만에 진범이 나왔다. 처음부터 "push가 실제로 나가고 있고 서버가 200을 주는가"를 봤다면 며칠을 아꼈다.

**2. 계측을 만드는 비용은 추측하는 비용보다 싸다.** 패널은 계측 모듈 138줄 + UI 87줄, 반나절짜리다. 그 앞의 오진 두 건은 각각 배포와 실기기 세션을 소모했다. 그리고 계측은 **판독표를 먼저 정하고** 만들어야 한다 — "hb:OFF면 A, slot≠mine이면 B"를 미리 적어둔 덕에 사진 한 장에서 결론이 나왔다.

**3. 임시 계측은 제거 조건을 함께 커밋한다.** 진단 패널은 커밋 메시지와 파일 상단 주석 양쪽에 "파티룸 상대 동기화 동결이 닫히면 제거"라고 적어두고 시작했고, 실제로 그 조건이 충족된 날 제거됐다. 조건을 안 적으면 임시 코드는 영구 코드가 된다.

**4. 데이터가 자라서 생긴 병은 diff에 없다.** "언제부터 안 됐나"를 물으면 자연히 최근 커밋을 뒤지게 된다. 하지만 원인이 "런 156개"였다면 어떤 커밋에도 없다. **"예전엔 됐는데 지금은 안 된다"의 원인 후보에 코드 변경만 두지 말고 데이터 크기를 항상 같이 올려야 한다.**

**5. 완화를 세 번 배포했는데 못 버텼다면, 완화의 축이 틀렸을 수 있다.** 변경 감지 스킵도, 락 프리 읽기도 전부 "쓰기 횟수"를 줄이는 방향이었다. 정작 줄여야 했던 건 **쓰기 한 번의 크기**였다. 같은 축으로 세 번 밀었는데 안 되면 축을 의심할 때다.

**6. 계획서가 이미 답을 알고 있었다.** [`docs/postgres-transition-plan.md`](../../docs/postgres-transition-plan.md)에는 수술 몇 달 전부터 이렇게 적혀 있었다.

> PostgreSQL은 JSON 파일처럼 "전체 store를 읽고 통째로 저장"하는 방식이 맞지 않다.

알고 있었고, 적어뒀고, 그럼에도 임시 구조로 출시 직전까지 갔다. 임시 구조에는 만료일을 붙여야 하고, 만료일이 지났는지 알려주는 건 문서가 아니라 **지표**여야 한다. 그래서 후속 작업(`88412817`)에서 blob 크기와 락 대기 시간을 상시 경고 로그로 내보내게 했다 — 다음번엔 사용자 제보가 아니라 그래프가 먼저 알려주도록.

---

### 관련 코드

- [`src/features/runs/sync/liveMatchCadence.ts`](../../src/features/runs/sync/liveMatchCadence.ts)
- [`src/utils/rgKeyedRegistry.ts`](../../src/utils/rgKeyedRegistry.ts)
- [`src/features/runs/sync/useMatchProgressSync.ts`](../../src/features/runs/sync/useMatchProgressSync.ts)
- [`backend/src/storage/postgresStoreAdapter.mjs`](../../backend/src/storage/postgresStoreAdapter.mjs)
- [`backend/src/lib/runHelpers.mjs`](../../backend/src/lib/runHelpers.mjs)
- [`backend/src/repositories/runsRepository.test.mjs`](../../backend/src/repositories/runsRepository.test.mjs)
- [`backend/src/storage/postgresStoreAdapter.test.mjs`](../../backend/src/storage/postgresStoreAdapter.test.mjs)
