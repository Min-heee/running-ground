// NATIVE DISTANCE ACCUMULATOR — JS-side controller (VARIANT 1: POST-only merge).
//
// This is the OTA-SAFE bridge between the JS background flush and the NEW native distance
// accumulator (the native GPS consumer that keeps a run's distance advancing while the JS thread is
// suspended — screen off). The native module + its accumulator fns ship in the NEXT native build
// only; the CURRENTLY INSTALLED binaries do NOT have them, so EVERY function here is a guarded no-op
// on those binaries — the existing JS distance pipeline stays the single source of truth. That guard
// is what makes shipping this controller over OTA safe.
//
// SAFETY MODEL (see the merge helper below):
//   - The native accumulator is SEEDED to the JS total at start, so native and JS share ONE origin.
//   - The merge takes max(jsKm, nativeKm) — NEVER a sum — so the native total can never double-count
//     and max() can never produce a backward jump.
//   - When native is unavailable OR the kill-switch flag is off, getAccumulatedNativeMeters returns
//     0 → max(jsKm, 0) === jsKm === EXACTLY today's behavior.
//   - In the foreground the JS pipeline is ahead (JS >= native), so max() === jsKm and the
//     foreground happy path is byte-for-byte unchanged.
//
// The native binding lives OUTSIDE src/ (modules/match-progress-uploader) and imports react-native +
// expo-modules-core, which do not resolve under the node test runner. So the native binding is
// injected (default = a lazy import of the real module) and the pure merge decision lives here,
// unit-testable without the native layer — mirroring periodicMatchUploadController.

import {
  COLD_START_MAX_STABLE_ACCURACY_METERS,
  COLD_START_MAX_STABLE_CLUSTER_RADIUS_METERS,
  COLD_START_MAX_STABLE_WINDOW_MS,
  COLD_START_STABLE_FIX_COUNT,
  DISTANCE_GATE_ACCURACY_SCALE,
  DISTANCE_GATE_BASE_METERS,
  MAX_CREDITABLE_FIX_GAP_MS,
  MAX_LOCATION_AGE_MS,
  MAX_REASONABLE_RUNNING_SPEED_MPS,
  MAX_TRACKING_ACCURACY_METERS,
  MIN_LOCATION_TIME_DELTA_MS,
  MIN_TELEPORT_FILTER_DISTANCE_METERS,
  POOR_ACCURACY_METERS,
  STATIONARY_SPEED_MPS,
} from '@/features/runs/tracking/background/locationDistance';

// OTA kill-switch (default true). An OTA can flip this to false to force the pure-JS distance path
// (no native merge) WITHOUT a native rebuild if a field regression appears. When false, the merge
// helper ignores the native total entirely → today's behavior.
export const ENABLE_NATIVE_DISTANCE_MERGE = true;

// OTA kill-switch for the distance-ADVANCE freshness signal (backgroundSyncDiagnostics
// lastDistanceAdvanceAtMs). The signal is consulted only when this is true AND the installed
// binary passes the gap-rule check below (isGapRuleBinarySupported).
//
// HISTORY — why this sat at false until 2026-08-17: freshness rightly means "are we still
// MEASURING", and keying staleness on it makes the screen-off native gap-fill reachable in far
// more situations than before (any stretch where every fix is rejected, plus long stationary
// stretches) — not just a fully suspended JS thread. The pre-bfc54ec6 native accumulators had no
// signal-loss dt ceiling, so a 3-minute GPS blackout banked its whole ~1km straight-line chord at
// a perfectly plausible speed, and the server's Math.max means an inflated total can never be
// walked back. The original plan gated the flip on "the gap-rule build is the MINIMUM shipped
// version" — but the app enforces no minimum version, so that day never comes while one old
// install survives. The per-BINARY check replaces the fleet-wide condition: each device opens the
// gap-fill only if its own accumulator enforces the gap rule (오너 실사고 2026-08-17: 회원F
// 아이폰 화면꺼짐 정지 — 스토어 빌드 55, 갭 규칙 탑재본인데 신호가 꺼져 있어 갭필이 안 열림).
export const ENABLE_DISTANCE_ADVANCE_FRESHNESS = true;

