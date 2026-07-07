All gates green. Final report:

## C-1 … C-7 implemented per plan — all gates green, nothing committed

Repo: `<repo>` (all my changes under `src/` only; the modified `backend/*.mjs` files in the tree are the parallel backend workstream's — untouched by me).

**Gates**
- `npx tsc --noEmit`: 0 errors
- `npx eslint` (all 23 touched files): 0 errors, 0 warnings
- `npx tsx --test "src/**/*.test.ts" "src/**/*.test.tsx"`: **1146 pass, 0 fail** (baseline 1133 + 13 new)

**C-1 overlay watchdog**
- NEW `src/features/runs/lifecycle/matchEndOverlayWatchdog.ts:18-33` — pure `resolveOverlayWatchdogPhase(elapsedMs)` → saving/slow(≥12s)/exit-offer(≥20s)/expired(≥40s), wall-clock.
- NEW `src/features/runs/components/MatchEndTransitionOverlay.tsx` — extraction of the old inline block; startMs on visible flip (:43), 1s interval (:62) + AppState 'active' re-eval (:65-69, H1 jump), slow sub-copy "서버 응답이 늦어지고 있어요. 계속 저장 중이에요…" (:88-91), "기다리지 않고 나가기" button (:93-97), expired auto-abandon once per episode (:54-58).
- `src/features/runs/components/TrackRunExperienceView.tsx:172-181` — renders the component (old block + dead style removed); prop :96/:116.
- `src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx:379` `saveNavEpochRef`; :2320-2324 abandon handler (epoch bump → `setIsLeavingDuelMatch(false)`+`setIsLeavingGroupMatch(false)`; status stays 'saving' so paused-shell buttons stay hidden, `LiveMatchSavingIndicator` shows); :2350 wired.
- Late-settle: `src/features/runs/hooks/runSaveFlow/useRunForfeitCommand.ts:126` epoch captured at entry; :173-187 epoch unchanged → `router.replace` as today, abandoned → `Alert.alert('기록 저장 완료', …, [나중에, 보기 → router.push(redirect)])`; late failure keeps the existing catch → paused shell + C-2 retry.
- Double-replace removal: `skipPostProcessorNavigation` in `src/features/runs/hooks/useRunTracking.ts:20`; forfeit save always sets it (`useRunForfeitCommand.ts:155`); postProcessor skipped at `useRunSaveCommand.ts:210-216`; solo saves keep it.

**C-2 pendingMatchSaveContext**
- NEW `src/features/runs/hooks/runSaveFlow/pendingMatchSaveContext.ts` — module store `{matchId, mode, matchSource, matchResult}` + set/get/clear + pure `resolvePendingMatchSaveFallbacks` (live runtime always wins; pending backfills after the wipe, incl. party-ness).
- `useRunSaveCommand.ts:96-124` set on save (before `createTrackedRun`) with fallbacks `activeMatchId = resolveActiveMatchId(...) ?? pending.matchId`, `resolvedMatchResult = override ?? tracked ?? pending.matchResult`; :142 matchSource threaded; retry re-threads matchId → freeze clamp reapplies via existing `getLocalGoalFreeze(activeMatchId)`.
- Cleared: `runCleanupAfterSave.ts:49` (save success, next to `clearLocalGoalFreeze` — freeze contract untouched), `useRunFinishCommand.ts:78` (discard), `useRunSaveCommand.ts:226` (exit-unsavable discard).
- Failure copy `useRunSaveCommand.ts:233` now points at the actual paused-shell button '이 기록 저장하기'.
- B-5 dependency stands as planned: until backend B-5 is deployed, a retry after a landed-but-timed-out original can duplicate a match run row (deploy-note item).

**C-3** `src/features/runs/tracking/session/useTrackingSessionSnapshots.ts:489-491` — one conditional: skip `setStatus(snapshot.status)` when `trackerStatusRef.current==='saving' && snapshot.status==='paused'`; existing `trackerStatusRef` threaded through the Pick (:61) + `useTrackingSnapshotBuilder.ts` passthrough.

**C-4** `src/features/runs/lifecycle/matchExitAction.ts:98-117` — self-finished `disabled = isLeaving || isSaving` (dropped `!isRunning`), label `!isRunning && !isSaving` → '결과 다시 저장하기' (:111). `LiveMatchExitActionCard` one-shot `autoExitTriggeredRef` untouched.

**C-5** `src/features/running/screens/RunDetailScreen.tsx:96-118` — AuthHeader outside the conditional (always renders), skeleton hero/duo/info blocks while loading, '다시 불러오기' on a failed first load calling new `reload` (`useRunDetail.ts:83-88`, returned :270). Convoy relief: `useRunDetail.ts:42-48` + :230-257 — `origin==='running'` delays the FIRST `runReconcile` by 8s+0-4s jitter; cold opens immediate; the §B4 one-shot retry timer unchanged.

**C-6** `OpponentProfileScreen.tsx:26-72` fetch extracted to `loadProfile` callback + retryNonce effect, '다시 시도' at :86-92 (header already always renders). `MatchResultScreen.tsx:80-105` EmptyState gets `onRetry` → '다시 시도' wired only for `status==='error'` (:185-189); loading keeps `BrandLoadingView`.

**C-7** `src/features/runs/lifecycle/terminatedRouteFocusMatch.ts` — TTL 10min → 24h (:26), Map write-through persisted + hydrated on module init (:70-125, hydrate kick :125). NOTE (deviation, deliberate): the plan says "AsyncStorage" but `@react-native-async-storage` is not a dependency and adding it needs a native rebuild — impossible for this OTA batch. Used the repo's established idiom instead (lazy `expo-secure-store` with no-op fallback, exactly `localGoalFreezeStore`'s pattern), same durability semantics + test-injectable storage.

