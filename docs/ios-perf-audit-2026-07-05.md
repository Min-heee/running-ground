# iOS PERF-REGRESSION DIAGNOSIS — RunningGround (window a0d87ec..36ea67f, Jun 25–Jul 5)

All load-bearing claims below were re-verified in code at `<repo>`, not averaged from reader opinions. Reader disagreements adjudicated: (a) Reader D called the home tree growth "recent" — git blame shows the heavy home cards landed Jun 1–2 (31fd7c3, 0d2e8ff, 28e5556), i.e. PRE-window; Reader B is right that it's not the regression. (b) Readers A and C independently converged on the OTA hook; I verified every mechanical detail of it. (c) Reader B's 768-Intl-calls-per-render claim is exactly right (verified constants and call sites below).

---

## 1. THE VERDICT

### #1 — The OTA adoption loop × near-daily publish cadence (REGRESSION, eec5b71, Jul 3). Confidence: HIGH it's happening, MODERATE-HIGH it's the primary perceived cause.

**Mechanism (all verified):**
- `src/features/home/screens/HomeScreen.tsx:33` mounts `useOtaUpdatePrompt` — HOME is the post-launch tab, so `src/features/home/hooks/useOtaUpdatePrompt.ts:143` fires `runUpdateCheck()` immediately at every app launch, and `:145-149` re-fires on every foreground (throttled to 15 min, `src/features/home/utils/otaUpdatePrompt.ts:11`).
- `:123-127`: `checkForUpdateAsync()` (network RTT) then `fetchUpdateAsync()` — a multi-MB bundle download + disk writes concurrent with the user's first taps and home's initial fetches.
- `app.config.ts:179-183` sets `fallbackToCacheTimeout: 0` and does NOT set `checkAutomatically` → expo-updates' native ON_LOAD check also runs at every cold start. Two check paths per launch.
- When the card shows (`HomeScreen.tsx:50`) and the user taps 지금 적용, `Updates.reloadAsync()` (`useOtaUpdatePrompt.ts:164`) does a full JS restart — re-paying the entire boot, including the paint-blocking network profile fetch (`src/lib/session/sessionState.ts:71,89-90` via `src/navigation/rootAuthGate.ts:30`) and home's 6 parallel refetches.

**Why now:** the window has ~17 client commits in 5 days and the publish cadence was ~10 OTAs in 10 days — so "update available" was true at nearly every app open. A typical session this week: boot → background bundle download during first browsing → card → tap → full reboot → refetch everything. That is exactly a diffuse "app feels slightly slower overall, no jank" — felt at cold start and foreground, first ~10–30s of every session. Bundle growth in the window (+13.4k net lines, ~+12%) compounds it: bigger downloads, marginally longer boots, twice per session.

The hook itself is well-built (fail-closed run guards, throttle). The regression is hook × publish cadence; it partially self-heals when publishes slow down post-launch — but launch week won't be slow.

### #2 — RuntimeModel per-render tax: ~768 Intl date formats per render (PRE-EXISTING, 83c9873 May 13; amplified by every new render source). Confidence: HIGH the cost is real, MODERATE the user feels it (needs a match context).

**Verified:** `src/features/runs/hooks/matchLifecycle/useMatchQueueActions.ts:12-14` calls `buildWeeklyHourlySlots()` TWICE, unmemoized, at hook top — executed on every render of the 2,318-line `TrackRunExperienceRuntimeModel`. `src/features/runs/utils/matchScheduling.ts:95-127` builds (7+1) days × 24 = 192 slots, each with 2× `toLocaleDateString('ko-KR')` → 384 Intl formats + ~400 Date allocations per call, ×2 = ~768 Intl formats per render (Hermes constructs a fresh formatter per call). Estimated 5–30 ms/render. This taxes: the 1 Hz ticker whenever any reservation exists (`countdownTickerGate.ts:125-126,142-145` keep-alive terms), every 2.5–5 s status poll, and every GPS/heartbeat render during matches. It is OFF on a truly idle running tab (idle gate verified by Reader B). Not new — but it is the single biggest per-render lever, and it multiplies everything shipped since.

### #3 — Home tab unconditional 1 Hz full-screen re-render (PRE-EXISTING timer, tree heavier since Jun 1–2). Confidence: certain it exists, LOW it alone explains a new perception.