// Whether THIS binary's native accumulators enforce the signal-loss gap rule. Latched once at app
// start from react-native + expo-constants (locationTask.ts), which this module must not import —
// its tests run under node. Default FALSE: until the latch is set (and on any binary that fails
// the check) every consumer keeps today's pre-freshness behavior. fail-closed.
let gapRuleBinarySupported = false;

export function setGapRuleBinarySupport(supported: boolean) {
  gapRuleBinarySupported = supported === true;
}

export function isGapRuleBinarySupported(): boolean {
  return gapRuleBinarySupported;
}

// The JS filter constants handed to the native accumulator so native mirrors JS EXACTLY (source:
// locationDistance.ts). Kept here so the start wiring and the native side stay in lockstep.
export type NativeDistanceAccumulatorOptions = {
  maxAccuracyMeters: number;
  distanceGateBaseMeters: number;
  distanceGateAccuracyScale: number;
  teleportMinMeters: number;
  maxSpeedMps: number;
  maxLocationAgeMs: number;
  // STEP 4 — new wire-format fields pushed ahead of the native build (steps 5-6, separate). A native
  // binary that predates these fields simply ignores the extra keys, so adding them is OTA-safe. They
  // mirror the JS filter chain so the native accumulator can match JS EXACTLY once the native build
  // reads them; the JS pipeline is unaffected by their presence here.
  //
  // Minimum time delta between counted fixes (JS: MIN_LOCATION_TIME_DELTA_MS).
  minTimeDeltaMs: number;
  // 2nd (accuracy-scaled) teleport gate: drop a fix when it jumps farther than
  // max(teleportMinMeters, accuracy * teleportAccuracyScale) AND faster than teleportMaxSpeedMps.
  teleportAccuracyScale: number;
  teleportMaxSpeedMps: number;
  // Stationary noise rejection (JS shouldIgnoreNoisySegment): a fix moving slower than
  // stationarySpeedMps within a small accuracy-scaled radius is treated as jitter, not movement.
  stationarySpeedMps: number;
  poorAccuracyMeters: number;
  // Cold-start stabilization gate (JS buildStableColdStartRouteCandidate). The native side waits for
  // coldStartStableFixCount fixes inside coldStartMaxClusterRadiusMeters / coldStartMaxAccuracyMeters
  // within coldStartMaxWindowMs before anchoring, then (matching the JS seed=0) banks NO intra-cluster
  // path — distance only accumulates after the stable anchor.
  coldStartStableFixCount: number;
  coldStartMaxClusterRadiusMeters: number;
  coldStartMaxAccuracyMeters: number;
  coldStartMaxWindowMs: number;
  // SIGNAL-LOSS GAP CEILING (JS MAX_CREDITABLE_FIX_GAP_MS / isSignalLossGapMs). No valid fix for
  // longer than this means the path between the two fixes was never observed, so the chord is NOT
  // credited — the native accumulator only re-anchors and resumes counting from the re-acquired
  // position. Added together with the native gate that reads it (see the convention note below).
  maxCreditableFixGapMs: number;
};

