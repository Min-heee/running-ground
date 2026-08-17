import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import {
  flushBackgroundMatchProgressSync,
} from '@/features/runs/tracking/background/backgroundMatchProgressSync';
import { setGapRuleBinarySupport } from '@/features/runs/tracking/background/distanceAccumulatorController';
import { resolveNativeGapRuleBinary } from '@/features/runs/tracking/background/nativeGapRuleSupport';
import { appendTrackedLocation } from '@/features/runs/tracking/background/routeAccumulator';
import { reconcileScreenOffGapFromBatch } from '@/features/runs/tracking/background/screenOffGapReconcile';
import {
  BACKGROUND_RUN_TASK_NAME,
  LEGACY_BACKGROUND_RUN_TASK_NAME,
} from '@/features/runs/tracking/background/locationTaskNames';

export {
  BACKGROUND_RUN_TASK_NAME,
  LEGACY_BACKGROUND_RUN_TASK_NAME,
} from '@/features/runs/tracking/background/locationTaskNames';

export function buildLocationTaskOptions(): Location.LocationTaskOptions {
  const isIOS = Platform.OS === 'ios';

  return {
    accuracy: Location.Accuracy.BestForNavigation,
    // CROSS-DEVICE SAMPLING PARITY — the bg-task GPS options are now PLATFORM-IDENTICAL, leveling
    // Android UP to iOS's fix density so both devices integrate the same route from the same-shaped
    // input. Before this, Android was capped at timeInterval 2000ms AND >=4m displacement while iOS
    // streamed every raw fix (~1 Hz), so Android chord-cut curves and read systematically SHORTER
    // than iOS on the same route.
    //
    // timeInterval: iOS has NO such option (expo-location's iOS LocationOptions only reads
    // accuracy/distanceInterval — the field is dead there) and streams ~1 Hz natively with
    // distanceInterval 0. Android DOES honor it as a hard interval floor, so 1000ms makes Android
    // match iOS's ~1 Hz delivery instead of the old 0.5 Hz.
    timeInterval: 1000,
    // distanceInterval 0 on BOTH ("deliver every fix, do not gate on displacement"): the old
    // Android-only 4m pre-gate suppressed fixes on slow/tight turns (net displacement <4m while the
    // path is longer), which is exactly the chord-cutting that shortened Android distances. The
    // shared JS filter chain — not the OS displacement gate — decides what counts as movement.
    //
    // Perf note for the raised Android fix rate: the 2026-07 JS-thread saturation issues (#195/#201)
    // were RENDER-driven, not filter-driven. The shared MIN_LOCATION_TIME_DELTA_MS (900ms) gate sits
    // at the top of the chain and drops surplus fixes before the expensive stages; surviving fixes
    // pay bounded per-fix work (route append + pace window + a counted-fix elevation pass) — the
    // same cost profile iOS has shipped at this exact 1Hz/0m config since Fix A.4.
    distanceInterval: 0,
    // iOS deferred-updates: keep them OFF so iOS does not batch/withhold fixes in the background
    // (batched delivery is what lets the screen-off flush go stale). A 0 distance/interval means
    // "deliver each fix immediately" rather than deferring.
    ...(isIOS
      ? {
          deferredUpdatesInterval: 0,
          deferredUpdatesDistance: 0,
        }
      : {}),
    // false, and load-bearing for the silent-retry contract: the manager core re-attempts this
    // start on a bounded backoff, and a retry must never surface a system dialog. expo-location
    // 19.0.8 ignores this option in startLocationUpdatesAsync on both platforms (the settings
    // dialog exists only in watchPosition/getCurrentPosition), so this is inert today — false
    // keeps it inert if a future SDK starts honoring it here.
    mayShowUserSettingsDialog: false,
    // activityType fitness already biases iOS toward frequent pedestrian fixes.
    activityType: Location.ActivityType.Fitness,
    // pausesUpdatesAutomatically=false so iOS never auto-pauses background updates mid-run.
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    ...(Platform.OS === 'android'
      ? {
          foregroundService: {
            notificationTitle: 'RunningGround가 러닝을 측정 중이에요',
            notificationBody: '백그라운드에서도 거리와 경로를 계속 기록하고 있어요.',
          },
        }
      : {}),
  };
}

function defineBackgroundRunTask(taskName: string) {
  if (TaskManager.isTaskDefined(taskName)) {
    return;
  }

  TaskManager.defineTask(taskName, async ({ data, error }) => {
    if (error || !data) {
      return;
    }

    const locations = Array.isArray((data as { locations?: Location.LocationObject[] }).locations)
      ? (data as { locations?: Location.LocationObject[] }).locations ?? []
      : [];

    // 깨어난 뒤 첫 묶음이면 화면꺼짐 갭 정산을 확정한다 — 묶음 처리 **전에**. 타임스탬프가
    // 재생 여부를 가르고, 정산이 이관하는 크레딧은 깨어나는 순간의 포획본에서 오므로 이
    // 묶음이 더할 거리와 겹치지 않는다. 먼저 정산해야 이 묶음의 커밋들부터 되찾은 총거리를
    // 싣고 나간다.
    reconcileScreenOffGapFromBatch(
      locations
        .map((location) => location.timestamp)
        .filter((timestamp): timestamp is number => typeof timestamp === 'number' && Number.isFinite(timestamp)),
    );
    locations.forEach(appendTrackedLocation);
    // Fix A.3 — fire-and-forget. Do NOT await the flush: a stuck/hung background push must never
    // wedge the native location-task callback (which is what keeps the GPS route buffer + distance
    // accumulating). The flush has its own single-flight + stale-reclaim + per-request timeout, so
    // it self-heals. Swallow errors here so a rejected push can never surface as an unhandled
    // rejection out of the task callback.
    void flushBackgroundMatchProgressSync({ platform: Platform.OS }).catch(() => false);
  });
}

if (Platform.OS !== 'web') {
  defineBackgroundRunTask(BACKGROUND_RUN_TASK_NAME);
  defineBackgroundRunTask(LEGACY_BACKGROUND_RUN_TASK_NAME);

  // 이 바이너리의 네이티브 누적기가 신호 끊김 갭 규칙을 강제하는지 — 앱 시작에 한 번
  // 래치한다. 판별은 **설치된 바이너리**의 빌드 번호(Constants.nativeBuildVersion)로 한다:
  // OTA 번들의 app.json은 구버전 기기에서도 최신 숫자를 말하므로 증거가 못 된다. 이 파일이
  // 래치를 놓는 이유는 단순하다 — 여기는 앱이 살아나는 가장 이른 길목이면서 react-native를
  // 이미 알고, 판별을 소비하는 컨트롤러는 노드 테스트 때문에 react-native를 모르는 채로
  // 남아야 한다.
  setGapRuleBinarySupport(resolveNativeGapRuleBinary(Platform.OS, Constants.nativeBuildVersion));
}