**Verified:** `src/features/home/hooks/useHomeScreenModel.ts:143-151` — ungated `setInterval(() => setNowMs(Date.now()), 1000)`, mount-scoped, home never unmounts. `visibleUpcomingMatches` (`:153-156`) returns a new array every tick even when empty → `HomeUpcomingMatchesCard` memo breaks; `HomeOverview` (`src/features/home/HomeOverview.tsx:20`) is a plain function, not memoized → rank hero/point gauge/calendar re-render every second while home is focused. ~0.5–2 ms/tick — a constant hum, not jank. Both the timer and the heavy cards predate Jun 25.

**No other credible cause survived verification.** Nothing in the audited OTAs adds recurring work outside an active run/match except #1.

---

## 2. FIX PLAN (impact ÷ risk, best first)

### Quick win A (≤1 h, OTA-able, near-zero risk): defer the launch OTA check + slow the throttle
- **File:** `<repo>/src/features/home/hooks/useOtaUpdatePrompt.ts:135-154`.
- **Approach:** replace the immediate `void runUpdateCheck()` at `:143` with a ~12–15 s `setTimeout` (cleared on unmount) or `InteractionManager.runAfterInteractions`; optionally raise `OTA_UPDATE_CHECK_THROTTLE_MS` 15→60 min (`src/features/home/utils/otaUpdatePrompt.ts:11`). Moves the download out of the first-touch window; adoption guarantee unchanged (check still happens every session).
- **Protected systems:** none touched — the mid-run reload guards (`isRunPossiblyActive`, fail-closed) are untouched. Countdown funnel / #203 bg-sync / localGoalFreeze / save path: not in the diff.
- **Test:** release build cold start → card appears ~15 s in, not instantly; start a run before the delay elapses → no prompt (existing pure-function unit tests on `shouldRunOtaUpdateCheck` already cover the gate).
- **Process half (0 code, biggest lever):** batch OTA publishes. Every publish costs every device one download + one reboot. Fewer publishes = most of the regression gone.

### Quick win B (≤1 h, OTA-able, low risk): memoize `buildWeeklyHourlySlots`
- **File:** `<repo>/src/features/runs/hooks/matchLifecycle/useMatchQueueActions.ts:12-14`.
- **Approach:** compute once and share (`const slotOptions = useMemo(() => buildWeeklyHourlySlots(), [hourKey])` where `hourKey = Math.floor(nowMs / 3_600_000)` — or a module-level cache keyed by hour; the two calls are identical, so build one array). Semantics: the slot list only actually changes on the hour; if `isClosed` freshness within the hour matters for the picker, key by a 5-min bucket (12 rebuilds/hour ≈ free). Removes 5–30 ms from EVERY runtime-model render.
- **Protected systems:** CAUTION — this hook also hosts `setNowMs`/server-clock plumbing used by the countdown funnel. Keep the diff surgical: touch ONLY lines 12–14; do not touch `syncServerClock`, `serverClockReady`, `syncedNowMs`. The slot list feeds the reservation picker, not countdown timing — outside the NO-GO list.
- **Test:** open duel/group reservation modal → slot list renders, closed slots correct; cross an hour boundary with the app open → picker updates; run existing matchScheduling unit tests.

