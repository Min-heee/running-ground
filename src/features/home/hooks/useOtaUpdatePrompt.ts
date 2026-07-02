import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';
import { hasAnyLiveMatchMarkedMounted } from '@/features/runs/lifecycle/liveMatchMountedRegistry';
import { getLastActiveRoomCheck } from '@/features/runs/sync/activeRoomCheckRequestRegistry';
import type { ActiveRoomCheckSource } from '@/features/runs/sync/activeRoomCheckTypes';
import { getBackgroundRunTrackingSnapshot, subscribeBackgroundRunTracking } from '@/features/runs/tracking/background';
import { isRoomCheckSignalActive, shouldOfferOtaUpdate, shouldRunOtaUpdateCheck } from '@/features/home/utils/otaUpdatePrompt';

// OTA update adoption prompt (P1-5). Today a published OTA fix only applies after
// TWO cold starts (fallbackToCacheTimeout 0 + default background check). This hook
// checks for an update on foreground (throttled to once per 15 minutes), fetches it,
// and offers a non-blocking "지금 적용" reload — but ONLY while no run/match could
// be active. A missed prompt is fine; a mid-run reload is a catastrophe.
//
// Active-run signal (both must be clear):
//   1. background tracking snapshot store status !== 'idle' — the module-level
//      source of truth the GPS pipeline writes ('running'/'paused' for solo runs,
//      party runs, duels, groups, including warmup) and that only the finish/
//      forfeit/cleanup flows reset to 'idle'. It survives tab navigation, so
//      being on the HOME tab while a run tracks in background still gates.
//   2. liveMatchMountedRegistry — a duel/group match screen is mounted (covers
//      the countdown/arming phase before tracking starts).
// Any error while reading the signals counts as "active" (fail closed).

// Module-level so a HOME tab remount does not reset the 15-minute throttle.
let lastOtaCheckAtMs: number | null = null;

// Test-only escape hatch for the module-level throttle state.
export function resetOtaUpdatePromptThrottleForTest() {
  lastOtaCheckAtMs = null;
}

const ROOM_CHECK_SOURCES: readonly ActiveRoomCheckSource[] = ['track-run experience', 'match-room snapshot'];

// Third signal (adversarial-review hardening): a FRESH cached /rooms/my payload that
// shows the user in a party room. Closes the arming blind window — a guest idling on
// HOME when the host presses start briefly has no mounted arena and no GPS yet, but
// the room caches (polled ~1.5-2s while in a room) already know the room.
function hasFreshActiveRoomSignal(nowMs: number): boolean {
  for (const source of ROOM_CHECK_SOURCES) {
    const lastCheck = getLastActiveRoomCheck(source);
    if (
      lastCheck
      && isRoomCheckSignalActive({
        roomId: lastCheck.payload?.room?.roomId,
        completedAtMs: lastCheck.completedAtMs,
        nowMs,
      })
    ) {
      return true;
    }
  }
  return false;
}

function isRunPossiblyActive(): boolean {
  try {
    if (getBackgroundRunTrackingSnapshot({ cloneRoute: false }).status !== 'idle') {
      return true;
    }
    if (hasAnyLiveMatchMarkedMounted()) {
      return true;
    }
    return hasFreshActiveRoomSignal(Date.now());
  } catch {
    // If the signal itself cannot be read, assume the worst and suppress.
    return true;
  }
}

export function useOtaUpdatePrompt() {
  const [hasUpdateReady, setHasUpdateReady] = useState(false);
  const [isRunActive, setIsRunActive] = useState(() => isRunPossiblyActive());

  // Track the active-run signal reactively: the tracking snapshot store emits on
  // every start/pause/finish (and on GPS frames while running), which also gives
  // us fresh moments to re-read the live-match registry.
  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | null = null;

    try {
      unsubscribe = subscribeBackgroundRunTracking(() => {
        if (!disposed) {
          setIsRunActive(isRunPossiblyActive());
        }
      }, { cloneRoute: false });
    } catch {
      // Tracking store unavailable — stay on the fail-closed initial value.
    }

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  const runUpdateCheck = useCallback(async () => {
    const runActiveNow = isRunPossiblyActive();
    setIsRunActive(runActiveNow);

    let updatesEnabled = false;
    try {
      updatesEnabled = Updates.isEnabled;
    } catch {
      return;
    }

    if (!shouldRunOtaUpdateCheck({
      isDev: __DEV__,
      isUpdatesEnabled: updatesEnabled,
      isRunActive: runActiveNow,
      nowMs: Date.now(),
      lastCheckAtMs: lastOtaCheckAtMs,
    })) {
      return;
    }

    lastOtaCheckAtMs = Date.now();

    try {
      const checkResult = await Updates.checkForUpdateAsync();
      if (!checkResult.isAvailable) {
        return;
      }
      await Updates.fetchUpdateAsync();
      setHasUpdateReady(true);
    } catch {
      // Update checks must never crash or block the app — swallow everything
      // (offline, dev client without EAS, server hiccup) and try again later.
    }
  }, []);

  useEffect(() => {
    if (__DEV__) {
      // expo-updates throws in dev — skip the whole mechanism.
      return;
    }

    // The app is already foregrounded when HOME first mounts, so run one
    // (throttled) check immediately instead of waiting for the next transition.
    void runUpdateCheck();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void runUpdateCheck();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [runUpdateCheck]);

  const applyUpdate = useCallback(() => {
    // Re-verify the guard at press time: the banner having been visible is not,
    // by itself, permission to reload.
    if (!shouldOfferOtaUpdate({ hasUpdateReady: true, isRunActive: isRunPossiblyActive(), isDev: __DEV__ })) {
      setIsRunActive(true);
      return;
    }

    Updates.reloadAsync().catch(() => {
      // Reload failure is non-fatal — the update still applies on next cold start.
    });
  }, []);

  return {
    showUpdatePrompt: shouldOfferOtaUpdate({ hasUpdateReady, isRunActive, isDev: __DEV__ }),
    applyUpdate,
  };
}
