All evidence is gathered and cross-verified. Here is the synthesis.

---

# ROOT CAUSE SYNTHESIS + MINIMAL FIX — foreground opponent-poll stall

Repo: `<repo>`

## 1. ROOT CAUSE

### 1a. The naive prime suspect is disproved — no poll scheduler is render-clocked

Verified directly: every foreground cadence is a real OS timer. Blocking/safety poll: `setInterval` in `src/utils/rgPollingRegistry.ts:55-57`; linked poll: immediate fetch + `setInterval` (`src/features/runs/sync/partyRunSync/useLinkedMatchSync.ts:334, 343-357`); heartbeat keep-alive: raw 1s `setInterval` (`src/features/runs/sync/useMatchProgressSync.ts:687-699`) plus GPS-emission drive (`src/features/runs/tracking/useTrackingAppStateSync.ts:115-118`), gated by `Date.now()` not `syncedNowMs` (`matchProgressSync.ts:221-233`). The quiesce (038c999) tears down only the `setNowMs` chain; a running interval never needs a render to fire. Additionally, on the iPhone the runtime model demonstrably kept rendering (own distance climbs through model state on iOS — leaf-store routing is Android-only, `TrackRunExperienceRuntimeModel.tsx:722-724`), and the opponent still stayed 0.00. **Render starvation alone cannot be the mechanism.** Also disproved: funnel mode/matchId drop (progress-POST response carries `mode`, `matchId`, full `opponent` — `backend/src/lib/matchActionHandlers.mjs:508-515` → `buildRunningMatchStatusResponse` with `sessionOverride`, same builder as the GET, `matchResponseBuilders.mjs:354,273`); monotonic-guard poisoning (guard accepts equal-or-newer and only server stamps ever advance the ref, `serverClockSync.ts:340-352` — and a poisoned ref would have rejected the resume GET too, which contradicts the discriminator); backend opponent-zeroing (resume GET returned real data from the same builder); `liveMatchStartupWorkReady` stuck false (it is a 150ms real timer, `useAndroidLiveMatchStartupGate.ts:38-45`).

### 1b. The actual mechanism: single-shot, never-retried arming latches, with resume as the only registry-exempt channel

The entire foreground opponent-delivery loop passes through exactly two module-level keyed-slot registries whose lose-path is **permanently dead until an effect re-runs**, and during `state==='active'` every effect dep is stable, so "until an effect re-runs" means "until match end or AppState resume":

