import { useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  buildLiveMatchPerfSummary,
  getLiveMatchPerfSamples,
  subscribeLiveMatchPerfSamples,
} from '@/components/matches/liveMatchPerfQaLog';
import { LIVE_MATCH_PERF_QA_ENABLED } from '@/components/matches/useAndroidLiveMatchPerfProbe';

type AndroidLiveMatchPerfPanelProps = {
  label: string;
};

export function AndroidLiveMatchPerfPanel({ label }: AndroidLiveMatchPerfPanelProps) {
  const samples = useSyncExternalStore(
    subscribeLiveMatchPerfSamples,
    getLiveMatchPerfSamples,
    getLiveMatchPerfSamples,
  );
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
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.4)',
    backgroundColor: 'rgba(15, 23, 42, 0.76)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  eyebrow: {
    color: '#A5B4FC',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  line: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  meta: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '700',
  },
  hint: {
    color: '#E0E7FF',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  diagnosis: {
    borderRadius: 999,
    alignSelf: 'flex-start',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: '900',
  },
  diagnosisStable: {
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
    color: '#BBF7D0',
  },
  diagnosisWatch: {
    backgroundColor: 'rgba(250, 204, 21, 0.18)',
    color: '#FEF08A',
  },
  diagnosisCritical: {
    backgroundColor: 'rgba(248, 113, 113, 0.18)',
    color: '#FECACA',
  },
});
