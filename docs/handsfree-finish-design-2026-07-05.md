# HANDS-FREE FINISH — Staged Architecture (RunningGround)

Repo: `<repo>`. All stages OTA unless marked NATIVE-BUILD. No countdown-funnel file is touched. #203 lifeline and 2e5a626 finish-cadence semantics are only ever ADDED to (fire-and-forget calls + one new store), never gated or reordered. Zero server changes (first-write-wins seal already shipped; per-request cost stays flat).

**Core design decision:** mirror the server's first-write-wins finish seal LOCALLY. One new module — a `localGoalFreeze` store (sibling of `src/features/runs/sync/pendingFinishStore.ts`, same SecureStore idiom) — records `{matchId, elapsedSeconds, distanceKm, pace, crossedAtIso}` exactly once, at the FIRST place any code computes `'finished'`. Every downstream consumer (save clamp, route truncation, deliverFinalMatchStatus, save-time finish push, kill-restore) reads it instead of re-deriving the finish from live/drifted state. It is deliberately NOT `pendingFinishStore` (that one is cleared on server ACK — `clearPendingFinish`, `pendingFinishStore.ts:97-101` — which on Android happens seconds BEFORE the save runs; the freeze must survive until save-success). Clamp semantics are strictly downward (`min`) — the clamp can never inflate a value, which is the anti-corruption invariant.

Stage order = user value ÷ risk, descending.

---

## STAGE 1 — Remove the goal-ETA alarm (ship first; zero risk; OTA)

All lines verified against current files.

1. `src/features/runs/finishReminder/useFinishApproachReminder.ts`
   - Delete imports: `GOAL_ETA_REMINDER_BUFFER_KM` (line 6), `presentGoalEtaReminderNow` (line 12), `scheduleGoalEtaReminder` (line 14).
   - Delete refs `goalHasFiredRef`/`goalScheduledInSecondsRef` (lines 59-60), their resets (lines 74-75 and 85-86), the `goalScheduledInSecondsRef.current = null` bookkeeping inside the approach `'cancel'` case (line 115), and the entire `goalDecision` pass (lines 125-152).
   - Rewrite the doc comment (lines 38-45) from "TWO ... notifications" to one.
2. `src/features/runs/finishReminder/finishApproachNotification.ts`
   - Delete `GOAL_ETA_REMINDER_TITLE`/`GOAL_ETA_REMINDER_BODY` (lines 21-22), `scheduleGoalEtaReminder` (lines 177-186), `presentGoalEtaReminderNow` (lines 188-191).
   - **KEEP** `GOAL_ETA_REMINDER_KIND` (line 16) and keep it in the `cancelFinishApproachReminder` kinds list (line 203) for ≥1 OTA generation — OS date-scheduled notifications survive app restart; a run started on pre-OTA code can leave a stale goal-ETA notification queued, and the cancel sweep is what garbage-collects it. Add a `// legacy GC only` comment.
3. `src/features/runs/finishReminder/finishApproachReminderDecision.ts`
   - Delete `GOAL_ETA_REMINDER_BUFFER_KM` (lines 14-19). Keep the generic `bufferKm` param (lines 50-53, 89, 108) — defaulted, harmless, smallest diff.
4. `src/features/runs/finishReminder/finishApproachReminderDecision.test.ts`
   - Delete the §3.⑤ block (lines 153-~200: the 4 `bufferKm`/`GOAL_ETA_REMINDER_BUFFER_KM` tests) and the import at line 9. Keep the "omitted bufferKm keeps the approach default" test (line 167) with the literal `0` if desired.
5. `src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx:960-966` — comment only; it already describes only the 300m reminder, no code change. Verified nothing else imports the deleted symbols.

The 300m approach reminder is the SAME screen-on crutch (its premise is cited by `backgroundMatchProgressSync.ts:651-654`) — do NOT remove it yet; it is the safety net for old iOS binaries until Stage 3+5 are device-verified. Its removal is Stage 6.

## STAGE 2 — At-crossing celebration notification (OTA-feasible: yes; ship with Stage 1)

`expo-notifications` is compiled in; POST_NOTIFICATIONS already granted at onboarding (`src/features/auth/onboarding/onboardingPermissions.ts:211`); the module-level helpers have zero React dependency, and the background flush runs real JS inside the TaskManager callback (`locationTask.ts:63-79`) — the pattern is already proven.

