import { Alert, Platform } from 'react-native';
import {
  isBatteryOptimizationControlAvailable,
  isIgnoringBatteryOptimizations,
  requestIgnoreBatteryOptimizations,
} from '../../../../../modules/match-progress-uploader';

// Battery-optimization warning for Android live-match runs.
//
// On Android the screen-off ~3s periodic upload is throttled by Doze / app-standby unless the app is
// exempt from battery optimization. When a live-match run begins we warn and offer the OS settings so
// screen-off match recording does not freeze. It must:
//   - NEVER block the run (the run proceeds regardless of the user's choice or any failure),
//   - be a complete no-op on iOS and on old binaries (availability flag false), so a single OTA
//     bundle is safe and only the new native build that exposes the battery fns ever prompts.
//
// 2026-08-23 실전 사고: 이 경고는 원래 평생 한 번이었다. 민병희의 갤럭시는 한 번 보고
// '나중에'를 눌렀고, 그 뒤로는 영영 조용했다 — 화면을 끄자 One UI가 앱을 죽여 0.26km에서
// 기록이 죽었다. 면제될 때까지는 매 매치 시작마다 다시 경고한다: 대결 기록이 통째로 죽는
// 것보다 반복 경고가 낫다. 스로틀은 자동 시작 퍼널과 수동 시작이 같은 매치에서 겹칠 때의
// 이중 알림만 막는다.
const NUDGE_REPEAT_THROTTLE_MS = 10 * 60 * 1000;

let lastShownAtMs = 0;

// Show the Android battery-optimization warning when a live-match run starts, if and only if the
// native control is available AND the app is not already exempt. Repeats on every match run until
// the exemption is granted (throttled so overlapping start funnels cannot double-prompt).
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

  if (Date.now() - lastShownAtMs < NUDGE_REPEAT_THROTTLE_MS) {
    return;
  }
  lastShownAtMs = Date.now();

  Alert.alert(
    '화면을 끄면 기록이 죽을 수 있어요',
    '배터리 최적화가 켜져 있으면 화면을 끄는 순간 시스템이 측정을 멈출 수 있어요. 이번 대결 기록을 지키려면 지금 꺼주세요. (삼성: 설정 → 배터리 → 제한 없음)',
    [
      {
        text: '설정 열기',
        onPress: () => {
          requestIgnoreBatteryOptimizations();
        },
      },
      { text: '이번엔 그냥 뛰기' },
    ],
  );
}
