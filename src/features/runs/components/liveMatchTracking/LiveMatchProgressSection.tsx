import { memo } from 'react';
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
}: Pick<
  LiveMatchProgressSectionProps,
  | 'duelDistanceKm'
  | 'duelLiveTitle'
  | 'duelLiveSummary'
  | 'duelStatusAlert'
  | 'distanceKm'
> & {
  opponent: DuelMatchOpponent;
}) {
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
  effectiveGroupParticipantCount,
  currentGroupStanding,
  groupAheadParticipant,
  groupBehindParticipant,
  groupStatusAlert,
  groupLiveStandings,
  currentGroupLeader,
}: LiveMatchProgressSectionProps) {
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
        />
      ) : null}
      {matchMode === 'group' && effectiveGroupParticipantCount > 0 && currentGroupStanding ? (
        <LiveMatchRankingSection
          effectiveGroupParticipantCount={effectiveGroupParticipantCount}
          currentGroupStanding={currentGroupStanding}
          groupAheadParticipant={groupAheadParticipant}
          groupBehindParticipant={groupBehindParticipant}
          groupStatusAlert={groupStatusAlert}
          groupLiveStandings={groupLiveStandings}
          currentGroupLeader={currentGroupLeader}
        />
      ) : null}
    </Card>
  );
});