1. `finishApproachNotification.ts` — add `presentFinishCelebrationNow(distanceKm: number, elapsedSeconds: number)` reusing the `presentReminderNotificationNow` idiom (lines 128-159). New kind `runningground-finish-celebration`. New Android channel `runningground-finish-celebration` at **DEFAULT importance** (no heads-up, no vibration pattern — "requires NO action"). Copy: title `🎉 ${formatKm(distanceKm)}km 완주! ${formatMmSs(elapsedSeconds)}`, body `완주 기록이 저장되고 있어요. 결과는 앱에서 확인하세요.` Gate internally on `getBackgroundSyncDiagnostics().isAppBackground` — foreground users see the result UI, never the notification (this also makes the `notificationHandler.ts` foreground-presentation question moot).
2. Fire-once dedupe: module-level `Set<string>` (`celebratedMatchIds`) inside the notification module, exported `presentFinishCelebrationOnce(matchId, distanceKm, elapsedSeconds)`. Process-lifetime, never cleared (bounded).
3. Call site A — `backgroundMatchProgressSync.ts`, immediately after `const status = input.status;` (line 857), BEFORE the native/JS branch split so both delivery paths get it:
   `if (status === 'finished') { void presentFinishCelebrationOnce(input.matchId, input.distanceKm, input.elapsedSeconds); }`
   Fire-and-forget with no `await` — the §3.④ zero-await invariant between payload build and native handoff (lines 810-830, 866-935) is preserved. The `pendingFinishIntent` re-send branch (lines 834-852) also produces `'finished'`; the fired-set dedupes re-sends and cadence retries.
