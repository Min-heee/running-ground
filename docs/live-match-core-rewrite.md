# Live-Match Countdown/Start Core — Clean Rewrite (design + staged plan)

## Principle
Countdown VISIBILITY, arena OPENING, and GPS STARTING must all derive from ONE fact:
**has THIS phone's synced clock reached THIS match's slot?** = `Date.now() + offset >= slotStartMs`.
No `clockReady` gate anywhere in display/phase (the offset is best-available + self-correcting).
Scales to 30+ group because it is O(1)/client (one server slot + one scalar offset, no peer math).

## Single source of truth — `src/features/runs/lifecycle/liveMatchSlot.ts` (pure)
- `resolveActiveMatchSlot(inputs) → { matchId, slotStartMs } | null` — pick the slot: room
  `linkedMatchSlotStartAt ?? slotStartAt`, else duel/group `slotStartAt`, else upcoming. Freeze first
  value per matchId (reuse `freezeSlotStartMsForMatch`).
- `selectCountdownDigit({ slotStartMs, syncedNowMs, windowSeconds }) → number | null`
  = `ceil((slotStartMs - syncedNowMs)/1000)` when `0 < remaining ≤ window`, else null.
  PURE — no clockReady, no lock, no tombstone, no monotonic re-baseline.
- `deriveSlotPhase({ slotStartMs, syncedNowMs, serverActive }) → 'pre' | 'countdown' | 'active'`
  `remaining > window → 'pre'`; `0 < remaining ≤ window → 'countdown'`; `remaining ≤ 0 → 'active'`.
  `serverActive` may promote to 'active' ONLY when `remaining ≤ 0` (corroboration, never pre-emption).

## Stages (each: own commit, gated tsc0/eslint0/tests, verified on the diag overlay 85f1a11)
- **0** Add `liveMatchSlot.ts` + unit tests. Wire nothing. Diag unchanged.
- **1** Room countdown digit → `selectCountdownDigit` (bypass freeze/clockReady).
  Diag: with clockReady=n, `remainSec` counts 30→1 smoothly, `roomCdEntry=y` whole window, both phones.
- **2** Phase → `deriveSlotPhase`; remove `clampLinkedMatchStateToSlot` calls + active-inference grace.
  Backend: slot-gate the DIRECT status endpoint (`matchResponseBuilders.mjs buildRunningMatchStatusResponse`)
  so `duelMatchStatus.state`/`groupMatchStatus.state` report 'matched' until `slot <= now` (mirror 52a9a17).
  Diag: `phase` stays arming/countdown until `remainSec≈0`; NO `phase→active` before `remainSec≈0`.
- **3** Single `useSlotGatedArenaOpen` = the ONLY caller of `setForceOpenActiveMatch(true)` (gate:
  `syncedNow>=slot || (serverActive && slotPassed)` + explicit route force). Reroute the pre-slot
  force-opens (useActiveArenaPinEffect, useLiveMatchNavigationExecutor, navOwner, useMatchEntryEffects);
  they may still mount/scroll the arena page but must NOT flip forceOpenActiveMatch pre-slot.
  Diag: NO `forceOpenActive=true` event with `remaining>0`; `forceOpen=n` through the countdown.
- **4** Warm-up GPS only at/after slot — gate `useMatchAutoTrackingEffects` warm-up on `isActiveForMe`
  (drop the `shouldAutoOpenMatchArena`-gated warm-up branch). Diag: no `startTracking src=autoTracking:warmup`
  while `remainSec>0`; `trackState` idle through countdown, flips at `remainSec≈0`.
- **5** Unify the other 3 countdown pipelines (duel/group/upcoming) onto `selectCountdownDigit`; delete
  `useStableCountdownSeconds`, the lock Map + finished-key Set in `countdownLockStore` (keep
  `freezeSlotStartMsForMatch`); simplify `useLocalCountdownSeconds` to the pure rAF.
- **6** Matched-group ≥3 (→30+) verification; remove dead code; strip the diag overlay (revert 85f1a11) in
  the final ship commit.

## KEEP (backend): 04fe131 (slot block on durable room.linkedMatchId), 52a9a17 (room 'active' gated on slot).
## clockReady=n: never trips because ≥2 trusted RTT samples must agree within 250ms (jitter/untimed snapshots
prevent it). Drop clockReady from ALL display/phase; use best-available offset (self-correcting). Offset itself
is sound (lowest-RTT select, cold-start snap, 400ms bounded crawl).