// TODO(next native build): the JS filter chain now caps the accuracy value used by its
// accuracy-SCALED thresholds at ACCURACY_SCALE_CAP_METERS = 15 (locationDistance.ts — cross-device
// parity: vendor accuracy estimates differ, and uncapped estimates widen the Galaxy's gates vs the
// iPhone's). The native accumulators mirror those gates from THESE wire constants and have no cap
// yet, so this cap is JS-side only for now. Mirroring it natively needs a new optional wire key
// (accuracyCapMeters) read by the NEXT binary. Do NOT add the key yet: build-44 natives ignore
// unknown keys so it would be inert, and a half-wired key invites confusion — add accuracyCapMeters
// here in the same change that teaches the native accumulators to read it.
export const NATIVE_DISTANCE_ACCUMULATOR_OPTIONS: NativeDistanceAccumulatorOptions = {
  maxAccuracyMeters: MAX_TRACKING_ACCURACY_METERS,
  distanceGateBaseMeters: DISTANCE_GATE_BASE_METERS,
  distanceGateAccuracyScale: DISTANCE_GATE_ACCURACY_SCALE,
  teleportMinMeters: MIN_TELEPORT_FILTER_DISTANCE_METERS,
  maxSpeedMps: MAX_REASONABLE_RUNNING_SPEED_MPS,
  maxLocationAgeMs: MAX_LOCATION_AGE_MS,
  // STEP 4 — new wire-format fields (OTA-safe; ignored by binaries that predate them).
  minTimeDeltaMs: MIN_LOCATION_TIME_DELTA_MS,
  teleportAccuracyScale: 1.8,
  teleportMaxSpeedMps: 5.8,
  stationarySpeedMps: STATIONARY_SPEED_MPS,
  poorAccuracyMeters: POOR_ACCURACY_METERS,
  coldStartStableFixCount: COLD_START_STABLE_FIX_COUNT,
  coldStartMaxClusterRadiusMeters: COLD_START_MAX_STABLE_CLUSTER_RADIUS_METERS,
  coldStartMaxAccuracyMeters: COLD_START_MAX_STABLE_ACCURACY_METERS,
  coldStartMaxWindowMs: COLD_START_MAX_STABLE_WINDOW_MS,
  // Wired in the SAME change that teaches BOTH native accumulators to read it (see above).
  maxCreditableFixGapMs: MAX_CREDITABLE_FIX_GAP_MS,
};

type NativeDistanceAccumulatorModule = {
  isNativeDistanceAccumulatorAvailable(): boolean;
  startDistanceAccumulator(options: NativeDistanceAccumulatorOptions): boolean;
  seedDistanceAccumulator(startMeters: number): void;
  getAccumulatedDistanceMeters(): number;
  resetDistanceAccumulator(): void;
  stopDistanceAccumulator(): void;
  // vc51 — 죽은 세션의 디스크 총거리 읽기(재실행 정산 전용). 이전 바이너리엔 없다.
  getPersistedDistanceSessionMeters?(): number;
};

let injectedModule: NativeDistanceAccumulatorModule | null | undefined;

// Lazy default resolver. Mirrors getNativeMatchProgressUploaderService: the native binding is
// dynamically imported so the node test runner (which cannot resolve react-native) never loads it,
// and so a missing native module degrades to the JS-only distance path.
async function resolveNativeDistanceAccumulatorModule(): Promise<NativeDistanceAccumulatorModule | null> {
  if (injectedModule !== undefined) {
    return injectedModule;
  }

  try {
    return (await import('../../../../../modules/match-progress-uploader')) as NativeDistanceAccumulatorModule;
  } catch {
    return null;
  }
}

// Test seam: inject a fake native module (or null to force the unavailable path).
export function setNativeDistanceAccumulatorModuleForTest(module: NativeDistanceAccumulatorModule | null | undefined) {
  injectedModule = module;
}

// 재실행 정산 전용 — 모듈을 읽기만을 위해 미리 캐시한다(아무것도 시동하지 않는다). 아래의
// 동기 읽기들은 캐시가 없으면 0을 돌려주므로, 정산은 반드시 이걸 await한 뒤 읽어야 한다.
export async function ensureNativeDistanceAccumulatorModuleResolved(
  resolveModule: () => Promise<NativeDistanceAccumulatorModule | null> = resolveNativeDistanceAccumulatorModule,
): Promise<void> {
  await ensureCachedModule(resolveModule);
}

// vc51 재실행 정산 — 프로세스가 죽은 러닝이 디스크에 남긴 마지막 네이티브 총거리(m).
// 부활 서비스조차 못 뜬 새 프로세스에서 잠든 구간을 회수할 유일한 통로다. 킬스위치·캐시
// 부재·구 바이너리(함수 없음)·만료 세션은 전부 0 — 절대 던지지 않는다.
export function getPersistedNativeDistanceSessionMeters(): number {
  if (!ENABLE_NATIVE_DISTANCE_MERGE || !cachedModule) {
    return 0;
  }

  try {
    if (typeof cachedModule.getPersistedDistanceSessionMeters !== 'function') {
      return 0;
    }
    const meters = cachedModule.getPersistedDistanceSessionMeters();
    return Number.isFinite(meters) && meters > 0 ? meters : 0;
  } catch {
    return 0;
  }
}

