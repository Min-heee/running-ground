import { Alert, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  isBatteryOptimizationControlAvailable,
  isIgnoringBatteryOptimizations,
  requestIgnoreBatteryOptimizations,
} from '../../../../../modules/match-progress-uploader';

// ONE-TIME battery-optimization nudge for Android live-match runs.
//
// On Android the screen-off ~3s periodic upload is throttled by Doze / app-standby unless the app is
// exempt from battery optimization. When a live-match run begins we offer a single, non-blocking
// prompt to open the OS settings so screen-off match recording does not freeze. It must:
//   - fire at most once ever (persist a flag so we never nag twice),
//   - NEVER block the run (the run proceeds regardless of the user's choice or any failure),
//   - be a complete no-op on iOS and on old binaries (availability flag false), so a single OTA
//     bundle is safe and only the new native build that exposes the battery fns ever prompts.
const BATTERY_OPT_NUDGE_STORAGE_KEY = 'rg.batteryOptNudge.v1';

async function hasShownBatteryOptNudge(): Promise<boolean> {
  try {
    if (!(await SecureStore.isAvailableAsync())) {
      // If we cannot read persistence we must NOT risk nagging repeatedly — treat as already shown.
      return true;
    }

    return (await SecureStore.getItemAsync(BATTERY_OPT_NUDGE_STORAGE_KEY)) != null;
  } catch {
    // Best-effort: on any read failure assume already shown so we never nag in a loop.
    return true;
  }
}

async function markBatteryOptNudgeShown(): Promise<void> {
  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.setItemAsync(BATTERY_OPT_NUDGE_STORAGE_KEY, '1');
    }
  } catch {
    // Ignore persistence failures — worst case the nudge could show once more on a later run.
  }
}

// Show the one-time Android battery-optimization nudge when a live-match run starts, if and only if
// the native control is available AND the app is not already exempt AND we have not shown it before.
// Always resolves (never throws); the caller fires this without awaiting so the run never waits on it.
export async function maybeShowBatteryOptimizationNudge(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  // Old binaries / iOS report unavailable → skip entirely (no false battery nag).
  if (!isBatteryOptimizationControlAvailable()) {
    return;
  }

  // Already exempt → nothing to ask. (Old binaries also return true here, but the availability
  // gate above already short-circuited them.)
  if (isIgnoringBatteryOptimizations()) {
    return;
  }

  if (await hasShownBatteryOptNudge()) {
    return;
  }

  // Persist BEFORE showing so a race (e.g. a second run starting) can never double-prompt.
  await markBatteryOptNudgeShown();

  Alert.alert(
    '백그라운드 측정 안정화',
    '화면을 꺼도 대결 기록이 멈추지 않으려면 배터리 최적화를 꺼주세요. (삼성: 설정 → 배터리 → 제한 없음)',
    [
      {
        text: '설정 열기',
        onPress: () => {
          requestIgnoreBatteryOptimizations();
        },
      },
      { text: '나중에' },
    ],
  );
}