- `createKeyedSlotRegistry.acquire` returns `{acquired:false, release:()=>{}}` (`src/utils/rgKeyedRegistry.ts:61-76`); `startRgPollingInterval` converts that into a dead handle with **no timer and no retry** (`rgPollingRegistry.ts:42-48`), and no leading tick even on success (`:55-57`).
- Blocking/mounted-safety poll (the ONLY foreground GET for a direct matched duel — this recording's mode, per `docs/opponent-early-progress-diag-2026-07-06.md`): on `!polling.acquired` it logs and returns **without any cleanup or retry** (`useBlockingMatchStatusPolling.ts:292-307`, group `:415-430`). Deps (`:341-353`) are scalars stable during active — verified: `shouldFastPollDuelMatchStatus` is constant-true during active regardless of the frozen `syncedNowMs` (`:64-74, 202-208`).
- Heartbeat slot: on `!heartbeatSlot.acquired` the effect returns silently (`useMatchProgressSync.ts:268-269`), `heartbeatSlotOwnerRef` stays null, and **every push — including the resume-forced `syncMatchLifecycleStatus` — is skipped** while a foreign owner lives (`canSendMatchProgressHeartbeat` at `:606, :641` → `canUseRgHeartbeatSlot`, `rgHeartbeatRegistry.ts:70-73`).
- The linked poll shares the latch (`useLinkedMatchSync.ts:359-363`) but at least fires one pre-acquire fetch per effect run (`:334`).

These latches are **render-proof**: renders with unchanged dep values never re-run effects, so even iOS's GPS-cadence renders cannot heal them. The resume path is the unique exception on all axes: OS-event-armed (`useTrackingAppStateSync.ts:235, 147-203`), reads targets purely from refs, and is **registry-free** — `refreshStaleMatchArtifacts` → `loadDuelMatchStatus` performs a bare fetch + guarded `setDuelMatchStatus` with no slot acquire and no cadence gate (`useTrackRunRuntimeMatchMaintenanceActions.ts:94-111`, `useTrackRunMatchStatusLoaders.ts:228-243, 266, 317`). That is exactly why screen OFF→ON heals instantly while 90s of foreground timers deliver nothing.

**Parsimonious reconstruction of the recording:** one phone's slot pair (heartbeat + polling, both keyed by matchId and armed in the same active-transition commit window) lost its acquire and latched. That phone neither pushes nor GET-polls: its board shows opponent 0.00 (receive dead), and the *healthy* phone's board also shows 0.00 **truthfully** (the wedged opponent never pushed) — one wedged device produces the full bidirectional symptom, and reconciles yesterday's diagnosis ("opponent genuinely hasn't pushed", which was correct for the healthy phone's view) with today's evidence. Toggling the wedged phone fires the registry-free resume GET (opponent appears immediately) and the background flush/resume push injects its own data, after which the healthy phone's still-running poll picks it up within 5-10s.

**Where the quiesce fits (timeline fit, 07-03 00:23 boundary):** 038c999 did not stop a timer; it removed the 1Hz render floor that (a) continuously re-derived every render-computed sync input and (b) is the system's only remaining liveness clock — the gate's own comment admits wake-up depends on "renders arriving at heartbeat/poll/GPS cadence" (`countdownTickerGate.ts:29-31`), which is circular once status applies die. Pre-quiesce, ambient dep churn across a long match (overlay flips, upcoming refreshes, notices) gave lost acquires periodic second chances; post-quiesce a wedge acquired after the 30s grace is permanent and silent until resume. The quiesce is the **enabler/amplifier**, the latch is the **bullet**.

**Confidence:** structural verdict (foreground receive loop killed by a no-retry latch, resume-only recovery) — HIGH (~85%). Which specific slot/owner lost the acquire in this recording — MEDIUM (~55%): pin it on-device via `rgPerfMark('polling duplicate blocked')` (`rgPollingRegistry.ts:10-17`), `'progress heartbeat skipped' reason:'duplicate-heartbeat-owner'` (`useMatchProgressSync.ts:308-314`), and the `'duel match status set from poll'` cadence (`useTrackRunMatchStatusLoaders.ts:302-316`) during the stall window. The fix below is deliberately trigger-agnostic so it does not wait on that confirmation.

## 2. MINIMAL FIX

Two additive pieces. No protected file's logic is touched; `useMatchProgressSync.ts` is not touched at all.

**Piece 1 — un-latch the blocking poll (one unprotected file).** In `useBlockingMatchStatusPolling.ts` duel+group effects, replace the dead early-return at `:292-307`/`:415-430`: on `!polling.acquired`, arm a local retry `setInterval(intervalMs)` that re-calls `startRgPollingInterval`; on successful re-acquire, fire one immediate `onTick()` (catch-up) and keep the real handle; return a cleanup that stops retry-or-poll. Success path stays byte-identical (no leading tick on first acquire). ~15 lines.

**Piece 2 — opponent-sync lifeline (the trigger-agnostic guarantee; a timer-shaped clone of the proven resume path).** New hook `src/features/runs/runtime/useTrackRunOpponentSyncLifeline.ts`, mounted from `TrackRunExperienceRuntimeModel.tsx`:
- Stamp `lastMatchStatusAppliedAtMsRef.current = Date.now()` at the three ACCEPTED apply sites (all unprotected): after `setDuelMatchStatus` (`useTrackRunMatchStatusLoaders.ts:317`), after `setGroupMatchStatus` (`:389`), and inside the funnel's accepted branch (`useTrackRunMatchStatusSnapshotApplier.ts:96-100`). Stamp only on accepted applies, so a funnel-drop wedge also trips the lifeline.
- Effect deps: `[activeLiveMatchProgressMatchId]` (existing scalar, `TrackRunExperienceRuntimeModel.tsx:656-668`) — armed once at the active transition (renders provably exist there), then a plain `setInterval(5000)` that reads only refs: skip if app backgrounded (background applier owns it) or `duelMatchStatusRef/groupMatchStatusRef` not `state==='active'`; if `Date.now() - lastApplied > 8000` and no lifeline fetch in flight (local ref), call `loadersRef.current.loadDuelMatchStatus()` / `loadGroupMatchStatus()` (per-render-refreshed ref, same pattern as `useBlockingMatchStatusPolling.ts:177-186`; no-arg call resolves matchId via `focusedDuelMatchIdRef`, `useTrackRunMatchStatusLoaders.ts:233`) + `rgPerfMark('opponent sync lifeline fired')`.
- Like the resume path it is registry-free (no latch can kill it), ref-read-only (no render can starve it), and applies through the full existing guard chain (forfeit + monotonic + vanish) because it calls the same loaders.

**Re-render cost:** healthy steady state — zero added renders and zero added requests (heartbeat applies every 2.5s keep the stamp fresh; the timer no-ops). Wedged state — one guarded `setDuelMatchStatus` per ≥8s recovery fetch, i.e. exactly the poll-apply render that should have been happening; nothing at 1Hz; quiesce and countdown funnel untouched. (If review insists the lifeline live in `useMatchProgressSync.ts`, the additive-only shape is: one new optional input `{lastAppliedAtMsRef, loadActiveMatchStatus}` + one new self-contained effect appended after `:730` — no existing line modified. The runtime-hook placement above is preferred and keeps the #203 host untouched.)

Deferred (pending counters): the heartbeat-slot loser path (`useMatchProgressSync.ts:268-269`) — only reachable with a live foreign owner; fix only if `'duplicate-heartbeat-owner'` marks appear, since that edit touches the #203 host.

## 3. TEST PLAN

Node (existing client runner):
1. Retry test: pre-acquire `blocking-match-status:m1` via `acquireRgPollingSlot` (zombie); render hook with active duel m1, fake timers → loader not called; release zombie; advance one interval → re-acquired + immediate catch-up tick; unmount → `jest.getTimerCount()===0`.
2. Lifeline render-independence: render once with active-duel refs, stamp stale, **zero re-renders**, advance 60s fake time → loader called every ≥8s cycle; refresh stamp every 2s (healthy applies) → loader never called; flip statusRef to `finished` → ticks no-op.
3. Stamp wiring: accepted poll apply and accepted funnel apply advance the ref; a funnel-DROPPED snapshot (forfeited id) does not.
4. Existing `matchProgressSync.test.ts` + registry suites stay green.

On-device (both screens ON, no toggling, direct duel): opponent km must move within ≤8s of the other phone continuously through T+30s (quiesce boundary) and T+120s. Diag: `'duel match status set from poll'` cadence ≤5-8s the whole window; `'opponent sync lifeline fired'` absent in a healthy run (presence = wedge existed AND recovery worked); `'polling duplicate blocked'`/`'progress heartbeat skipped'` presence pins the trigger (capture ownerIds). Golden-discriminator scenario re-run: no toggle needed anymore.

## 4. ROLLBACK SAFETY

- **Pushes untouched:** zero edits to `pushRunningMatchProgress`, `refreshMatchProgressHeartbeat`, `syncMatchLifecycleStatus`, the 12s eviction (`rgHeartbeatRegistry.ts:27`), or the background flush. The lifeline is GET-only, max ~7 req/min/phone and only while the channel is provably silent; zero when healthy.
- **Jank cannot revive:** no new subscriptions, no per-second setState, `countdownTickerGate`/`useSyncedCountdownTicker` untouched; steady-state render count identical to today.
- **Blast radius:** Piece 1 activates only on the previously-dead branch and returns a real cleanup (no leaks); Piece 2 is a self-contained hook + three one-line ref stamps. Both are independently OTA-revertable; Piece 2 alone ends the user-visible stall even if Piece 1 is reverted.

Key files: `<repo>/src/utils/rgKeyedRegistry.ts`, `src/utils/rgPollingRegistry.ts`, `src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts`, `src/features/runs/sync/useMatchProgressSync.ts`, `src/features/runs/runtime/useTrackRunMatchStatusLoaders.ts`, `src/features/runs/runtime/useTrackRunMatchStatusSnapshotApplier.ts`, `src/features/runs/tracking/useTrackingAppStateSync.ts`, `src/features/runs/runtime/countdownTickerGate.ts`, `src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx`, `backend/src/lib/matchActionHandlers.mjs`.