4. Call site B — `useMatchProgressSync.ts` inside `deliverFinalMatchStatus`, next to `rememberPendingFinish` (line 525): same `presentFinishCelebrationOnce(...)` with the intent's values (backgrounded-but-flush-missed and iOS late-detection cases; the isAppBackground gate suppresses it foreground).
5. iOS caveat (document, don't fix here): on the current binary the celebration fires only when a JS window computes the crossing — possibly late (#203 residual). On-time firing screen-off with frozen JS is the NATIVE-BUILD item (native module posts the notification from the cadence when it observes the finish ACK).
6. Solo: out of scope — no goal plumbing exists (`TrackRunExperienceRuntimeModel.tsx:967-976` gates duel/group; context armed only from match target).

## STAGE 3 — Local goal freeze + save clamp (gaps 1, 3, 4) — the correctness core. EXTRA REVIEW REQUIRED (touches run-save)

**3a. New store** `src/features/runs/sync/localGoalFreezeStore.ts` (clone the `pendingFinishStore.ts` pattern: in-memory Map + SecureStore persistence + hydration, key `runningground.localGoalFreeze.v1`):
- `recordLocalGoalFreezeOnce(freeze)` — **local first-write-wins**: no-op if an entry exists for `matchId`. Validates `elapsedSeconds > 0`, finite `distanceKm > 0`.
- `getLocalGoalFreeze(matchId)`, `clearLocalGoalFreeze(matchId)`, `hydrateLocalGoalFreezes()`.
- Shape: `{matchId, elapsedSeconds, distanceKm, pace, crossedAtIso}`.
- Cleared ONLY on save success (`runCleanupAfterSave`) and on `resetBackgroundRunTracking`-driven discard — never on server ACK.

**3b. Record sites** (every place `'finished'` is first computed):
- `backgroundMatchProgressSync.ts:857` (same guard as the Stage-2 celebration; the flush's `input.elapsedSeconds` is wall-clock-anchored via `resolveSnapshotElapsedMs` at line 677, i.e. the crossing-time value even after JS suspension) — `crossedAtIso = new Date(nowMs).toISOString()`.
- `useMatchProgressSync.ts` foreground heartbeat where `heartbeatStatus === 'finished'` (lines 625-638) — screen-ON crossings.
- `deliverFinalMatchStatus` (line 518-530) — as last resort; because the store is first-write-wins, this only lands when neither of the above fired.

**3c. Consume in deliverFinalMatchStatus (gap 4)** — `useMatchProgressSync.ts:506-541`: before building the intent from live `progress`, `const freeze = getLocalGoalFreeze(endedTarget.matchId)`; if present, use `freeze.elapsedSeconds/distanceKm/pace` for both `rememberPendingFinish` and the push. This closes the "screen-off delivery failed → drifted foreground value becomes the server-frozen finish" leak. Server first-write-wins keeps it idempotent.

**3d. Consume in the save flow (gaps 1 + 3)**:
- New pure module `src/features/runs/hooks/runSaveFlow/goalFreezeClamp.ts`: `applyGoalFreezeToDisplayedSnapshot(displayedSnapshot, freeze): DisplayedTrackingSnapshot`. Semantics (all strictly downward, no-op otherwise):
  - `elapsedSeconds = Math.min(displayed.elapsedSeconds, freeze.elapsedSeconds)` — kills the slot-anchored drift (`trackingDisplayModel.ts:18-42` keeps ticking; that is the 26:46→+minutes bug).
  - `distanceKm = Math.min(displayed.distanceKm, freeze.distanceKm)` — the frozen value is the measured-at-crossing distance (≈goal), matching the server record; never the raw goal constant.
  - Route truncation: `endedAtIso = freeze.crossedAtIso`; drop route points with `timestamp > endedAtIso`; if <2 points remain, keep the untruncated route (route is display-only — backend never derives distance from it, per the comment at `runSaveResultMapper.ts:184-187`).
- Wire in `useRunSaveCommand.ts` after `displayedSnapshot` is built (line 78) and `activeMatchId` resolved (line 81): `const freeze = activeMatchId ? getLocalGoalFreeze(activeMatchId) : null;` then clamp. This covers BOTH save flows — the auto-exit path routes `saveForfeitResultAndNavigate` (`useRunForfeitCommand.ts:115-146`) → `handleSaveTracking`. Forfeit saves are inherently safe: a freeze exists only if the goal was crossed, and min() can only lower values.
- `endedAt` clamp: `runSaveResultMapper.ts:136-138` takes the last route timestamp — after truncation that IS the crossing-area timestamp; additionally pass the clamped elapsed so the `buildEndedAt(startedAt, finalElapsedSeconds)` fallback (line 138, 36-42) is consistent. No change to the mapper's rounding/validation logic itself beyond accepting the already-clamped snapshot (keeps the mapper's C1/C4 guards intact).
- Also feed frozen values into the save-time final push `useRunSaveCommand.ts:108-115` (currently posts live `progress` with `status:'finished'` — same drift leak as 3c).

Risk: MEDIUM — this is the run-save path. Mitigations: min-only semantics; freeze validated at write; clamp active only when a freeze exists for the exact `activeMatchId`; full CI coverage (below); flagged for extra review + a dedicated device pass before OTA.

## STAGE 4 — Kill-and-reopen hardening (gap 5). OTA. EXTRA REVIEW (creates saves)

With Stage 3 in place, the common kill case self-heals: restore forces `'running'` (`backgroundRunPersistence.ts:185-192`), slot-anchored elapsed catches up, poll shows finished, auto-save fires, clamp restores the crossing values. Remaining fixes:

- **4a (small, safe):** freeze-aware staleness — in `restoreBackgroundRunSnapshot` (`backgroundRunPersistence.ts:177-180`), when `getLocalGoalFreeze(matchId)` exists, extend `STALE_THRESHOLD_MS` (30min) to 24h: a crossed run's snapshot is a real finished run, deleting it destroys the only local route/record.
- **4b (small, safe):** never start a FRESH run for an already-crossed match — in `useMatchAutoTrackingEffects.ts:172-174`, skip `startMatchTrackingAutomatically(activeMatchId)` when a freeze exists for it (prevents the bogus 0km re-run after a stale-deleted snapshot).
- **4c (larger, gated):** orphaned-run recovery — reopen after the match resolved server-side: restore never fires (`useMatchAutoTrackingEffects.ts:114-122`), local run silently never saved. Add a fire-once foreground sweep (runtime mount): for each hydrated freeze with a persisted snapshot but no active match and idle tracking, build a save input from the persisted snapshot + freeze clamp and `createTrackedRun`, then clear both stores; on failure keep stores and retry next foreground. This CREATES runs → highest-risk item in the plan; ship last within the stage, behind its own review, or defer past launch (the server verdict is already correct without it — only the 내 활동 entry is missing).

## STAGE 5 — GPS auto-stop at goal (gap 2) + auto-save robustness (gap 6)

- **Android (OTA: verify, don't add):** GPS already stops at crossing+ε — the FG service keeps JS+React alive, the finished response applies, the auto-exit effect (`LiveMatchExitActionCard.tsx:72-88`) saves in background, and the save's `pauseBackgroundRunTracking()` (`useRunSaveCommand.ts:73`) stops the task. Adding an earlier stop would kill the FG service that keeps that pipeline alive. Device-verify instead (script below).
- **iOS (NATIVE-BUILD bucket, Jul):** do NOT stop the expo task at crossing over OTA — its location deliveries are the only JS wakeup windows; stopping them strands ACK observation and the 10-min cap enforcement (`enforcePendingNativeFinishCap` runs on flush ticks, line 768), leaving the cadence re-POSTing until foreground. Native items: (1) cadence self-stops on 2xx finish-ACK natively (no JS needed); (2) module stops its second CLLocationManager on that ACK; (3) native "goal reached" computation so a frozen-JS iPhone can flip its own payload to finished + fire the celebration on time (lifts the sub-goal cap only from the native side after native-vs-JS parity is proven — this is the one item that interacts with the fairness cap, design review with `NATIVE_SUBGOAL_CAP_EPSILON_KM` semantics required); (4) only then stop the expo task at ACK.
- **Do NOT touch** the `!isRunning` disable in `matchExitAction.ts:98` this week: any pre-save GPS/tracking stop flips `isRunning` false and DEADLOCKS the auto-exit (button renders disabled "결과 화면 준비 중..."). If a pre-save stop is ever added, the same PR must relax that gate to `!(isRunning || hasLocalGoalFreeze(matchId))`.
- **Gap 6 (accepted for now):** auto-save still needs the arena mounted/unfrozen; foregrounding into another tab defers it until the running tab refocuses. Data stays correct via Stage 3. A snapshot-store-level finalizer is post-launch work.

## STAGE 6 — Remove the 300m approach reminder (after Stage 3+5 device verification on BOTH platforms)

Same mechanical pattern as Stage 1 (kind kept in the cancel sweep one more generation). Blocked on: Android background auto-save verified + iOS native self-finish chain verified on the Jul build. On old iOS binaries it remains the only screen-off finish crutch — removing it earlier re-opens the frozen-finish window.

---

## TEST LIST

**CI (pure logic, `npm test` = `tsx --test`, node:test — package.json:69):**
1. `goalFreezeClamp.test.ts` — min-only elapsed/distance; route truncation by `crossedAtIso`; <2-points keeps full route; no-freeze passthrough; freeze>displayed is a no-op; forfeit snapshot with freeze only clamps down.
2. `localGoalFreezeStore.test.ts` — first-write-wins (second record ignored); validation rejects 0/NaN elapsed; hydration round-trip; clear-on-save.
3. `backgroundMatchProgressSync.test.ts` additions — crossing tick records freeze exactly once with the crossing-tick elapsed; celebration+freeze fire once across pendingFinishIntent re-sends; injected native uploader still receives the finished body (no new await before handoff); non-finished ticks record nothing.
4. `finishApproachReminderDecision.test.ts` — goal-ETA tests deleted; approach suite green.
5. Extract `buildPendingFinishIntentFromFreeze(freeze, liveProgress)` as a pure helper and test freeze-preferred vs live-fallback (covers 3c).
6. `runSaveResultMapper` with a clamped snapshot — durationSeconds/endedAt/pace consistency; C1 no-0 guard still holds.

**On-device (genuinely unverifiable in CI — freezes, FG service, notification delivery). Minimal user script, 0.5km party duel to keep runs short:**
1. **Android screen-off finish:** start duel, lock screen at 0.1km, cross goal locked. Expect: celebration notification at crossing (±5s), NO goal-ETA alarm, no 300m-reminder regression. Stay locked 3+ min, unlock into the app → run ALREADY saved; 기록상세 distance ≈ 0.5km (no drift), duration == result-card verdict time, map has no post-goal tail.
2. **iOS screen-off finish (build 43):** same run. Expect: verdict time = crossing time on the server; celebration fires (possibly delayed to a JS window); unlock 3 min later → auto-save fires on foreground with clamped values equal to the verdict (not +3min). Note GPS indicator stays on until foreground — expected until the Jul native build.
3. **Kill after crossing (Android):** cross goal locked, then swipe-kill the app from recents, reopen after 2 min → verdict intact; with Stage 4a/4c: local run recovered/clamped; without 4c: confirm no bogus fresh 0km run starts (4b).
4. **Kill before crossing:** kill mid-run, reopen within 30min → restores to running, finish normally → single correct save.
5. **Foreground crossing (regression):** run with screen on → no celebration notification (isAppBackground gate), result flow unchanged, verdict == saved record.

**Extra-review flags (could corrupt a run save):** Stage 3d (clamp wiring in `useRunSaveCommand.ts`), Stage 4c (orphan auto-save), and any future change to `matchExitAction.ts:98`'s `!isRunning` gate. Stage 1/2 cannot touch saves.

**Key files:** `src/features/runs/finishReminder/{useFinishApproachReminder,finishApproachNotification,finishApproachReminderDecision}.ts`, `src/features/runs/tracking/background/backgroundMatchProgressSync.ts`, `src/features/runs/sync/{useMatchProgressSync.ts,pendingFinishStore.ts}` (+ new `localGoalFreezeStore.ts`), `src/features/runs/hooks/runSaveFlow/{useRunSaveCommand.ts,runSaveResultMapper.ts}` (+ new `goalFreezeClamp.ts`), `src/features/runs/tracking/background/backgroundRunPersistence.ts`, `src/features/runs/tracking/lifecycle/useMatchAutoTrackingEffects.ts`, `src/features/runs/components/LiveMatchExitActionCard.tsx` (read-only reference), `src/features/runs/lifecycle/matchExitAction.ts` (do-not-touch trap documented).
