The grep hit an error only on the last two commands (backend path is actually the same worktree; no separate backend dir, and RunningMetricGrid path differs). The critical facts are confirmed: `cadenceSpm?: number | null` and `elevationGainM?: number | null` are both nullable in the API type (`runs.ts:22-23`) and domain (`running.ts:44`). So "save null when unreliable → renders as `--`" is fully representable end-to-end. `totalSteps` at save comes from `totalStepsRef.current` (`useRunSaveCommand.ts:116`).

I have everything I need. Let me write up the staged architecture.

I have verified every load-bearing claim against source. Here is the architecture.

---

# Cross-Platform Metric Parity — Staged Fix Plan

**Repo:** `<repo>`
**Diagnosis:** all three readers are correct and confirmed against source. Root causes:
- **Elevation (Galaxy 410m):** raw `coords.altitude` summed with a **0.8m positive-delta gate** — far below GPS vertical noise (±10–30m/fix), so it filters nothing on Android's unfused GNSS altitude. **100% JS-computed → OTA-fixable.**
- **Cadence (Galaxy 3spm):** the `ACTIVITY_RECOGNITION` runtime permission is effectively never granted on Android, so `TYPE_STEP_COUNTER` delivers ~81 steps for a ~4170-step run. The manifest permission **is present** (`expo-sensors/android/src/main/AndroidManifest.xml` + `app.json:32`), but the app's onboarding code carries a **stale false belief** it isn't (`onboardingPermissions.ts:11-15,62-66`) and never walks the user through granting it. **OTA-fixable** (permission UX + a save-time sanity floor).
- **Distance/Pace (17s / 3s/km):** within GPS tolerance — **no change** (details in ③).

Ordered by impact ÷ risk.

---

## ① ELEVATION FILTER — highest impact, lowest risk — **OTA**

**OTA verdict: fully OTA-able.** There is no native elevation module on either platform (confirmed: `grep altitude/elevation` over `modules/ ios/ android/` is empty). Elevation is derived purely in JS from `Location.coords.altitude`, which `expo-location` already surfaces to JS. **Nothing here needs the Jul native build.** The one *optional* enhancement — reading `coords.altitudeAccuracy` — is also already available from `expo-location` in JS with no rebuild.

### The concrete filter (exact numbers)

Replace the bare `> 0.8` gate with a **three-part filter**, applied to a **smoothed** altitude series:

1. **Altitude-accuracy gate** — reject any point whose vertical accuracy is poor. Read `location.coords.altitudeAccuracy`, store it as `altitudeAccuracyM` on `RunRoutePoint`, and when computing a delta, **drop the segment if either endpoint has `altitudeAccuracyM == null` OR `altitudeAccuracyM > 8` meters.** (Android routinely reports 10–40m vertical accuracy on flat ground — exactly the samples that fabricate the 410m. iOS barometric-fused fixes typically report ≤ 5m, so they pass.) When `altitudeAccuracyM` is absent on **both** endpoints (older saved routes, or a device that never reports it), fall back to the threshold+EMA path below rather than hard-dropping — so we never regress iOS, which already reads fine.
2. **EMA smoothing** — maintain an exponential moving average of altitude, `emaAlt = emaAlt + α·(rawAlt − emaAlt)` with **α = 0.3** (≈ a 5–6 sample window at the ~2s cadence). Accumulate gain from the **smoothed** series, not raw fixes. This alone kills the per-sample sawtooth that Android's noise creates.
3. **Minimum sustained-delta threshold** — only count an EMA rise once it exceeds **2.0 m** above the last committed elevation (hysteresis/"deadband"), not a per-sample 0.8 m. Track a running `committedAlt`; when `emaAlt − committedAlt ≥ 2.0`, add the difference and advance `committedAlt = emaAlt`. Small wobble never crosses the band → flat ground yields ~0 on both platforms.

Net effect on the dual-phone case: iOS 56m → ~0–15m; Galaxy 410m → ~0–15m. They converge because the smoothing+deadband dominate, and the accuracy gate removes Android's worst spikes at the source.

**Do NOT branch on `Platform.OS`.** Apply the identical filter in the shared JS accumulator. The accuracy gate self-adapts: Android's poor `altitudeAccuracy` naturally excludes its bad samples; iOS's good values pass. This keeps one code path (matches the existing "no Platform branch in the accept/reject path" design that Reader C validated) and avoids a magic-number platform fork.

### Files (all must change together — two summing paths + one type + two point-builders + four accumulator call sites)

