import { Platform } from 'react-native';
import { EventSubscription, requireNativeModule } from 'expo-modules-core';

type MatchProgressResponseEvent = {
  // The raw 2xx response body string the native periodic re-POST already read, so JS can apply
  // the opponent's live state WITHOUT a JS timer (the whole point of the native cadence).
  body: string;
};

// NATIVE DISTANCE ACCUMULATOR (NEW — ships in the NEXT native build on BOTH platforms). The native
// GPS consumer (iOS CLLocationManager fixes / Android FusedLocation) keeps advancing the run's
// distance while the JS thread is suspended (screen off). It mirrors the JS distance filter
// constants 1:1 so native and JS produce the same total, and is SEEDED to the JS total at start so
// both share a single origin (the JS merge then takes max(jsKm, nativeKm) — never a sum).
type DistanceAccumulatedEvent = {
  // The native running total in METERS after a fix advanced it (emitted on advance only).
  meters: number;
};

// The JS filter constants handed to the native accumulator so it mirrors JS EXACTLY (source:
// src/features/runs/tracking/background/locationDistance.ts + routeAccumulator.ts). The native side
// uses ONLY these — it never reads JS state — so the two pipelines stay in lockstep.
export type DistanceAccumulatorOptions = {
  // MAX_TRACKING_ACCURACY_METERS (60): reject a fix whose horizontal accuracy is worse than this.
  maxAccuracyMeters: number;
  // DISTANCE_GATE_BASE_METERS (2.5): the constant floor of the per-segment distance gate.
  distanceGateBaseMeters: number;
  // DISTANCE_GATE_ACCURACY_SCALE (0.15): how much the worst accuracy widens the gate.
  distanceGateAccuracyScale: number;
  // MIN_TELEPORT_FILTER_DISTANCE_METERS (35): a segment >= this AND faster than maxSpeedMps is a GPS
  // teleport and is dropped.
  teleportMinMeters: number;
  // MAX_REASONABLE_RUNNING_SPEED_MPS (8.5): the teleport speed ceiling.
  maxSpeedMps: number;
  // MAX_LOCATION_AGE_MS (15000): reject a fix whose timestamp is older/newer than this vs now.
  maxLocationAgeMs: number;
};

