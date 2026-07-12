# native health integration

Updated 2026-07-12 — the integration is FINISHED for launch. This replaces the older
"what is still next" plan (both native readers are done and shipping).

## launch shape (locked decisions)

- **Sources offered in the app: the two platform hubs only** — Apple Health (iOS) and
  Health Connect (Android). Brand apps (NRC, Strava, Garmin, 삼성헬스, …) are not
  separate sources; the hub guides explain that turning on "save to Apple Health /
  Health Connect" in those apps routes their runs in through the hub. MyNB was removed
  entirely (it consumes records, never produces them).
- **Manual import only** — the "기기에서 기록 가져오기" button. There is NO automatic or
  background import (that would need iOS HKObserverQuery / Android WorkManager — a
  post-launch native-build feature). All UI copy says button-import, never auto-sync.
- **Imported runs are display-only**: they appear in personal stats (홈 기록 카드, 내 활동,
  개인 스트릭 표시) but never shape competitive surfaces — 오늘의 랭킹, rank LP, 전적,
  친구/디스트릭트 순위, 지역 트리 rollup, 매치 러너 프로필(페이스 밴드·LP 크기·상대 표시 카드)
  are all `isCompetitiveRun`-gated (backend/src/lib/competitiveRuns.mjs).
- **Imported runs mint zero points** (2026-07-12): level/streak/growth point lattices run
  on competitive runs only (backend/src/points.mjs) because points are market-redeemable
  and used as ranking tie-breaks, and platform health apps accept hand-typed workouts.

## what is implemented

- iOS: `plugins/withHealthAccess.js` injects the `RunnigappAppleHealth` ObjC bridge into
  the app target; reads HealthKit running workouts. Entitlement +
  `NSHealthShareUsageDescription` prepared at prebuild.
- Android: `modules/runnigapp-health-connect/` Kotlin Expo module reads Health Connect
  `ExerciseSessionRecord` (running), including the permission-sheet flow.
- JS bridge `src/integrations/nativeHealth.ts` normalizes both platforms into one payload
  shape, queues via `POST /integrations/import`, then syncs (`POST /integrations/sync`)
  to materialize run records with 3-layer dedup (externalId / fingerprint / time-overlap).
- A 0-record import shows permission guidance (iOS HealthKit never reveals read denial,
  so the copy points at 설정 > 개인정보 보호 > 건강).

## bridge contract

Modules: `RunnigappAppleHealth`, `RunnigappHealthConnect`. Method `readRuns()`
(optional `isAvailable()`), returning:

```ts
{
  externalId?: string;
  date?: string;
  startedAt?: string;
  distanceKm?: number;
  distanceMeters?: number;
  pace?: string;
  paceMinutesPerKm?: number;
  paceSecondsPerKm?: number;
  durationSeconds?: number;
}
```

## post-launch backlog

- Automatic/background import (HKObserverQuery / WorkManager) — native build required.
- Direct brand integrations (Strava/Garmin OAuth) if user demand shows up; the catalog
  hide is one metadata entry away from re-offering them.
