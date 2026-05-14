import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { RunningMetricGrid } from '@/features/runs/components/RunningMetricGrid';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  hasRemoteRunnerProgress,
  resolveParticipantDisplayDistanceKm,
  type GroupLiveStanding,
} from '@/features/runs/viewModels/matchProgress';
import { type MatchExitSource } from '@/features/runs/lifecycle/matchExitFlow';
import { buildMatchParticipantStatusLabel } from '@/features/runs/lifecycle/matchStateMachine';
import type { DuelMatchOpponent } from '@/lib/api/types';
import { useDevRenderCounter } from '@/utils/useDevRenderCounter';

type MatchStatusAlert = {
  tone: 'danger' | 'warning' | 'neutral';
  title: string;
  summary: string;
};

export type LiveMatchMetricLabels = {
  elapsedLabel: string;
  distanceLabel: string;
  averagePaceLabel: string;
  currentPaceLabel: string;
  cadenceLabel: string;
  elevationLabel: string;
};

export type LiveMatchTrackingPageProps = {
  includeMatchCards: boolean;
  matchMode: RunMatchMode;
  liveMatchTitle: string;
  liveMatchText: string;
  effectiveDuelOpponent: DuelMatchOpponent | null;
  duelDistanceKm: number;
  duelLiveTitle: string;
  duelLiveSummary: string;
  duelStatusAlert: MatchStatusAlert | null;
  distanceKm: number;
  isLeavingDuelMatch: boolean;
  effectiveGroupParticipantCount: number;
  currentGroupStanding: GroupLiveStanding | null;
  groupAheadParticipant: GroupLiveStanding | null;
  groupBehindParticipant: GroupLiveStanding | null;
  groupStatusAlert: MatchStatusAlert | null;
  isLeavingGroupMatch: boolean;
  groupLiveStandings: GroupLiveStanding[];
  currentGroupLeader: GroupLiveStanding | null;
  elapsedSeconds: number;
  averagePace: string;
  currentPace: string;
  cadenceSpm: number | null;
  elevationGainM: number;
  metricLabels: LiveMatchMetricLabels;
  onContinueSoloFromMatch: (source: MatchExitSource) => void;
};

export const LiveMatchTrackingPage = memo(function LiveMatchTrackingPage({
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
  metricLabels,
  onContinueSoloFromMatch,
}: LiveMatchTrackingPageProps) {
  useDevRenderCounter(`LiveMatchTrackingPage:${matchMode}`);
  return (
    <>
      <LiveMatchCardsSection
        includeMatchCards={includeMatchCards}
        matchMode={matchMode}
        liveMatchTitle={liveMatchTitle}
        liveMatchText={liveMatchText}
        effectiveDuelOpponent={effectiveDuelOpponent}
        duelDistanceKm={duelDistanceKm}
        duelLiveTitle={duelLiveTitle}
        duelLiveSummary={duelLiveSummary}
        duelStatusAlert={duelStatusAlert}
        distanceKm={distanceKm}
        isLeavingDuelMatch={isLeavingDuelMatch}
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
      <TrackingMetricGridSection
        metricLabels={metricLabels}
      />
    </>
  );
});

const TrackingMetricGridSection = memo(function TrackingMetricGridSection({
  metricLabels,
}: {
  metricLabels: LiveMatchMetricLabels;
}) {
  return (
    <RunningMetricGrid
      elapsedLabel={metricLabels.elapsedLabel}
      distanceLabel={metricLabels.distanceLabel}
      averagePaceLabel={metricLabels.averagePaceLabel}
      currentPaceLabel={metricLabels.currentPaceLabel}
      cadenceLabel={metricLabels.cadenceLabel}
      elevationLabel={metricLabels.elevationLabel}
    />
  );
});

