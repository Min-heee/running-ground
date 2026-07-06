I have the complete, verified chain. The `matchDistanceStaleness` gate is only for MY distance (screen-off freeze), not the opponent — ruling out one more candidate. The elapsed is slot-anchored (confirmed by tracking/index.ts:185 comment "slot-anchored elapsed keeps climbing"), so the client sends real elapsed on its first push, meaning the speed-limiter clamps but does not zero.

All theories are now resolved against actual code. Here is my decision-ready synthesis.

---

# ROOT CAUSE — verified in code

**This is a TIMING/first-progress issue (READER C is correct), NOT a display gate and NOT the speed-limiter (READER B overstated). Confidence: HIGH (~85%).**

Each device shows the opponent at **0.00km / 측정 대기** for the opening window because **the opponent's participant record genuinely carries no live data yet** — `liveDistanceKm: 0`, `liveUpdatedAt: null` — and for a **real (non-bot) duel there is no server-side estimate to fill the gap.** The display layer is faithfully reporting missing data; the label is a truthful mirror, not a suppression.

### The four things I verified that pin this down

1. **The label is `측정 대기`, not `속도 대기`.** Zero hits for `속도` in the client. Source: `src/features/runs/viewModels/matchProgress.ts:101` — `hasParticipantLiveProgress(participant) ? '동기화 중' : '측정 대기'`. It returns `측정 대기` only when the opponent has **all three** of `liveDistanceKm>0`, `liveElapsedSeconds>0`, `liveUpdatedAt` empty (`matchProgress.ts:72-78`). So the label firing means the opponent object is genuinely empty.

2. **The opponent row reads the raw live distance directly — there is NO 30s-checkpoint display gate suppressing real data.** `duelRaceBoardRows.ts:89-92`: `opponentBoardDistanceKm = liveOpponentDistanceKm > 0 ? liveOpponentDistanceKm : syncedDuelOpponentDistanceKm`. If the opponent's poll payload carried a real `liveDistanceKm > 0`, the board would show it on the very next 2.5s poll. It does not, because the payload value is 0. **This rules out "display gate."**

3. **For a REAL duel, the server's synthetic estimate NEVER fires** — this is the decisive finding that separates this from the bot/test path. `buildSyntheticParticipantLiveSnapshot` (`matchSessionSnapshots.mjs:85-124`) returns `null` at line 86 unless `participant.profileSnapshot` exists. Real duels seed participants via `createMatchSession(store,'duel',…,[{id,seedRank}])` (`matchResponseBuilders.mjs:613-616`) and `buildSessionParticipant` only attaches `profileSnapshot` for bots (`...(participant.profileSnapshot ? … : {})`). So a real opponent with no push → the snapshot echoes the raw `liveDistanceKm: 0` / `liveUpdatedAt: null` (`matchSessionSnapshots.mjs:126-160`). **The opponent is a bald 0.00, not a pace-estimate.**

4. **Neither device pushes until its own slot passes**, which is what creates the window:
   - Client push is hard-gated: `resolveActiveMatchProgressTarget` returns a target only when `duelMatchStatus.state === 'active'` (`matchProgressSync.ts:193`); below that, `refreshMatchProgressHeartbeat`/`syncMatchLifecycleStatus` early-return with no POST (`useMatchProgressSync.ts:601-604, 636-639`).
   - The backend withholds `active`: it downgrades the reported state to `matched` until `session.slotStartAt <= now` on the reader's own poll (`matchResponseBuilders.mjs:337`), and the write endpoint itself rejects a pre-slot progress POST with 400 (`matchActionHandlers.mjs:369-376`).
   - So until each phone's own clock passes the slot, it does not push. Any **inter-device slot/clock skew** (RTT correction differences, one phone still in countdown/GPS warm-up) means device X is `active` and pushing while device Y is still `matched` and silent — X sees Y at 0.00. Mirrored → **bidirectional**.

