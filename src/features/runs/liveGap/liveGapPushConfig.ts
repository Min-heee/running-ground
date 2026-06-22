// Per-match configuration for the live opponent-gap push notifications. Lives in a
// module-level store so the waiting-room picker (writer) and the in-run scheduler
// (reader) stay in sync without threading props through the idle/runtime models.
// It survives component remounts within a session and remembers the last choice as a
// default; it intentionally resets to the default on a full app restart (no native
// persistence layer is wired for non-session prefs).

export type LiveGapInterval = 'off' | '30s' | '1m' | '3m' | '5m' | '10m';

// Relative targets (ahead1/behind1) follow my live rank; absolute targets (rank1)
// follow the leaderboard position regardless of where I sit. Legacy values
// (ahead2/rank2/rank3) remain in the union for back-compat with stored configs but are no
// longer offered in the options list / UI.
export type LiveGapGroupTarget =
  | 'ahead1'
  | 'behind1'
  | 'rank1'
  | 'ahead2'
  | 'rank2'
  | 'rank3';

// Which metrics the push reports. The first two are about me; the last two are about
// the opponent (the single opponent in a duel, or each selected group target).
export type LiveGapMetric =
  | 'remainingDistance'
  | 'avgPace'
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
  { value: '10m', label: '10분', ms: 600_000 },
];

export type LiveGapGroupTargetOption = {
  value: LiveGapGroupTarget;
  label: string;
};

export const LIVE_GAP_GROUP_TARGET_OPTIONS: readonly LiveGapGroupTargetOption[] = [
  { value: 'ahead1', label: '앞사람' },
  { value: 'behind1', label: '뒷사람' },
  { value: 'rank1', label: '1등' },
];

export type LiveGapMetricOption = {
  value: LiveGapMetric;
  label: string;
};

export const LIVE_GAP_METRIC_OPTIONS: readonly LiveGapMetricOption[] = [
  { value: 'remainingDistance', label: '남은거리' },
  { value: 'avgPace', label: '평균페이스' },
  { value: 'opponentDistance', label: '상대와 거리' },
  { value: 'opponentPace', label: '상대와 평균페이스' },
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
  // When true, this config is persisted to device storage and restored on the next app
  // launch (the "다음에도 이 설정 기억하기" checkbox). When false, the choice lives only for
  // the session and the store falls back to DEFAULT_CONFIG after a full restart.
  remember: boolean;
};

const DEFAULT_CONFIG: LiveGapPushConfig = {
  interval: 'off',
  groupTargets: ['ahead1', 'rank1'],
  metrics: ['remainingDistance', 'opponentDistance', 'opponentPace'],
  deliveryMode: 'notification',
  remember: false,
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
  // reads top-down (앞사람 → 1등) regardless of the tap sequence.
  const groupTargets = LIVE_GAP_GROUP_TARGET_OPTIONS
    .map((option) => option.value)
    .filter((value) => (value === target ? !isSelected : currentConfig.groupTargets.includes(value)));

  currentConfig = { ...currentConfig, groupTargets };
  emit();
}

export function toggleLiveGapMetric(metric: LiveGapMetric) {
  const isSelected = currentConfig.metrics.includes(metric);
  // Keep stored order aligned with the option order so the push reads top-down
  // (남은거리 → 상대와 평균페이스) regardless of the tap sequence.
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

export function setLiveGapRemember(remember: boolean) {
  if (currentConfig.remember === remember) {
    return;
  }

  currentConfig = { ...currentConfig, remember };
  emit();
}

const VALID_INTERVALS = new Set<LiveGapInterval>(LIVE_GAP_INTERVAL_OPTIONS.map((option) => option.value));
const VALID_GROUP_TARGETS = LIVE_GAP_GROUP_TARGET_OPTIONS.map((option) => option.value);
const VALID_METRICS = LIVE_GAP_METRIC_OPTIONS.map((option) => option.value);
const VALID_DELIVERY_MODES = new Set<LiveGapDeliveryMode>(
  LIVE_GAP_DELIVERY_MODE_OPTIONS.map((option) => option.value),
);

// Coerce an untrusted (persisted / possibly stale) blob into a valid config: unknown
// enum values fall back to the default, and array fields are filtered to known options in
// canonical order so a corrupt or older-schema payload can never break the store.
export function normalizeLiveGapPushConfig(raw: unknown): LiveGapPushConfig {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_CONFIG;
  }

  const candidate = raw as Record<string, unknown>;

  const interval = VALID_INTERVALS.has(candidate.interval as LiveGapInterval)
    ? (candidate.interval as LiveGapInterval)
    : DEFAULT_CONFIG.interval;

  const rawGroupTargets = Array.isArray(candidate.groupTargets) ? candidate.groupTargets : [];
  const groupTargets = VALID_GROUP_TARGETS.filter((value) => rawGroupTargets.includes(value));

  const rawMetrics = Array.isArray(candidate.metrics) ? candidate.metrics : [];
  const metrics = VALID_METRICS.filter((value) => rawMetrics.includes(value));

  const deliveryMode = VALID_DELIVERY_MODES.has(candidate.deliveryMode as LiveGapDeliveryMode)
    ? (candidate.deliveryMode as LiveGapDeliveryMode)
    : DEFAULT_CONFIG.deliveryMode;

  return {
    interval,
    groupTargets,
    metrics,
    deliveryMode,
    remember: candidate.remember === true,
  };
}

// Replace the whole config from a persisted payload (called once on app launch). Goes
// through normalize so a malformed payload degrades to defaults rather than corrupting
// the store.
export function hydrateLiveGapPushConfig(raw: unknown) {
  currentConfig = normalizeLiveGapPushConfig(raw);
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