type MatchProgressUploaderNativeModule = {
  // NATIVE: resolves with the response body string the native side already reads (or null on
  // non-2xx / failure) so the JS background flush can apply the opponent's live state instead of
  // discarding it. Android (Kotlin) has shipped this; iOS (Swift) ships it in the NEXT build.
  upload(url: string, authToken: string, jsonBody: string): Promise<string | null>;
  // OTA-SAFETY marker — ONLY the REAL native module (Android Kotlin's behavior + the NEW iOS
  // Swift build) sets this to true. The CURRENT iOS no-op Swift binary does NOT define it, so it
  // reads back as `undefined`. This is the signal that lets isNativeMatchProgressUploaderAvailable
  // route iOS to the native path only on the new build (see below).
  available?: boolean;

  // NATIVE PERIODIC UPLOADER (NEW — ships in the NEXT native build on BOTH platforms). These are
  // the GPS+JS-independent wall-clock (~3s) cadence that re-sends the latest JS-built payload while
  // the screen is off. They are OPTIONAL on the type because the CURRENTLY INSTALLED binaries do
  // NOT define them — `typeof` guards below make every call a safe no-op on those binaries so a
  // single OTA bundle stays safe (the existing JS-timer + location-task flush remains the fallback).
  //
  // The native side NEVER recomputes distance/pace/elapsed — it only re-sends the exact jsonBody JS
  // hands it. JS stays the single source of truth.
  startPeriodicUpload?(url: string, authToken: string, jsonBody: string, intervalMs: number): void;
  updatePeriodicPayload?(url: string, authToken: string, jsonBody: string): void;
  stopPeriodicUpload?(): void;
  // TERMINAL SELF-STOP MARK (NEW — iOS build 44+ ONLY; the current iOS/Android binaries and the
  // Kotlin module do NOT define it). Marks the currently cached periodic payload TERMINAL (a
  // finished body) so the NATIVE side self-stops its cadence + location consumer + distance
  // accumulator when THAT payload gets a terminal server response (2xx/404/410) — a screen-off iOS
  // runner cannot rely on JS observing the ACK. OPTIONAL on the type for the same reason as the
  // periodic fns above; the `typeof` gate in the wrapper below makes the call a safe no-op
  // everywhere the fn is absent (old binaries, Android, web), so a single OTA bundle stays safe.
  markPeriodicPayloadTerminal?(): void;

  // BATTERY OPTIMIZATION CONTROL (NEW — Android-only, ships in the NEXT native build). Synchronous
  // Expo `Function(...)`s exposed by the Kotlin module. OPTIONAL on the type for the SAME reason as
  // the periodic fns above: the CURRENTLY INSTALLED binaries do NOT define them, so the `typeof`
  // probe below reports them unavailable and every wrapper no-ops on those binaries (single OTA
  // bundle stays safe). iOS never links these.
  //   - isIgnoringBatteryOptimizations: true when this app is already exempt from Doze/app-standby
  //     battery optimization (so screen-off periodic upload won't be throttled).
  //   - requestIgnoreBatteryOptimizations: fires the Android settings intent asking the user to
  //     exempt the app; returns true when the intent was dispatched.
  isIgnoringBatteryOptimizations?(): boolean;
  requestIgnoreBatteryOptimizations?(): boolean;

  // NATIVE DISTANCE ACCUMULATOR (NEW — ships in the NEXT native build on BOTH platforms). These
  // begin/seed/read/reset/stop a native GPS distance total that advances while JS is suspended.
  // OPTIONAL on the type for the SAME reason as the periodic fns above: the CURRENTLY INSTALLED
  // binaries do NOT define them, so the `typeof` probe below reports them unavailable and every
  // wrapper no-ops on those binaries (single OTA bundle stays safe). The native side NEVER feeds
  // distance back into the JS pipeline on its own — JS reads it explicitly via getAccumulatedDistance
  // and merges with max(), so the native total can never double-count or jump JS backward.
  //   - startDistanceAccumulator: begins native GPS accumulation with the JS filter constants. start
  //     resets the per-fix anchor so the first fix only sets the origin (no initial jump).
  //   - seedDistanceAccumulator: set the native running total to the JS total at start so native and
  //     JS share one origin.
  //   - getAccumulatedDistanceMeters: SYNCHRONOUS read of the native total (Expo Function).
  //   - resetDistanceAccumulator / stopDistanceAccumulator: clear / stop the accumulation.
  startDistanceAccumulator?(options: DistanceAccumulatorOptions): boolean;
  seedDistanceAccumulator?(startMeters: number): void;
  getAccumulatedDistanceMeters?(): number;
  resetDistanceAccumulator?(): void;
  stopDistanceAccumulator?(): void;

  // NATIVE RUN-SAVE DELIVERY (NEW — ships in the NEXT native build on BOTH platforms). 화면 꺼진
  // 완주(골 크로싱) 순간 JS가 완성한 /runs/tracked 저장 페이로드를 네이티브가 재시도하며
  // 배달한다. 네이티브는 아무 것도 재계산하지 않는다 — JS 몸통 그대로. 서버의
  // (userId, startedAt) dedupe 덕에 이후 JS 저장과 겹쳐도 이중 기록이 안 된다.
  // OPTIONAL: 현재 설치된 바이너리들은 이 fn들이 없으므로 typeof 게이트로 no-op (OTA 안전).
  armRunSaveUpload?(url: string, authToken: string, jsonBody: string): void;
  cancelRunSaveUpload?(): void;

  // Emitter contract used by addListener below (Expo Events("onMatchProgressResponse") +
  // Events("onDistanceAccumulated")).
  addListener?(
    eventName: string,
    listener: (event: MatchProgressResponseEvent | DistanceAccumulatedEvent) => void,
  ): EventSubscription;
};

let nativeModule: MatchProgressUploaderNativeModule | null = null;

try {
  nativeModule = requireNativeModule<MatchProgressUploaderNativeModule>('MatchProgressUploader');
} catch {
  nativeModule = null;
}

// OTA-SAFETY: availability detection is platform-aware so a single OTA bundle is safe for BOTH
// currently-installed binaries.
//
//  - Android (current APK has the REAL Kotlin uploader): the native module registers a non-null
//    proxy with a working `upload`, so `nativeModule != null` is the correct, unchanged signal.
//    The current APK has NO `available` property, so we must NOT require it here or we would break
//    Android's already-shipped native path.
//
//  - iOS: the CURRENTLY INSTALLED TestFlight binary has the NO-OP Swift module. It DOES register a
//    non-null proxy (so `nativeModule != null` would be a FALSE positive), but it does NOT define
//    the `available` marker → `nativeModule?.available !== true` → reported UNAVAILABLE → the JS
//    flush keeps using the fetch fallback (today's behavior, unchanged). The NEXT iOS build ships
//    the REAL Swift module which sets `available = true` → reported AVAILABLE → native path.
export function isNativeMatchProgressUploaderAvailable(): boolean {
  if (nativeModule == null) {
    return false;
  }

  if (Platform.OS === 'ios') {
    // Gate iOS strictly on the explicit marker so the current no-op binary stays on JS fetch.
    return nativeModule.available === true;
  }

  // Android (and any other native platform that links the real module): a non-null proxy with a
  // real `upload` is the long-shipped availability signal — keep it unchanged.
  return true;
}