### Medium (2–4 h, OTA-able, low-moderate risk): tame home's 1 Hz
- **File:** `<repo>/src/features/home/hooks/useHomeScreenModel.ts:143-156`.
- **Approach:** (1) run the interval only when `upcomingMatches.length > 0` (the 시작까지 pill still ticks whenever it matters) and gate on focus (`useFocusEffect`); (2) return a stable `EMPTY_ARRAY` constant from the filter when nothing is visible so `HomeUpcomingMatchesCard`'s memo holds; (3) wrap `HomeOverview` in `React.memo`. Before shipping, confirm `nextStartingMatch` consumers don't need ticking with zero matches (they can't — it derives from the list).
- **Protected systems:** none; home is outside the countdown funnel. Notification-sync effect (`:130-141`) depends only on `upcomingMatches` — untouched.
- **Test:** dev render counter on HomeScreen: no matches → 0 renders/s; with a reservation → pill ticks 1 Hz; blur → interval stops.

### Bigger item (post-launch, NOT week-of-launch): unblock first paint from the network
- `src/lib/session/sessionState.ts:71` profile fetch gates first paint (`rootAuthGate.ts:30`) — paint from cached profile, refresh in background. Saves 100–400 ms per cold start AND per OTA reload (multiplies with #1). Risk: session/auth edge cases; needs its own careful pass.

### Trivial deletion (any time): dead diag effect
- `src/features/runs/viewModels/useMatchSelectionModel.ts:143-161` runs `buildMatchProgressModel` + `JSON.stringify` per ready-screen render to feed a production-silenced log. Delete. Imperceptible gain, zero risk — hygiene only.

---

## 3. HONESTY SECTION — suspects checked and cleared

- **b191687 elevation full-route recompute:** real O(n) per counted GPS fix, but ~10 arithmetic ops/point on Hermes ≈ 30–80 ns/iter → at 60 min (n≈3600) 0.1–0.3 ms per 1 Hz fix; even a 2 h run stays sub-ms per fix. Run-scoped only; zero cost while browsing. The added `altitudeAccuracyM` fattens run persistence ~10–15% — run-scoped, marginal.
- **0a3283c localGoalFreeze:** exactly ONE promise-memoized SecureStore read per session, and it is NOT on the boot path — only awaited inside run-snapshot restore with an active matchId (`backgroundRunPersistence.ts:173`). Record sites only reachable when `status === 'finished'`; retry ticks cost a Map lookup. Cleared.
- **Finish celebration / reminder (0a3283c):** fires once at finish behind a Set guard; the commit REMOVED recurring reminder scheduling from the progress path. Net cheaper per tick.
- **rgDiagLog / diag surfaces:** `isRgPerfTraceEnabled()` no-ops before any formatting in production; residual argument-string construction totals <10 µs/s during runs. The Android perf probe is Android-only AND env-gated — dead on iOS. The heavy on-screen overlay was stripped in 56ff3cc.
- **a867480 arming veil:** returns `null` when unmounted; mount cost is one one-shot 400 ms native-driver no-op animation. Not a standing cost.
- **36ea67f:** pure deletion (−265 lines). Neutral-to-faster.
- **Timer/subscription leaks:** none found. Countdown rAF self-terminates; pedometer subscribes only while `running`; location watchers are singletons with explicit stops + an abandoned-tracking watchdog; the finished-until-ACK native cadence is background-only and hard-capped at 10 min (`PENDING_NATIVE_FINISH_MAX_HOLD_MS`, enforced twice) and force-stopped on foreground resume; duplicate runtime mounts are blocked by keyed registries.
- **Cold-start path:** byte-identical to pre-window; nothing new is awaited before first paint; 3 storage reads at boot. The paint-blocking profile fetch is real but pre-window (May).
- **Idle running tab:** the 1 Hz ticker is verifiably OFF when idle (038c999 quiesce + idle gate) — a window IMPROVEMENT. Side proof: an untapped reservation's 시작까지 pill doesn't tick.
- **Hermes/new-arch `app.json` flags (working repo):** app.json changes cannot ship via OTA; irrelevant to the current iOS build unless a new native build was installed. Outside this audit.

Bottom line of the honesty pass: nothing in the audited OTAs makes steady-state browsing measurably slower. If the slow feeling persists mid-session, sitting still, with no match anywhere — it's #2/#3 (pre-existing) or outside this repo, not the new OTAs.

---

## 4. 2-MINUTE ON-DEVICE SANITY CHECK (top hypothesis: OTA adoption loop)

1. **Drain pending updates (30 s):** open the app; if the 지금 적용 card appears, tap it, let it reload, then force-quit.
2. **Clean-session baseline (45 s):** reopen cold (no new OTA published since step 1). Browse home → friends → running tab for ~30 s. This session still checks (two manifest requests) but downloads nothing. Note the feel.
3. **Publish-window comparison (45 s):** immediately after your next OTA publish (or recall any app-open from this past week), force-quit and reopen, and browse during the first ~15 s while `fetchUpdateAsync` is downloading; then tap 지금 적용 and watch the full reload + home refetch.

**Read-out:** if the "slightly slower" feeling lives in the first ~15–30 s of sessions that follow a publish (and around the card/reload), and step 2's clean session feels like the old app — hypothesis confirmed; ship Quick win A and batch publishes. If step 2 still feels slow while sitting motionless on home or on the running tab with a reservation, the OTA loop is exonerated for that part — that's #3 (home 1 Hz) or #2 (reservation-standby renders), both pre-existing, fixed by Quick win B and the Medium item.
