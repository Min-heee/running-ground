All load-bearing claims from the three readers are now independently verified in code (latch branch, dead handle, retry helper signature/tests, bridge inertness, freezeOnBlur, wiring points, test runner). Synthesis follows.

---

# COUNTDOWN-SKIP SYNTHESIS — guest lobby never learns host-start

Repo: `<repo>` (read-only; nothing was edited). All three readers converge and I re-verified every decisive line myself.

## 1. ROOT CAUSE — H1, high confidence (~90%). H2 ruled out.

**The guest lobby's `/rooms/my` poller carries the exact never-retried keyed-slot latch that df02afc diagnosed and fixed only for match-STATUS polls — and in a waiting room it is the guest's single point of failure with every rescue path structurally disabled.**

Verified mechanism chain:

- **The latch.** `useRoomSnapshotPolling` acquires its interval through the same `rgPollingRegistry` keyed slot (`src/features/match/hooks/lobby/roomSnapshot/useRoomSnapshotPolling.ts:104`, key `room:{id}:match-room-snapshot`). On a lost acquire `startRgPollingInterval` returns a no-timer dead handle (`src/utils/rgPollingRegistry.ts:42-48`), and the lose branch returns a bare cleanup — no retry, no re-attempt (`useRoomSnapshotPolling.ts:120-126`). The effect deps (lines 152-164) are stable callbacks plus four room scalars that can only change via new poll data → a lost acquire is **permanently dead**. Byte-for-byte the pre-df02afc pattern; df02afc's `armBlockingMatchStatusPollRetry` was wired only into `useBlockingMatchStatusPolling.ts:377/522`.
- **Single point of failure.** In `state==='waiting'` this poller is the designed sole owner of `/rooms/my`: the party-room poller disables itself with reason `match-room-snapshot-owner` (`src/features/runs/sync/partyRunSync/useRoomPolling.ts:44-50`), the recipient-inbox poll is focus-gated to the running tab, and the root Stack has `freezeOnBlur: true` (`app/_layout.tsx`, `<Stack screenOptions={{ headerShown: false, freezeOnBlur: true }}>`), so while `/match-room` is on top the running-tab runtime — including everything df02afc added — is frozen. The RUNTIME→LOBBY bridge (`useRoomSnapshotFetcher.ts:123-163`) only executes inside a completing lobby tick and needs a ≤15s-fresh `'track-run experience'` cache that nothing refreshes in this topology: a dead lobby interval kills the bridge too.
- **Symptom reproduction is exact.** No `/rooms/my` delivery ⇒ guest never gets `linkedMatchId` ⇒ lobby banners impossible (`hasLinkedMatch` gate, `matchStateMachine.ts:395-405`) and the running tab never mounts (the only route out is `openLinkedMatchInRunning`, which returns on `!nextRoom.linkedMatchId`, `useMatchRoomLobbyEffects.ts:46-48`). So: no 로딩중, no digits — plain 대기실. The first surviving snapshot (foreground one-shot in `useRoomSnapshotForegroundRefresh.ts:45-51`, a lobby-action commit, or a dep-change one-shot `hydrate()` at `useRoomSnapshotPolling.ts:98`) necessarily arrives at/after slot, carries `state:'active'` + passed slot ⇒ `flow.shouldOpenArena` ⇒ `router.replace('/(tabs)/running', { forceMatchArena: '1' })` (`useMatchRoomLobbyEffects.ts:114-125`) ⇒ **straight into the arena at exactly the moment iOS's countdown hit 0**. The "arena jump" is not a separate channel; it proves the lobby received exactly one late snapshot.
- **Why Android / why this pair now.** Slower cadence + wider suppression (2000ms poll, 1500ms debounce, 1200ms input-suppression window — `roomSnapshotPollingPolicy.ts:11-14`, `useRoomSnapshotFetcher.ts:64-84`) and a congested JS thread at lobby entry widen the double-instance acquire race (multiple `/match-room` pushers can overlap the old instance's blur-cleanup release). iOS host is unaffected because its own press response feeds its runtime directly.
- **H2 exhaustively cleared.** Reader B swept the complete `dd44f9e..df02afc` diff (65 files): the chain's organs (`useRoomSnapshotPolling`, `useRoomPolling`, `useMatchRoomSelectionSync`, `useMatchCountdownModel`, `useLinkedMatchSync`) have zero commits on 07-06. 4f5ca3b removed only host-side draft/create plumbing and still hard-sends `startMode:'host'` with all reads intact; preflight commits gate entry presses only; df02afc is strictly additive; c8a1cb9 touches the matchmaking picker, not party rooms; rest is copy/integrations/backend.

**Reconciliation ("worked for weeks, broke today"):** the defect is pre-existing (`useRoomPolling.ts` last touched 06-30, snapshot poller unpatched by df02afc) and probabilistic — a remount-overlap race or congestion-starvation that simply hadn't been hit in the tested windows. No code-level causation from today's OTAs exists; today's changed entry timing (preflight work at press, lobby recomposition from the removed start-mode card) can shift mount timing but that is circumstance, not mechanism. Whether this specific incident was **latch** (lost acquire, interval dead) or **starvation** (interval alive, every tick suppressed/timed-out/discarded) is not decidable from code alone — see section 4. Both modes are the same organ and both are covered by the fix below.

## 2. FIX DESIGN — two small pieces, protected files untouched, OTA-able

Reuse df02afc's exported+tested helper `armBlockingMatchStatusPollRetry` (`src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts:122-167`). Its `startPolling: () => { acquired, ownerId, stop }` parameter is exactly `startRgPollingInterval`'s return shape — it ports with zero changes. Import it as-is (no relocation; optionally lift it into `rgPollingRegistry.ts` later with a back-compat re-export).

**Piece 1a — retry in the lobby snapshot poller** (`src/features/match/hooks/lobby/roomSnapshot/useRoomSnapshotPolling.ts`). Replace the lose branch at 120-126:

```ts
if (!polling.acquired) {
  rgPerfMark('match-room snapshot polling lost acquire', { intervalMs, pollingKey, roomId: pollingRoomId, source: 'match-room snapshot' });
  const retry = armBlockingMatchStatusPollRetry({
    intervalMs,
    onReacquired: (handle) => rgPerfMark('match-room snapshot polling reacquired after retry', { ownerId: handle.ownerId, pollingKey, source: 'match-room snapshot' }),
    onTick: loadRoom,
    startPolling: () => startRgPollingInterval({ intervalMs, key: pollingKey, label: 'match-room snapshot polling', onTick: loadRoom, detail: { /* same detail */ } }),
  });
  return () => { cancelled = true; hydrateGenerationRef.current += 1; retry.stop(); setLoading(false); };
}
```

Success path byte-identical; the helper fires one catch-up `loadRoom()` on re-acquire (safe: `loadRoom` self-gates on paused/focus refs and all applies pass the existing monotonic/tombstone/dedup guards in `activeRoomResultHandler.ts`).

**Piece 1b — same one-line wrap in the party-room poller** (`src/features/runs/sync/partyRunSync/useRoomPolling.ts:129-131`): replace `return undefined;` with the identical arm (`onTick: () => callbacksRef.current.loadMatchRoom()`, `startPolling` re-invoking the same `startRgPollingInterval`; return `() => retry.stop();`) plus a lost-acquire perf mark (today it logs nothing).

**Piece 2 — registry-free room lifeline for the pre-start hold window** (mirrors df02afc Piece 2). New file `src/features/match/hooks/lobby/roomSnapshot/useRoomSnapshotLifeline.ts`, wired in `useRoomSnapshotRuntime.ts` next to `useRoomSnapshotForegroundRefresh` (inputs: `loadRoom`, `mountedRef`, `pollingPausedRef`, `screenFocusedRef`, `roomRef` — all already available at `useRoomSnapshotRuntime.ts:55-82`):

- One mount effect with a plain `setInterval` (NOT the registry — cannot be latched) at ~3000ms.
- Each tick, all ref reads, zero re-renders: skip unless `mountedRef.current && screenFocusedRef.current && !pollingPausedRef.current && !roomRef.current?.linkedMatchId`.
- Staleness needs no new stamp: read `getLastActiveRoomCheck('match-room snapshot')` (`src/features/runs/sync/activeRoomCheckRequestRegistry.ts`, `completedAtMs` field — same API the bridge uses). If no entry or `Date.now() - completedAtMs > 8000` (constant in `roomSnapshotPollingPolicy.ts`, mirroring df02afc's 8s), mark `'room snapshot lifeline forced'` and `void loadRoom()`.
- This covers BOTH failure modes: in latch mode the guest learns host-start within ≤8s + one RTT (inside the 14s 로딩중 buffer); in starvation mode it adds independent attempts. Downstream idempotence (700ms throttle in `runActiveRoomCheck`, snapshot-key dedup, monotonic serverNow) makes extra calls no-ops.
- Optional hardening (small, recommended): give `loadRoom` an optional `{ bypassInteractionGuards?: boolean }` arg in `useRoomSnapshotFetcher.ts` that skips only the `isRgInputInteractionRecent()` (line 64) and debounce (line 76) gates when the lifeline forces a stale load — all callers pass no args today (registry invokes `onTick()` bare), so it is backward-compatible.

**Explicitly NOT touched:** `useLinkedMatchSync.ts:359` also has the bare lose branch but is on the protected list; its exposure is post-start (needs matchId) and partially covered by df02afc's lifeline + blocking-poll retry. Flag for a post-launch pass with owner sign-off. All other protected files (countdown model, state machine, clocks, tickers) are pure consumers of the room data this fix restores — zero logic changes.

**Test plan** (`npm test` = `tsx --test "src/**/*.test.ts"`, plus `npm run typecheck`, `npm run lint`):
- Extract the lose-branch arm into a small exported function (e.g. `armRoomSnapshotPollRetry`) so it is node-testable exactly like df02afc's; new `useRoomSnapshotPolling.test.ts` mirroring `useBlockingMatchStatusPolling.test.ts:280-360` with the same fake-timer harness: zombie holds `room:*:match-room-snapshot` → arm → tick no-op → zombie release → next tick re-acquires + fires exactly one catch-up `loadRoom` → straggler tick no-op → `stop()` leaves `getActiveRgPollingSlotCount() === 0`; and cleanup-before-reacquire acquires nothing.
- Extract the lifeline predicate (`shouldForceRoomSnapshotLifelineLoad({ lastCompletedAtMs, nowMs, staleMs, focused, paused, hasLinkedMatchId })`) and test the matrix (stale+focused → force; fresh → skip; paused/unfocused/linked → skip; no-entry → force).
- Same pair for `useRoomPolling`'s branch.

**Rollout:** pure-JS, OTA-eligible. Per the standing OTA authorization, publish production after tests + on-device verification pass; backend untouched.

## 3. ON-DEVICE VERIFY SCRIPT (after the fix build/OTA on both phones)

Setup each run: iOS creates a party duel room (host), Android (Galaxy) joins via invite; both sit in 대기실.

1. **Baseline ×3:** both idle 30s+ in the lobby, Android screen on, hands off. iOS presses 시작.
   PASS per run: Android shows the 로딩중 veil within ~5s of the press (hard bound: inside the 14s buffer) → digit appears at 10 → both phones show the same digit → Android enters the arena at 0 via the countdown, never by a direct jump at slot.
2. **Remount-race run ×2 (exercises the latch window):** Android, while in the lobby, backgrounds and re-enters the room via the invite/notification path twice in quick succession (or home → re-enter), then idles; host presses 시작. Same PASS criteria.
3. **Congestion/interaction run ×1 (exercises starvation):** Android continuously scrolls/taps the lobby while iOS presses 시작. 로딩중 must still appear within the 14s buffer.
4. **Log check** (adb logcat filtered to the rgPerfMark stream during runs 2-3): if `polling duplicate blocked` with `pollingKey` `room:*:match-room-snapshot` appears, it MUST be followed by `match-room snapshot polling reacquired after retry` and/or `room snapshot lifeline forced`, then `match polling start`; steady `invite inbox fetch for recipient end success:true` cadence ≈2s while waiting.
5. Regression sanity: one full duel to finish (countdown parity, live distance, result) to confirm no handoff/teardown change.

## 4. HONESTY — what the code cannot decide, and the one diagnostic that does

H1 vs H2 is settled (H2 cleared by exhaustive diff sweep; H1 verified line-by-line). What code alone cannot decide is **which H1 sub-mode fired on 07-06**: lost-acquire latch (favored — total silence with zero banner is cleaner under a dead interval, and a race matches "worked for weeks") vs tick starvation (the documented historical mode). The single discriminator: one repro recording with the perf-mark stream captured —

- **Latch signature:** `polling duplicate blocked` (`pollingKey: room:*:match-room-snapshot` or `active-room:*:match-room-snapshot`) with NO subsequent `match polling start`, then one `active room result handled` at ~slot.
- **Starvation signature:** `match polling start` present, then repeated `invite inbox polling debounced` / `active room check suppressed by user interaction` / timed-out or `stale-generation` skips from source `match-room snapshot`.

The distinction does not change the decision: Piece 1 kills the latch mode deterministically, Piece 2 covers starvation and doubles as the latch backstop, both are low-risk (tested helper reuse + a ref-only timer), so ship both regardless; capture the log stream during verification run 2-3 to close the sub-mode question for the record.

Key files (absolute):
- `<repo>/src/features/match/hooks/lobby/roomSnapshot/useRoomSnapshotPolling.ts` (defect: 120-126; edit here)
- `<repo>/src/features/runs/sync/partyRunSync/useRoomPolling.ts` (defect: 129-131; edit here)
- `<repo>/src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts` (helper to reuse: 122-167; import only)
- `<repo>/src/features/match/hooks/lobby/roomSnapshot/useRoomSnapshotRuntime.ts` (wire new lifeline hook)
- `<repo>/src/features/match/hooks/lobby/roomSnapshot/useRoomSnapshotLifeline.ts` (new)
- `<repo>/src/features/match/hooks/lobby/roomSnapshot/useRoomSnapshotFetcher.ts` (optional bypass arg; bridge context: 123-163)