const LiveMatchCardsSection = memo(function LiveMatchCardsSection({
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
}: Omit<LiveMatchTrackingPageProps,
  'elapsedSeconds'
  | 'averagePace'
  | 'currentPace'
  | 'cadenceSpm'
  | 'elevationGainM'
  | 'metricLabels'
>) {
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
        <GroupTrackingSummaryCard
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
}: {
  opponent: DuelMatchOpponent;
  duelDistanceKm: number;
  duelLiveTitle: string;
  duelLiveSummary: string;
  duelStatusAlert: MatchStatusAlert | null;
  distanceKm: number;
  isLeavingDuelMatch: boolean;
  onContinueSoloFromMatch: (source: MatchExitSource) => void;
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
        <MatchStatusBanner
          alert={duelStatusAlert}
          actionLabel={isLeavingDuelMatch ? '전환 중...' : '혼자 계속 달릴게요'}
          disabled={isLeavingDuelMatch}
          onPress={handleContinueSolo}
        />
      ) : null}
    </View>
  );
});

function areGroupLiveStandingsEqual(left: GroupLiveStanding, right: GroupLiveStanding) {
  return left.id === right.id
    && left.rank === right.rank
    && left.name === right.name
    && left.isCurrentUser === right.isCurrentUser
    && left.averagePace === right.averagePace
    && left.levelLabel === right.levelLabel
    && left.seedSummary === right.seedSummary
    && left.liveStatus === right.liveStatus
    && left.currentDistanceKm === right.currentDistanceKm;
}

const GroupLiveStandingRow = memo(function GroupLiveStandingRow({
  participant,
}: {
  participant: GroupLiveStanding;
}) {
  return (
    <View
      style={[styles.groupLiveRow, participant.isCurrentUser ? styles.groupLiveRowCurrent : undefined]}
    >
      <Text style={styles.groupLiveRank}>{participant.rank}</Text>
      <View style={styles.groupLiveCopy}>
        <Text style={styles.groupLiveName}>
          {participant.name}
          {participant.isCurrentUser ? ' (나)' : ''}
        </Text>
        <Text style={styles.groupLiveMeta}>
          {participant.averagePace} · {participant.levelLabel} · {participant.seedSummary}
          {participant.liveStatus ? ` · ${buildMatchParticipantStatusLabel(participant.liveStatus)}` : ''}
        </Text>
      </View>
      <Text style={styles.groupLiveDistance}>{participant.currentDistanceKm.toFixed(2)}km</Text>
    </View>
  );
}, (prevProps, nextProps) => areGroupLiveStandingsEqual(prevProps.participant, nextProps.participant));

const CurrentGroupStandingRow = memo(function CurrentGroupStandingRow({
  participant,
}: {
  participant: GroupLiveStanding;
}) {
  return (
    <View style={[styles.groupLiveRow, styles.groupLiveRowCurrent]}>
      <Text style={styles.groupLiveRank}>{participant.rank}</Text>
      <View style={styles.groupLiveCopy}>
        <Text style={styles.groupLiveName}>{participant.name} (나)</Text>
        <Text style={styles.groupLiveMeta}>
          {participant.averagePace} · {participant.levelLabel}
          {participant.liveStatus ? ` · ${buildMatchParticipantStatusLabel(participant.liveStatus)}` : ''}
          {' · '}
          앞 사람과 {participant.gapAheadKm?.toFixed(2) ?? '0.00'}km
        </Text>
      </View>
      <Text style={styles.groupLiveDistance}>{participant.currentDistanceKm.toFixed(2)}km</Text>
    </View>
  );
}, (prevProps, nextProps) => areGroupLiveStandingsEqual(prevProps.participant, nextProps.participant)
  && prevProps.participant.gapAheadKm === nextProps.participant.gapAheadKm);

