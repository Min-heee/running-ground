import { ActivityIndicator, Text, View } from 'react-native';
import { buildMatchSlotDateLabel } from '@/features/runs/utils/matchScheduling';
import { formatMatchCountdown, shouldShowMatchCardCountdown } from '@/lib/matchCountdown';
import {
  MatchActionButtons,
  MatchDistanceSelector,
  MatchNotice,
  MatchTimeSlotSelector,
} from '@/features/runs/components/matchSetupCards/MatchSetupCommon';
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
  activeSlotStartAt,
  effectiveSlotLabel,
  startCountdownSeconds,
  matchNotice,
  needsManualRematch,
  isCancelingMatch,
  reservationLocked,
  canCreateMatch,
  blockingMatchHelperText,
  expiryCountdownLabel,
  opponent,
  waitingTitle,
  waitingMeta,
  waitingHint,
  opponentStatusLabel,
  liveGapKm,
  onDistanceTextChange,
  onShowCustomDistanceInputChange,
  onSelectDate,
  onSelectTimeSection,
  onSelectSlot,
  onCancelMatch,
  onRequestMatch,
  onRequestTestMatch,
  onRequestRematch,
}: DuelMatchSetupCardProps) {
  return (
    <View style={styles.duelSetupCard}>
      <MatchDistanceSelector
        chipKeyPrefix="duel"
        distanceKm={distanceKm}
        distanceText={distanceText}
        showCustomDistanceInput={showCustomDistanceInput}
        onDistanceTextChange={onDistanceTextChange}
        onShowCustomDistanceInputChange={onShowCustomDistanceInputChange}
      />
      <MatchTimeSlotSelector
        dateKeyPrefix="duel-date"
        sectionKeyPrefix="duel-section"
        dateOptions={dateOptions}
        selectedDateKey={selectedDateKey}
        selectedTimeSection={selectedTimeSection}
        slotOptions={slotOptions}
        selectedSlotStartAt={selectedSlotStartAt}
        onSelectDate={onSelectDate}
        onSelectTimeSection={onSelectTimeSection}
        onSelectSlot={onSelectSlot}
      />

      {isRequesting ? <ActivityIndicator size="small" color={colors.brandLight} /> : null}

      {matchState === 'waiting' ? (
        <View style={styles.duelResultCard}>
          <Text style={styles.duelResultEyebrow}>WAITING</Text>
          <Text style={styles.duelResultTitle}>{waitingTitle}</Text>
          <Text style={styles.duelResultMeta}>{waitingMeta}</Text>
          <Text style={styles.duelResultMeta}>{waitingHint}</Text>
          {expiryCountdownLabel ? (
            <Text style={styles.duelResultMeta}>자동 정리까지 {expiryCountdownLabel} 남음</Text>
          ) : null}
          <Text style={styles.duelResultMeta}>{matchStatus?.criteriaSummary}</Text>
        </View>
      ) : null}

      {matchState === 'matched' && opponent ? (
        <View style={styles.duelResultCard}>
          <Text style={styles.duelResultEyebrow}>MATCHED</Text>
          <Text style={styles.duelResultTitle}>
            {matchStatus?.isTestMatch ? '테스트 매칭이 잡혔습니다' : '매칭이 잡혔습니다'}
          </Text>
          <Text style={styles.duelResultMeta}>
            {buildMatchSlotDateLabel(matchStatus?.slotStartAt ?? activeSlotStartAt)} {effectiveSlotLabel}
          </Text>
          {shouldShowMatchCardCountdown(startCountdownSeconds) ? (
            <View style={styles.matchCountdownPill}>
              <Text style={styles.matchCountdownText}>시작까지 {formatMatchCountdown(startCountdownSeconds!)}</Text>
            </View>
          ) : null}
          <Text style={styles.duelResultMeta}>
            상대 {opponent.name} · {opponent.averagePace} · {opponent.levelLabel}
            {opponentStatusLabel ? ` · ${opponentStatusLabel}` : ''}
          </Text>
          <Text style={styles.duelResultMeta}>
            {matchStatus?.isTestMatch
              ? (matchStatus?.readyToStart ? '카운트다운이 끝나서 바로 시작돼요.' : '테스트 카운트다운이 끝나면 자동으로 대결이 시작돼요.')
              : matchStatus?.readyToStart ? '지금 바로 시작할 수 있어요.' : '시작 시간 전까지 자동으로 예약 상태를 유지해요.'}
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
        testRequestLabel="1대1 테스트 매칭"
        isCancelingMatch={isCancelingMatch}
        reservationLocked={reservationLocked}
        canCreateMatch={canCreateMatch}
        blockingMatchHelperText={blockingMatchHelperText}
        onCancelMatch={onCancelMatch}
        onRequestMatch={onRequestMatch}
        onRequestTestMatch={onRequestTestMatch}
      />
    </View>
  );
}