**Tests added (13)** — `matchEndOverlayWatchdog.test.ts` (thresholds, plan constants, 10-min clock jump → expired, negative elapsed); `matchExitAction.test.ts` (+2: retry enabled '결과 다시 저장하기', saving/leaving disabled); `pendingMatchSaveContext.test.ts` (round-trip/clear, wiped-runtime fallback incl. party matchSource, live-wins, solo passthrough, freeze-clear precondition restored on retry); `terminatedRouteFocusMatch.test.ts` (24h TTL incl. >10min re-entry, storage round-trip across simulated app kill, hydration drops expired + in-session mark wins).

**Hard rules honored**: `useMatchProgressSync.ts`, `localGoalFreezeStore.ts` (write/clear semantics — freeze still cleared ONLY on save-success/discard), locationTask, countdown-funnel files all untouched; H3/H4 stay deferred; work uncommitted.

---

All gates green and line numbers captured. Final report:

## B-1/B-2/B-3/B-5 implemented per plan; B-4 left out

Repo: `<repo>` — all changes uncommitted, backend/ only. (The `src/` diffs in the working tree are the pre-existing C-1..C-7 client OTA batch; untouched.)

### Per-item implementation

**B-1 — /result lock-free fast path**
- `backend/src/routes/runningMatch/runningMatchProgressRoutes.mjs:52-96` — `loadStore` snapshot at :63, `requireUser` probe at :64, `if (!sweepStuckMatchSessionFallbacks(snapshot))` pure-read respond at :66-69; changed → today's locked path verbatim at :82-88. `loadStore` added to the handler's destructured deps at :31.
- No `server.mjs` edit was needed: `loadStore` is already injected into `createApiRouteHandler` at `backend/src/server.mjs:699` and flows to every route via the routeContext spread (`backend/src/routes/index.mjs:47-56`).
- Required supporting fix: `backend/src/lib/runningMatchSession/matchSessionFallbackSeals.mjs:150,163` — the sticky seal functions return the pre-existing resolution on an already-sealed session, so the sweep reported `changed=true` forever for any lingering sealed session, contradicting its own doc contract and the plan's §5 test ("finalized+back-filled → mutateStore never called"). Now `changed` fires only for a seal WRITTEN by that sweep (`hadSealBeforeSweep`). The B-1 fast path is the sweep return value's only consumer (verified by grep); errs-toward-locked behavior is preserved for every real heal.