// PURE merge decision — the single safety-critical helper, unit-tested in isolation.
//
// FRESH-JS-WINS + NATIVE-DELTA-ONLY (replaces the old unconditional max()):
//
//   mergedDistanceKm =
//     (!nativeMergeEnabled || !nativeAvailable) ? jsDistanceKm           // today's pure-JS behavior
//   : jsIsFresh                                 ? jsDistanceKm           // FRESH → JS EXACTLY (all filters)
//   : /* JS stale (screen off) */                 max(lastFreshJsKm, nativeKm)  // native FILLS the gap
//
// WHY this is not max() while JS is fresh: the native accumulator omits some JS jitter/cold-start
// filters and can OVER-COUNT, so an unconditional max() let the noisier native path WIN an interval
// and lock in jitter the JS chain already filtered. When JS is FRESH (foreground / screen on), the
// fully-filtered JS chain is authoritative, so we return jsDistanceKm EXACTLY — native can never win.
//
// WHY this still advances screen-off (no freeze / no under-count): the native total is RE-SEEDED to
// the JS total on every fresh flush (see seedNativeDistanceAccumulatorToMeters + the flush wiring), so
// at the moment JS goes stale, native == the last fresh JS total and then accumulates its OWN GPS
// deltas on top. So nativeKm === lastFreshJsKm + nativeDeltaSinceLastFreshSeed — i.e. the last fresh
// JS baseline PLUS native's gap-fill delta, additively, NEVER a re-add of pre-seed jitter. The
// max(lastFreshJsKm, nativeKm) is a monotonic FLOOR: it can never drop below the last fresh JS total
// (no backward jump) and the native delta keeps it climbing while the screen is off (no freeze).
//
// Invariants (proven by the tests):
//   - flag off OR native unavailable → returns jsDistanceKm EXACTLY (today's behavior).
//   - jsIsFresh → returns jsDistanceKm EXACTLY (native NEVER wins an interval the JS chain filtered).
//   - jsIsFresh and native ahead → STILL jsDistanceKm (the old max() would have taken native; now it
//     cannot — this is the whole point of killing the noisier-path-over-counts win).
//   - stale → max(lastFreshJsKm, nativeKm): never below the last fresh JS total (no backward jump /
//     no decrease), advances with the native delta (no freeze / no under-count screen-off).
//   - a non-finite/negative native total is treated as 0 → cannot corrupt the merge (stale falls back
//     to lastFreshJsKm, never a drop).
export function resolveMergedDistanceKm(args: {
  jsDistanceKm: number;
  nativeMeters: number;
  nativeAvailable: boolean;
  jsIsFresh: boolean;
  lastFreshJsKm?: number;
  nativeMergeEnabled?: boolean;
}): number {
  const {
    jsDistanceKm,
    nativeMeters,
    nativeAvailable,
    jsIsFresh,
    lastFreshJsKm,
    nativeMergeEnabled = ENABLE_NATIVE_DISTANCE_MERGE,
  } = args;

  const safeJsKm = Number.isFinite(jsDistanceKm) && jsDistanceKm > 0 ? jsDistanceKm : 0;

  // Flag off / native unavailable → pure JS path, byte-for-byte today's behavior.
  if (!nativeMergeEnabled || !nativeAvailable) {
    return safeJsKm;
  }

  // FRESH JS → the fully-filtered JS chain is authoritative; native can never win an interval.
  if (jsIsFresh) {
    return safeJsKm;
  }

  // STALE JS (screen off) → native fills the gap, additively from the last fresh JS baseline. The
  // baseline floor is the last fresh JS total (falls back to the current — frozen but equal — JS
  // total if no explicit baseline was captured), so the merged value can never drop below it.
  const safeBaselineKm = Number.isFinite(lastFreshJsKm) && (lastFreshJsKm as number) > 0
    ? (lastFreshJsKm as number)
    : safeJsKm;
  const safeNativeKm = Number.isFinite(nativeMeters) && nativeMeters > 0 ? nativeMeters / 1000 : 0;
  return Math.max(safeBaselineKm, safeNativeKm);
}