const GroupTrackingSummaryCard = memo(function GroupTrackingSummaryCard({
  effectiveGroupParticipantCount,
  currentGroupStanding,
  groupAheadParticipant,
  groupBehindParticipant,
  groupStatusAlert,
  isLeavingGroupMatch,
  groupLiveStandings,
  currentGroupLeader,
  onContinueSoloFromMatch,
}: {
  effectiveGroupParticipantCount: number;
  currentGroupStanding: GroupLiveStanding;
  groupAheadParticipant: GroupLiveStanding | null;
  groupBehindParticipant: GroupLiveStanding | null;
  groupStatusAlert: MatchStatusAlert | null;
  isLeavingGroupMatch: boolean;
  groupLiveStandings: GroupLiveStanding[];
  currentGroupLeader: GroupLiveStanding | null;
  onContinueSoloFromMatch: (source: MatchExitSource) => void;
}) {
  const topStandings = useMemo(() => groupLiveStandings.slice(0, 5), [groupLiveStandings]);
  const topStandingRows = useMemo(() => topStandings.map((participant) => (
    <GroupLiveStandingRow key={participant.id} participant={participant} />
  )), [topStandings]);
  const handleContinueSolo = useCallback(() => {
    onContinueSoloFromMatch('group');
  }, [onContinueSoloFromMatch]);
  const statusActionPress = groupStatusAlert?.tone === 'danger' ? handleContinueSolo : undefined;

  return (
    <View style={styles.groupLiveCard}>
      <View style={styles.groupLiveHeader}>
        <View style={styles.groupLiveHeaderCopy}>
          <Text style={styles.liveMatchEyebrow}>LIVE RANK</Text>
          <Text style={styles.groupLiveTitle}>
            현재 {currentGroupStanding.rank}/{effectiveGroupParticipantCount}위
          </Text>
          <Text style={styles.groupLiveSummary}>
            {currentGroupStanding.rank === 1
              ? groupBehindParticipant
                ? `${groupBehindParticipant.name}님보다 ${groupBehindParticipant.gapAheadKm?.toFixed(2) ?? '0.00'}km 앞서 있어요.`
                : '지금은 선두예요. 이 흐름을 그대로 유지해보세요.'
              : `앞 사람과 ${currentGroupStanding.gapAheadKm?.toFixed(2) ?? '0.00'}km 차이 · 1위와 ${currentGroupStanding.gapLeaderKm.toFixed(2)}km 차이`}
          </Text>
          <View style={styles.groupLiveGapRow}>
            {groupAheadParticipant ? (
              <View style={styles.groupLiveGapChip}>
                <Text style={styles.groupLiveGapEyebrow}>앞</Text>
                <Text style={styles.groupLiveGapText}>
                  {groupAheadParticipant.name} · {currentGroupStanding.gapAheadKm?.toFixed(2) ?? '0.00'}km
                </Text>
              </View>
            ) : null}
            {groupBehindParticipant ? (
              <View style={styles.groupLiveGapChip}>
                <Text style={styles.groupLiveGapEyebrow}>뒤</Text>
                <Text style={styles.groupLiveGapText}>
                  {groupBehindParticipant.name} · {groupBehindParticipant.gapAheadKm?.toFixed(2) ?? '0.00'}km
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.groupLiveBadge}>
          <Text style={styles.groupLiveBadgeText}>{effectiveGroupParticipantCount}명</Text>
        </View>
      </View>
      {groupStatusAlert ? (
        <MatchStatusBanner
          alert={groupStatusAlert}
          actionLabel={isLeavingGroupMatch ? '전환 중...' : '혼자 계속 달릴게요'}
          disabled={isLeavingGroupMatch}
          onPress={statusActionPress}
        />
      ) : null}
      <View style={styles.groupLiveTopList}>
        {topStandingRows}
      </View>
      {currentGroupStanding.rank > 5 ? (
        <CurrentGroupStandingRow participant={currentGroupStanding} />
      ) : null}
      {currentGroupLeader && currentGroupStanding.rank !== 1 ? (
        <Text style={styles.groupLiveFooter}>
          선두는 {currentGroupLeader.name}님이에요. {currentGroupLeader.currentDistanceKm.toFixed(2)}km로 앞서가고 있어요.
        </Text>
      ) : (
        <Text style={styles.groupLiveFooter}>지금은 선두예요. 다음 러너와 간격을 유지해보세요.</Text>
      )}
    </View>
  );
});

const MatchStatusBanner = memo(function MatchStatusBanner({
  alert,
  actionLabel,
  disabled,
  onPress,
}: {
  alert: MatchStatusAlert;
  actionLabel: string;
  disabled: boolean;
  onPress?: () => void;
}) {
  return (
    <View
      style={[
        styles.matchStatusBanner,
        alert.tone === 'danger'
          ? styles.matchStatusBannerDanger
          : alert.tone === 'warning'
            ? styles.matchStatusBannerWarning
            : styles.matchStatusBannerNeutral,
      ]}
    >
      <Text style={styles.matchStatusBannerTitle}>{alert.title}</Text>
      <Text style={styles.matchStatusBannerText}>{alert.summary}</Text>
      {onPress ? (
        <Pressable
          style={styles.matchStatusBannerAction}
          disabled={disabled}
          onPress={onPress}
        >
          <Text style={styles.matchStatusBannerActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  mapCard: {
    gap: 14,
    backgroundColor: '#111827',
  },
  liveMatchCard: {
    gap: 5,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#1F2937',
  },
  liveMatchEyebrow: {
    color: '#C7D2FE',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  liveMatchTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  liveMatchText: {
    color: '#D0D5DD',
    lineHeight: 20,
  },
  groupLiveCard: {
    gap: 12,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#312E81',
    backgroundColor: '#111827',
  },
  duelLiveCard: {
    gap: 12,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#0F172A',
  },
  duelLiveHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  duelLiveBadge: {
    borderRadius: 999,
    backgroundColor: '#172554',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  duelLiveBadgeText: {
    color: '#DBEAFE',
    fontSize: 11,
    fontWeight: '800',
  },
  matchStatusBanner: {
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  matchStatusBannerNeutral: {
    backgroundColor: 'rgba(148, 163, 184, 0.10)',
    borderColor: 'rgba(148, 163, 184, 0.18)',
  },
  matchStatusBannerWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.22)',
  },
  matchStatusBannerDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.22)',
  },
  matchStatusBannerTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  matchStatusBannerText: {
    color: '#D0D5DD',
    fontSize: 12,
    lineHeight: 18,
  },
  matchStatusBannerAction: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  matchStatusBannerActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  groupLiveHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  groupLiveHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  groupLiveTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  groupLiveSummary: {
    color: '#D0D5DD',
    lineHeight: 20,
  },
  groupLiveGapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  groupLiveGapChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(129, 140, 248, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.22)',
  },
  groupLiveGapEyebrow: {
    color: '#C7D2FE',
    fontSize: 10,
    fontWeight: '800',
  },
  groupLiveGapText: {
    color: '#F9FAFB',
    fontSize: 12,
    fontWeight: '800',
  },
  groupLiveBadge: {
    borderRadius: 999,
    backgroundColor: '#3730A3',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  groupLiveBadgeText: {
    color: '#EEF2FF',
    fontSize: 11,
    fontWeight: '800',
  },
  groupLiveTopList: {
    gap: 8,
  },
  groupLiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  groupLiveRowCurrent: {
    backgroundColor: 'rgba(109, 94, 247, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.45)',
  },
  groupLiveRank: {
    width: 24,
    color: '#C7D2FE',
    fontWeight: '800',
  },
  groupLiveCopy: {
    flex: 1,
    gap: 2,
  },
  groupLiveName: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  groupLiveMeta: {
    color: '#D0D5DD',
    fontSize: 12,
    lineHeight: 17,
  },
  groupLiveDistance: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  groupLiveFooter: {
    color: '#D0D5DD',
    lineHeight: 20,
  },
});
