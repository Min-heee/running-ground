// Per-match configuration for the live opponent-gap push notifications. Lives in a
// module-level store so the waiting-room picker (writer) and the in-run scheduler
// (reader) stay in sync without threading props through the idle/runtime models.
// It survives component remounts within a session and remembers the last choice as a
// default; it intentionally resets to the default on a full app restart (no native
// persistence layer is wired for non-session prefs).

export type LiveGapInterval = 'off' | '30s' | '1m' | '3m' | '5m';

// Relative targets (ahead1/ahead2) follow my live rank; absolute targets (rank1..3)
// follow the leaderboard position regardless of where I sit.
export type LiveGapGroupTarget = 'ahead1' | 'ahead2' | 'rank1' | 'rank2' | 'rank3';

// Which metrics the push reports. The first three are about me; the last two are about
// the opponent (the single opponent in a duel, or each selected group target).
export type LiveGapMetric =
  | 'remainingDistance'
  | 'avgPace'
  | 'currentPace'
  | 'opponentDistance'
  | 'opponentPace';

// How the gap is delivered: a notification (vibration/banner), spoken voice (earphones),
// or both.
export type LiveGapDeliveryMode = 'notification' | 'voice' | 'both';

export type LiveGapIntervalOption = {
  value: LiveGapInterval;
  label: string;
  ms: number | null;
};

export const LIVE_GAP_INTERVAL_OPTIONS: readonly LiveGapIntervalOption[] = [
  { value: 'off', label: '끄기', ms: null },
  { value: '30s', label: '30초', ms: 30_000 },
  { value: '1m', label: '1분', ms: 60_000 },
  { value: '3m', label: '3분', ms: 180_000 },
  { value: '5m', label: '5분', ms: 300_000 },
];

export type LiveGapGroupTargetOption = {
  value: LiveGapGroupTarget;
  label: string;
};

export const LIVE_GAP_GROUP_TARGET_OPTIONS: readonly LiveGapGroupTargetOption[] = [
  { value: 'ahead1', label: '앞사람' },
  { value: 'ahead2', label: '앞앞사람' },
  { value: 'rank1', label: '1등' },
  { value: 'rank2', label: '2등' },
  { value: 'rank3', label: '3등' },
];

export type LiveGapMetricOption = {
  value: LiveGapMetric;
  label: string;
};

export const LIVE_GAP_METRIC_OPTIONS: readonly LiveGapMetricOption[] = [
  { value: 'remainingDistance', label: '남은거리' },
  { value: 'avgPace', label: '평균페이스' },
  { value: 'currentPace', label: '현재페이스' },
  { value: 'opponentDistance', label: '상대와 거리' },
  { value: 'opponentPace', label: '상대와 페이스' },
];

export type LiveGapDeliveryModeOption = {
  value: LiveGapDeliveryMode;
  label: string;
};

export const LIVE_GAP_DELIVERY_MODE_OPTIONS: readonly LiveGapDeliveryModeOption[] = [
  { value: 'notification', label: '알림만' },
  { value: 'voice', label: '음성만' },
  { value: 'both', label: '둘다' },
];

export function resolveLiveGapIntervalMs(interval: LiveGapInterval): number | null {
  return LIVE_GAP_INTERVAL_OPTIONS.find((option) => option.value === interval)?.ms ?? null;
}

export type LiveGapPushConfig = {
  interval: LiveGapInterval;
  groupTargets: readonly LiveGapGroupTarget[];
  // Which metrics to include in each push.
  metrics: readonly LiveGapMetric[];
  // Notification, voice (TTS — needs a native expo-speech build), or both.
  deliveryMode: LiveGapDeliveryMode;
};

const DEFAULT_CONFIG: LiveGapPushConfig = {
  interval: 'off',
  groupTargets: ['ahead1', 'rank1'],
  metrics: ['remainingDistance', 'opponentDistance', 'opponentPace'],
  deliveryMode: 'notification',
};

let currentConfig: LiveGapPushConfig = DEFAULT_CONFIG;
const listeners = new Set<() => void>();

export function getLiveGapPushConfig(): LiveGapPushConfig {
  return currentConfig;
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function setLiveGapInterval(interval: LiveGapInterval) {
  if (currentConfig.interval === interval) {
    return;
  }

  currentConfig = { ...currentConfig, interval };
  emit();
}

export function toggleLiveGapGroupTarget(target: LiveGapGroupTarget) {
  const isSelected = currentConfig.groupTargets.includes(target);
  // Keep the stored order aligned with the option order so the notification body
  // reads top-down (앞사람 → 3등) regardless of the tap sequence.
  const groupTargets = LIVE_GAP_GROUP_TARGET_OPTIONS
    .map((option) => option.value)
    .filter((value) => (value === target ? !isSelected : currentConfig.groupTargets.includes(value)));

  currentConfig = { ...currentConfig, groupTargets };
  emit();
}

export function toggleLiveGapMetric(metric: LiveGapMetric) {
  const isSelected = currentConfig.metrics.includes(metric);
  // Keep stored order aligned with the option order so the push reads top-down
  // (남은거리 → 상대와 페이스) regardless of the tap sequence.
  const metrics = LIVE_GAP_METRIC_OPTIONS
    .map((option) => option.value)
    .filter((value) => (value === metric ? !isSelected : currentConfig.metrics.includes(value)));

  currentConfig = { ...currentConfig, metrics };
  emit();
}

export function setLiveGapDeliveryMode(deliveryMode: LiveGapDeliveryMode) {
  if (currentConfig.deliveryMode === deliveryMode) {
    return;
  }

  currentConfig = { ...currentConfig, deliveryMode };
  emit();
}

export function subscribeLiveGapPushConfig(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Test-only: restore the default so each test starts from a known state.
export function resetLiveGapPushConfigForTests() {
  currentConfig = DEFAULT_CONFIG;
  listeners.clear();
}