// Synchronous read of the native distance total in METERS, merged into the flush. Returns 0 when the
// native accumulator is unavailable OR the kill-switch is off — so the merge becomes max(jsKm, 0) ===
// jsKm === today's behavior. Resolves the module via the SAME injected/lazy seam as the lifecycle
// wiring; the resolved-module reference is cached after the first lifecycle call so this stays
// synchronous on the hot flush path.
let cachedModule: NativeDistanceAccumulatorModule | null = null;
let cachedModuleResolved = false;

async function ensureCachedModule(
  resolveModule: () => Promise<NativeDistanceAccumulatorModule | null>,
): Promise<NativeDistanceAccumulatorModule | null> {
  if (cachedModuleResolved) {
    return cachedModule;
  }
  cachedModule = await resolveModule();
  cachedModuleResolved = true;
  return cachedModule;
}

// SYNCHRONOUS native total read for the merge. Returns 0 unless the native accumulator is both
// available AND the kill-switch is on. Never throws.
export function getMergeableNativeDistanceMeters(): number {
  if (!ENABLE_NATIVE_DISTANCE_MERGE || !cachedModule) {
    return 0;
  }

  try {
    if (!cachedModule.isNativeDistanceAccumulatorAvailable()) {
      return 0;
    }
    const meters = cachedModule.getAccumulatedDistanceMeters();
    return typeof meters === 'number' && Number.isFinite(meters) && meters > 0 ? meters : 0;
  } catch {
    return 0;
  }
}

// SYNCHRONOUS re-seed of the native total to the JS authoritative total, on the hot flush path.
//
// WHY: the native accumulator is SEEDED to the JS total at start, so it inherits all the JS distance
// filters at t0 — but it then accumulates on its OWN GPS deltas, which mirror only SOME of the JS
// filters (it omits the JS cold-start cluster collapse). At GPS cold start the native therefore
// OVER-COUNTS the warmup jitter the JS pipeline discards, and because the POST merge is
// max(jsKm, nativeKm), that one-time over-count is preserved forever as a CONSTANT offset.
//
// Re-seeding the native total to the CURRENT JS total whenever the JS distance is FRESH erases that
// over-count: each fresh flush overwrites the native total with the fully-JS-filtered value, so the
// native only ever DIVERGES (leads) once JS goes stale (screen off) and stops being re-seeded — the
// existing screen-off lead behavior is preserved, just from a clean (offset-free) baseline. The
// native keeps its GPS anchor, so it accumulates correct deltas after each re-seed.
//
// No-op (never throws) when the kill-switch is off, no module is cached, the native accumulator is
// unavailable, OR the native lacks seedDistanceAccumulator (e.g. build 40, where the fn is absent) —
// so this stays OTA-safe on every current binary, exactly like getMergeableNativeDistanceMeters.
// Returns true only when the native total was actually re-seeded.
export function seedNativeDistanceAccumulatorToMeters(meters: number): boolean {
  if (!ENABLE_NATIVE_DISTANCE_MERGE || !cachedModule) {
    return false;
  }

  const safeMeters = Number.isFinite(meters) && meters > 0 ? meters : 0;

  try {
    if (!cachedModule.isNativeDistanceAccumulatorAvailable()) {
      return false;
    }
    if (typeof cachedModule.seedDistanceAccumulator !== 'function') {
      return false;
    }
    cachedModule.seedDistanceAccumulator(safeMeters);
    return true;
  } catch {
    return false;
  }
}

// LAST-FRESH-JS BASELINE — the JS authoritative total (in METERS) captured at the most recent FRESH
// flush, i.e. the value the native accumulator was last re-seeded to. This is the floor the stale
// merge fills the gap from: while JS is stale (screen off) the native total === this baseline + its
// own GPS delta, so the merge returns max(baseline, native) — additive from a clean JS baseline,
// never a re-add of pre-seed jitter, never below the last fresh JS total. Reset to 0 between runs.
let lastFreshJsAuthoritativeMeters = 0;

// Record the JS authoritative total at a FRESH flush. Called ONLY when MY JS distance is fresh (the
// flush guards this with the same isMyMatchDistanceStale signal that gates the native re-seed), so it
// always holds the last screen-on, fully-JS-filtered total. Floors garbage/negative to 0.
export function recordFreshJsAuthoritativeMeters(meters: number) {
  lastFreshJsAuthoritativeMeters = Number.isFinite(meters) && meters > 0 ? meters : 0;
}

