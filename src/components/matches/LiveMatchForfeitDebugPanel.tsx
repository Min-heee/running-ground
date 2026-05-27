import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLiveMatchForfeitDiagnostics } from '@/features/runs/debug/liveMatchForfeitDiagnostics';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

const FORFEIT_DEBUG_ENABLED = process.env.EXPO_PUBLIC_ENABLE_ANDROID_MATCH_PERF === '1';
function useDebugNowMs(enabled: boolean) {
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

function formatAgo(ms: number | null | undefined, nowMs: number) {
  if (ms === null || ms === undefined) {
    return '없음';
  }

  const agoSeconds = Math.max(0, Math.floor((nowMs - ms) / 1000));
  return `${agoSeconds}s 전`;
}

function formatParticipantStatuses(
  participants: { label: string; liveStatus: string | null; resultLabel: string | null; isCurrentUser: boolean }[],
) {
  if (participants.length === 0) {
    return '없음';
  }

  return participants
    .map((participant) => {
      const label = participant.isCurrentUser ? '나' : participant.label;
      const badge = participant.resultLabel ? `/${participant.resultLabel}` : '';
      return `${label}:${participant.liveStatus ?? 'null'}${badge}`;
    })
    .join(' / ');
}

function formatPolls(pollsBySource: Record<string, number>, nowMs: number) {
  const duelLinked = `duel:linked-force=${formatAgo(pollsBySource['duel:linked-force'], nowMs)}`;
  const duelPoll = `duel:poll=${formatAgo(pollsBySource['duel:poll'], nowMs)}`;
  const groupLinked = `group:linked-force=${formatAgo(pollsBySource['group:linked-force'], nowMs)}`;
  const groupPoll = `group:poll=${formatAgo(pollsBySource['group:poll'], nowMs)}`;
  return `${duelLinked} · ${duelPoll} · ${groupLinked} · ${groupPoll}`;
}

export function LiveMatchForfeitDebugPanel() {
  const diagnostics = useLiveMatchForfeitDiagnostics();
  const nowMs = useDebugNowMs(FORFEIT_DEBUG_ENABLED);

  if (!FORFEIT_DEBUG_ENABLED) {
    return null;
  }

  return (
    <View style={styles.panel} pointerEvents="none">
      <Text style={styles.eyebrow}>FORFEIT DEBUG</Text>
      <Text style={styles.line}>
        mode {diagnostics.mode} · match {diagnostics.matchId ?? 'null'} · source {diagnostics.source}
      </Text>
      <Text style={styles.line}>
        status current {diagnostics.currentUserLiveStatus ?? 'null'} · opponent {diagnostics.opponentLiveStatus ?? 'null'}
      </Text>
      <Text style={styles.line}>
        linked {diagnostics.roomLinkedMatchId ?? 'null'} · {diagnostics.roomLinkedState ?? 'null'}
      </Text>
      <Text style={styles.debugLine}>
        status: {formatParticipantStatuses(diagnostics.statusParticipants)}
      </Text>
      <Text style={styles.debugLine}>
        room: {formatParticipantStatuses(diagnostics.roomParticipants)}
      </Text>
      <Text style={styles.debugLine}>
        placeholder: {formatParticipantStatuses(diagnostics.placeholderParticipants)}
      </Text>
      <Text style={styles.debugLine}>
        arena: {formatParticipantStatuses(diagnostics.arenaParticipants)}
      </Text>
      <Text style={styles.debugLine}>
        poll: {formatPolls(diagnostics.pollsBySource, nowMs)}
      </Text>
      <Text style={styles.meta}>
        latest poll {formatAgo(diagnostics.pollAtMs, nowMs)} {diagnostics.pollSource ? `(${diagnostics.pollSource})` : ''}
        {' · snapshot '}
        {formatAgo(diagnostics.updatedAtMs, nowMs)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(251, 113, 133, 0.45)',
    backgroundColor: 'rgba(69, 10, 10, 0.76)',
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.xxl,
    gap: spacing.xxs,
  },
  eyebrow: {
    color: colors.dangerBorder,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.black,
    letterSpacing: 0.8,
  },
  line: {
    color: colors.white,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
  },
  debugLine: {
    color: colors.borderCool,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.bold,
  },
  meta: {
    color: colors.brandWashStrong,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.bold,
  },
});