| File | Change |
|---|---|
| `src/domain/running.ts:7` | Add `altitudeAccuracyM?: number \| null;` to `RunRoutePoint` (next to `altitude`). |
| `src/features/runs/tracking/background/locationDistance.ts:79-89` | In `buildRoutePoint`, read `location.coords.altitudeAccuracy` via a `normalizeAccuracyMeters`-style guard and store `altitudeAccuracyM`. |
| `src/features/runs/tracking/trackingSession.ts:146-153` | **Second** `buildRoutePoint` — same addition (currently also drops it). Both entry points must carry vertical accuracy or the gate is blind on one path. |
| `src/features/runs/tracking/background/locationDistance.ts:91-102` | Rewrite `calculateElevationGainForSegment` → an accuracy-gated single-segment delta (used by the accumulator's incremental add at `routeAccumulator.ts:364`). |
| `src/features/runs/tracking/index.ts:63-86` | Rewrite `calculateElevationGainM(route)` as the **stateful whole-route** EMA+deadband+accuracy-gate reducer. This is the match/save recompute path. |
| `src/features/runs/tracking/background/routeAccumulator.ts:171-178,231,252,324,364` | `calculateRouteElevationGainMeters` and its 3 full-recompute call sites should route through the **same** whole-route reducer as `calculateElevationGainM` so incremental (`:364`) and recompute paths can't diverge. **Recommended:** make `calculateElevationGainM` the single implementation and have the accumulator call it for the full-route recomputes; keep an incremental variant only if the per-segment hot path matters. Simplest correct design: on every commit, recompute `accumulatedElevationGainMeters = calculateElevationGainM(route)` and delete the incremental `+=` at `:364` — elevation is cheap vs distance and this guarantees one source of truth.

**Why both `calculateElevationGainForSegment` and `calculateElevationGainM` (or their unification):** matches use the `index.ts` recompute path via `trackingDisplayModel.ts:105` (`officialStartBaseline` present — the runner's lakeside-course case); non-matches (solo) pass through the accumulator's `snapshot.elevationGainM` (`trackingDisplayModel.ts:126`). A fix to only one lands on only one platform-of-record path. **Unifying on `calculateElevationGainM` closes that gap permanently.**

### Save-path flag ⚠️
`trackingDisplayModel.ts:105` (match) and `:128` (solo) both feed `displayedSnapshot.elevationGainM`, which `runSaveResultMapper.ts:141` reads and writes at `:183` into the saved run. **This IS the run-save path — extra review required.** The change is pure-function output only (no schema change; `elevationGainM?: number | null` already), so risk is contained to "the number is smaller," but review that `Math.round` at the four `commitSnapshot` sites and at `index.ts:85` still produces an integer.

### Tests (pure-function — this is where the elevation fix must be nailed)
Test runner is `tsx --test` (`package.json:69`), not jest. Add/extend:
- `src/features/runs/tracking/tracking.test.ts` — **this existing test at line 80 asserts `calculateElevationGainM(route) === 2` and WILL break** once the deadband is 2.0m; update its fixture and add:
  - **flat-noisy Android profile:** altitudes oscillating ±15m around a mean with `altitudeAccuracyM: 20` → assert gain **≈ 0** (this is the 410m regression test).
  - **flat-clean iOS profile:** altitudes ±1m, `altitudeAccuracyM: 4` → assert gain **≈ 0** (proves iOS 56m→~0, no over-correction).
  - **real hill:** a sustained +30m climb over 15 points, good accuracy → assert gain **≈ 30** (proves we didn't kill legitimate elevation).
  - **missing altitudeAccuracy** (both endpoints null) → falls back to EMA+deadband, still suppresses ±15m noise via smoothing.
  - **partial/none altitude** (`null`) → returns 0, no throw (preserve current `index.ts:74` guard).
- `src/features/runs/tracking/background/routeAccumulator.test.ts` — fixtures **already carry `altitudeAccuracy: 4`** at lines 45,72 (the type change makes them real inputs now); add a noisy-altitude append sequence asserting `getAccumulatedElevationGainMeters()` stays near 0.
- `src/features/runs/hooks/runSaveFlow/runSaveResultMapper.test.ts:44` — currently asserts saved `elevationGainM === 12`; keep a pass-through test (mapper just forwards `displayedSnapshot.elevationGainM`) so the save contract is pinned.
- `src/features/runs/viewModels/trackingDisplayModel.test.ts` — extend the `officialStartBaseline` path to assert the recompute uses the new reducer.

### Tell the user to verify (next dual-phone run)
On the same flat lakeside 5km, both phones should now read **elevation within ~0–20m of each other and both near 0** (was 56 vs 410). If Galaxy still reads high, capture a run and check whether `altitudeAccuracy` is being reported at all on that device (some Androids report `null`); if null, the EMA+deadband still carries it, but we may need to lower α to 0.2.

---

## ② CADENCE — high impact, low–moderate risk — **OTA (two parts)**

**OTA verdict: OTA-fixable. No native build needed.** The manifest already holds `ACTIVITY_RECOGNITION` (via `expo-sensors/android/src/main/AndroidManifest.xml` — Gradle-merged — and redundantly `app.json:32`). The built Galaxy binary **has** the permission. The bug is (a) the app never properly drives the runtime grant on Android because of a stale code belief, and (b) when steps are near-zero it saves a bogus `3spm` instead of `null`. Both are JS.

### Part A — Fix the permission UX (the real fix)

The false premise lives in `onboardingPermissions.ts`:
- Lines **11-15** and **62-66**: comments + `MOTION_ANDROID_NEEDS_NATIVE_BUILD = Platform.OS === 'android'` assert the permission "is not in the manifest." **Stale/incorrect** — it's baked into expo-sensors' own module manifest.
- Line **230-231**: `requestMotion` comments claim the Android request "resolves without a dialog." In fact `Pedometer.requestPermissionsAsync()` on API ≥ Q routes to `askForPermissionsWithPermissionsManager(ACTIVITY_RECOGNITION)` (`PedometerModule.kt:55`) and **does** show the dialog once the manifest entry exists — which it does.

**Fix:**
1. **Delete `MOTION_ANDROID_NEEDS_NATIVE_BUILD`** (line 66) and every consumer that labels the motion row "needs native build," so onboarding treats Android motion as a real, grantable permission (like iOS). Grep for `MOTION_ANDROID_NEEDS_NATIVE_BUILD` across the onboarding UI and remove the branch.
2. **Correct the stale comments** (11-15, 62-66, 230-231) to reflect that ACTIVITY_RECOGNITION is manifest-declared and the request shows a real dialog on Android.
3. The runtime tracking path (`usePedometerTracking.ts:55-61`) already calls `requestPermissionsAsync()` and bails cleanly if not granted — that's correct and stays. The only change it needs: when `granted === false` on Android after a request, we should surface it (see Part B display) rather than silently proceeding to a dead sensor.

*(If a device has already hard-denied ACTIVITY_RECOGNITION from an earlier build, `canAskAgain` is false and the re-request no-ops — `onboardingPermissions.ts` already models `canAskAgain` and routes to Settings. Verify the onboarding UI actually shows the "설정 열기" path for motion once `MOTION_ANDROID_NEEDS_NATIVE_BUILD` is gone.)*

### Part B — Interim safety floor (ship regardless, protects the saved record)

Even with the permission fixed, a device that denies it, lacks the hardware sensor, or under-reports must **never display a bogus `3spm`.** Right now `calculateCadenceSpm` (`index.ts:88-94`) returns `null` only when `totalSteps <= 0`, so ~81 steps → a real, tiny `3`.

**Add a plausibility floor to `calculateCadenceSpm`:** if the computed cadence is below a running floor — e.g. **`< 30 spm`** for any run whose `elapsedSeconds > 60` — treat it as "no reliable data" and return `null`. (No human running for over a minute produces < 30 spm; this cleanly separates "sensor dead" from a real slow jog at 120–180 spm.) Because the API/domain types are `cadenceSpm?: number | null` (`runs.ts:22`, `running.ts:44`), `null` flows through the save mapper (`runSaveResultMapper.ts:142,182`) and renders as **`--`** at `RunDetailInfoCard.tsx:29` (`run.cadenceSpm ? ... : '--'`). So a broken sensor shows an honest `--`, never `3spm`.

This is the fallback you asked for: **hide cadence when unreliable rather than showing a bogus number** — and it protects even the case where Part A's permission fix doesn't take on some device.

### Files
| File | Change | OTA |
|---|---|---|
| `src/features/runs/tracking/index.ts:88-94` | `calculateCadenceSpm`: add `< 30 spm && elapsedSeconds > 60 → null` floor. | OTA |
| `src/features/auth/onboarding/onboardingPermissions.ts:11-15,62-66,230-231` | Remove `MOTION_ANDROID_NEEDS_NATIVE_BUILD`; fix stale comments; Android motion becomes a first-class grantable permission. | OTA |
| Onboarding UI consumer(s) of `MOTION_ANDROID_NEEDS_NATIVE_BUILD` | Remove the "needs native build" label branch; use the normal grant/settings flow. (Grep to locate.) | OTA |
| `usePedometerTracking.ts:72` | Leave the Android non-solo perf suppression as-is (it only gates React state, not the saved value) — **do not touch**, it's tied to the #195/#201 JS-saturation work. | — |

### Save-path flag ⚠️
`calculateCadenceSpm` feeds `runSaveResultMapper.ts:142` → saved `cadenceSpm`. **Run-save path — extra review.** The floor only converts an implausible tiny number to `null`; confirm no downstream consumer assumes `cadenceSpm` is always a number (types already allow null, and the display guards with `? :`).

### Tests
- `src/features/runs/tracking/tracking.test.ts` — add `calculateCadenceSpm` cases: `(81 steps, 1625 s) → null` (the Galaxy case), `(4170, 1625) → 154` (iPhone), `(0, 100) → null`, `(5, 5) → null` (short run guard: 60s rule shouldn't fire but 60spm from 5 steps/5s = 60 → returns 60; verify the `elapsedSeconds > 60` guard so a legit sprint start isn't nulled).
- `src/features/runs/hooks/runSaveFlow/runSaveResultMapper.test.ts` — add a case where `totalSteps` is tiny → saved `cadenceSpm === null`.
- Onboarding: if `onboardingPermissions.test.ts` exists, update expectations now that Android motion is grantable (no `MOTION_ANDROID_NEEDS_NATIVE_BUILD`).

### Tell the user to verify
1. **Fresh install / re-onboard on the Galaxy** and confirm the motion/activity permission dialog actually appears and is granted (Settings → App → Permissions → Physical activity = allowed). This is the crux — the 3spm will not fix without the grant.
2. Next dual-phone run: Galaxy cadence should read a real **~150–170 spm**, close to the iPhone. If it still shows `--`, the permission didn't take (check Settings) or that Galaxy's `TYPE_STEP_COUNTER` is genuinely absent — in which case `--` is the correct honest display.

---

## ③ DISTANCE / PACE — **within GPS tolerance, NO CHANGE**

Reader C is right; I confirmed the code. **Do not spend risk here.**

- The entire accept/reject filter is a **single shared JS path** (`routeAccumulator.appendTrackedLocation`, `locationDistance.ts` constants) with **no `Platform.OS` branch** — verified. Distance math is identical on both phones.
- The 17s (~1.05% over 27min) has two legitimate *physics/config* origins, neither a computation bug:
  1. **Per-phone cold-start anchor:** `startedAt` = each device's own first *stable* cold-start GPS fix (`routeAccumulator.ts:238`, gated by `COLD_START_STABLE_FIX_COUNT`). iPhone (BestForNavigation, faster lock) and Galaxy cross the stable-cluster gate seconds apart, so elapsed = `Date.now() − thatPhone'sOwnStart` differs. For a **solo** run there is no `matchSlotStartAt` shared clock to anchor to (`trackingDisplayModel.ts:27-33` returns null) — so there is nothing correct to unify against. Forcing a shared start would *invent* a fake reference.
  2. **Background sampling config** differs by design: `locationTask.ts:31` gives iOS `distanceInterval:0` (every fix) vs Android `4`m. This is deliberate and load-bearing — it's part of the **#203 bg-sync lifeline** (iOS needs dense fixes to keep the screen-off flush alive; Android is throttled to avoid the #195/#201 JS-saturation lag). **Touching it would weaken a protected system** — explicitly out of bounds per the constraints.

**Verdict:** within GPS tolerance. No change. Tell the user 17s / 3s-per-km on two independent GPS chipsets over 27 minutes is expected and not worth destabilizing the tracking pipeline for.

---

## Constraint compliance
- **Countdown-funnel files:** untouched. None of the changed files are in that set.
- **#203 bg-sync lifeline / hands-free finish (`localGoalFreeze`, 0a3283c):** untouched. The iOS `distanceInterval:0` and the Android perf suppression at `usePedometerTracking.ts:72` are explicitly left alone.
- **GPS point pipeline / cold-start jitter fixes:** the elevation change adds a field and swaps the elevation reducer only — it does **not** alter any distance accept/reject gate, teleport filter, or cold-start logic. Distance behavior is byte-for-byte unchanged.
- **OTA-only this week:** ✅ every change (①, ②) is JS/TS. Nothing requires the Jul native build. **NATIVE-BUILD bucket for this fix: EMPTY.** (`altitudeAccuracy` is already JS-exposed by expo-location; ACTIVITY_RECOGNITION is already in the merged manifest.)

## Suggested ship order
1. **② Part B** (cadence floor) — 1-line-ish, pure function, immediately stops the embarrassing `3spm` on any device even before the permission fix propagates.
2. **①** (elevation) — biggest visible win; land with the full pure-function test suite; flag the save-path review.
3. **② Part A** (permission UX) — real cadence fix; requires a re-onboard to verify, so ship alongside ① and tell the user to reinstall on the Galaxy.
4. **③** — no code; just communicate "within tolerance."

**Two changes touch the run-save path and need the extra review you asked for:** `calculateElevationGainM`/accumulator unification (→ saved `elevationGainM`) and the `calculateCadenceSpm` floor (→ saved `cadenceSpm`). Both only *shrink or null* a value through already-nullable types; neither changes the save schema or the distance/pace/route contract.
