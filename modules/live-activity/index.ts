import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

// iOS Live Activity (lock-screen live-run card + Dynamic Island) OTA-SAFE JS FOUNDATION.
//
// This module is the JS-side bridge ONLY. The native Apple target (the Widget Extension that
// renders the ActivityKit Live Activity) is NOT shipped yet — it lands in a LATER native build.
// Until then, EVERY function here must be a safe no-op on the CURRENT production binaries (which
// have no LiveActivityModule linked), so a single OTA bundle stays safe. The availability gate
// below is what guarantees that — it mirrors modules/match-progress-uploader/index.ts EXACTLY:
// the wrappers probe the resolved native module for the real functions and no-op when absent.

// ---------------------------------------------------------------------------------------------
// TS contract shared with the (future) native target. The native Swift ActivityAttributes /
// ContentState must mirror these field-for-field.
// ---------------------------------------------------------------------------------------------

// Static, set-once attributes for the Live Activity (passed at start, never updated after).
export type LiveActivityAttributes = {
  // Present ONLY for a match run (duel/group); omitted for solo.
  matchId?: string;
  mode: 'solo' | 'duel' | 'group';
  // Present when the run has a distance goal (match always; solo only if a goal was set). When
  // absent (solo with no goal) the card shows NO progress ring — just time/distance/pace.
  goalDistanceKm?: number;
  // Display names for the rank bar (top-3 + me). Empty for solo.
  runnerNames: string[];
  // ISO start timestamp (the official/run start), for the card's own elapsed rendering.
  startedAt: string;
};

// One runner row on the match rank bar. Capped to top-3 + me by buildLiveCardState.
export type LiveActivityRunner = {
  name: string;
  // 0..1 fraction toward the goal distance, for the bar fill.
  progress0to1: number;
  isMe: boolean;
};

// Live, frequently-updated content state. Solo uses only the first block; match adds the rest.
export type LiveActivityContentState = {
  elapsedSeconds: number;
  // Distance in WHOLE METERS (int) — the native card formats km/m itself.
  distanceM: number;
  // Pre-formatted AVG pace text, e.g. '06:20/km' or '--:--/km'.
  paceText: string;
  // Wall-clock ms after which the card should DIM (not lie) if location stalls (~10s ahead).
  staleDateMs: number;

  // ---- match-only fields (undefined for solo) ----
  // My current rank within the match (1-based).
  myRank?: number;
  // Total competing runners.
  totalRunners?: number;
  // Gap to the IMMEDIATELY ADJACENT runner: '-Xm' to the one just ahead, or '+Xm' to the one
  // just behind when I lead. Empty/undefined when not computable yet.
  adjacentGapText?: string;
  // Capped top-3 + me rows for the rank bar.
  runners?: LiveActivityRunner[];
};

// ---------------------------------------------------------------------------------------------
// Native module resolution + availability gate (mirrors match-progress-uploader/index.ts).
// ---------------------------------------------------------------------------------------------

type LiveActivityNativeModule = {
  // OTA-SAFETY marker — ONLY the REAL native module (the future build that ships the Widget
  // Extension) sets this to true. The current binaries have NO LiveActivityModule linked at all,
  // so requireNativeModule throws and nativeModule stays null → unavailable.
  available?: boolean;
  // Start a Live Activity with the static attributes + initial content state. The native side
  // gates iOS 16.2+ internally; pre-16.2 simply renders nothing.
  start?(attributes: LiveActivityAttributes, state: LiveActivityContentState): void;
  // Push a fresh content state to the running activity.
  update?(state: LiveActivityContentState): void;
  // End + dismiss the running activity.
  end?(): void;
};

let nativeModule: LiveActivityNativeModule | null = null;

try {
  // Throws on every CURRENT binary (no LiveActivityModule linked) → caught → stays null →
  // every wrapper below no-ops. Only the future native build resolves a real proxy.
  nativeModule = requireNativeModule<LiveActivityNativeModule>('LiveActivityModule');
} catch {
  nativeModule = null;
}

// True ONLY on iOS when the resolved native module actually exposes the Live Activity functions
// — i.e. ONLY on the future native build. On every CURRENT binary (iOS TestFlight + Android, which
// has no apple module at all) this returns false, so all wrappers below are no-ops and the OTA
// bundle stays safe. Android is permanently false here (Live Activity is iOS-only for now).
export function isLiveActivityAvailable(): boolean {
  if (Platform.OS !== 'ios') {
    return false;
  }

  if (nativeModule == null) {
    return false;
  }

  return (
    nativeModule.available === true
    && typeof nativeModule.start === 'function'
    && typeof nativeModule.update === 'function'
    && typeof nativeModule.end === 'function'
  );
}

// Start the lock-screen / Dynamic Island card. No-op (and never throws) on any binary lacking the
// native module, so callers do not strictly need their own guard — but they SHOULD still gate with
// isLiveActivityAvailable() to skip building the view-model on old binaries.
export function startLiveActivity(
  attributes: LiveActivityAttributes,
  state: LiveActivityContentState,
): void {
  if (!isLiveActivityAvailable()) {
    return;
  }

  try {
    nativeModule?.start?.(attributes, state);
  } catch {
    // Best-effort UI affordance: a failure to start the card must never break the run.
  }
}

// Push a fresh content state to the running card. No-op when unavailable.
export function updateLiveActivity(state: LiveActivityContentState): void {
  if (!isLiveActivityAvailable()) {
    return;
  }

  try {
    nativeModule?.update?.(state);
  } catch {
    // Best-effort: a dropped update just leaves the previous (or dimmed-by-staleDate) card.
  }
}

// End + dismiss the card (run end / forfeit / unmount). No-op when unavailable.
export function endLiveActivity(): void {
  if (!isLiveActivityAvailable()) {
    return;
  }

  try {
    nativeModule?.end?.();
  } catch {
    // Best-effort teardown.
  }
}
