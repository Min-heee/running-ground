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
  DISTANCE_GATE_ACCURACY_SCALE,
  DISTANCE_GATE_BASE_METERS,
  MAX_LOCATION_AGE_MS,
  MAX_REASONABLE_RUNNING_SPEED_MPS,
  MAX_TRACKING_ACCURACY_METERS,
  MIN_TELEPORT_FILTER_DISTANCE_METERS,
} from '@/features/runs/tracking/background/locationDistance';

// OTA kill-switch (default true). An OTA can flip this to false to force the pure-JS distance path
// (no native merge) WITHOUT a native rebuild if a field regression appears. When false, the merge
// helper ignores the native total entirely → today's behavior.
export const ENABLE_NATIVE_DISTANCE_MERGE = true;

// The JS filter constants handed to the native accumulator so native mirrors JS EXACTLY (source:
// locationDistance.ts). Kept here so the start wiring and the native side stay in lockstep.
export type NativeDistanceAccumulatorOptions = {
  maxAccuracyMeters: number;
  distanceGateBaseMeters: number;
  distanceGateAccuracyScale: number;
  teleportMinMeters: number;
  maxSpeedMps: number;
  maxLocationAgeMs: number;
};

export const NATIVE_DISTANCE_ACCUMULATOR_OPTIONS: NativeDistanceAccumulatorOptions = {
  maxAccuracyMeters: MAX_TRACKING_ACCURACY_METERS,
  distanceGateBaseMeters: DISTANCE_GATE_BASE_METERS,
  distanceGateAccuracyScale: DISTANCE_GATE_ACCURACY_SCALE,
  teleportMinMeters: MIN_TELEPORT_FILTER_DISTANCE_METERS,
  maxSpeedMps: MAX_REASONABLE_RUNNING_SPEED_MPS,
  maxLocationAgeMs: MAX_LOCATION_AGE_MS,
};

type NativeDistanceAccumulatorModule = {
  isNativeDistanceAccumulatorAvailable(): boolean;
  startDistanceAccumulator(options: NativeDistanceAccumulatorOptions): boolean;
  seedDistanceAccumulator(startMeters: number): void;
  getAccumulatedDistanceMeters(): number;
  resetDistanceAccumulator(): void;
  stopDistanceAccumulator(): void;
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

// PURE merge decision — the single safety-critical helper, unit-tested in isolation.
//
//   mergedDistanceKm = (nativeMergeEnabled && nativeAvailable)
//     ? max(jsDistanceKm, nativeMeters / 1000)
//     : jsDistanceKm
//
// Invariants this encodes (proven by the tests):
//   - never summed → max() of two same-origin totals → NO double-count.
//   - max() never drops below jsDistanceKm → never a backward jump from the JS value.
//   - flag off OR native unavailable → returns jsDistanceKm EXACTLY (today's behavior).
//   - foreground (jsDistanceKm >= nativeMeters/1000) → returns jsDistanceKm (foreground unchanged).
//   - a non-finite/negative native total is treated as 0 → cannot corrupt the merge.
export function resolveMergedDistanceKm(args: {
  jsDistanceKm: number;
  nativeMeters: number;
  nativeAvailable: boolean;
  nativeMergeEnabled?: boolean;
}): number {
  const { jsDistanceKm, nativeMeters, nativeAvailable, nativeMergeEnabled = ENABLE_NATIVE_DISTANCE_MERGE } = args;

  const safeJsKm = Number.isFinite(jsDistanceKm) && jsDistanceKm > 0 ? jsDistanceKm : 0;

  if (!nativeMergeEnabled || !nativeAvailable) {
    return safeJsKm;
  }

  const safeNativeKm = Number.isFinite(nativeMeters) && nativeMeters > 0 ? nativeMeters / 1000 : 0;
  return Math.max(safeJsKm, safeNativeKm);
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

let lastStartedMatchKey: string | null = null;

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
  cachedModule = null;
  cachedModuleResolved = false;
}
