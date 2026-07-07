All mechanics verified. Assembling the report.

## Verified mechanics + fix-surface map

### 1. rgHeartbeatRegistry semantics — the SLOT registry has NO eviction at all (the 12s at :27 is a different registry)

`<repo>/src/utils/rgHeartbeatRegistry.ts` holds **two** registries:

- **Slot registry** (`heartbeatSlotRegistry`, :10-19, built by `createKeyedSlotRegistry` in `src/utils/rgKeyedRegistry.ts:54-112`): `acquire()` (:61-100) — if `activeSlots.get(key)` exists it returns `{acquired:false, ownerId: activeSlot.ownerId, release: () => {}}` (a **no-op release**, :71-75) with **no age check of any kind**. `startedAtMs` is recorded at :85 but **never read**. The only removal paths are the winning owner's `release()` closure (:91-98, ownerId-identity-guarded delete) and `clearForTest`. `canUseRgHeartbeatSlot(key, ownerId)` (rgHeartbeatRegistry.ts:66-69) is a pure read: `activeOwnerId === null || activeOwnerId === ownerId`. **There is no liveness concept: nothing renews an owner (not sends, not ticks), and nothing evicts a dead/silent owner — a held slot is held until the exact owning closure's `release()` runs. Lazy-vs-active is moot: neither exists.**
- **Single-flight registry** (:29-44): the 12s constant at :27 (`HEARTBEAT_MAX_INFLIGHT_AGE_MS`) belongs **only** to this one — in-flight API requests. Its eviction IS lazy: evaluated inside `run()` (rgKeyedRegistry.ts:129-155) only when a new `runRgHeartbeatSingleFlight` call arrives for the key. During the latch the visible instance never reaches `run()` (blocked earlier at the canSend gate), so even this lazy eviction is unreachable from the loser.

### 2. The heartbeat effect in useMatchProgressSync (`src/features/runs/sync/useMatchProgressSync.ts`)

