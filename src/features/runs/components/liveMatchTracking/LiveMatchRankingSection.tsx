import { memo, useMemo } from 'react';
import { Text, View } from 'react-native';
import { LiveMatchActionSection } from '@/features/runs/components/liveMatchTracking/LiveMatchActionSection';
import { liveMatchTrackingStyles as styles } from '@/features/runs/components/liveMatchTracking/styles';
import type { MatchStatusAlert } from '@/features/runs/components/liveMatchTracking/types';
import { buildMatchParticipantStatusLabel } from '@/features/runs/lifecycle/matchStateMachine';
import type { GroupLiveStanding } from '@/features/runs/viewModels/matchProgress';

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
  const rowStyle = useMemo(
    () => [styles.groupLiveRow, participant.isCurrentUser ? styles.groupLiveRowCurrent : undefined],
    [participant.isCurrentUser],
  );

  return (
    <View style={rowStyle}>
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
  const rowStyle = useMemo(
    () => [styles.groupLiveRow, styles.groupLiveRowCurrent],
    [],
  );

  return (
    <View style={rowStyle}>
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

export const LiveMatchRankingSection = memo(function LiveMatchRankingSection({
  effectiveGroupParticipantCount,
  currentGroupStanding,
  groupAheadParticipant,
  groupBehindParticipant,
  groupStatusAlert,
  groupLiveStandings,
  currentGroupLeader,
}: {
  effectiveGroupParticipantCount: number;
  currentGroupStanding: GroupLiveStanding;
  groupAheadParticipant: GroupLiveStanding | null;
  groupBehindParticipant: GroupLiveStanding | null;
  groupStatusAlert: MatchStatusAlert | null;
  groupLiveStandings: GroupLiveStanding[];
  currentGroupLeader: GroupLiveStanding | null;
}) {
  const topStandings = useMemo(() => groupLiveStandings.slice(0, 5), [groupLiveStandings]);
  const topStandingRows = useMemo(() => topStandings.map((participant) => (
    <GroupLiveStandingRow key={participant.id} participant={participant} />
  )), [topStandings]);

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
        <LiveMatchActionSection
          alert={groupStatusAlert}
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
