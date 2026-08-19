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
  // TERMINAL SELF-STOP MARK (Stage 5) — OPTIONAL on the type so injected test fakes without it stay
  // valid; the call sites below use `?.()` so absence can never throw. The real wrapper (index.ts)
  // always exports it and no-ops internally on every binary lacking the native fn (old iOS, all
  // Android, web), so calling it here is OTA-safe on both platforms.
  markPeriodicMatchPayloadTerminal?(): boolean;
  // 잠든 중 실시간 병합 상한 — OPTIONAL(테스트 가짜·옛 래퍼 호환). 실제 래퍼는 옛 바이너리에서
  // 내부적으로 무동작한다.
  setPeriodicMatchMergeCap?(mergeCapKm: number): boolean;
  addMatchProgressResponseListener(listener: (body: string) => void): () => void;
};

export type PeriodicMatchUploadPayload = {
  url: string;
  authToken: string;
  jsonBody: string;
  // TERMINAL SELF-STOP (Stage 5) — true when jsonBody is a TERMINAL (finished) body: right after
  // the handoff the cached native payload is marked terminal, so the NEW iOS binary self-stops its
  // cadence + location consumer when that exact payload gets a terminal server response
  // (2xx/404/410) even while JS is suspended. Optional and default-absent: every non-finish payload
  // (and every existing caller) behaves exactly as before.
  isTerminal?: boolean;
  // 잠든 중 실시간 병합 상한(km) = goal − tolerance − epsilon. 주어지면 시동/갱신 직후
  // 네이티브에 내려보내, 재전송되는 distanceKm이 네이티브 누적 총거리로 실시간 갱신되게
  // 한다(절대 이 상한을 못 넘음 — 완주 판정은 영원히 JS 몫). 생략 = 병합 꺼짐.
  mergeCapKm?: number;
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
    // 병합 상한도 같이 새로 고친다 — iOS는 시동이 상한을 리셋하므로(fail-closed) 갱신마다
    // 다시 내려보내는 쪽이 어느 순서에서도 안전하다.
    if (Number.isFinite(payload.mergeCapKm) && (payload.mergeCapKm as number) > 0) {
      module.setPeriodicMatchMergeCap?.(payload.mergeCapKm as number);
    }
    // TERMINAL SELF-STOP (Stage 5) — re-mark AFTER the refresh: the native payload update RESETS
    // the terminal mark, and both calls marshal through the same native queue, so marking here
    // deterministically lands on the payload it was issued for.
    if (payload.isTerminal === true) {
      module.markPeriodicMatchPayloadTerminal?.();
    }
    return true;
  }

  // A different match took over (or none was running): tear down any prior listener first so a
  // stale subscription can never double-apply onto the new match.
  removeResponseListener?.();
  removeResponseListener = module.addMatchProgressResponseListener((body) => {
    applyBody(body);
  });
  lastStartedMatchKey = matchKey;

  const started = module.startPeriodicMatchUpload(payload.url, payload.authToken, payload.jsonBody, intervalMs);
  // 병합 상한은 시동 **뒤에** 내려보낸다 — 네이티브 시동이 이전 매치의 상한을 리셋하므로
  // (fail-closed), 이 순서라야 새 매치의 상한이 남는다. 같은 네이티브 큐라 순서가 보장된다.
  if (Number.isFinite(payload.mergeCapKm) && (payload.mergeCapKm as number) > 0) {
    module.setPeriodicMatchMergeCap?.(payload.mergeCapKm as number);
  }
  // TERMINAL SELF-STOP (Stage 5) — mark AFTER the start handoff for the same ordering reason as the
  // refresh branch above (start caches an unmarked payload first).
  if (payload.isTerminal === true) {
    module.markPeriodicMatchPayloadTerminal?.();
  }
  return started;
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
