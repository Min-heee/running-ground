All load-bearing claims from the three readers verified in source (corrections noted inline below). Final plan follows.

---

# FIX PLAN — slow/hanging finish flow (결과 저장 중 → blank 기록상세 → 잔상)

Repo: `<repo>`. All reader claims spot-verified; two refinements found: (1) the backend tracked-run dedup at `backend/src/repositories/runsRepository.mjs:401-410` **deliberately excludes match saves** (`!input.matchResult`), so a match-save retry after a landed-but-timed-out original inserts a duplicate run row — this couples client fix C2 to backend fix B5; (2) today's broken retry-as-solo accidentally *hits* that dedup, so Reader C's "duplicate solo record" occurs only when the original never landed. Protected areas (`useMatchProgressSync`, `localGoalFreezeStore` write path, locationTask, countdown funnel) are untouched by every item below.

## Verified failure model (one paragraph)

The overlay `결과 저장 중...` (render `src/features/runs/components/TrackRunExperienceView.tsx:169-176`, flag `TrackRunExperienceRuntimeModel.tsx:2331`) clears only in the `finally` of the save chain (`useRunForfeitCommand.ts:294/322/343`) — a serial 4-hop awaited chain (finish push 5s cap → `createTrackedRun` 60s cap + hidden `await fetchMyProfile()` at `src/lib/api/services/runs.ts:150` → live-sharing PATCH → native resets), every cap a JS `setTimeout` (`apiClient.ts:187-188`) that suspends when backgrounded (H1 = infinite overlay; self-heals only on foreground resume when the late timer fires). Server-side, both phones' finish traffic serializes on one 2.5MB `FOR UPDATE` row (`backend/src/storage/postgresStoreAdapter.mjs:130-175`): every 2.5s heartbeat writes because `liveUpdatedAt` is stamped unconditionally (`matchActionHandlers.mjs:461` area) and each push also runs `pruneMatchSessions`+`pruneMatchRooms` (each re-running the sweep); every `/result` poll holds the lock for a sweep (`runningMatchProgressRoutes.mjs:59-63`); room polls hold it too. 40-80% lock utilization from two users → multi-second queue delay per hop → 10-30s+ overlay. On failure the catch (`useRunSaveCommand.ts:192-193`) leaves bg-store 'paused'+persisted, wipes match runtime (`useRunForfeitCommand.ts:164`) → 잔상 with degraded retry (solo, freeze immortal); route-param tombstone expires at 10min (`terminatedRouteFocusMatch.ts:18`) → arena re-forced (C3).

---

## 1. CLIENT HARDENING — OTA batch, ship first (standing OTA authorization applies)

Ranked by user-pain-relief ÷ risk. None touch protected files.

### C-1. Overlay watchdog: 결과 저장 중 can never be infinite (relief: highest / risk: low-med)
- **New** `src/features/runs/lifecycle/matchEndOverlayWatchdog.ts` — pure: `resolveOverlayWatchdogPhase(elapsedMs)` → `'saving' | 'slow'(≥12s) | 'exit-offer'(≥20s) | 'expired'(≥40s)`. Wall-clock (`Date.now()` deltas), so a suspended-timer gap (H1) is counted.
- **New** `MatchEndTransitionOverlay` component (extract the block at `TrackRunExperienceView.tsx:169-176`): on `visible` flip true record `startMs`; 1s interval + `AppState` 'active' listener re-evaluate phase (resume after screen-off immediately jumps phases — H1-proof). Phases: `slow` → sub-copy "서버 응답이 늦어지고 있어요. 계속 저장 중이에요…"; `exit-offer` → secondary button "기다리지 않고 나가기"; `expired` → auto-invoke abandon once.
- **Abandon** (`onAbandonMatchEndTransition`, wired in `TrackRunExperienceRuntimeModel.tsx` next to the flag at :2331): bump a new `saveNavEpochRef`, then `setIsLeavingDuelMatch(false)` + `setIsLeavingGroupMatch(false)`. The in-flight save keeps running; status stays 'saving' → paused-shell action buttons stay hidden (`shouldShowPausedTrackingActions = isPaused && !showLiveArena`, `liveMatchPagePropsComparator.ts:27-36`) so no duplicate-save tap is possible; the small `LiveMatchSavingIndicator` shows.
- **Late-settle behavior** in `useRunForfeitCommand.ts:saveForfeitResultAndNavigate`: capture epoch at entry; at :160-162, if epoch unchanged → `router.replace` as today; if abandoned → **no yank**, instead `Alert.alert('기록 저장 완료', ..., [나중에, 보기 → router.push(redirect)])`. Late failure → existing catch → paused shell + retry (C-2).
- **Double-replace removal**: add `skipPostProcessorNavigation` to `SaveTrackingOptions`; `saveForfeitResultAndNavigate` always sets it (it navigates itself with matchId at :160-162), so `runPointRankingPostProcessor.ts:11`'s matchId-less first replace (and its extra run-detail mount + reconcile fetches) disappears. Solo saves keep it.

