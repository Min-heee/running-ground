import { useEffect, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  buildLiveMatchPerfSummary,
  getLiveMatchPerfSamples,
  subscribeLiveMatchPerfSamples,
} from '@/components/matches/liveMatchPerfQaLog';
import { LIVE_MATCH_PERF_QA_ENABLED } from '@/components/matches/useAndroidLiveMatchPerfProbe';
import { useBackgroundSyncDiagnostics } from '@/features/runs/tracking/background/backgroundSyncDiagnostics';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type AndroidLiveMatchPerfPanelProps = {
  label: string;
};

function usePanelNowMs(enabled: boolean) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const ticker = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      clearInterval(ticker);
    };
  }, [enabled]);

  return nowMs;
}

function formatAgo(ms: number | null, nowMs: number) {
  if (ms === null) {
    return '없음';
  }

  const agoSeconds = Math.max(0, Math.floor((nowMs - ms) / 1000));
  return `${agoSeconds}s 전`;
}

function formatFailureReason(reason: string | null) {
  if (!reason) {
    return '';
  }

  return reason.length > 60 ? `${reason.slice(0, 57)}...` : reason;
}

function formatTaskStatus({
  attemptCount,
  failedReason,
  inFlight,
  startedAtMs,
  nowMs,
}: {
  attemptCount: number;
  failedReason: string | null;
  inFlight: boolean;
  startedAtMs: number | null;
  nowMs: number;
}) {
  const attemptLabel = `시도 ${attemptCount}회`;

  if (startedAtMs !== null) {
    return `시작 ${formatAgo(startedAtMs, nowMs)} (${attemptLabel})`;
  }

  if (inFlight) {
    return `시도중 (${attemptLabel})`;
  }

  if (failedReason) {
    return `실패 (${attemptLabel})`;
  }

  return attemptCount > 0 ? `미시작 (${attemptLabel})` : '미시작';
}

export function AndroidLiveMatchPerfPanel({ label }: AndroidLiveMatchPerfPanelProps) {
  const samples = useSyncExternalStore(
    subscribeLiveMatchPerfSamples,
    getLiveMatchPerfSamples,
    getLiveMatchPerfSamples,
  );
  const bgDiagnostics = useBackgroundSyncDiagnostics();
  const nowMs = usePanelNowMs(LIVE_MATCH_PERF_QA_ENABLED);
  const summary = buildLiveMatchPerfSummary(samples, label);

  if (!LIVE_MATCH_PERF_QA_ENABLED || !summary) {
    return null;
  }

  const visibleParticipantsLabel = typeof summary.visibleParticipants === 'number'
    ? ` · 표시 ${summary.visibleParticipants}명`
    : '';
  const diagnosisStyle = summary.diagnosis.level === 'critical'
    ? styles.diagnosisCritical
    : summary.diagnosis.level === 'watch'
      ? styles.diagnosisWatch
      : styles.diagnosisStable;
  const taskFailureReason = formatFailureReason(bgDiagnostics.taskFailedReason);
  const taskStatus = formatTaskStatus({
    attemptCount: bgDiagnostics.taskStartAttemptCount,
    failedReason: bgDiagnostics.taskFailedReason,
    inFlight: bgDiagnostics.taskStartAttemptInFlight,
    startedAtMs: bgDiagnostics.taskStartedAtMs,
    nowMs,
  });

  return (
    <View style={styles.panel} pointerEvents="none">
      <Text style={styles.eyebrow}>ANDROID QA PERF</Text>
      <Text style={styles.line}>
        FPS {summary.latestFps} / 평균 {summary.averageFps}
      </Text>
      <Text style={styles.line}>
        렌더 {summary.latestRenders}/5s / 평균 {summary.averageRenders}
      </Text>
      <Text style={styles.line}>
        변화 전체 {summary.latestProgressUpdates} · 표시 {summary.latestVisibleProgressUpdates} · 숨은 {summary.latestHiddenProgressUpdates}
      </Text>
      <Text style={styles.line}>
        정적 {summary.latestStaticRenders} · 레이아웃 {summary.latestLayoutUpdates} · 거리 {summary.latestTargetUpdates}
      </Text>
      <Text style={[styles.diagnosis, diagnosisStyle]}>
        진단 {summary.diagnosis.label}
      </Text>
      <Text style={styles.hint}>
        조치 {summary.diagnosis.hint}
      </Text>
      <Text style={styles.meta}>
        참가 {summary.participants}명{visibleParticipantsLabel} · {summary.targetDistanceKm.toFixed(1)}km · 샘플 {summary.sampleCount}
      </Text>
      <View style={styles.sectionSeparator} />
      <Text style={styles.eyebrow}>BG SYNC</Text>
      <Text style={styles.line}>
        task {taskStatus}
      </Text>
      {taskFailureReason ? (
        <Text style={styles.warningLine}>실패 {taskFailureReason}</Text>
      ) : null}
      <Text style={styles.line}>
        snapshot {formatAgo(bgDiagnostics.lastSnapshotAtMs, nowMs)}
      </Text>
      <Text style={styles.line}>
        heartbeat {formatAgo(bgDiagnostics.lastHeartbeatAtMs, nowMs)} (총 {bgDiagnostics.heartbeatAttemptCount}회)
      </Text>
      <Text style={styles.line}>
        appState {bgDiagnostics.isAppBackground ? '백그라운드' : '포그라운드'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.4)',
    backgroundColor: 'rgba(15, 23, 42, 0.76)',
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.xxl,
    gap: spacing.xxs,
  },
  eyebrow: {
    color: colors.brandTint,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.black,
    letterSpacing: 0.8,
  },
  line: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  meta: {
    color: colors.borderCool,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  hint: {
    color: colors.brandWashStrong,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    lineHeight: 15,
  },
  warningLine: {
    color: colors.warningBright,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
  },
  sectionSeparator: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.22)',
    marginVertical: spacing.xxs,
  },
  diagnosis: {
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
    overflow: 'hidden',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxs,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.black,
  },
  diagnosisStable: {
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
    color: colors.successWash,
  },
  diagnosisWatch: {
    backgroundColor: 'rgba(250, 204, 21, 0.18)',
    color: colors.warningBright,
  },
  diagnosisCritical: {
    backgroundColor: 'rgba(248, 113, 113, 0.18)',
    color: colors.dangerBorder,
  },
});