### Why READER B (speed-limiter → 0.00) is a real mechanism but NOT the dominant cause
The limiter in `normalizeRunningMatchProgress` (`matchProgressStoreHelpers.mjs:47-60`, cap `MATCH_PROGRESS_MAX_SPEED_MPS=12` → 0.012 km/s) **does clamp** early distance from a zero baseline. But I simulated it with the **real slot-anchored elapsed** the client actually sends (confirmed slot-anchored: `tracking/index.ts:185`): at t=5s it stores **0.06km**, t=8s **0.10**, t=11s **0.13**. It **halves** the early distance — it does not park it at a flat **0.00** for 90s. READER B's "both write ~0 → bidirectional 0.00" only holds if elapsed stays ~0, which it does not. So the limiter is a *fairness/under-reporting* nuisance, not the 측정-대기 cause. (It's worth a separate fix, but it is not this bug.)

### The ~90s
No single gate hard-codes 90s on the happy path. The ~90s is **compounded slot/clock skew + GPS warm-up + first-poll-after-active latency**, and can be *aggravated* by the one 90s constant in the path — `MATCH_PARTICIPANT_RUNNING_STALE_MS = 90s` (`matchConstants.mjs:31` → `matchPureHelpers.mjs:146`), which demotes a `running` participant whose `liveUpdatedAt` is >90s old to `disconnected`. If a stale pre-slot warm-up push exists but ages out, the opponent snapshot is suppressed for ~90s. This is the strongest numeric suspect and the likely lineage of the two prior fixes ("갤럭시가 상대 0.00km만", "먼저 완주 못 받음").

---

# FIX PLAN (impact ÷ risk)

**Zero per-poll server cost in every option below — none adds store reads/writes or scans. The 1vCPU / #209 ceiling is respected.**

