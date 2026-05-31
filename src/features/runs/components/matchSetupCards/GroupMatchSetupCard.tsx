import { memo, useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { buildMatchSlotDateLabel } from '@/features/runs/utils/matchScheduling';
import { buildMatchParticipantStatusLabel } from '@/features/runs/lifecycle/matchStateMachine';
import { formatMatchCountdown, shouldShowMatchCardCountdown } from '@/lib/matchCountdown';
import {
  MatchActionButtons,
  MatchNotice,
} from '@/features/runs/components/matchSetupCards/MatchSetupCommon';
import { MatchSetupTabbedSelector } from '@/features/runs/components/matchSetupCards/MatchSetupTabbedSelector';
import type { GroupMatchSetupCardProps } from '@/features/runs/components/matchSetupCards/types';
import { matchSetupCardStyles as styles } from '@/features/runs/components/matchSetupCards/styles';
import { colors } from '@/theme/tokens';

type GroupParticipant = GroupMatchSetupCardProps['participants'][number];

const GroupParticipantPreviewRow = memo(function GroupParticipantPreviewRow({
  effectiveSeedRank,
  participant,
}: {
  effectiveSeedRank: number | undefined;
  participant: GroupParticipant;
}) {
  return (
    <View style={styles.groupParticipantRow}>
      <Text style={styles.groupParticipantRank}>{participant.seedRank}</Text>
      <View style={styles.groupParticipantCopy}>
        <Text style={styles.groupParticipantName}>
          {participant.name}
          {participant.seedRank === (effectiveSeedRank ?? 1) ? ' (나)' : ''}
        </Text>
        <Text style={styles.groupParticipantMeta}>
          {participant.averagePace} · {participant.levelLabel}
          {participant.liveStatus ? ` · ${buildMatchParticipantStatusLabel(participant.liveStatus)}` : ''}
        </Text>
      </View>
    </View>
  );
});

export function GroupMatchSetupCard({
  distanceKm,
  distanceText,
  showCustomDistanceInput,
  dateOptions,
  selectedDateKey,
  selectedTimeSection,
  slotOptions,
  selectedSlotStartAt,
  isRequesting,
  matchState,
  matchStatus,
  activeSlotStartAt,
  effectiveSlotLabel,
  startCountdownSeconds,
  matchNotice,
  needsManualRematch,
  isCancelingMatch,
  reservationLocked,
  canCreateMatch,
  blockingMatchHelperText,
  forceLeaveStuckMatchError,
  isForceLeavingStuckMatch,
  expiryCountdownLabel,
  isTestFlow,
  isLoadingDemandSummary,
  demandSummary,
  effectiveParticipantCount,
  effectiveSeedRank,
  participants,
  onDistanceTextChange,
  onShowCustomDistanceInputChange,
  onSelectDate,
  onSelectTimeSection,
  onSelectSlot,
  onCancelMatch,
  onForceLeaveStuckMatch,
  onRequestMatch,
  onRequestRematch,
}: GroupMatchSetupCardProps) {
  const participantPreviewRows = useMemo(() => participants.slice(0, 3).map((participant) => (
    <GroupParticipantPreviewRow
      key={participant.id}
      effectiveSeedRank={effectiveSeedRank ?? undefined}
      participant={participant}
    />
  )), [effectiveSeedRank, participants]);

  return (
    <View style={styles.duelSetupCard}>
      <MatchSetupTabbedSelector
        chipKeyPrefix="group"
        distanceKm={distanceKm}
        distanceText={distanceText}
        showCustomDistanceInput={showCustomDistanceInput}
        onDistanceTextChange={onDistanceTextChange}
        onShowCustomDistanceInputChange={onShowCustomDistanceInputChange}
        dateKeyPrefix="group-date"
        sectionKeyPrefix="group-section"
        dateOptions={dateOptions}
        selectedDateKey={selectedDateKey}
        selectedTimeSection={selectedTimeSection}
        slotOptions={slotOptions}
        selectedSlotStartAt={selectedSlotStartAt}
        onSelectDate={onSelectDate}
        onSelectTimeSection={onSelectTimeSection}
        onSelectSlot={onSelectSlot}
      />

      {!isTestFlow ? (
        <View style={styles.matchDemandCard}>
          <View style={styles.matchDemandHeader}>
            <Text style={styles.matchDemandTitle}>현재 신청 현황</Text>
            {isLoadingDemandSummary ? <ActivityIndicator size="small" color={colors.brandLight} /> : null}
          </View>
          <Text style={styles.matchDemandHeadline}>
            {demandSummary
              ? `${demandSummary.averagePace} · ${demandSummary.fillRatioLabel}`
              : '평균 페이스와 신청 인원을 불러오는 중'}
          </Text>
          {demandSummary?.participantsCount ? (
            <Text style={styles.matchDemandText}>{demandSummary.summaryText}</Text>
          ) : null}
        </View>
      ) : null}

      {isRequesting ? <ActivityIndicator size="small" color={colors.brandLight} /> : null}

      {matchState === 'waiting' ? (
        <View style={styles.duelResultCard}>
          <Text style={styles.duelResultEyebrow}>WAITING</Text>
          <Text style={styles.duelResultTitle}>{isTestFlow ? '테스트 그룹을 모으는 중이에요' : '비슷한 그룹을 모으는 중이에요'}</Text>
          <Text style={styles.duelResultMeta}>
            {isTestFlow
              ? `현재 ${matchStatus?.participantCount ?? 0}/${matchStatus?.capacity ?? 30}명 대기 · 2명만 모이면 시작`
              : `현재 ${matchStatus?.participantCount ?? 0}/${matchStatus?.capacity ?? 30}명 대기 · 평균 ${demandSummary?.averagePace ?? '페이스 계산 중'}`}
          </Text>
          {expiryCountdownLabel ? (
            <Text style={styles.duelResultMeta}>자동 정리까지 {expiryCountdownLabel} 남음</Text>
          ) : null}
          <Text style={styles.duelResultMeta}>{matchStatus?.criteriaSummary}</Text>
        </View>
      ) : null}

      {(matchState === 'matched' || matchState === 'active') && effectiveParticipantCount ? (
        <View style={styles.duelResultCard}>
          <Text style={styles.duelResultEyebrow}>
            {matchState === 'matched' ? 'MATCHED' : 'GROUP ACTIVE'}
          </Text>
          <Text style={styles.duelResultTitle}>
            {matchState === 'matched'
              ? matchStatus?.isTestMatch ? '테스트 그룹이 잡혔습니다' : '매칭이 잡혔습니다'
              : `${effectiveParticipantCount}명 그룹전 바로 시작 가능`}
          </Text>
          <Text style={styles.duelResultMeta}>
            {buildMatchSlotDateLabel(matchStatus?.slotStartAt ?? activeSlotStartAt)} {effectiveSlotLabel}
          </Text>
          {matchState === 'matched' && shouldShowMatchCardCountdown(startCountdownSeconds) ? (
            <View style={styles.matchCountdownPill}>
              <Text style={styles.matchCountdownText}>시작까지 {formatMatchCountdown(startCountdownSeconds!)}</Text>
            </View>
          ) : null}
          <Text style={styles.duelResultMeta}>
            {effectiveParticipantCount}명 그룹 · 내 시작 시드 {effectiveSeedRank ?? 1}위
          </Text>
          {matchState === 'matched' ? (
            <Text style={styles.duelResultMeta}>
              {matchStatus?.isTestMatch
                ? (matchStatus?.readyToStart ? '카운트다운이 끝나서 바로 시작돼요.' : '테스트 카운트다운이 끝나면 자동으로 그룹 대결이 시작돼요.')
                : matchStatus?.readyToStart ? '지금 바로 시작할 수 있어요.' : '시작 시간 전까지 자동으로 예약 상태를 유지해요.'}
            </Text>
          ) : null}
          <View style={styles.groupParticipantList}>
            {participantPreviewRows}
          </View>
          {effectiveParticipantCount > 3 ? (
            <Text style={styles.duelResultMeta}>외 {effectiveParticipantCount - 3}명</Text>
          ) : null}
        </View>
      ) : null}

      <MatchNotice
        notice={matchNotice}
        needsManualRematch={needsManualRematch}
        onRequestRematch={onRequestRematch}
      />

      <MatchActionButtons
        matchState={matchState}
        cancelingLabel="취소 중..."
        waitingCancelLabel="그룹 대기 취소"
        matchedCancelLabel="그룹 예약 취소"
        requestLabel="그룹 매칭 찾기"
        isCancelingMatch={isCancelingMatch}
        reservationLocked={reservationLocked}
        canCreateMatch={canCreateMatch}
        blockingMatchHelperText={blockingMatchHelperText}
        forceLeaveStuckMatchError={forceLeaveStuckMatchError}
        isForceLeavingStuckMatch={isForceLeavingStuckMatch}
        onCancelMatch={onCancelMatch}
        onForceLeaveStuckMatch={onForceLeaveStuckMatch}
        onRequestMatch={onRequestMatch}
      />
    </View>
  );
}