export async function uploadMatchProgressNative(
  url: string,
  authToken: string,
  jsonBody: string,
): Promise<string | null> {
  try {
    return (await nativeModule?.upload(url, authToken, jsonBody)) ?? null;
  } catch {
    // Best-effort background upload; the next location tick will retry with fresher data.
    return null;
  }
}

// OTA-SAFETY availability gate for the NEW native periodic uploader. True ONLY when the resolved
// native module actually exposes the periodic fns — i.e. ONLY on the next native build. On every
// CURRENTLY INSTALLED binary (Android APK + iOS TestFlight, neither of which has these fns) this
// returns false, so all the JS wrappers below become no-ops and the existing JS-timer +
// location-task flush remains the unchanged fallback. This is what keeps the OTA bundle safe.
export function isNativePeriodicUploaderAvailable(): boolean {
  if (nativeModule == null) {
    return false;
  }

  return (
    typeof nativeModule.startPeriodicUpload === 'function'
    && typeof nativeModule.updatePeriodicPayload === 'function'
    && typeof nativeModule.stopPeriodicUpload === 'function'
  );
}

// Start the native wall-clock cadence with the current JS-built payload. No-op (returns false) on
// any binary that lacks the native fns, so callers do not need their own guard — but they SHOULD
// still gate with isNativePeriodicUploaderAvailable() to avoid the wrapper churn on old binaries.
export function startPeriodicMatchUpload(
  url: string,
  authToken: string,
  jsonBody: string,
  intervalMs: number,
): boolean {
  if (!isNativePeriodicUploaderAvailable()) {
    return false;
  }

  try {
    nativeModule?.startPeriodicUpload?.(url, authToken, jsonBody, intervalMs);
    return true;
  } catch {
    // Best-effort: a failure to start leaves the JS-timer + location-task fallback in place.
    return false;
  }
}

// Cheaply overwrite the cached native payload (no thread restart). Called by JS on EVERY snapshot
// commit + every bg-location tick so the native re-POST always carries the freshest JS-built body.
export function updatePeriodicMatchPayload(
  url: string,
  authToken: string,
  jsonBody: string,
): boolean {
  if (!isNativePeriodicUploaderAvailable()) {
    return false;
  }

  try {
    nativeModule?.updatePeriodicPayload?.(url, authToken, jsonBody);
    return true;
  } catch {
    return false;
  }
}

// Stop + clear the native cadence (match finish / forfeit / context clear / unmount).
export function stopPeriodicMatchUpload(): boolean {
  if (!isNativePeriodicUploaderAvailable()) {
    return false;
  }

  try {
    nativeModule?.stopPeriodicUpload?.();
    return true;
  } catch {
    return false;
  }
}

// TERMINAL SELF-STOP MARK (hands-free finish Stage 5) — mark the currently cached native periodic
// payload TERMINAL. Called by the controller right AFTER a FINISHED payload handoff (the native
// start/update reset the mark, so the mark must follow the payload it belongs to — both marshal
// through the same native queue, preserving order). Once marked, the NEW iOS binary self-stops its
// cadence + CLLocationManager + distance accumulator when that payload gets a terminal server
// response (2xx/404/410), without waiting for JS. No-op (returns false) on ANY binary lacking the
// native fn — the current iOS build, every Android build (the Kotlin module deliberately does not
// implement it: Android's stop pipeline already works via the FG service), web, and Expo Go — so
// the single OTA bundle stays safe and the JS-observed stop path remains the unchanged fallback.
export function markPeriodicMatchPayloadTerminal(): boolean {
  if (!isNativePeriodicUploaderAvailable()) {
    return false;
  }

  if (typeof nativeModule?.markPeriodicPayloadTerminal !== 'function') {
    return false;
  }

  try {
    nativeModule?.markPeriodicPayloadTerminal?.();
    return true;
  } catch {
    return false;
  }
}

