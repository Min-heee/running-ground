All four questions are now verifiable from source. Assembling the final map with exact citations.

## Party-duel (room-linked) foreground opponent-delivery map — verified

**Q1. Which channel delivers the opponent's live distance in the arena?** Four concurrent channels, all ending in `duelMatchStatus.opponent` (+ `officialComparison`):

1. **Linked poll (organ 3)** — `src/features/runs/sync/partyRunSync/useLinkedMatchSync.ts:245-401`, mounted via `usePartyRunSync.ts:173-193` ← `useRuntimeNavigationEffects`. One immediate pre-acquire fetch per effect run (`:334`), then interval under keyed slot `match:${matchId}:linked-match-status` (`:342`). Cadence (`resolveLinkedMatchPollingCadence:62-91`): arming/readyAcked 1000ms, countdown/arena 2500ms (`MATCH_STATUS_FAST_POLL_MS` = `LIVE_MATCH_SERVER_SYNC_INTERVAL_MS` = 2500), else 3000ms. Tick → `syncRoomLinkedMatchStatus` (`useTrackRunRuntimeMatchMaintenanceActions.ts:165-186`) → `loadDuelMatchStatus(slot, {matchId, distanceKm, forceAccept:true})` → **applies in the loader, not the funnel applier**: `useTrackRunMatchStatusLoaders.ts:319` (`setDuelMatchStatus`), `:278` (sets `focusedDuelMatchIdRef`), `:323` (lifeline stamp). Response carries opponent (`backend/src/lib/matchResponseBuilders.mjs:354,398`, live snapshot `:273`).
2. **Blocking poll — YES it runs for party duels.** `TrackRunExperienceRuntimeModel.tsx:1875-1884`: `enabled` includes `shouldPollLinkedMatch` (`matchLifecycleController.ts:348-358`, true through active while I'm not terminal), and `linkedMatchContext = roomLinkedMatchContext`. In `useBlockingMatchStatusPolling.ts:296-299` `isLinkedMatchPolling=true` (effectiveDuelMatchId === linked matchId), so the mounted-safety skip is bypassed (`:319`) and it polls at fast cadence with the linked args incl. matchId+forceAccept (`:335-341`, `buildLinkedMatchStatusLoadArgs:88-98`) under key `blocking-match-status:${matchId}` (`registryKeys.ts:6-9`) — a **different key** from organ 3, so the two never collide with each other. Lost acquire → df02afc retry (`:360-394`, helper `:122-167`). Note the retry only wins when the current owner **releases**; against a live foreign owner it fails forever (by design — single flight).
3. **Heartbeat POST responses — YES party duels push the same heartbeat and apply opponent from the response.** Target resolution includes `roomLinkedMatchContext.state==='active'` (`matchProgressSync.ts:207-216`); driven by GPS emits + a raw 1s keep-alive timer (`useMatchProgressSync.ts:687-699`), gated to every 2500ms (`matchProgressSync.ts:221-233`, `liveMatchCadence.ts:1`). Backend `/api/running/matches/progress` response is built by the same `buildRunningMatchStatusResponse` with `sessionOverride` (`matchActionHandlers.mjs:508-514`) → full `opponent`. Applied via the funnel `applyMatchStatusSnapshot({source:'heartbeat'})` (`useMatchProgressSync.ts:369`) → party routing succeeds through `roomLinkedMatchContextRef` (`matchProgressSync.ts:86-98`; ref stamped per-render in `trace/useTrackRunRoomTrace.ts:11`) → `setDuelMatchStatus` + stamp (`useTrackRunMatchStatusSnapshotApplier.ts:82-91`).
4. **Lifeline** (5s tick, fires at >8s stamp staleness, `opponentSyncLifeline.ts:8-9`) and the **registry-free AppState-resume path** (`useTrackingAppStateSync.ts:147-191` + `trackingAppStatePolicy.ts:41-48`: resume → `refreshStaleMatchArtifacts` → bare `loadDuelMatchStatus` + a resume push attempt). The resume path is why app-switching heals instantly.

**Q2. df02afc lifeline covers party duels — CONFIRMED, not a no-op.**
(a) Party accepted applies stamp `lastMatchStatusAppliedAtMsRef` on **both** paths: linked/blocking/lifeline/resume applies stamp in the loader (`useTrackRunMatchStatusLoaders.ts:323`, group `:397`); heartbeat/background applies stamp in the funnel's accepted branch (`useTrackRunMatchStatusSnapshotApplier.ts:91`). Guard-dropped snapshots don't stamp.
(b) Lifeline arming uses `activeLiveMatchProgressMatchId`, which falls back to `roomLinkedMatchContext.matchId` for party (`trackRunRuntimeDerivedState.ts:176-200`, model `:661-673`) — armed. The no-arg `loadDuelMatchStatus()` sends `slotStartAt=activeDuelSlotStartAt` (wrong for party) and `duelDistanceKm`, but `matchId = focusedDuelMatchIdRef.current` (`useTrackRunMatchStatusLoaders.ts:235`), which IS set for room-linked duels (`:278` on every accepted linked apply; also `useLiveMatchNavigationExecutor.ts:177` on arena focus). The backend resolves **by matchId alone**, ignoring slot/distance (`matchSessionLifecycle.mjs:196-211`; the status route parses slot leniently when matchId is present, `runningMatchProgressRoutes.mjs:87-91`) → response is the party session with opponent → applied through the loader's guarded accepted branch. Worst-case delivery in a fully-wedged GET state: one apply every ~8-13s.

**Q3. Organ 3 exact behavior.** Per effect run: gate log (`:246-256`), bail if `!enabled || !pollingEnabled || !roomLinkedMatchContext` (`:258-261`); ONE immediate fetch (`:334`) regardless of acquisition; then `startRgPollingInterval` (`:343-357`). Lose branch `:359-363` returns a cancel-only cleanup — **no retry timer, no rgPerfMark, permanently dead** (contrast `useRoomPolling.ts:196-210` and `useBlockingMatchStatusPolling.ts:360-394`, both retry-armed). Effect deps (`:386-401`): `currentUserDoneWithLinkedMatch`, poll intervals, `pollingEnabled`, context fields (distanceKm/matchId/mode/slotStartAt/state), `visiblePartyRunFlow.phase`/`shouldOpenArena` — during a stable active match **none change** (state='active', phase stable, done-flag flips only at my finish/forfeit), so a lost acquire stays dead until match end. A lose requires a foreign owner of the same key; the only caller of that key is this hook — i.e., a second mounted runtime instance (both `RunningScreen` (tab) and `TrackRunScreen` (stack) render the full `TrackRunExperience` runtime; registries are module-level: `rgPollingRegistry.ts:9`, `rgHeartbeatRegistry.ts:10`).

**Q4. Tension resolved — the linked lose branch ALONE is NOT the freeze mechanism.** Heartbeat progress-POST responses do carry the opponent and do apply for party duels (proven above). So while MY pushes are healthy, the opponent state refreshes every 2.5s even with organ 3 and the blocking poll both dead. Two code-verified mechanisms produce tonight's symptom, and both center on the **deferred heartbeat-slot latch** (`useMatchProgressSync.ts:268-269`: `!heartbeatSlot.acquired` → silent return, never retried; `canSendMatchProgressHeartbeat` `:300-317` then skips EVERY foreground push including the resume-forced one):

- **(i) Zombie-owner receive starvation:** a coexisting runtime instance (tab+stack overlap window) wins `match-progress:<id>`, `match:<id>:linked-match-status`, and `blocking-match-status:<id>`. Its timers keep ticking (its pushes read the module-level tracking snapshot, so MY distance still reaches the server), but its GET applies land in ITS OWN React state — invisible. The visible instance: organ 3 latched (:359), blocking retry forever-failing against the live owner, heartbeat sends skipped — the ONLY visible-instance delivery is its own registry-free lifeline at ~8-13s cadence. That IS "barely updates"; app-switch fires the registry-free resume GET → instant.
- **(ii) Push-death checkpoint clamp:** the arena does not display raw `opponent.liveDistanceKm` — it prefers the official comparison (`liveMatchProgressModel.ts:205-229`), whose checkpoint is `min(live participants' elapsed)` (`matchSessionSnapshots.mjs:222-227`) with the opponent's distance projected at that checkpoint (`matchPureHelpers.mjs:172-180`). If MY pushes die, MY server elapsed freezes → the checkpoint freezes → the opponent's **displayed** official distance is pinned even though every GET channel is healthy and applying fresh payloads. It snaps only when I'm marked disconnected after 90s (`matchConstants.mjs:31`, `matchPureHelpers.mjs:157-158`) — or on app-switch, because the background flush POSTs **without** the heartbeat-slot gate (`backgroundMatchProgressSync.ts` has its own single-flight, no `canUseRgHeartbeatSlot`), advancing my elapsed, and resume adds the registry-free GET → the opponent leaps forward "immediately".

**Verdict.** The df02afc lifeline and blocking-poll fixes DO cover party duels (premise refuted on both counts). The remaining un-fixed latches are exactly two: the organ-3 lose branch (`useLinkedMatchSync.ts:359-363`) — real but only an aggravator — and the **never-retried heartbeat slot + its canSend gate** (`useMatchProgressSync.ts:268-269, 300-317`), which is required to reproduce tonight's freeze and was explicitly deferred in `docs/opponent-poll-stall-diag-2026-07-06.md:45` ("fix only if 'duplicate-heartbeat-owner' marks appear"). To pin (i) vs (ii) on-device, read during the stall: `'progress heartbeat skipped' reason:'duplicate-heartbeat-owner'` (`useMatchProgressSync.ts:308-314`), `'polling duplicate blocked'` (`rgPollingRegistry.ts:10-17`), `'opponent sync lifeline fired'` cadence, and whether `'duel match status set from poll'` (`useTrackRunMatchStatusLoaders.ts:304-318`) shows opponentLiveDistanceKm CLIMBING while the board is frozen — climbing applies + frozen board = mechanism (ii); silent applies = mechanism (i). One caveat outside code: if tonight's phones predate the df02afc/a5923e9 OTA (deploy backlog note), the old single-latch story suffices without either mechanism.

---

All done. Final report with per-piece citations, the verbatim protected-file diff, and gates.

---

## PIECE A — organ-3 lose-branch retry (IMPLEMENTED)

**File:** `<repo>/src/features/runs/sync/partyRunSync/useLinkedMatchSync.ts`
- Import (line 2): `armBlockingMatchStatusPollRetry` imported as-is from `@/features/runs/sync/matchPolling/useBlockingMatchStatusPolling`
- Lose branch (now lines 360–412): lost-acquire mark `'linked match polling lost acquire'` (:369, includes `activeOwnerId` of the zombie owner, tying it to `'polling duplicate blocked'`), shared retry helper armed (:379) with `onTick: syncRoomLinkedMatch` (the same tick fn the interval uses — the helper fires exactly ONE catch-up tick on re-acquire), re-acquire mark `'linked match polling reacquired after retry'` (:382), `startPolling` re-attempting the same `startRgPollingInterval` invocation with verbatim-identical args (key/label/onTick/detail), cleanup `canceled = true; retry.stop()` stops whichever is live (:408–411).
- **ZERO other changes**: pre-acquire immediate fetch (:335), cadence resolution, the acquired/success path (both success marks + success cleanup), effect deps, funnel/response handling — all untouched. No other protected file touched; `backend/`, registries untouched.

**Exact verbatim diff of useLinkedMatchSync.ts (the whole diff in this file):**

```diff
diff --git a/src/features/runs/sync/partyRunSync/useLinkedMatchSync.ts b/src/features/runs/sync/partyRunSync/useLinkedMatchSync.ts
index b9ad239..aa7bfc7 100644
--- a/src/features/runs/sync/partyRunSync/useLinkedMatchSync.ts
+++ b/src/features/runs/sync/partyRunSync/useLinkedMatchSync.ts
@@ -1,4 +1,5 @@
 import { useEffect, useRef } from 'react';
+import { armBlockingMatchStatusPollRetry } from '@/features/runs/sync/matchPolling/useBlockingMatchStatusPolling';
 import type { RunningMatchRoom, RunningMatchState } from '@/lib/api/types';
 import { getMatchStartRemainingSeconds, shouldAutoOpenMatchArena } from '@/lib/matchCountdown';
 import { buildPartyRunFlowSnapshot } from '@/features/runs/lifecycle/matchStateMachine';
@@ -357,8 +358,56 @@ export function useLinkedMatchSync({
     });
 
     if (!polling.acquired) {
+      // Opponent-poll stall fix (docs/opponent-poll-stall-diag-2026-07-06.md) — organ-3 un-latch.
+      // A lost acquire used to return a cancel-only cleanup, and every dep of this effect is
+      // stable during a stable active match, so the linked poll stayed permanently dead until
+      // match end (a zombie runtime instance owning the key starves the visible one). Same df02afc
+      // retry seam as the blocking/party-room organs: re-attempt the SAME startRgPollingInterval
+      // invocation (identical args) every intervalMs; on re-acquire mark + fire ONE catch-up
+      // syncRoomLinkedMatch and hold the real handle. Cleanup stops whichever is live (retry timer
+      // or acquired poll handle). The acquired/success path below is untouched.
+      rgPerfMark('linked match polling lost acquire', {
+        activeOwnerId: polling.ownerId,
+        intervalMs,
+        matchId: roomLinkedMatchContext.matchId,
+        mode: roomLinkedMatchContext.mode,
+        pollingKey,
+        reason: transitionReason,
+        source: 'linked match status',
+        state: roomLinkedMatchContext.state ?? null,
+      });
+      const retry = armBlockingMatchStatusPollRetry({
+        intervalMs,
+        onReacquired: (handle) => {
+          rgPerfMark('linked match polling reacquired after retry', {
+            intervalMs,
+            matchId: roomLinkedMatchContext.matchId,
+            mode: roomLinkedMatchContext.mode,
+            ownerId: handle.ownerId,
+            pollingKey,
+            source: 'linked match status',
+          });
+        },
+        onTick: syncRoomLinkedMatch,
+        startPolling: () => startRgPollingInterval({
+          intervalMs,
+          key: pollingKey,
+          label: 'linked match status polling',
+          onTick: syncRoomLinkedMatch,
+          detail: {
+            intervalMs,
+            matchId: roomLinkedMatchContext.matchId,
+            mode: roomLinkedMatchContext.mode,
+            owner: 'linked match status',
+            reason: transitionReason,
+            source: 'linked match status',
+            state: roomLinkedMatchContext.state ?? null,
+          },
+        }),
+      });
       return () => {
         canceled = true;
+        retry.stop();
       };
     }
```

## PIECE B — lifeline party coverage (NO PRODUCTION CHANGE — premise refuted by findings)

Verification confirmed the df02afc lifeline ALREADY resolves party-linked matches: arming falls back to `roomLinkedMatchContext.matchId` (`trackRunRuntimeDerivedState.ts:176-200` — party fallback already locked by tests at `trackRunRuntimeDerivedState.test.ts:268-275, 294-300`), the no-arg loader resolves by `focusedDuelMatchIdRef` matchId alone (backend ignores slot/distance), and stamps land on BOTH party apply paths (loader `useTrackRunMatchStatusLoaders.ts:323`, funnel applier `useTrackRunMatchStatusSnapshotApplier.ts:91`). Per the task's conditional ("if the lifeline can't resolve party-linked matches"), no lifeline code was touched. Added the party coverage decision case to lock the claim:
- `<repo>/src/features/runs/runtime/opponentSyncLifeline.test.ts:58-89` — new test `'opponent sync lifeline covers an active party-linked match: fires on a stale stamp, no-ops while party applies stamp'` with comments citing the party arming/loader/stamp chain.

## TESTS

`<repo>/src/features/runs/sync/partyRunSync/useLinkedMatchSync.test.ts` — RN-free seam tests (repo pattern; the hook doesn't render under the node runner), exercising the exact lose-branch wiring on the linked key `match:<matchId>:linked-match-status` with label `'linked match status polling'` and one shared tick fn:
- `:87` zombie owns key → initial start loses → retry armed → retry tick while zombie live = no-op → zombie releases → next retry tick re-acquires + fires exactly ONE catch-up sync + stops the retry timer → straggler tick is a no-op → cleanup leaves zero slots.
- `:156` cleanup before re-acquire clears the timer; a straggler tick after stop (slot now free) acquires nothing, ticks nothing, zero leaks.

## GATES (all green, work NOT committed)

- `npx tsc --noEmit`: 0 errors
- `npx eslint .`: exit 0 — 0 errors, 15 warnings, byte-identical to HEAD baseline (verified via stash; the 2 warnings in useLinkedMatchSync.ts are pre-existing `react-hooks/exhaustive-deps` at HEAD :222/:386, only line-shifted to :223/:435)
- `npx tsx --test "src/**/*.test.ts" "src/**/*.test.tsx"`: **1130 pass, 0 fail** (baseline 1127 + 3 new tests)
- `git status`: 3 modified files only (`useLinkedMatchSync.ts`, `useLinkedMatchSync.test.ts`, `opponentSyncLifeline.test.ts`), uncommitted.

## Residual (out of scope by boundary)

The findings' mechanism (ii) — the never-retried deferred heartbeat slot + `canSendMatchProgressHeartbeat` gate (`useMatchProgressSync.ts:268-269, 300-317`) — is in a PROTECTED file and remains unfixed. This fix removes the organ-3 starvation aggravator (mechanism (i)'s GET side); if MY pushes die via the heartbeat latch, the displayed opponent distance can still pin to the frozen official-comparison checkpoint until the 90s disconnect or an app-switch background flush. The lifeline (~8-13s) plus this retry are the delivery backstops. On-device discriminator marks to watch during any future stall: `'progress heartbeat skipped' reason:'duplicate-heartbeat-owner'`, `'polling duplicate blocked'`, `'linked match polling lost acquire'` / `'linked match polling reacquired after retry'` (new), `'opponent sync lifeline fired'` cadence.

---

All verification complete. Compiling the verdict.

## MAXIMUM-SCRUTINY VERDICT: **SHIP**

Diff scope verified: exactly 3 modified files, 221 insertions, **0 deletions**, no untracked files — `useLinkedMatchSync.ts` (+49), `useLinkedMatchSync.test.ts` (+143), `opponentSyncLifeline.test.ts` (+29).

### Attack 1 — FUNNEL BYTE-SAFETY: PASS
`git diff --numstat` = 49/0 for the protected file; `git diff -U0 | grep '^-'` = zero removed lines. The 49 lines are exactly: 1 import (line 2) + lost-acquire branch body (:361–411: comment, `'linked match polling lost acquire'` mark, `armBlockingMatchStatusPollRetry` call, `retry.stop()` in the lose-cleanup). Byte-identical to HEAD: effect deps (:435–450 = HEAD :386–401), pre-acquire immediate fetch (:335), cadence resolution + call site, the entire `syncRoomLinkedMatch` body (fetch/apply/keep-fresh/pin), acquired/success path incl. both marks and cleanup, the navigation and upcoming-refresh effects. No new state/refs. Eslint output byte-identical to HEAD except pure line-shift of the two pre-existing `exhaustive-deps` warnings (222→223, 386→435) — no new lint surface. New import creates no module cycle (`useBlockingMatchStatusPolling`'s value imports are matchStateMachine/matchCountdown/rgPollingRegistry/rgPerfTrace — all already in this hook's graph at HEAD — plus RN-free liveMatchMountedRegistry/registryKeys, none referencing partyRunSync).

### Attack 2 — RETRY CORRECTNESS in the countdown funnel: PASS
The catch-up tick is the **same effect-local `syncRoomLinkedMatch` closure** the acquired interval fires — equivalence is structural, not behavioral-by-luck. Retry ticks while the zombie lives are registry-acquire attempts only (dead handle, no timer, no network; the per-tick `onDuplicate` mark is `__DEV__`/trace-flag-gated console, production no-op — same as the shipped blocking/party-room retries). Countdown walk (host press → 로딩중 → digit → active): in every phase the retry can fire only in the lose state, where HEAD delivered *nothing* after the initial fetch; post-re-acquire timing (one catch-up + `intervalMs` cadence) equals the healthy path's shape (immediate fetch + `intervalMs`). WHAT the funnel learns cannot differ: same endpoint/builder → `loadDuelMatchStatus` with linked args → monotonic `shouldAcceptServerSnapshot` (out-of-order/overlap-safe) + forfeit tombstone; server reports `'matched'` until the slot passes (STAGE 2), digit is pure `selectCountdownDigit(slotStartMs, syncedNowMs)`, force-open is owned solely by slot-gated `useSlotGatedArenaOpen` (STAGE 3 — this sync cannot flip it), extra `syncServerClock` samples only make clockReady sooner (the direction of the countdown-entry fix's "clock every poll"). Keep-fresh room refetch stays throttled+in-window-gated; arena pin stays pinKey-deduped. Stale closures die on any dep change (cleanup stops retry before re-attempt with fresh values); post-cleanup catch-up applies are `canceled`-guarded for the effect-local parts and loader-guarded for the apply — identical envelope to HEAD's in-flight-tick-at-cleanup.