**B-2 — skip live-field stamping on already-finished re-pushes**
- `backend/src/lib/matchActionHandlers.mjs:470-480` — `skipFinishedRepushLiveStamps = liveStatus==='finished' && effectiveStatus==='finished' && finishElapsedSeconds != null` gates the five assignments (liveDistanceKm/liveElapsedSeconds/livePace/liveUpdatedAt/liveStatus). Sealed-DNF downgrade (`effectiveStatus 'running'`) and the F1 unfrozen-finish case stamp normally. Verified safe against `resolveParticipantLiveStatus` (matchPureHelpers.mjs:147 returns stored status for 'finished' without reading liveUpdatedAt) and the finished short-circuit in `normalizeRunningMatchProgress`.

**B-3 — progress-POST prune throttle**
- `backend/src/lib/matchActionHandlers.mjs:531-532` (epilogue now calls `runProgressPollPrunesIfDue(store, resolvedAt)`), `:548-569` (`PROGRESS_PRUNE_MIN_INTERVAL_MS = 15_000`, module-level `lastProgressPruneMs`, injectable `now`, `resetProgressPruneThrottle()` test hook mirroring `clearVanishedMatchTombstones`). The finish handler's direct `sealDuel/GroupFallbackResolutionIfElapsed` calls (:411-418) are untouched; leave/forfeit, session lookups, room sync and the /result locked path still prune unthrottled.
- Collateral: `backend/src/lib/matchSealRevision.test.mjs:188-200` — its `pushFinish` helper now re-arms the throttle before each push, because that suite pins per-push heal-then-prune ordering.

**B-5 — match-save dedupe-as-upgrade (BOTH repos)**
- `backend/src/repositories/runsRepository.mjs:427-470` — same `(userId, startedAt)` AND same `matchResult.matchId` (:442-450) → no new row; re-runs `resolveMatchResult`, overwrites the existing run's matchResult in place (:456-458), invalidates+recomputes metrics, returns `buildRunDetail(existingRun…)`.
- `backend/src/repositories/postgresRunsRepository.mjs:121-158` — twin logic; in-place row update via new `updateRunMatchResult` (`backend/src/repositories/postgresRunsQueries.mjs:175-188`, match_result + updated_at only).
- Shared helpers `isDefiniteMatchResult`/`shouldOverwriteMatchResult` at `runsRepository.mjs:325-347`: the overwrite never replaces a definite verdict (win/lose/draw tone, group rank, forfeit badge) with a PENDING placeholder — the same direction-lock `backFillFinisherSavedRuns` applies, preserving the plan's stated "PENDING→resolved upgrade" while preventing a degraded re-resolve (session pruned + opponent run missing) from erasing a resolved verdict and its +20P.

### Tests (plan §5 backend list)
- NEW `backend/src/routes/runningMatch/runningMatchProgressRoutes.test.mjs` (6 tests): finalized+back-filled → mutateStore never called; plain both-finished → fast path; seal-due → locked path taken and seal persisted on the authoritative store, follow-up poll lock-free; 404 identical on fast and locked paths; malformed/oversized id 404 before any store access; 401 propagates lock-free. (/result has no 410 branch — the tombstone 410 belongs to the progress POST, untouched; noted in the test header.)
- `backend/src/runningMatchContract.test.mjs:1425-1490` (new pin): duplicate finished push → persisted store byte-identical (readStore compare across a 25ms-spaced re-push), finish fields and opponent-view standings unchanged.
- NEW `backend/src/lib/matchActionHandlers.test.mjs` (2 tests): two finishing pushes within 15s → one epilogue prune (second all-done session survives, finish semantics + LP untouched); `runProgressPollPrunesIfDue` boundary at exactly 15s with injectable `now`; reset re-arms.
- `backend/src/repositories/runsRepository.test.mjs` + `backend/src/repositories/postgresRunsRepository.test.mjs` (new B5 tests + harness override + fake update-SQL handler): retry same (userId, startedAt, matchId) → `runs.length === 1`, matchResult upgraded PENDING→resolved, resolver re-run, match bonus counted once (json: `runPointsById.size===1`, `matchBonusPoints===20`), never-downgrade on a later PENDING re-resolve, different matchId at same startedAt still inserts.
- Wiring: `backend/package.json:17` (test:lib + matchActionHandlers.test.mjs), `:29` (test:routes + runningMatchProgressRoutes.test.mjs).

### Gates
`cd backend && npm test` → exit 0, fully green (test:lib, test:repositories, test:bridges, test:db, test:routes, test:contracts — including both contract suites with all seal/LP/§B4 pins and the new B-2 pin). `npm run test:contracts` green standalone as part of it. Full log: `<tmp>--claude-worktrees-compassionate-swartz-d2f634/ef6f60eb-e174-48e3-abf2-d4cb3a539fef/scratchpad/fulltest.log`.

