import { ActivityIndicator, Text, View } from 'react-native';
import {
  MatchActionButtons,
  MatchNotice,
} from '@/features/runs/components/matchSetupCards/MatchSetupCommon';
import { MatchSetupTabbedSelector } from '@/features/runs/components/matchSetupCards/MatchSetupTabbedSelector';
import type { DuelMatchSetupCardProps } from '@/features/runs/components/matchSetupCards/types';
import { matchSetupCardStyles as styles } from '@/features/runs/components/matchSetupCards/styles';
import { colors } from '@/theme/tokens';

export function DuelMatchSetupCard({
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
  effectiveSlotLabel,
  matchNotice,
  needsManualRematch,
  isCancelingMatch,
  reservationLocked,
  canCreateMatch,
  blockingMatchHelperText,
  forceLeaveStuckMatchError,
  isForceLeavingStuckMatch,
  opponent,
  waitingTitle,
  opponentStatusLabel,
  liveGapKm,
  slotDuelCounts,
  onDistanceTextChange,
  onShowCustomDistanceInputChange,
  onSelectDate,
  onSelectTimeSection,
  onSelectSlot,
  onCancelMatch,
  onForceLeaveStuckMatch,
  onRequestMatch,
  onRequestRematch,
}: DuelMatchSetupCardProps) {
  return (
    <View style={styles.duelSetupCard}>
      <MatchSetupTabbedSelector
        chipKeyPrefix="duel"
        distanceKm={distanceKm}
        distanceText={distanceText}
        showCustomDistanceInput={showCustomDistanceInput}
        onDistanceTextChange={onDistanceTextChange}
        onShowCustomDistanceInputChange={onShowCustomDistanceInputChange}
        dateKeyPrefix="duel-date"
        sectionKeyPrefix="duel-section"
        dateOptions={dateOptions}
        selectedDateKey={selectedDateKey}
        selectedTimeSection={selectedTimeSection}
        slotOptions={slotOptions}
        selectedSlotStartAt={selectedSlotStartAt}
        slotDuelCounts={slotDuelCounts}
        onSelectDate={onSelectDate}
        onSelectTimeSection={onSelectTimeSection}
        onSelectSlot={onSelectSlot}
      />

      {isRequesting ? <ActivityIndicator size="small" color={colors.brandLight} /> : null}

      {matchState === 'waiting' ? (
        <View style={styles.duelResultCard}>
          <Text style={styles.duelResultEyebrow}>WAITING</Text>
          <Text style={styles.duelResultTitle}>{waitingTitle}</Text>
        </View>
      ) : null}

      {matchState === 'matched' && opponent ? (
        <View style={styles.duelResultCard}>
          <Text style={styles.duelResultEyebrow}>예약 완료</Text>
          <Text style={styles.duelResultTitle}>
            {matchStatus?.isTestMatch ? '테스트 매칭이 잡혔습니다' : '매칭이 잡혔습니다'}
          </Text>
          <Text style={styles.duelResultMeta}>
            위 다가오는 매치 카드를 눌러 예약 대기실에서 시작을 기다릴 수 있어요.
          </Text>
        </View>
      ) : null}

      <MatchNotice
        notice={matchNotice}
        needsManualRematch={needsManualRematch}
        onRequestRematch={onRequestRematch}
      />

      {matchState === 'active' && opponent ? (
        <View style={styles.duelResultCard}>
          <Text style={styles.duelResultEyebrow}>MATCH ACTIVE</Text>
          <Text style={styles.duelResultTitle}>{opponent.name}님과 바로 시작할 수 있어요</Text>
          <Text style={styles.duelResultMeta}>
            {opponent.averagePace} · {opponent.levelLabel} · {opponent.districtName}
            {opponentStatusLabel ? ` · ${opponentStatusLabel}` : ''}
          </Text>
          {liveGapKm !== null ? (
            <Text style={styles.duelResultMeta}>
              {liveGapKm >= 0
                ? `${liveGapKm.toFixed(2)}km 앞서고 있어요`
                : `${Math.abs(liveGapKm).toFixed(2)}km 따라가는 중이에요`}
            </Text>
          ) : null}
          <Text style={styles.duelResultMeta}>{effectiveSlotLabel} 시작</Text>
        </View>
      ) : null}

      <MatchActionButtons
        matchState={matchState}
        cancelingLabel="취소 중..."
        waitingCancelLabel="1대1 대기 취소"
        matchedCancelLabel="1대1 예약 취소"
        requestLabel="1대1 매칭 찾기"
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