### Attack 3 — LIFELINE PARTY COVERAGE: PASS (test-only)
Zero production lifeline change. The new test locks the decision: stale stamp >8s + active → fires; 2.5s-fresh → no-op. Pre-active/post-finish silence already locked (`matchActive:false`; the runtime hook derives mode from `statusRef.state==='active'` → null → skip). Cited plumbing verified in-tree: party matchId fallback locked in `trackRunRuntimeDerivedState.test.ts` ('room-duel-match' assertions), loader stamps only accepted applies (`lastMatchStatusAppliedAtMsRef.current = Date.now()` after `setDuelMatchStatus`; guard-dropped returns exit above the stamp), no-arg loader resolves by `focusedDuelMatchIdRef` matchId. Zero cost when healthy (decision no-op, hook sets no state).

### Attack 4 — LATCH HEALED: PASS
Walk verified in helper source + locked by the 2 new seam tests on the real registry: lose → mark (with zombie's `activeOwnerId`, tying to `'polling duplicate blocked'`) → retry at `intervalMs` → zombie release (owner-identity-guarded; nothing else can release it) → next tick re-acquires → timer cleared **before** the single catch-up → normal cadence. Straggler ticks no-op (`stopped`/`acquiredPolling` guards); cleanup-before-reacquire clears the timer and a post-stop straggler acquires nothing; `stop()` idempotent; failed handles carry the registry's no-op release — zero slots leaked (asserted). Both-dead: linked + blocking retries ride different keys (grep confirms `match:<id>:linked-match-status` has exactly one creator) and heal independently; concurrent catch-ups are monotonic-guard-safe. Double-arm impossible (one retry per effect run, React cleanup ordering). Permanent-zombie worst case = cheap registry probe per tick, with lifeline + resume as backstops.

### Attack 5 — GATES: PASS (independently re-run)
`npx tsc --noEmit` 0 errors. `npx eslint .` 0 errors / 15 warnings. Full suite **1130 pass / 0 fail**. Stash-baseline (performed, diff restored intact): HEAD = 1127/0 and identical eslint modulo the two line-shifted pre-existing warnings → exactly +3 new tests, no baseline drift. `git diff --name-only` = the scoped protected file + 2 test files only; untouched: `useMatchProgressSync.ts` (#203 host), `useBlockingMatchStatusPolling.ts`, loaders, snapshot applier, `matchStateMachine`, `liveMatchSlot`, `countdownTickerGate`, registries, `backend/`.

### Attack 6 — HISTORICAL REGRESSION THOUGHT-EXPERIMENT: PASS
- **Guest skips countdown** (490e78f class): requires pre-slot active transition authority. Triple-gated (backend slot gate, slot-fact `useSlotGatedArenaOpen` sole flag owner, `resolveLinkedMatchActiveTransition`); the retry adds zero transition authority — it re-runs the same guarded tick, and a pre-slot fetch returns `'matched'`. Not reproducible.
- **Digit divergence**: digit is pure in (server slot, RTT-corrected monotonic clock); the diff changes neither cadence nor either source — in lose states it *restores* the clock/slot sample flow HEAD starved. Not reproducible.
- **Arming overlay re-show** (dual-source thrash class): no second state source introduced; same tick fn, throttled keep-fresh, deduped pin, phase derivation untouched. Not reproducible.

### Residual (documented, in scope-boundary)
Mechanism (ii) — the never-retried heartbeat slot + `canSendMatchProgressHeartbeat` gate (`useMatchProgressSync.ts:268-269, 300-317`) — remains, per the diag doc's explicit deferral ("fix only if `'duplicate-heartbeat-owner'` marks appear"). This diff neither touches nor worsens it; displayed-opponent checkpoint pinning under a dead push channel is still possible until the 90s disconnect/app-switch. Watch marks: `'linked match polling lost acquire'`/`'reacquired after retry'` (new), `'polling duplicate blocked'`, `'progress heartbeat skipped'`, `'opponent sync lifeline fired'`.

Minor non-defect: the retry's `startPolling` duplicates the interval-args object verbatim — deliberate (guarantees byte-identical re-acquire semantics) and safer than refactoring the acquired path in a protected file.

**SHIP** — uncommitted work at `<repo>` (`src/features/runs/sync/partyRunSync/useLinkedMatchSync.ts`, `src/features/runs/sync/partyRunSync/useLinkedMatchSync.test.ts`, `src/features/runs/runtime/opponentSyncLifeline.test.ts`) is safe to commit as-is.