### FIX 1 — Client-only copy + last-known-distance (SHIP FIRST; impact high, risk ~nil, OTA)
The opponent-at-0.00 for the pre-push window is **largely expected** (the opponent truly hasn't reported). The concrete defect is that a bald **0.00km + 측정 대기** *reads as broken*. Fix the reading, not the data:

- **Copy:** when the opponent has no live progress yet *and the match is live*, render **"상대 준비 중"** (or "상대 측정 대기 중") instead of `측정 대기` next to a stark `0.00km`. Files: `src/features/runs/viewModels/matchProgress.ts:101,118,129` (the `측정 대기` fallbacks). Pure string/branch change.
- **Last-known hold (already half-built):** `duelRaceBoardRows.ts:89-92` already falls back to `syncedDuelOpponentDistanceKm` when `liveOpponentDistanceKm <= 0`. Confirm `syncedDuelOpponentDistanceKm` is seeded from the last non-zero opponent checkpoint so a transient 0 never *flickers* the opponent back to 0.00 once they've started. No new data required.
- **Cost:** OTA only. No backend, no per-poll cost.

### FIX 2 — Backend: let the real opponent show a "출발" heartbeat immediately (impact high, risk low-med, backend-deploy, still zero per-poll cost)
The genuine data gap is that a real opponent shows nothing until their *first distance* clears the speed-limiter. Two surgical, **read-path-only** options (no extra store work — they run inside the existing `buildParticipantLiveSnapshot` already called per poll):

- **2a (minimal, recommended):** extend `buildSyntheticParticipantLiveSnapshot` to also fire for a **real** participant (drop the `profileSnapshot` precondition at `matchSessionSnapshots.mjs:86`), resolving pace from the already-loaded runner profile instead of `participant.profileSnapshot.averagePace`. Gate it exactly as today (`liveUpdatedAt` empty + session `active`), so it stops the instant the real push lands. This makes the opponent show a **pace-estimated distance** during the gap instead of 0.00 — mirroring what bots already do. **Fairness note:** the official verdict is server-authoritative from measured finishes, so an estimate-only *live* display does not affect who wins (same rationale already documented at `duelRaceBoardRows.ts:80-86`). Risk: must ensure the estimate can never seed the finish/standings path — verify against the "먼저 완주" seal logic before shipping.
- **2b (even cheaper, safest):** on the **first** progress write, stop letting the speed-limiter clamp the genuine first sample to a fraction. In `normalizeRunningMatchProgress`, when `previousDistanceKm === 0` and `previousElapsedSeconds === 0` (true first write), seed the baseline from the client's reported `distanceKm` (capped to session distance) rather than ramping from 0 at 0.012 km/s. This removes the halving so the opponent's first visible number is real, and it closes the anti-teleport hole no wider than one poll. This is the READER B fix and is **complementary** to Fix 1.

**Recommendation:** ship **Fix 1 now (OTA)** — it addresses the "reads as broken" reality with zero risk. Batch **Fix 2b** into the next backend deploy (it's a 3-line, cost-free correctness fix to under-reporting). Consider **Fix 2a** only if, after Fix 1, users still complain the opponent "does nothing" early — and only after auditing the seal/standings path.

---

# WHAT TO TELL THE USER TO VERIFY (next dual-phone run)

1. **Watch the transition, not just the 0.00.** Note the wall-clock gap between "my km starts climbing" and "opponent's km starts climbing." If the opponent jumps from 0.00 to a *real* climbing number **within ~10-15s of both phones passing the slot**, then the ~90s is **slot/clock skew + GPS warm-up** (expected) — Fix 1 (copy) is the correct and sufficient fix.
2. **Check whether one phone enters the arena visibly later** (still on countdown / "측정 대기" while the other is already running). That asymmetry is the skew driver — confirms Fix 2 would help but the core is timing.
3. **If the opponent stays flat 0.00 for exactly ~90s then snaps to a large value**, that's the `MATCH_PARTICIPANT_RUNNING_STALE_MS=90s` demotion of a stale pre-slot warm-up push — tell me and I'll target that constant/path specifically.
4. **After Fix 2b:** the opponent's *first* shown number should be their real ~0.10km, not ~0.05 — i.e. no more visible "starts at half and catches up."

---

# HONESTY

**The early 0.00 is mostly EXPECTED behavior, not a data-delivery bug.** In a real 1:1 duel each device legitimately has nothing to show for the opponent until the opponent's phone crosses its own slot and pushes — there is deliberately no server-side estimate for a real opponent (the synthetic estimator is bot-only). The system is faithfully reporting "opponent hasn't reported yet." The genuine problem is that **`0.00km + 측정 대기` reads as broken** when it actually means "상대 준비 중." So the highest-value fix is **cosmetic/copy (Fix 1, OTA, zero risk)**, with an optional cost-free backend correctness follow-up (Fix 2b) to stop the speed-limiter from under-reporting each runner's genuine first sample. READER B's speed-limiter clamp is real but secondary (it halves early distance, it does not create the flat 0.00); READER C's first-progress/slot-gate timing is the actual driver.

**Key evidence files:** `src/features/runs/viewModels/matchProgress.ts:72-78,101` · `src/features/runs/viewModels/duelRaceBoardRows.ts:80-92` · `backend/src/lib/runningMatchSession/matchSessionSnapshots.mjs:85-160` · `backend/src/lib/runningMatchSession/matchSessionLifecycle.mjs:98` (buildSessionParticipant, no profileSnapshot) · `backend/src/lib/matchResponseBuilders.mjs:337,613-616` · `src/features/runs/sync/matchProgressSync.ts:193` · `src/features/runs/sync/useMatchProgressSync.ts:601-604,636-639` · `backend/src/lib/matchActionHandlers.mjs:369-376,460-467` · `backend/src/lib/matchProgressStoreHelpers.mjs:47-60` · `backend/src/lib/matchConstants.mjs:31,60-61`.