// OTA-SAFETY availability gate for the NEW Android battery-optimization control. Mirrors
// isNativePeriodicUploaderAvailable EXACTLY: true ONLY when the resolved native module actually
// exposes BOTH battery fns — i.e. ONLY on the next native build. On every CURRENTLY INSTALLED
// binary (Android APK + iOS TestFlight, neither of which has these fns) this returns false, so the
// wrappers below no-op and callers can gate on it to skip the nudge entirely (no false battery
// nag on old binaries, and never on iOS). This is what keeps the OTA bundle safe.
export function isBatteryOptimizationControlAvailable(): boolean {
  if (nativeModule == null) {
    return false;
  }

  return (
    typeof nativeModule.isIgnoringBatteryOptimizations === 'function'
    && typeof nativeModule.requestIgnoreBatteryOptimizations === 'function'
  );
}

// True when this app is already exempt from Android battery optimization (Doze/app-standby), so the
// screen-off periodic upload won't be throttled. On any binary lacking the native fn this returns
// `true` (assume fine → no nag), so callers safely skip prompting on old binaries and on iOS.
export function isIgnoringBatteryOptimizations(): boolean {
  if (!isBatteryOptimizationControlAvailable()) {
    return true;
  }

  try {
    return nativeModule?.isIgnoringBatteryOptimizations?.() ?? true;
  } catch {
    // Best-effort: if the native probe throws, assume exempt so we never nag erroneously.
    return true;
  }
}

// Fire the Android settings intent asking the user to exempt this app from battery optimization.
// Returns true when the intent was dispatched, false otherwise. No-op (returns false) on any binary
// lacking the native fn and on iOS, so callers do not need their own guard.
export function requestIgnoreBatteryOptimizations(): boolean {
  if (!isBatteryOptimizationControlAvailable()) {
    return false;
  }

  try {
    return nativeModule?.requestIgnoreBatteryOptimizations?.() ?? false;
  } catch {
    return false;
  }
}

// Subscribe to the native onMatchProgressResponse emitter, which fires with the 2xx response body
// string after each native re-POST. Returns an unsubscribe fn (no-op when unavailable). The caller
// routes each body through the EXISTING applyNativeMatchStatusBody / applier guards so the opponent
// board unfreezes WITHOUT a JS timer.
export function addMatchProgressResponseListener(
  listener: (body: string) => void,
): () => void {
  if (nativeModule == null || typeof nativeModule.addListener !== 'function') {
    return () => undefined;
  }

  try {
    const subscription = nativeModule.addListener('onMatchProgressResponse', (event) => {
      if (event && typeof (event as MatchProgressResponseEvent).body === 'string') {
        listener((event as MatchProgressResponseEvent).body);
      }
    });
    return () => {
      try {
        subscription.remove();
      } catch {
        // Best-effort teardown.
      }
    };
  } catch {
    return () => undefined;
  }
}

// OTA-SAFETY availability gate for the NEW native distance accumulator. Mirrors
// isNativePeriodicUploaderAvailable EXACTLY: true ONLY when the resolved native module actually
// exposes ALL the accumulator fns — i.e. ONLY on the next native build. On every CURRENTLY INSTALLED
// binary (Android APK + iOS TestFlight, neither of which has these fns) and on Expo Go / web / a
// platform without the module this returns false, so all the wrappers below no-op (start→false,
// get→0, seed/reset/stop→nothing) and the JS distance pipeline stays the single source of truth.
// This is what keeps the single OTA bundle safe.
export function isNativeDistanceAccumulatorAvailable(): boolean {
  if (nativeModule == null) {
    return false;
  }

  return (
    typeof nativeModule.startDistanceAccumulator === 'function'
    && typeof nativeModule.seedDistanceAccumulator === 'function'
    && typeof nativeModule.getAccumulatedDistanceMeters === 'function'
    && typeof nativeModule.resetDistanceAccumulator === 'function'
    && typeof nativeModule.stopDistanceAccumulator === 'function'
  );
}

// Begin native GPS distance accumulation with the JS filter constants so native mirrors JS. No-op
// (returns false) on any binary lacking the native fns, so callers do not need their own guard — but
// they SHOULD still gate with isNativeDistanceAccumulatorAvailable() to avoid the wrapper churn on
// old binaries. start resets the per-fix anchor so the first fix only sets the origin (no jump).
export function startDistanceAccumulator(options: DistanceAccumulatorOptions): boolean {
  if (!isNativeDistanceAccumulatorAvailable()) {
    return false;
  }

  try {
    return nativeModule?.startDistanceAccumulator?.(options) ?? false;
  } catch {
    // Best-effort: a failure to start leaves the JS distance pipeline as the only source.
    return false;
  }
}