- **Arming**: effect :256-290, deps exactly `[activeHeartbeatMatchId, heartbeatEnabled]` (:290). `activeHeartbeatMatchId` is computed **at render** (:190-192) from `resolveActiveMatchProgressTarget` (matchProgressSync.ts:182-219 — needs `state === 'active'` on the instance's own `duelMatchStatusRef`/`groupMatchStatusRef`/`roomLinkedMatchContextRef`). `heartbeatEnabled` comes from `TrackRunExperienceRuntimeModel.tsx:1969-1971`: `heavyTickersFocusGate && trackRunIdleViewModel.shouldRunLiveMatchProgress && shouldEnableMatchProgressHeartbeat`, where `heavyTickersFocusGate = !(isTabMode && hasLocalActiveHint && !isScreenFocused)` (:766-771) — i.e. always TRUE for a stack-mode instance regardless of focus.
- **Lost acquire** (:268-270): `if (!heartbeatSlot.acquired) { return undefined; }` — no ownerRef write, no retry, no cleanup, no mark. `heartbeatSlotOwnerRef` stays null, so `canSendMatchProgressHeartbeat` (:300-317) evaluates `canUseRgHeartbeatSlot(key, undefined)` → false while anyone else holds → `'progress heartbeat skipped' reason:'duplicate-heartbeat-owner'` (:308-314).
- **Re-run triggers**: only a change of those two dep values. **AppState transitions do NOT re-run it** — resume re-renders the model, but if matchId+enabled are value-identical the effect is skipped, so there is no re-attempted acquire and (per §1) no eviction to trigger. **Screen-off/on does NOT heal the latch; it bypasses it**: while backgrounded, `flushBackgroundMatchProgressSync` (backgroundMatchProgressSync.ts:733-1053) POSTs every 3s with **no heartbeat-slot gate** (its own module single-flight :449-464, gated `!isAppBackground || !context → return` at :772-774), advancing my server elapsed; on resume the forced `refreshMatchProgressHeartbeat` (useTrackingAppStateSync.ts:171-190, :178) hits the canSend skip again → re-wedge. Exactly the observed flow-then-wedge.
- **What fires sends** — all gated by `canSendMatchProgressHeartbeat`: (a) GPS snapshot emissions → `subscribeBackgroundRunTracking` → `handleBackgroundTrackingSnapshot` (useTrackingAppStateSync.ts:115-118) → `refreshMatchProgressHeartbeat` (gate at :641); (b) the 1s keep-alive interval (useMatchProgressSync.ts:687-699 → same fn, same gate); (c) resume/lifecycle pushes via `syncMatchLifecycleStatus` (gate at :606). Gate order inside `refreshMatchProgressHeartbeat`: throttle :628 (2.5s, `MATCH_PROGRESS_HEARTBEAT_INTERVAL_MS = LIVE_MATCH_SERVER_SYNC_INTERVAL_MS = 2500`, liveMatchCadence.ts:1) → target :636 → canSend :641 → stamp :645. Because the stamp only advances **after** canSend passes, a latched instance re-attempts (and marks) every ~1s. **Exception: `sendPendingFinishPush` → `pushRunningMatchProgress` (:477) is NOT canSend-gated — finish delivery bypasses the latch.**

### 3. Why the ghost stops pushing — it is a LIVE, mounted, silent holder; "dead-but-unevicted" is impossible and "eviction-on-retry" alone is insufficient

- A truly unmounted ghost always releases (React runs the cleanup :283-289; release is ownerId-guarded so it can't misfire). Held slot ⇒ the owning effect instance is still mounted with its cleanup un-run.
- `canSendMatchProgressHeartbeat` itself has **no focus/mounted refs** — only the registry ownership check (:300-317). The ghost (owner) always passes it.
- The ghost's send values are NOT the problem: `buildDisplayedMatchProgress(snapshot)` (useTrackingSessionSnapshots.ts:394-416) derives distance/elapsed from the **passed module-level snapshot** (`getBackgroundRunTrackingSnapshot`) — last night's verify was right that a *sending* ghost delivers live distance. Likewise `shouldSendMatchProgressHeartbeat` reads the shared snapshot's status.
- The instance-scoped kill switch is the **per-tick target resolution**: every send path calls `getActiveMatchProgressTarget()` live (:601-603, :636-638), which reads the ghost's OWN `matchModeRef` / `duelMatchStatusRef` / `groupMatchStatusRef` / `roomLinkedMatchContextRef`. Those are effect-mirrored from its React state (`useTrackRunRenderTrace.ts:11-14`) or **directly nulled without any render** (`roomLinkedMatchContextRef.current = null` at useTrackRunMatchStatusLoaders.ts:155, useTrackRunRuntimeMatchMaintenanceActions.ts:53, TrackRunExperienceRuntimeModel.tsx:1584). A holder whose target collapses via such a non-render mutation — while its render pipeline is stalled (tab instance frozen under freezeOnBlur; a frozen tree defers renders/effect re-runs but its already-armed intervals keep ticking and module callbacks keep mutating refs) — returns silently at :637/:602 on **every** tick: zero pushes, zero marks (the 'skipped' mark only fires from the canSend gate, not the target-null return), while the acquire effect's render-scoped deps never change → release never runs → **slot held forever by a live ghost**. A focus-gate flip (`heartbeatEnabled` → false) cannot be the silencer: processing that render re-runs the effect and releases the slot; if the freeze defers the render, the closure stays stale-true and doesn't gate anything.
- **Consequence for the fix**: periodic re-acquire in the loser only wins when the owner eventually releases (unfreeze/unmount/enabled-flip render). Against today's silent-live-holder the slot never frees, so retry must be paired with a **stale-owner eviction/steal** keyed on a push-activity stamp. The steal is safe by construction: the ghost's eventual `release()` is ownerId-guarded (rgKeyedRegistry.ts:92-97, no-op after a steal) and its own canSend flips false forever (its `heartbeatSlotOwnerRef.ownerId` no longer matches the registry owner) — no dual-sender window.

### 4. Minimal-fix surface (additive, lose-branch only)

- **Retry site**: inside the effect at useMatchProgressSync.ts:256-290, in the `!heartbeatSlot.acquired` branch (:268-270). Mirror the shipped organ-3 pattern `armBlockingMatchStatusPollRetry` (useBlockingMatchStatusPolling.ts:122-167; consumed additively in useLinkedMatchSync.ts:379 with lost-acquire/reacquired marks): arm a `setInterval` (natural cadence `MATCH_PROGRESS_HEARTBEAT_INTERVAL_MS` 2500ms — failed attempts are a Map lookup + the registry's `onDuplicate` rgPerfMark, same cost profile as the shipped polling retry) that re-calls `acquireRgHeartbeatSlot(heartbeatKey, ...)`; cleanup must stop retry-or-acquired-handle (the helper's `stop()` shape).
- **On reacquire**: set `heartbeatSlotOwnerRef.current = {key, ownerId}` (mirror :272-275), start `rgPerfTrackResource` (mirror :277-281), add marks mirroring `'linked match polling lost acquire'`/`'reacquired after retry'`. An explicit immediate heartbeat is optional: during the latch the throttle stamp (:645) never advanced, so the existing 1s keep-alive (:687-699) fires a real send within ≤1s of reacquire on its own; if an explicit one is wanted, call `refreshMatchProgressHeartbeat(getBackgroundRunTrackingSnapshot({cloneRoute:false}))` via a render-updated ref (extend the existing `callbackRef` pattern :165-177) to avoid changing the effect's deps. (Note: adding `refreshMatchProgressHeartbeat` to the deps would technically be re-run-neutral — its identity only changes with `heartbeatEnabled`, already a dep — but the ref route keeps the dep list byte-identical.)
- **Stale-owner eviction (required for the live silent ghost)**: in the retry tick, if `!acquired` AND `Date.now() - (getBackgroundSyncDiagnostics().lastHeartbeatAtMs ?? 0) > STALL_MS` (~10-15s; must exceed 2500ms×a few and the 3s bg cadence), force-free then acquire. `lastHeartbeatAtMs` (backgroundSyncDiagnostics.ts:9,:68-75) is the module-level **attempt** stamp fed by every instance's `pushRunningMatchProgress` (:322) plus both background paths (backgroundMatchProgressSync.ts:944, :1002) — a fresh stamp means SOMEONE is pushing (healthy owner or bg flush → don't steal); a stale one is exactly the silent-holder signature. Needs one new additive registry method (`evict(key)`/force-acquire on `createKeyedSlotRegistry` + a wrapper in rgHeartbeatRegistry.ts — new surface outside the protected file; registries were untouched by the organ-3 fix). An attempting-but-failing owner keeps the stamp fresh and is instead handled by the existing single-flight 12s lazy eviction.
- **Existing stamps** (for an optional push-watchdog): success-only — `setLastSyncedMatchProgress` w/ `updatedAt` (useMatchProgressSync.ts:350; matchProgressSync.ts:173-179, per-instance state) and `lastBackgroundMatchProgressSyncAtMs` (backgroundMatchProgressSync.ts:448, advanced at :960/:1020, bg-only). Attempt-only shared — `lastHeartbeatAtMs` above (`recordBackgroundHeartbeatSent` :77-79 merely aliases attempt). **No module-level last-successful-foreground-push stamp exists**; adding one would be one fire-and-forget line after `await heartbeatRequest.promise` (:349) — touches the fn shared with the pending-finish path, so list it explicitly if taken.
- **#203 invariants that must stay byte-identical**:
  - 3s uploader chain: `BACKGROUND_MATCH_PROGRESS_TIMER_MS = 3000` (backgroundMatchProgressTimer.ts:8), `BACKGROUND_MATCH_PROGRESS_SYNC_INTERVAL_MS = 3000` / `INFLIGHT_STALE 6s` / `PUSH_TIMEOUT 4s` (backgroundMatchProgressSync.ts:44-58), `PERIODIC_MATCH_UPLOAD_INTERVAL_MS = 3000` (periodicMatchUploadController.ts:34) and the `startPeriodicMatchUpload` handoff (backgroundMatchProgressSync.ts:925-931).
  - Background flush internals: gate order :762-810, throttle-advance-on-success-only (:960, :1020), identity-guarded single-flight teardown (:453-464), terminal-stop 404/410 (:230-256, :1041-1043).
  - Pending-finish retry: 5s resend interval + hydration (useMatchProgressSync.ts:706-730), `sendPendingFinishPush` channel order — backgrounded-native first :466-472, JS :476-479, native-on-throw :483-487 — settle rules :381-435, and its canSend-bypass (:477).
  - Finished-body native handoff zero-await: §3.④ pre-resolve (backgroundMatchProgressSync.ts:499-522, :812-832) and no await between payload build and handoff (:888-994).
  - Forfeit/finish paths: match-end teardown ORDER deliver-final → stop-timer → clear-context (useMatchProgressSync.ts:571-595), `deliverFinalMatchStatus` finished-only push (:513-563), unmount-only cleanup (:295-298), funnel forfeit-first/monotonic-second + terminal teardown (useTrackRunMatchStatusSnapshotApplier.ts:32-101).
  - Heartbeat API single-flight semantics incl. the 12s lazy eviction (rgHeartbeatRegistry.ts:27-44, rgKeyedRegistry.ts:128-171) — the fix operates on the SLOT registry only; and the guarded-apply routing `applyMatchStatusSnapshot(..., {source:'heartbeat'})` (:360-369) plus the deliberately-unwired bg applier note (:249-254).
- **On-device discriminators** for this exact mechanism: visible instance emits `'progress heartbeat skipped' reason:'duplicate-heartbeat-owner'` every ~1s; the silent holder emits nothing (target-null return has no mark); `'heartbeat duplicate blocked'` (rgHeartbeatRegistry.ts:12-17) fires on each retry attempt once the fix lands.

---

All gates green. Final report.

## Implementation

**Fix (retry-only, additive):** the heartbeat-slot effect's lost-acquire branch in `useMatchProgressSync.ts` now arms a retry interval (cadence `MATCH_PROGRESS_HEARTBEAT_INTERVAL_MS` = 2500ms) that re-attempts the SAME `acquireRgHeartbeatSlot`. On re-acquire it performs exactly the success-path bookkeeping (owner ref + `rgPerfTrackResource`, plus lost/reacquired `rgPerfMark`s mirroring the organ-3 marks) and fires ONE catch-up via the existing `refreshMatchProgressHeartbeat(getBackgroundRunTrackingSnapshot({cloneRoute:false}))` — the same function/gates the 1s keep-alive uses (its throttle stamp never advanced during the latch, so the catch-up sends immediately). Cleanup `retry.stop()` halts whichever is live. Registries untouched.

**New RN-free sibling helper** (existing `armBlockingMatchStatusPollRetry` shape didn't fit the slot registry's `release()`-handle acquire): `<repo>/src/features/runs/sync/heartbeatSlotRetry.ts` — `armHeartbeatSlotAcquireRetry` (retry timer, stopped/acquired guards, bookkeeping-before-catch-up, single catch-up, idempotent `stop()`, injectable timers). Node tests in `heartbeatSlotRetry.test.ts` against the REAL `rgHeartbeatRegistry`: zombie holds → retry ticks fail → zombie releases → re-acquire with owner-ref-set callback BEFORE exactly one catch-up → send gate flips (`canUseRgHeartbeatSlot`) → straggler tick no-op → stop releases slot, zero live timers, idempotent; stop-before-reacquire acquires nothing; rejecting catch-up swallowed.

**One disclosed deviation beyond branch+import** (unavoidable): a 2-line render-updated ref `refreshMatchProgressHeartbeatRef` added after the `refreshMatchProgressHeartbeat` useCallback — the slot effect sits textually ABOVE that callback, so putting it in the dep array is a render-time TDZ ReferenceError and capturing it un-depped adds an exhaustive-deps warning (breaking eslint baseline). This is the ref route the verification sanctioned; the effect's dep array stays byte-identical `[activeHeartbeatMatchId, heartbeatEnabled]`. Success path, canSend gating, 1s keep-alive, GPS sends, pending-finish (incl. its canSend-bypass), background flush, finished handoff, forfeit/finish teardown order: byte-identical (see diff — no other hunks).

**RESIDUAL (per verification §3, deliberately not attempted):** a LIVE silent holder — frozen tab instance whose match target collapsed via non-render ref mutation — never releases, so retry alone never wins against it; fixing it needs a stale-owner eviction keyed on `lastHeartbeatAtMs` (new registry surface). On-device discriminators: latched instance marks `'progress heartbeat skipped' reason:'duplicate-heartbeat-owner'` ~1/s, plus (new) `'progress heartbeat slot lost acquire'` once and `'heartbeat duplicate blocked'` per retry attempt; the silent holder emits nothing. `'progress heartbeat slot reacquired after retry'` confirms an un-latch.

## Gates

- tsc: exit 0
- eslint: exit 0, output byte-identical to baseline (15 warnings, all pre-existing)
- suite `npx tsx --test "src/**/*.test.ts" "src/**/*.test.tsx"`: **1133 pass, 0 fail** (baseline 1130 + 3 new), 0 cancelled/skipped
- NOT committed

## git diff --name-only

```
src/features/runs/sync/useMatchProgressSync.ts
```
Untracked new files: `src/features/runs/sync/heartbeatSlotRetry.ts`, `src/features/runs/sync/heartbeatSlotRetry.test.ts`

## Verbatim useMatchProgressSync.ts diff

```diff
diff --git a/src/features/runs/sync/useMatchProgressSync.ts b/src/features/runs/sync/useMatchProgressSync.ts
index c099f74..f0600d3 100644
--- a/src/features/runs/sync/useMatchProgressSync.ts
+++ b/src/features/runs/sync/useMatchProgressSync.ts
@@ -25,7 +25,9 @@ import {
 import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
 import type { PartyRunLinkedMatchContext } from '@/features/runs/lifecycle/matchStateMachine';
 import type { LastSyncedMatchProgress } from '@/features/runs/viewModels/matchProgress';
+import { armHeartbeatSlotAcquireRetry } from '@/features/runs/sync/heartbeatSlotRetry';
 import {
+  MATCH_PROGRESS_HEARTBEAT_INTERVAL_MS,
   buildSyncedMatchProgressSnapshot,
   resolveActiveMatchProgressTarget,
   resolveMatchProgressHeartbeatStatus,
@@ -266,7 +268,66 @@ export function useMatchProgressSync({
     });
 
     if (!heartbeatSlot.acquired) {
-      return undefined;
+      // Heartbeat-slot latch fix (4th organ of the no-retry latch; mirrors the shipped
+      // armBlockingMatchStatusPollRetry pattern) — a LOST acquire used to return silently, and
+      // this effect's deps (matchId + enabled) stay value-identical for the whole match, so the
+      // loser stayed latched out of the send gate forever: canSendMatchProgressHeartbeat kept
+      // reading canUseRgHeartbeatSlot(key, undefined) → false, every foreground send skipped as
+      // 'duplicate-heartbeat-owner', and NOTHING ever re-attempted the acquire (AppState resumes
+      // re-render but do not re-run a deps-stable effect). Keep re-attempting the SAME acquire at
+      // the heartbeat cadence; the moment the owner releases (unmount / unfreeze-processed
+      // cleanup / enabled-flip render) install the exact success-path bookkeeping and fire ONE
+      // catch-up heartbeat through the same refreshMatchProgressHeartbeat the 1s keep-alive tick
+      // uses — its throttle stamp never advanced during the latch (it only moves after canSend
+      // passes), so the catch-up sends immediately.
+      // RESIDUAL (deliberately NOT addressed here — no focus-based preemption in this file): a
+      // LIVE silent holder (frozen tab instance whose match target collapsed via a non-render
+      // ref mutation) never releases, so this retry never wins against it. On-device
+      // discriminators: this latched instance marks 'progress heartbeat skipped'
+      // reason:'duplicate-heartbeat-owner' ~1/s and the registry marks 'heartbeat duplicate
+      // blocked' per retry attempt, while the silent holder emits nothing.
+      rgPerfMark('progress heartbeat slot lost acquire', {
+        activeOwnerId: heartbeatSlot.ownerId,
+        heartbeatKey,
+        matchId: activeHeartbeatMatchId,
+      });
+      const retry = armHeartbeatSlotAcquireRetry({
+        intervalMs: MATCH_PROGRESS_HEARTBEAT_INTERVAL_MS,
+        acquireSlot: () => acquireRgHeartbeatSlot(heartbeatKey, 'match progress heartbeat', {
+          cadence: 'on tracking tick',
+          heartbeatKey,
+          matchId: activeHeartbeatMatchId,
+        }),
+        onReacquired: (retriedSlot) => {
+          heartbeatSlotOwnerRef.current = {
+            key: heartbeatKey,
+            ownerId: retriedSlot.ownerId,
+          };
+          rgPerfMark('progress heartbeat slot reacquired after retry', {
+            heartbeatKey,
+            matchId: activeHeartbeatMatchId,
+            ownerId: retriedSlot.ownerId,
+          });
+          const stopRetriedHeartbeatTrace = rgPerfTrackResource('heartbeat', 'match progress heartbeat', {
+            cadence: 'on tracking tick',
+            heartbeatKey,
+            matchId: activeHeartbeatMatchId,
+          });
+          return () => {
+            stopRetriedHeartbeatTrace();
+            if (heartbeatSlotOwnerRef.current?.ownerId === retriedSlot.ownerId) {
+              heartbeatSlotOwnerRef.current = null;
+            }
+          };
+        },
+        onCatchUp: () => refreshMatchProgressHeartbeatRef.current(
+          getBackgroundRunTrackingSnapshot({ cloneRoute: false }),
+        ),
+      });
+
+      return () => {
+        retry.stop();
+      };
     }
 
     heartbeatSlotOwnerRef.current = {
@@ -676,6 +737,16 @@ export function useMatchProgressSync({
     });
   }, [canSendMatchProgressHeartbeat, getActiveMatchProgressTarget, heartbeatEnabled, matchProgressHeartbeatRef, pushRunningMatchProgress]);
 
+  // Heartbeat-slot latch fix — render-updated ref through which the slot effect above (deps
+  // deliberately kept [matchId, enabled]) fires its post-reacquire catch-up using the SAME send
+  // function the 1s keep-alive tick uses. A direct reference up there is impossible: the effect
+  // sits textually above this declaration, so putting the callback in its dep array would read a
+  // TDZ binding during render, while capturing it without the dep would trip exhaustive-deps.
+  // Assigned every render, so the closure always sees the current identity (which only changes
+  // with heartbeatEnabled — already a dep of that effect).
+  const refreshMatchProgressHeartbeatRef = useRef(refreshMatchProgressHeartbeat);
+  refreshMatchProgressHeartbeatRef.current = refreshMatchProgressHeartbeat;
+
   // Stationary keep-alive. The heartbeat is the channel that brings the OTHER
   // participants' liveStatus (forfeited/finished) back into duel/groupMatchStatus, but
   // it was fired only from GPS snapshot emissions — a runner standing still stopped
```

---

All gates independently reproduced. Final verdict.

## VERDICT: SHIP

Diff surface: `src/features/runs/sync/useMatchProgressSync.ts` (3 hunks, 72+/1−), new `src/features/runs/sync/heartbeatSlotRetry.ts` + `heartbeatSlotRetry.test.ts`. Uncommitted, as stated.

### 1. FILE BYTE-SAFETY — PASS
Exactly 3 hunks: (i) 2 import lines (`armHeartbeatSlotAcquireRetry`, `MATCH_PROGRESS_HEARTBEAT_INTERVAL_MS` — genuinely exported at `matchProgressSync.ts:14` = 2500); (ii) the `!heartbeatSlot.acquired` branch, replacing only `return undefined;`; (iii) the disclosed render-updated ref after the `refreshMatchProgressHeartbeat` useCallback. Hunk (iii) is the exact ref route the verification sanctioned, mirrors the file's pre-existing `callbackRef` render-assignment pattern (:167-179), is an unconditional top-level hook (stable order), and the forward reference is TDZ-safe (dereferenced only when effects/timers run, after the component body initializes it). Arithmetic closes the ledger: 72/1 fully accounted, so keep-alive timer (:758-770), GPS send path, `canSendMatchProgressHeartbeat` (:361-378), `pushRunningMatchProgress` (:380-433), pending-finish store interactions + 5s resend + hydration (:435-624, :777-801) including the canSend-bypass at :538, match-end teardown order deliver→stop-timer→clear-context (:632-656), unmount-only cleanup (:356-359), and every dep array (:351 stays `[activeHeartbeatMatchId, heartbeatEnabled]`) are byte-identical. The zero-await finished-payload→native-handoff invariant lives in `backgroundMatchProgressSync.ts`, which is not in the diff at all — repo delta is exactly 1 modified + 2 new files, so every #203 invariant file (background sync/timer/periodic uploader, pending-finish store, snapshot applier, both registries) is untouched.

### 2. RETRY CORRECTNESS — PASS (one record correction)
Lost acquire → one `'progress heartbeat slot lost acquire'` mark → 2500ms interval re-attempts the identical acquire. On win: clearInterval before bookkeeping; ownerRef set exactly as the success path; reacquired mark; identical `rgPerfTrackResource` args; teardown mirrors the success cleanup (trace stop + ownerId-guarded ownerRef null; teardown-then-release vs the success path's release-then-null is a synchronous, unobservable ordering difference). Exactly ONE catch-up, fired strictly after bookkeeping (helper :60 vs :62; asserted in tests). Cleanup at any phase leaves zero timers and releases the slot; `stop()` idempotent; straggler tick a no-op; stop-before-win acquires nothing even if the slot frees; rejecting catch-up swallowed — all tested against the REAL registry. No steal possible: `createKeyedSlotRegistry.acquire` fails on Map presence, and a ghost's stale release is ownerId-guarded (`rgKeyedRegistry.ts:92-97`). Correction to the attack brief, not the code: the SLOT registry has no eviction of any kind — "retry attempts trigger lazy eviction" applies only to the single-flight API registry's 12s rule; the implementation correctly relies on owner release and correctly discloses the silent-live-holder RESIDUAL. Precision note: once an owner releases, the OLD code's keep-alive would already resume sending ownerless within ~1s (`canUseRgHeartbeatSlot(key, undefined)` is true on a free slot), so this fix's material delta in the win case is restoring registered single-ownership (re-blocking future duplicate instances) plus the un-latch telemetry — modest utility, zero regression.

### 3. PUSH-PATH SEMANTICS — PASS
The catch-up is one invocation of the same function+argument the 1s keep-alive fires, and the retry can only exist while the keep-alive effect is armed (identical arming conditions, torn down in the same commit). It therefore cannot reach any state the existing path cannot: throttle stamp advances after canSend so either interleaving (keep-alive-first or catch-up-first) throttles the other — no double-send; live target resolution requires `state === 'active'` — no countdown/terminal/forfeited send; `shouldSendMatchProgressHeartbeat` requires tracking `'running'` — no idle/paused send; backgrounded exposure identical to the existing keep-alive (Android-JS-alive already sends; iOS-suspended timers don't fire). A 'finished' catch-up reproduces exactly what a keep-alive tick would do 1s later, goal-freeze-first ordering included. Re-acquire against a LIVE owner is structurally impossible.

### 4. HANDS-FREE + #203 SCENARIOS — PASS
(a) screen-off finish: flush, finished-body build, native cadence handoff, zero-await — all in untouched files; (b) pending-finish after kill: hydration + 5s resend + channel order (backgrounded-native → JS → native-on-throw) + canSend-bypass byte-identical; (c) forfeit mid-run: target collapse re-runs the effect → `retry.stop()` (zero timers), teardown effect still delivers finished-only; (d) background flush while wedged: no slot gate there (unchanged), the retry adds only a network-free 2.5s Map lookup (prod-silent marks — all `rgPerfTrace` logging is gated on `isRgPerfTraceEnabled`).

### 5. GATES — PASS (reproduced myself, with stash baseline)
tsc exit 0. eslint exit 0, output byte-identical to the stashed baseline (15 pre-existing warnings, none in changed/new files). Suite: worktree 1133 pass / 0 fail / 0 cancelled / 0 skipped vs baseline 1130/0 — exactly the +3 new tests; scripts glob 5/0. `git diff --name-only`: only the allowed file; working tree restored checksum-identical after the baseline round-trip.

### 6. REGRESSION THOUGHT-EXPERIMENT — PASS
Push HTTP stall: the retry performs zero network and zero awaits; its one send rides the same single-flight with the 12s stale-inflight eviction — a hung push cannot wedge it. Inflight stuck: single-flight registry byte-untouched; the fix adds no eviction surface anywhere. FG-service kill / screen-off: the 3s uploader chain and its constants are in untouched files; the retry is a foreground-JS interval that dies with the JS thread, holds no native resources, and in the worst frozen-tree case ticks strictly less work every 2.5s than the pre-existing 1s keep-alive already does in that same tree. The only new failure classes a retry could introduce — wrong-state send or dual sender — are both excluded structurally (same gates/throttle/single-flight; atomic-sync acquire; ownerId-guarded ghost release).

RESIDUAL carried (disclosed, confirmed real): the silent LIVE holder never releases, so this retry cannot un-wedge that case; it needs the stale-owner eviction keyed on `lastHeartbeatAtMs` (new registry surface, deliberately out of scope). On-device discriminators to watch: `'progress heartbeat skipped' reason:'duplicate-heartbeat-owner'` ~1/s + `'heartbeat duplicate blocked'` per retry attempt (latched-with-live-holder), `'progress heartbeat slot reacquired after retry'` (un-latch confirmed), silence (the ghost itself).
