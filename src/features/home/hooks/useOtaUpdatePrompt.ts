import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';
import { hasAnyLiveMatchMarkedMounted } from '@/features/runs/lifecycle/liveMatchMountedRegistry';
import { getLastActiveRoomCheck } from '@/features/runs/sync/activeRoomCheckRequestRegistry';
import type { ActiveRoomCheckSource } from '@/features/runs/sync/activeRoomCheckTypes';
import { getBackgroundRunTrackingSnapshot, subscribeBackgroundRunTracking } from '@/features/runs/tracking/background';
import { isRoomCheckSignalActive, shouldAutoApplyOtaUpdate, shouldOfferOtaUpdate, shouldRunOtaUpdateCheck } from '@/features/home/utils/otaUpdatePrompt';

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

// Module-level so a HOME tab remount does not reset the throttle.
let lastOtaCheckAtMs: number | null = null;

// 자동 적용 (오너 2026-08-13): 런치 창 판정용 앱 시작 시각 + 세션당 1회 플래그
// (reload 실패 시 재시도 루프 차단 — 성공하면 새 세션이라 자연히 리셋).
const appStartedAtMs = Date.now();
let otaAutoAppliedThisSession = false;

// Defer the first (launch) OTA check off the cold-start critical path. The bundle
// download and check compete for the JS thread / network right when HOME first
// paints, so we wait out the first-touch window before sampling. Cleared on unmount.
const LAUNCH_OTA_CHECK_DELAY_MS = 13_000;

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

// Exported for reuse by other reload-triggering actions (e.g. the theme toggle):
// the same "never reload while a run/match could be live" rule applies to ANY
// Updates.reloadAsync caller, not just the OTA prompt.
export function isRunPossiblyActive(): boolean {
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
  // 자동 적용은 홈 탭이 포커스일 때만 (적대 검증 2026-08-13): freezeOnBlur는 타이머를 멈추지
  // 않아서, 런치 창 안에 다른 화면(폼 작성 등)으로 이동한 유저의 화면을 리셋할 수 있었다.
  // 홈 밖이면 카드로 강등 — 홈에 돌아오면 카드가 보인다.
  const isHomeFocusedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      isHomeFocusedRef.current = true;
      return () => {
        isHomeFocusedRef.current = false;
      };
    }, []),
  );

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

      // 자동 적용 (오너 2026-08-13): 앱을 켠 직후(런치 창 안)에 받은 업데이트는 묻지 않고
      // 바로 reload — "강제종료 두 번" 제거. 다운로드에 걸린 시간 동안 러닝이 시작됐을 수
      // 있으므로 fetch 후 신호를 다시 읽는다. 창 밖(사용 중)·러닝 중이면 기존 카드로 강등.
      if (isHomeFocusedRef.current && shouldAutoApplyOtaUpdate({
        isDev: __DEV__,
        isRunActive: isRunPossiblyActive(),
        hasUpdateReady: true,
        appAgeMs: Date.now() - appStartedAtMs,
        autoAppliedThisSession: otaAutoAppliedThisSession,
      })) {
        otaAutoAppliedThisSession = true;
        try {
          await Updates.reloadAsync();
          return;
        } catch {
          // reload 실패는 비치명 — 아래 카드 경로로 강등되고 다음 콜드 스타트에 적용된다.
        }
      }

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

    // The app is already foregrounded when HOME first mounts, but the launch check
    // is deferred off the cold-start critical path so the bundle download does not
    // compete for the JS thread / network during the first-touch window. A later
    // foreground transition still checks immediately.
    const launchCheckTimeout = setTimeout(() => {
      void runUpdateCheck();
    }, LAUNCH_OTA_CHECK_DELAY_MS);

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void runUpdateCheck();
      }
    });

    return () => {
      clearTimeout(launchCheckTimeout);
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
