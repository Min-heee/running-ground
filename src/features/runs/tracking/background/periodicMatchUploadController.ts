// PERIODIC NATIVE MATCH-PROGRESS UPLOADER — JS-side controller.
//
// This is the OTA-SAFE bridge between the JS background flush and the NEW native periodic uploader
// (the wall-clock ~3s, GPS+JS-independent cadence that re-sends the latest JS-built payload while
// the screen is off). The native module + its periodic fns ship in the NEXT native build only; the
// CURRENTLY INSTALLED binaries do NOT have them, so EVERY function here is a guarded no-op on those
// binaries — the existing JS-timer + location-task flush stays the unchanged fallback. That guard
// is what makes shipping this controller over OTA safe.
//
// The native side NEVER recomputes distance/pace/elapsed: this controller only ever hands it the
// EXACT JSON body the JS flush would POST. JS stays the single source of truth.
//
// The native-module binding lives OUTSIDE src/ (modules/match-progress-uploader) and imports
// react-native + expo-modules-core, which do not resolve under the node test runner. To keep the
// availability gate + the "no-op when unavailable" behavior unit-testable, the native binding is
// injected (default = a lazy import of the real module) and the pure decision lives here.

type PeriodicMatchUploaderModule = {
  isNativePeriodicUploaderAvailable(): boolean;
  startPeriodicMatchUpload(url: string, authToken: string, jsonBody: string, intervalMs: number): boolean;
  updatePeriodicMatchPayload(url: string, authToken: string, jsonBody: string): boolean;
  stopPeriodicMatchUpload(): boolean;
  addMatchProgressResponseListener(listener: (body: string) => void): () => void;
};

export type PeriodicMatchUploadPayload = {
  url: string;
  authToken: string;
  jsonBody: string;
};

// 3s wall-clock cadence — aligned with BACKGROUND_MATCH_PROGRESS_TIMER_MS / the flush throttle so
// the native re-POST and the JS-fallback flush share one cadence.
export const PERIODIC_MATCH_UPLOAD_INTERVAL_MS = 3_000;

let injectedModule: PeriodicMatchUploaderModule | null | undefined;

// Lazy default resolver. Mirrors getNativeMatchProgressUploaderService in backgroundMatchProgressSync:
// the native binding is dynamically imported so the node test runner (which cannot resolve
// react-native) never loads it, and so a missing native module degrades to the JS fallback.
async function resolvePeriodicMatchUploaderModule(): Promise<PeriodicMatchUploaderModule | null> {
  if (injectedModule !== undefined) {
    return injectedModule;
  }

  try {
    return (await import('../../../../../modules/match-progress-uploader')) as PeriodicMatchUploaderModule;
  } catch {
    return null;
  }
}

// Test seam: inject a fake native module (or null to force the unavailable path). Mirrors the
// dependency-injection style the flush tests already use.
export function setPeriodicMatchUploaderModuleForTest(module: PeriodicMatchUploaderModule | null | undefined) {
  injectedModule = module;
}

// True only when a native module is resolved AND it reports the periodic fns are linked. On every
// current binary this is false → the start/update/stop helpers below all no-op.
export async function isPeriodicMatchUploadAvailable(
  resolveModule: () => Promise<PeriodicMatchUploaderModule | null> = resolvePeriodicMatchUploaderModule,
): Promise<boolean> {
  const module = await resolveModule();
  return module?.isNativePeriodicUploaderAvailable() === true;
}

let lastStartedMatchKey: string | null = null;
let removeResponseListener: (() => void) | null = null;

// Start the native cadence for a freshly-built payload, wiring the onMatchProgressResponse emitter
// to applyBody so each native re-POST's 2xx body unfreezes the opponent board WITHOUT a JS timer.
// No-op (returns false) on any binary lacking the native fns. Idempotent for the same matchKey: a
// re-start just refreshes the payload via updatePeriodicMatchPayload (no listener/thread churn).
export async function startPeriodicMatchUpload(
  matchKey: string,
  payload: PeriodicMatchUploadPayload,
  applyBody: (body: string) => void,
  intervalMs: number = PERIODIC_MATCH_UPLOAD_INTERVAL_MS,
  resolveModule: () => Promise<PeriodicMatchUploaderModule | null> = resolvePeriodicMatchUploaderModule,
): Promise<boolean> {
  const module = await resolveModule();

  if (module?.isNativePeriodicUploaderAvailable() !== true) {
    return false;
  }

  if (lastStartedMatchKey === matchKey) {
    // Already running for this match — just refresh the cached payload (no thread/listener churn).
    module.updatePeriodicMatchPayload(payload.url, payload.authToken, payload.jsonBody);
    return true;
  }

  // A different match took over (or none was running): tear down any prior listener first so a
  // stale subscription can never double-apply onto the new match.
  removeResponseListener?.();
  removeResponseListener = module.addMatchProgressResponseListener((body) => {
    applyBody(body);
  });
  lastStartedMatchKey = matchKey;

  return module.startPeriodicMatchUpload(payload.url, payload.authToken, payload.jsonBody, intervalMs);
}

// NOTE: there is intentionally NO standalone updatePeriodicMatchPayload export. The same-match
// restart inside startPeriodicMatchUpload above already refreshes the cached native payload on each
// background flush (it calls module.updatePeriodicMatchPayload directly), so a separate exported
// helper had no production caller. The underlying native wrapper (index.ts) is kept because that
// restart path + the Android availability gate still use it.

// Stop + clear the native cadence and unsubscribe the response listener (match finish / forfeit /
// context clear / unmount). No-op when unavailable or when nothing is running.
export async function stopPeriodicMatchUpload(
  resolveModule: () => Promise<PeriodicMatchUploaderModule | null> = resolvePeriodicMatchUploaderModule,
): Promise<boolean> {
  removeResponseListener?.();
  removeResponseListener = null;
  lastStartedMatchKey = null;

  const module = await resolveModule();

  if (module?.isNativePeriodicUploaderAvailable() !== true) {
    return false;
  }

  return module.stopPeriodicMatchUpload();
}

// Test reset: clear the module-level cadence state between tests.
export function resetPeriodicMatchUploadForTest() {
  removeResponseListener = null;
  lastStartedMatchKey = null;
}
