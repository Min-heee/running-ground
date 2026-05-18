import { memo, useCallback, useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { LiveMatchActionSection } from '@/features/runs/components/liveMatchTracking/LiveMatchActionSection';
import { LiveMatchRankingSection } from '@/features/runs/components/liveMatchTracking/LiveMatchRankingSection';
import { liveMatchTrackingStyles as styles } from '@/features/runs/components/liveMatchTracking/styles';
import type { LiveMatchProgressSectionProps } from '@/features/runs/components/liveMatchTracking/types';
import {
  hasRemoteRunnerProgress,
  resolveParticipantDisplayDistanceKm,
} from '@/features/runs/viewModels/matchProgress';
import type { DuelMatchOpponent } from '@/lib/api/types';
import {
  createMatchArenaDiagnosticsThrottle,
  reportComponentMountDiagnostics,
} from '@/utils/matchArenaDiagnostics';

const LiveMatchIntroCard = memo(function LiveMatchIntroCard({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <View style={styles.liveMatchCard}>
      <Text style={styles.liveMatchEyebrow}>MATCH MODE</Text>
      <Text style={styles.liveMatchTitle}>{title}</Text>
      <Text style={styles.liveMatchText}>{text}</Text>
    </View>
  );
});

const DuelTrackingHeader = memo(function DuelTrackingHeader({
  title,
  summary,
}: {
  title: string;
  summary: string;
}) {
  return (
    <View style={styles.duelLiveHeader}>
      <View style={styles.groupLiveHeaderCopy}>
        <Text style={styles.liveMatchEyebrow}>LIVE GAP</Text>
        <Text style={styles.groupLiveTitle}>{title}</Text>
        <Text style={styles.groupLiveSummary}>{summary}</Text>
      </View>
      <View style={styles.duelLiveBadge}>
        <Text style={styles.duelLiveBadgeText}>1대1</Text>
      </View>
    </View>
  );
});

const DuelDistanceGapRow = memo(function DuelDistanceGapRow({
  opponent,
  duelDistanceKm,
  distanceKm,
}: {
  opponent: DuelMatchOpponent;
  duelDistanceKm: number;
  distanceKm: number;
}) {
  const opponentDistanceLabel = hasRemoteRunnerProgress(opponent)
    ? `${resolveParticipantDisplayDistanceKm(opponent, duelDistanceKm).toFixed(2)}km`
    : '동기화 중';

  return (
    <View style={styles.groupLiveGapRow}>
      <View style={styles.groupLiveGapChip}>
        <Text style={styles.groupLiveGapEyebrow}>나</Text>
        <Text style={styles.groupLiveGapText}>{distanceKm.toFixed(2)}km</Text>
      </View>
      <View style={styles.groupLiveGapChip}>
        <Text style={styles.groupLiveGapEyebrow}>상대</Text>
        <Text style={styles.groupLiveGapText}>{opponentDistanceLabel}</Text>
      </View>
    </View>
  );
});

const DuelTrackingSummaryCard = memo(function DuelTrackingSummaryCard({
  opponent,
  duelDistanceKm,
  duelLiveTitle,
  duelLiveSummary,
  duelStatusAlert,
  distanceKm,
  isLeavingDuelMatch,
  onContinueSoloFromMatch,
}: Pick<
  LiveMatchProgressSectionProps,
  | 'duelDistanceKm'
  | 'duelLiveTitle'
  | 'duelLiveSummary'
  | 'duelStatusAlert'
  | 'distanceKm'
  | 'isLeavingDuelMatch'
  | 'onContinueSoloFromMatch'
> & {
  opponent: DuelMatchOpponent;
}) {
  const handleContinueSolo = useCallback(() => {
    onContinueSoloFromMatch('duel');
  }, [onContinueSoloFromMatch]);

  return (
    <View style={styles.duelLiveCard}>
      <DuelTrackingHeader title={duelLiveTitle} summary={duelLiveSummary} />
      <DuelDistanceGapRow
        opponent={opponent}
        duelDistanceKm={duelDistanceKm}
        distanceKm={distanceKm}
      />
      {duelStatusAlert ? (
        <LiveMatchActionSection
          alert={duelStatusAlert}
          actionLabel={isLeavingDuelMatch ? '전환 중...' : '혼자 계속 달릴게요'}
          disabled={isLeavingDuelMatch}
          onPress={handleContinueSolo}
        />
      ) : null}
    </View>
  );
});

export const LiveMatchProgressSection = memo(function LiveMatchProgressSection({
  includeMatchCards,
  matchMode,
  liveMatchTitle,
  liveMatchText,
  effectiveDuelOpponent,
  duelDistanceKm,
  duelLiveTitle,
  duelLiveSummary,
  duelStatusAlert,
  distanceKm,
  isLeavingDuelMatch,
  effectiveGroupParticipantCount,
  currentGroupStanding,
  groupAheadParticipant,
  groupBehindParticipant,
  groupStatusAlert,
  isLeavingGroupMatch,
  groupLiveStandings,
  currentGroupLeader,
  onContinueSoloFromMatch,
}: LiveMatchProgressSectionProps) {
  const diagnosticsInstanceIdRef = useRef(`progress-section-${Math.random().toString(36).slice(2, 8)}`);
  const diagnosticsThrottleRef = useRef(createMatchArenaDiagnosticsThrottle());
  const hasReportedDiagnosticsMountRef = useRef(false);
  const hasEffectiveDuelOpponent = effectiveDuelOpponent !== null;
  const hasDuelStatusAlert = duelStatusAlert !== null;
  const hasCurrentGroupStanding = currentGroupStanding !== null;
  const hasGroupStatusAlert = groupStatusAlert !== null;
  const hasCurrentGroupLeader = currentGroupLeader !== null;
  const groupLiveStandingsCount = groupLiveStandings.length;

  useEffect(() => {
    const mountPhase = hasReportedDiagnosticsMountRef.current ? 'update' : 'mount';
    hasReportedDiagnosticsMountRef.current = true;
    reportComponentMountDiagnostics({
      componentName: 'LiveMatchProgressSection',
      instanceId: diagnosticsInstanceIdRef.current,
      mountPhase,
      payload: {
        includeMatchCards,
        matchMode,
        liveMatchTitle,
        liveMatchText,
        hasEffectiveDuelOpponent,
        duelDistanceKm,
        duelLiveTitle,
        hasDuelStatusAlert,
        distanceKm,
        effectiveGroupParticipantCount,
        hasCurrentGroupStanding,
        hasGroupStatusAlert,
        groupLiveStandingsCount,
        hasCurrentGroupLeader,
      },
    }, diagnosticsThrottleRef.current);
  }, [
    distanceKm,
    duelDistanceKm,
    duelLiveTitle,
    effectiveGroupParticipantCount,
    hasCurrentGroupLeader,
    groupLiveStandingsCount,
    hasCurrentGroupStanding,
    hasDuelStatusAlert,
    hasEffectiveDuelOpponent,
    hasGroupStatusAlert,
    includeMatchCards,
    liveMatchText,
    liveMatchTitle,
    matchMode,
  ]);

  if (!includeMatchCards || matchMode === 'solo') {
    return null;
  }

  return (
    <Card style={styles.mapCard}>
      <LiveMatchIntroCard title={liveMatchTitle} text={liveMatchText} />
      {matchMode === 'duel' && effectiveDuelOpponent ? (
        <DuelTrackingSummaryCard
          opponent={effectiveDuelOpponent}
          duelDistanceKm={duelDistanceKm}
          duelLiveTitle={duelLiveTitle}
          duelLiveSummary={duelLiveSummary}
          duelStatusAlert={duelStatusAlert}
          distanceKm={distanceKm}
          isLeavingDuelMatch={isLeavingDuelMatch}
          onContinueSoloFromMatch={onContinueSoloFromMatch}
        />
      ) : null}
      {matchMode === 'group' && effectiveGroupParticipantCount > 0 && currentGroupStanding ? (
        <LiveMatchRankingSection
          effectiveGroupParticipantCount={effectiveGroupParticipantCount}
          currentGroupStanding={currentGroupStanding}
          groupAheadParticipant={groupAheadParticipant}
          groupBehindParticipant={groupBehindParticipant}
          groupStatusAlert={groupStatusAlert}
          isLeavingGroupMatch={isLeavingGroupMatch}
          groupLiveStandings={groupLiveStandings}
          currentGroupLeader={currentGroupLeader}
          onContinueSoloFromMatch={onContinueSoloFromMatch}
        />
      ) : null}
    </Card>
  );
});