### B-4: did NOT make the cut
Not implemented. Reading the actual sync path showed the mutateStore→loadStore swap is not behavior-preserving for the countdown funnel: `/rooms/my` and `/invite-inbox` reads run `syncMatchRooms` (`backend/src/lib/matchRoom/matchRoomSync.mjs:57-61`), which (a) CREATES the linked match session for a scheduled room whose window arrived (`syncScheduledMatchRoom`, :22-53 — `createMatchSession` + `room.linkedMatchId = session.id`) and (b) ARMS the host countdown via `syncHostStartedMatchRoomCountdown` → `armRunningMatchRoomCountdown` (:104-168), stamping the once-only `room.countdownArmedAt` and rebuilding an elapsed slot. On a discarded clone, idle-lobby polls would mint a different ephemeral linkedMatchId per poll (never persisted until some write endpoint lands) and would re-arm/re-stamp slots per poll — the exact shared-slot divergence the arm guard exists to prevent (countdown-entry-regression territory). The plan also gates B-4 behind a two-phone party-run smoke, which cannot be run here.

### Deviations from the letter of the plan (all called out above)
1. Sweep `changed` accuracy fix in matchSessionFallbackSeals.mjs (required by the plan's own §5 fast-path test; return value has no other consumer).
2. B-5 never-downgrade guard on the overwrite (preserves the plan's "upgrade" intent; test-covered in both repos).
3. matchSealRevision.test.mjs `pushFinish` re-arms the B-3 throttle (test-harness plumbing so its per-push prune pins keep their meaning).
4. server.mjs untouched — loadStore injection already existed at server.mjs:699.

Nothing committed, per instructions.

---

# ADVERSARIAL REVIEW VERDICT — C-1…C-7 client hardening (uncommitted, `<repo>/src/`)

## Attack 1 — FREEZE CONTRACT: PASS
`clearLocalGoalFreeze` call sites are exactly the two pre-existing ones (grep-verified): `runCleanupAfterSave.ts:44` (save success) and `tracking/background/index.ts:274` (reset-driven discard). `localGoalFreezeStore.ts` and `background/index.ts` untouched. The watchdog abandon (`TrackRunExperienceRuntimeModel.tsx:2316-2324`) bumps `saveNavEpochRef` + drops two isLeaving flags only; `resetMatchRuntimeAfterTrackingCleared` (:1538-1597) touches no freeze/bg-store state.
- Abandon → late-success: `createTrackedRun` resolves → `runCleanupAfterSave` clears freeze once (double-clear with `resetBackgroundRunTracking` is a documented no-op). Correct.
- Abandon → late-failure: catch sets 'paused'; freeze RETAINED (required — retry clamp re-finds it via the pending-context matchId, `useRunSaveCommand.ts:130`), released only on retry-success or discard. Correct.

## Attack 2 — NO DOUBLE SAVE: FAIL (one real vector) → FIX-1
- After abandon: status stays 'saving' (C-3 guard), so `shouldShowPausedTrackingActions` (isPaused && !showLiveArena) is false, exit card disabled (`matchExitAction.ts:99`), forfeit handlers latched (`pendingCounterpartForfeitResultRef`/`pendingForfeitMatchRef`/`isSaving`). No second save while in flight. PASS.
- **After late-failure + retry: CONFIRMED double-save race.** The retry ('이 기록 저장하기' → `handleSaveTracking()` with no options, no guard anywhere in `useRunActionHandlers`→save command) now resolves a matchId via pending context, so it hits `await pushRunningMatchProgress(...)` (`useRunSaveCommand.ts:164`) BEFORE `setStatus('saving')` (:176). Until 'saving' renders, `LiveMatchPausedActions` stays visible and enabled with zero feedback — for seconds, under exactly the degraded-network/convoy conditions that caused the failure. A second tap starts a concurrent full save → two `createTrackedRun` → duplicate match run rows, and backend B-5 dedupe is NOT deployed under the OTA-first ordering. Pre-diff this window was ~1 render frame (retry degraded to solo: no pre-'saving' await); the diff widened it to seconds. The '측정 다시 시작' button is also live in that window (resume racing an in-flight save). **Fix: move `setStatus('saving')` above the `if (activeMatchId)` finish-push block (or add an entry in-flight ref guard).** ~2 lines, no protected files.

## Attack 3 — WATCHDOG: PASS
Pure wall-clock phases 12/20/40s (`matchEndOverlayWatchdog.ts:22-33`, tests cover thresholds, 10-min jump, negative elapsed). Auto-abandon exactly once per visible episode (`autoAbandonFiredRef` + full reset on visible-false, `MatchEndTransitionOverlay.tsx:36-58`); AppState 'active' re-eval jumps phases immediately on resume (H1). Abandon clears BOTH isLeaving flags → `visible` (=`isLeavingDuelMatch || isLeavingGroupMatch`) drops. `onAbandon` threading verified end-to-end: runtime :2350 → composer `...viewProps` spread (`useTrackRunRuntimePropsComposer.ts:24`) → view :180. Overlay >40s only while backgrounded (not user-visible); resume abandons instantly. Late-settle Alert: at most once per settle (save chain is single-flight via the ref latches), `Alert.alert` is global so unmount-safe; a manual press at ~39.9s clears the interval before the 40s tick — no double abandon.

## Attack 4 — NAVIGATION: PASS
`runPointRankingPostProcessor` is ONLY `router.replace` (no data side effects) — skipping it loses nothing. `skipPostProcessorNavigation: true` is set at exactly one call site (`useRunForfeitCommand.ts:155`); solo and paused-shell saves pass no options → replace exactly as today. Match saves: single epoch-matched `router.replace` (:173-174). Abandoned late settle: Alert with optional `router.push` — no yank. Failure: no navigation, paused shell + error as today.

## Attack 5 — GHOST CLOSURE: PASS with one code-vs-contract defect → FIX-2
- C1 failure dead-end: closed. Failure leaves 'paused' + wiped runtime; pending context backfills matchId/mode/matchResult/matchSource — including party-ness, which is genuinely needed since `resetMatchRuntimeAfterTrackingCleared` sets `wasPartyRunRef.current = false` (:1591). Freeze clamp reapplies via backfilled matchId. Retry surface reachable (paused shell) since showLiveArena resets with the wipe.
- C3 tombstone: closed. 24h TTL + SecureStore write-through + merge-hydration (in-session wins, expired dropped) — tests simulate app-kill round-trip. The failure path marks tombstones (:1573-1577). Deviation from plan (SecureStore, not AsyncStorage) verified legitimate: `@react-native-async-storage` absent from package.json, `expo-secure-store@~15.0.8` present, idiom identical to `localGoalFreezeStore.ts:54`. Accepted residual (in code comment): cold-relaunch hydration is best-effort — a route-gate consult racing ahead of the SecureStore read could force the dead arena once; strict improvement over pre-change (no persistence).
- App-kill during save → relaunch: persisted bg 'paused' snapshot → paused shell recovery; pending context lost (in-memory v1) → retry degrades to solo save — GPS record preserved (no loss), match-ness lost — plan-accepted and documented.
- **PLAUSIBLE cross-match contamination (contract violation): `pendingMatchSaveContext.ts:63`** — the live branch does `resolvedMatchResult: liveMatchResult ?? pendingContext?.matchResult` with NO `pendingContext.matchId === liveMatchId` check, directly contradicting its own "Never mixes sources" comment; tests only cover same-match and non-null-live cases. Chain: match-A save fails and is never resolved (pending cleared only on save-success/discard) → a new match B auto-starts (`useStartTrackingAction` force-resets bg tracking at :100 but does NOT clear pending) → if B's save resolves `options.matchResultOverride ?? trackedMatchResult` to null, match A's result blob (with matchId 'A' inside) attaches to match B's run. Narrow trigger, but it is record corruption on the sacred path. **Fix: gate the live-branch fallback on matchId equality (1 line), plus clear pending in the start-action reset.**

## Attack 6 — GATES: PASS (independently reproduced)
- `npx tsc --noEmit`: 0 errors.
- `npx eslint` on all 23 touched files: exit 0, no output.
- `npx tsx --test "src/**/*.test.ts" "src/**/*.test.tsx"`: **1146 pass / 0 fail**; HEAD-worktree baseline (80d7a79): **1133 pass / 0 fail** — delta +13, exactly the new tests.
- Protected files: full inventory of countdown-funnel (`MatchStartCountdownOverlay`, `useLocalCountdownSeconds`, `countdownLockStore`, `useCountdownHandoffEffect`, `useMatchCountdownModel`, `useStableCountdownSeconds`, `useSyncedCountdownTicker`, `countdownTickerGate`, `useCountdownReadyAck`, `matchCountdown`, `useSoloStartCountdown`), `useMatchProgressSync.ts`, `localGoalFreezeStore.ts`, all `locationTask*` — NONE appear in `git diff --name-only` or untracked additions. `TrackRunExperienceView.tsx`'s countdown render block untouched (only the match-end overlay hunk).

# OVERALL: FIX-FIRST (narrowly — two surgical fixes, then ship)
1. **FIX-1 (blocking)**: `src/features/runs/hooks/runSaveFlow/useRunSaveCommand.ts` — move `setStatus('saving')` (line 176) above the finish-push block (line 151), or add an in-flight guard at entry. Kills the seconds-wide double-tap → duplicate-match-row race on the retry path, which is unprotected until backend B-5 deploys.
2. **FIX-2 (strongly recommended, 1-2 lines)**: `src/features/runs/hooks/runSaveFlow/pendingMatchSaveContext.ts:63` — only fall back to `pendingContext.matchResult` when `pendingContext.matchId === liveMatchId`; also clear pending context in `useStartTrackingAction`'s pre-start reset (`src/features/runs/tracking/actions/useStartTrackingAction.ts:100` area).

Everything else — C-1 watchdog/epoch/Alert, C-3 downgrade guard, C-4 retry card, C-5 skeleton+delayed reconcile, C-6 retries, C-7 persisted tombstone, freeze contract, navigation single-replace — verified sound. Re-run the three gates after the two fixes (expect +1-2 trivial test additions); no protected file is implicated by either fix.

---

All gates green and the race probe passes. Final verification of the diff scope is complete.

## Adversarial review verdict — backend finish-flow batch (B-1/B-2/B-3/B-5)

**Attack 1 — B-1 /result lock-free fast path: PASS**
- Due seal still persists: clone-sweep `changed` → locked path re-runs sweep on the authoritative store (route test + my probe). Follow-up polls go lock-free only after the heal is durable.
- Double-seal impossible: I wrote and ran a two-overlapping-polls probe (both snapshots pre-heal → both take the locked path serially) — second pass is a byte-level no-op, `resolvedAt` stable, seal sticky, per-viewer payloads consistent (`scratchpad/b1-race-probe.mjs`: PASS).
- No clone-mutation leak: every sweep write is flagged into `changed` (seal → `sealed && !hadSealBeforeSweep`; finalize → explicit; LP applier only inside finalize; back-fill mutates ⟺ returns true — verified in `matchResultBuilders.mjs:778-828`). When `changed=false` the snapshot is byte-equal to persisted state, so the fast-path response equals the locked one. `requireUser` (server.mjs:568) is read-only; both adapters' `loadStore` return clones (store.mjs:425, postgresStoreAdapter.mjs:117).
- 404/401 identical on both paths (tested); /result correctly has no 410 branch (tombstone 410 lives in the progress POST at matchActionHandlers.mjs:356-361, untouched).
- The sticky-seal `changed` accuracy fix was *required* (old `if (sealed)` returned true forever for any lingering sealed session → fast path would never engage and the plan's own §5 test would fail) and is safe: the return value's only consumer is the B-1 fast path (`pruneMatchSessions` at matchSessionLifecycle.mjs:44 ignores it).
- Accepted residual (not a defect): `buildDuelVerdict`/`buildGroupVerdict` seal internally with their own `new Date()` (matchSessionVerdicts.mjs:70, :195). If the 90s boundary falls in the sub-millisecond gap between the fast-path sweep's `now` and the builder's `now`, one response can show a fresh provisional verdict before it's persisted; the next poll persists an outcome-identical seal (winner = the lone finisher, deterministic; `resolvedAt`/revision window shift ≤ one poll interval). Self-healing, fairness-neutral.

**Attack 2 — B-2 finished re-push stamp skip: PASS**
- (a) A finished participant can never decay to 'disconnected': `resolveParticipantLiveStatus` returns 'finished' from `finishedAt` (matchPureHelpers.mjs:139) or stored status (:147) *without* reading `liveUpdatedAt`; `isParticipantDoneWithMatch` derives from it.
- (b) Annul path stamps normally: a sealed-DNF runner never has `liveStatus==='finished'` with frozen `finishElapsedSeconds` (F4 blocks the stamp; the F1 null-elapsed case is excluded from the skip guard), and the downgrade path sets `effectiveStatus='running'` → skip false. matchSealRevision suite green with the throttle re-arm.
- (c) Byte-identity proven end-to-end: the contract pin brackets exactly the re-push through the real routes/handlers with a 25ms gap; adapter serialize-before/after skip confirmed (postgresStoreAdapter.mjs:157-170). `applyMatchLpIfComplete` is one-way-boolean idempotent; `normalizeRunningMatchProgress` is pure and freezes finished distance/elapsed.
- Residual: on a skipped re-push the epilogue prune's `now` (=frozen `liveUpdatedAt`) is stale → strictly more conservative pruning/sealing from that one call; entry prune and status polls use real now. No impact.

**Attack 3 — B-3 prune throttle: PASS**
- The finish handler's direct `sealDuel/GroupFallbackResolutionIfElapsed` calls (matchActionHandlers.mjs:411-418) are untouched — a due seal blocks a late finish on the very push carrying it regardless of the throttle.
- Seal/TTL cadence effectively unchanged: `findMatchSessionById` at the top of every progress POST still runs an unthrottled `pruneMatchSessions` (matchSessionLifecycle.mjs:191), status polls prune (matchResponseBuilders.mjs:868), room sync prunes, /result sweeps. Worst-case throttle-induced delay ≤15s with zero other traffic, inside a 90s window — immaterial.
- Nit: the code comment "prunes at most once per interval server-wide" oversells relief (entry prune remains per-push; the new test's fixture comment states this correctly). Perf relief is real (3 prune-sweeps + 1 room prune per push → 1 + throttled) but smaller than the comment implies.

**Attack 4 — B-5 dedupe-as-upgrade: PASS**
- No double count: single row preserved in both repos (`runs.length===1` pinned); json test pins `runPointsById.size===1` + `matchBonusPoints===20` once; weekly distance recomputes off the same single row; LP is session-standings-based and matchId-deduped, untouched by createTrackedRun.
- No downgrade: `shouldOverwriteMatchResult` blocks definite→PENDING (tested with a degraded third re-resolve in both repos); provisional verdicts can't sneak in because `resolveSavedDuelMatchResult` returns PENDING for them (matchResultBuilders.mjs:97).
- No cross-user/match: keyed on `userId` + exact `startedAt` + `matchId` string equality; different matchId at same startedAt still inserts (tested). Twins logically identical; note `postgresRunsRepository` is not wired into the live server (production runs json-repo over the postgres whole-store adapter), so the postgres twin is forward-parity only — its test-green suffices.
- Definite→definite overwrite is allowed (e.g. crafted win↔forfeit flip on one's own row) — organically unreachable via client flows, self-affecting display only, awards nothing new; not a regression vs the pre-B-5 ability to insert arbitrary extra rows.

**Attack 5 — gates: PASS.** Ran `cd backend && npm test` myself: exit 0 (test:lib incl. new matchActionHandlers suite, test:repositories incl. both B5 suites, test:bridges, test:db, test:routes incl. new 6-test route suite, test:contracts incl. the B-2 byte-identity pin and all §B4/LP pins). `git diff --name-only`: 11 modified backend files + 2 new backend test files exactly matching the report; src/ changes are the separate client OTA batch; nothing committed. B-4's omission is inherently safe (nothing removed) and the stated countdown-funnel rationale (clone-side `syncMatchRooms` would mint per-poll linkedMatchIds / re-arm countdowns) is consistent with `matchRoomSync`'s arm-once guard design.

**VERDICT: SHIP.** All four items are observably semantics-preserving on the fairness-critical paths, the deviations from the plan are each load-bearing and correctly scoped, and the two residuals I found (sub-millisecond non-durable-provisional-verdict window on B-1; overselling comment on B-3) are cosmetic/self-healing and need no code change before deploy.