// Set the native running total to the JS total at start so native and JS share ONE origin. The JS
// merge then takes max(jsKm, nativeKm), so seeding to the JS total guarantees the native side never
// adds a backward jump and never double-counts the distance JS already accrued. No-op when
// unavailable.
export function seedDistanceAccumulator(startMeters: number): void {
  if (!isNativeDistanceAccumulatorAvailable()) {
    return;
  }

  try {
    nativeModule?.seedDistanceAccumulator?.(startMeters);
  } catch {
    // Best-effort: a failed seed leaves the native total untouched; the merge's max() stays safe.
  }
}

// SYNCHRONOUS read of the native distance total in METERS. Returns 0 on any binary lacking the
// native fn (so max(jsKm, 0/1000) === jsKm === today's behavior) and on any throw, so the merge can
// call it unconditionally.
export function getAccumulatedDistanceMeters(): number {
  if (!isNativeDistanceAccumulatorAvailable()) {
    return 0;
  }

  try {
    const meters = nativeModule?.getAccumulatedDistanceMeters?.();
    return typeof meters === 'number' && Number.isFinite(meters) && meters > 0 ? meters : 0;
  } catch {
    return 0;
  }
}

// Reset the native total + per-fix anchor to zero (e.g. a new run start). No-op when unavailable.
export function resetDistanceAccumulator(): void {
  if (!isNativeDistanceAccumulatorAvailable()) {
    return;
  }

  try {
    nativeModule?.resetDistanceAccumulator?.();
  } catch {
    // Best-effort.
  }
}

// Stop native GPS accumulation + tear down the native location consumer (match finish / forfeit /
// context clear / unmount) so no battery is drained after the run. No-op when unavailable.
export function stopDistanceAccumulator(): void {
  if (!isNativeDistanceAccumulatorAvailable()) {
    return;
  }

  try {
    nativeModule?.stopDistanceAccumulator?.();
  } catch {
    // Best-effort teardown.
  }
}

// OTA-SAFETY availability gate for the NEW native run-save delivery. True ONLY when the resolved
// native module actually exposes both fns — i.e. ONLY on the next native build. On every currently
// installed binary this returns false, so the wrappers below no-op and the screen-off finish keeps
// today's behavior (record persisted by the JS pending-save queue, delivered on next app open).
export function isNativeRunSaveUploaderAvailable(): boolean {
  if (nativeModule == null) {
    return false;
  }

  return (
    typeof nativeModule.armRunSaveUpload === 'function'
    && typeof nativeModule.cancelRunSaveUpload === 'function'
  );
}

// 골 크로싱 순간 JS가 완성한 저장 페이로드를 네이티브 배달원에 맡긴다. 실패해도(no-op
// 포함) JS 저장 대기열이 안전망이므로 호출부는 결과에 의존하지 않는다.
export function armNativeRunSaveUpload(url: string, authToken: string, jsonBody: string): boolean {
  if (!isNativeRunSaveUploaderAvailable()) {
    return false;
  }

  try {
    nativeModule?.armRunSaveUpload?.(url, authToken, jsonBody);
    return true;
  } catch {
    return false;
  }
}

// JS 저장이 먼저 성공했거나(중복 전송 절약) 기록을 버렸을 때 네이티브 배달을 중단한다.
// 놓쳐도 무해하다 — 서버 dedupe가 이중 기록을 막는다.
export function cancelNativeRunSaveUpload(): boolean {
  if (!isNativeRunSaveUploaderAvailable()) {
    return false;
  }

  try {
    nativeModule?.cancelRunSaveUpload?.();
    return true;
  } catch {
    return false;
  }
}

// Subscribe to the native onDistanceAccumulated emitter, which fires with the running total in
// METERS after each fix advances it. Returns an unsubscribe fn (no-op when unavailable). The merge
// in VARIANT 1 reads the total synchronously via getAccumulatedDistanceMeters at flush time, so this
// listener is OPTIONAL plumbing for a future variant-2 (UI) wiring; it never drives the POST path.
export function addDistanceAccumulatedListener(
  listener: (meters: number) => void,
): () => void {
  if (nativeModule == null || typeof nativeModule.addListener !== 'function') {
    return () => undefined;
  }

  try {
    const subscription = nativeModule.addListener('onDistanceAccumulated', (event) => {
      const meters = (event as DistanceAccumulatedEvent)?.meters;
      if (typeof meters === 'number' && Number.isFinite(meters)) {
        listener(meters);
      }
    });
    return () => {
      try {
        subscription.remove();
      } catch {
        // Best-effort teardown.
      }
    };
  } catch {
    return () => undefined;
  }
}