// The last fresh JS total in KM, for the stale-branch baseline floor in resolveMergedDistanceKm.
export function getLastFreshJsAuthoritativeKm(): number {
  return lastFreshJsAuthoritativeMeters / 1000;
}

let lastStartedMatchKey: string | null = null;

// 이 키로 누적기가 지금 돌고 있는가 — 시동이 세팅하고 정지가 지운다. 솔로 가드가 '이미
// 도는 누적기를 동결 원장으로 되심는 것'과 '아직 안 도는 누적기를 새로 켜는 것'(항상
// 안전 — 지울 게 없다)을 가르는 데 쓴다.
export function isNativeDistanceAccumulatorStartedFor(matchKey: string): boolean {
  return lastStartedMatchKey === matchKey;
}

// Start native GPS distance accumulation for the match + SEED it to the JS authoritative total at
// this instant so native and JS share ONE origin. No-op on any binary lacking the native fns or when
// the kill-switch is off. Idempotent for the same matchKey (a re-start just re-seeds the baseline,
// keeping native aligned with JS without restarting the GPS session).
export async function startNativeDistanceAccumulator(
  matchKey: string,
  jsAccumulatedMeters: number,
  resolveModule: () => Promise<NativeDistanceAccumulatorModule | null> = resolveNativeDistanceAccumulatorModule,
): Promise<boolean> {
  if (!ENABLE_NATIVE_DISTANCE_MERGE) {
    return false;
  }

  const module = await ensureCachedModule(resolveModule);

  if (module?.isNativeDistanceAccumulatorAvailable() !== true) {
    return false;
  }

  const seedMeters = Number.isFinite(jsAccumulatedMeters) && jsAccumulatedMeters > 0 ? jsAccumulatedMeters : 0;

  if (lastStartedMatchKey === matchKey) {
    // Already running for this match — just re-seed so native stays aligned with the JS total (the
    // GPS session is left running; re-seeding cannot lose distance because the merge takes max()).
    module.seedDistanceAccumulator(seedMeters);
    return true;
  }

  const started = module.startDistanceAccumulator(NATIVE_DISTANCE_ACCUMULATOR_OPTIONS);

  // 거짓 성공 래치 무장해제 (2026-08-23 민병희 갤럭시): 시동 실패를 true로 래치하면 이후의
  // 모든 재호출이 '이미 돈다'는 재시딩 경로로 빠져 영영 재시동을 안 한다. vc50 Kotlin은
  // 무조건 true를 돌려줘서 이 가드는 지금은 잠들어 있지만, 실제 결과를 돌려주는 바이너리
  // (vc51+)부터는 실패가 래치되지 않고 다음 하트비트가 다시 시동을 건다.
  if (!started) {
    return false;
  }

  // SEED immediately after start so the native baseline == the JS total at this instant. start has
  // reset the per-fix anchor, so the next fix only sets the origin (no jump) and the seed sets the
  // total — together native == JS at t0.
  module.seedDistanceAccumulator(seedMeters);
  lastStartedMatchKey = matchKey;
  return started;
}

// Stop native GPS distance accumulation + tear down the native consumer (match finish / forfeit /
// context clear / unmount) so no battery is drained after the run. No-op when unavailable.
export async function stopNativeDistanceAccumulator(
  resolveModule: () => Promise<NativeDistanceAccumulatorModule | null> = resolveNativeDistanceAccumulatorModule,
): Promise<boolean> {
  lastStartedMatchKey = null;
  // Clear the last-fresh baseline so the next run's stale merge cannot floor off a previous run's total.
  lastFreshJsAuthoritativeMeters = 0;

  const module = await ensureCachedModule(resolveModule);

  if (module?.isNativeDistanceAccumulatorAvailable() !== true) {
    return false;
  }

  try {
    module.stopDistanceAccumulator();
    return true;
  } catch {
    return false;
  }
}

// Test reset: clear the module-level cadence state + the cached module between tests.
export function resetNativeDistanceAccumulatorForTest() {
  lastStartedMatchKey = null;
  lastFreshJsAuthoritativeMeters = 0;
  cachedModule = null;
  cachedModuleResolved = false;
  gapRuleBinarySupported = false;
}