### C-2. Failure-path recoverability: pending-match-save context (relief: high / risk: low)
Kills ghost hole C1's data damage while honoring the freeze contract (freeze cleared ONLY at `runCleanupAfterSave.ts:42-44` success or discard `background/index.ts` reset — both untouched).
- **New** `src/features/runs/hooks/runSaveFlow/pendingMatchSaveContext.ts`: module-level `{ matchId, mode, matchSource, matchResult }` + set/get/clear (in-memory v1; relaunch retry still degrades to today's behavior — acceptable, the persisted bg snapshot + freeze already survive).
- `useRunSaveCommand.ts`: after resolving `activeMatchId`/`resolvedMatchResult` (:85-91), when `activeMatchId` → `setPendingMatchSaveContext(...)`. Fallbacks: `activeMatchId = resolveActiveMatchId(...) ?? pending?.matchId`, `resolvedMatchResult = options.matchResultOverride ?? trackedMatchResult ?? pending?.matchResult`. Clear in `runCleanupAfterSave` and in both discard paths (`useRunFinishCommand.ts:74`, `useRunSaveCommand.ts:188`).
- Effect: the paused-shell "이 기록 저장하기" retry re-threads matchId → freeze clamp reapplies (`:100-101`), saved blob carries matchResult+matchId (run-detail reconcile derives from blob, verified `useRunDetail.ts:90-102`), and success finally clears the freeze. Improve the failure copy at `useRunSaveCommand.ts:193` to point at the retry button.
- **Dependency**: retry idempotency against a landed original needs backend B5 (see ordering, §4).

### C-3. Never downgrade 'saving' from background sync (risk: low)
`useTrackingSessionSnapshots.ts:483` (`setStatus(snapshot.status)`): thread a `statusRef` and skip when foreground is `'saving'` and snapshot says `'paused'` — a foreground resume mid-save currently flips `isSaving` false and reopens save buttons (verified mechanism). One conditional.

### C-4. Dead exit card → actionable retry (H2) (risk: low)
`src/features/runs/lifecycle/matchExitAction.ts:97-110` (self-finished branch): `disabled = isLeaving || isSaving` (drop `!isRunning`); label when `!isRunning && !isSaving` → `'결과 다시 저장하기'`. The one-shot `autoExitTriggeredRef` (`LiveMatchExitActionCard.tsx:72-88`) stays — auto fires once per mount, after a failure only manual re-press re-enters (existing `pendingCounterpartForfeitResultRef`/`isSaving` guards no-op duplicates). Pure function, already covered by `matchExitAction.test.ts`.

### C-5. Skeleton-first 기록상세 (kills blank+spinner) (risk: low)
- `RunDetailScreen.tsx:90-155`: move `AuthHeader` outside the `runDetail ? ...` conditional; while `loading` render header + hero/card skeleton blocks instead of a bare `ActivityIndicator`; on `error` render "다시 불러오기" button calling a new `reload` returned from `useRunDetail` (`loadRunDetail` at `useRunDetail.ts:66` — just expose it).
- Convoy pile-on relief: in `useRunDetail.ts:211-226`, when `origin === 'running'` (fresh post-save arrival, param set by `runSaveNavigation.ts:24`), delay the first `runReconcile` by ~8s+jitter (the client just pushed final status; the §B4 seal takes ~90s anyway). Cold opens (내 활동, no origin) keep immediate reconcile.

### C-6. Opponent profile / match-result screens: retry affordance (risk: trivial)
- `OpponentProfileScreen.tsx:25-60`: extract fetch to a callback; on error render "다시 시도". Header already always renders.
- `MatchResultScreen.tsx` (`status === 'error'` branch): add 다시 시도; loading keeps `BrandLoadingView` (branded, not blank).

### C-7. 잔상 C3: persist the tombstone (risk: low)
`terminatedRouteFocusMatch.ts`: TTL 10min → 24h AND write-through the Map to AsyncStorage (hydrate on module init). Kills both ">10min re-entry" and "app-kill wipes the Map". The deeper fix (suppress `resolveRouteForcedLiveArena` when tracker idle + no local/server evidence) touches the countdown-funnel handoff — backlog it for a native-build cycle, not this OTA.

### Deliberately deferred (protected file)
H3 (single-flight adoption) and H4 (C1 resend cap/backoff) live in `useMatchProgressSync.ts` (#203-protected). The watchdog makes them non-user-facing; backend B2 makes the resends nearly free. Post-launch item.

---

## 2. BACKEND RELIEF — rides the pending deploy batch

### B-1. `/result` lock-free fast path (biggest server win available without #209)
`backend/src/routes/runningMatch/runningMatchProgressRoutes.mjs:59-63` (+ inject `loadStore` into deps in `server.mjs`):
```js
const snapshot = await loadStore();               // MVCC, no lock
const probeUser = requireUser(snapshot, request);
if (!sweepStuckMatchSessionFallbacks(snapshot)) { // clone; returns comprehensive `changed` (verified matchSessionFallbackSeals.mjs:133-193)
  sendJson(response, 200, buildMatchResultByMatchId(snapshot, probeUser, matchId)); // pure read (matchResultBuilders.mjs:722)
  return;
}
// heal needed → exactly today's locked path
const payload = await mutateStore((store) => { ... });
```
After finalize+back-fill, every poll becomes a lock-free read; a due seal still persists via the locked path. Semantics-identical. (No extra throttle needed — unchanged sweeps are free now.)

### B-2. Stop stamping `liveUpdatedAt` on already-finished re-pushes
`backend/src/lib/matchActionHandlers.mjs` (~:461): when `currentParticipant.liveStatus === 'finished' && effectiveStatus === 'finished' && finishElapsedSeconds != null`, skip the five live-field assignments. Distance/elapsed are already frozen by the finished short-circuit, so the mutation becomes byte-identical → the 35a1674 adapter skip drops the 2.5MB UPDATE (write ~300ms → read-lock ~100ms) for every post-finish heartbeat and C1 resend. Safe: stall detection returns stored status for `finished` without reading `liveUpdatedAt` (`matchPureHelpers.mjs:145-149`); sealed-DNF downgrade path (`effectiveStatus==='running'`) stamps normally.

### B-3. Throttle prunes on the progress POST
`matchActionHandlers.mjs:516-518`: module-level `lastProgressPruneMs`; run `pruneMatchSessions`+`pruneMatchRooms` at most once per 15s server-wide (inject/testable `now`). Seal timing shifts ≤15s inside a 90s window; the finish handler's direct `sealDuelFallbackResolutionIfElapsed` call is unaffected.

### B-5 (required by C-2). Match-save dedupe-as-upgrade
`backend/src/repositories/runsRepository.mjs:401-410`: extend the startedAt idempotency to match saves — same `(userId, startedAt)` AND same `matchResult.matchId` → do NOT push a new row; re-run `resolveMatchResult` and overwrite the existing run's `matchResult` (preserves the intentional PENDING→resolved upgrade), return `buildRunDetail(existing…)`. LP already dedupes by matchId.

### B-4 (conditional, rank last). `rooms/my` + `invite-inbox` off the lock
`runningMatchRoomRoutes.mjs:~105-146`: `mutateStore` → `loadStore`; `syncMatchRooms`'s mutations (`pruneMatchRooms` + countdown syncs, `matchRoomSync.mjs:57-61`) run on the discarded clone — physical pruning still happens via every write endpoint and B-3's tick, and all readers recompute sync per-request anyway. This is countdown-funnel-adjacent server plumbing: gate behind `npm run test:contracts` + a two-phone party-run smoke before including.

Skip: `alwaysWrite` stringify-skip (B6 in Reader B) — it would defeat B-2's no-change skip on the progress route; only worth it scoped to `createTrackedRun`, marginal (~30-60ms), leave out to keep the batch tight.

---

## 3. Honest framing — what remains until #209

| Stage | 결과 저장 중 (typical) | Worst case | Blank screens / ghost |
|---|---|---|---|
| Today | 10-30s | 60s error, or infinite (H1/backgrounded) | blank 기록상세, dead-end 잔상 |
| + OTA (client) | unchanged duration, but **bounded**: honest copy at 12s, exit at 20s, hard cap 40s; save continues in background; full-fidelity retry | never infinite; failure = recoverable paused shell | header+skeleton always; ghost structurally closed |
| + backend relief | **~3-8s** (lock work in the finish window drops from ~4-8s/10s to ~1.5-3s/10s: post-finish heartbeats stop writing, /result and room polls leave the lock, prunes dedupe; the two ~350-600ms tracked-run writes and the serial 4-hop chain remain) | ~15-20s under overlap | same |
| + #209 (route side-table) | **~1-3s** (every remaining mutation 10-30ms; the save stops rewriting all historical GPS to append one run) | network-bound | same |

The client work makes it GRACEFUL, the backend batch makes it FASTER, but the per-holder cost is store-size-dominated and **grows with every saved run** — only #209 ends the convoy and the worsening trend. Relief items reduce holder *count*, not holder *cost*.

## 4. Ordering
1. OTA C-1..C-7 (independent, ship first per standing authorization after green checks).
2. Backend batch B-1, B-2, B-3, B-5 together (user redeploys droplet); B-4 only if contract tests + party smoke pass. **Until B-5 is live, a C-2 retry after a landed-but-aborted original can duplicate a match run row** — narrow window (retry is manual), call it out in the deploy note.
3. #209 stays the root cure (task #209).

## 5. Test plan

Backend (node, wired into existing `backend/package.json` scripts):
- `src/routes/runningMatch/runningMatchProgressRoutes.test.mjs` (new): DI spy deps — finalized+back-filled session → `/result` served with `mutateStore` never called; seal-due session → locked path taken; 404/410 behavior identical on both paths.
- Extend `runningMatchContract.test.mjs`: duplicate `finished` push → store serialization byte-identical (B-2); assert standings/verdict unchanged.
- `matchActionHandlers` prune throttle: two pushes within 15s → one prune (injectable now).
- Extend `src/repositories/runsRepository.test.mjs`: match-save retry same (userId, startedAt, matchId) → `runs.length === 1`, matchResult upgraded PENDING→resolved, points not doubled.
- Full `npm test` (contracts cover seal/LP semantics).

Client (`tsx --test`, colocated `.test.ts` like `matchExitAction.test.ts`):
- `matchEndOverlayWatchdog.test.ts`: phase thresholds; simulated 10-min clock jump → 'expired' (H1).
- `matchExitAction.test.ts`: self-finished + !isRunning + !isSaving → enabled '결과 다시 저장하기'; isSaving → disabled.
- `pendingMatchSaveContext.test.ts`: fallback resolution when statuses wiped; cleared on cleanup/discard; freeze-clear precondition (matchId present) restored on retry.
- `terminatedRouteFocusMatch.test.ts`: storage round-trip + 24h TTL.

On-device verify (two phones, party duel 0.5km):
1. Normal finish both phones → overlay a few seconds, 기록상세 헤더+스켈레톤 immediately, match card PENDING→heals, 러닝탭 ready.
2. Convoy/hang: at finish, `docker compose pause` postgres on the droplet for ~30s → overlay shows slow-copy ~12s, 나가기 at 20s → tap → shell with small saving spinner, no buttons; unpause → Alert 기록 저장 완료 → 보기 → run-detail with 대결 카드. Re-enter running tab: ready, no 잔상.
3. H1: finish → screen off / app-switch 60s → return: overlay resolves within seconds (success nav/Alert or failure→paused+retry).
4. Failure retry: airplane mode during save → error + paused shell → disable airplane → "이 기록 저장하기" → record has 대결 카드 + LP; a new match can start (freeze cleared).
5. Ghost: after a failed save, kill app → relaunch → paused shell (not dead arena); also re-enter running tab 15+ min after a clean finish → ready screen (persisted tombstone).
6. Server: before/after backend batch, time `curl` loops on `/result` and `/rooms/my` during a finish window; confirm post-finish heartbeats stop producing row UPDATEs (updated_at stops moving between pushes).
