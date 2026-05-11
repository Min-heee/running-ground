import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import {
  RECOMMENDED_MATCH_DISTANCES,
  buildMatchSlotDateLabel,
  findNearestRecommendedDistance,
  isRecommendedMatchDistance,
} from '@/features/runs/matchScheduling';
import { buildMatchParticipantStatusLabel } from '@/features/runs/matchStateMachine';
import { formatMatchCountdown, shouldShowMatchCardCountdown } from '@/lib/matchCountdown';
import type {
  DuelMatchOpponent,
  GroupMatchParticipant,
  MatchDemandSummaryResponse,
  RunningMatchState,
  RunningMatchStatusResponse,
} from '@/lib/api/types';

type TimeSection = 'am' | 'pm';

type MatchDateOption = {
  key: string;
  label: string;
  subtitle: string;
};

type MatchSlotOption = {
  startsAt: string;
  label: string;
  isClosed: boolean;
};

type DistanceSelectorProps = {
  distanceKm: number;
  distanceText: string;
  showCustomDistanceInput: boolean;
  chipKeyPrefix: string;
  onDistanceTextChange: (text: string) => void;
  onShowCustomDistanceInputChange: (show: boolean) => void;
};

type TimeSlotSelectorProps = {
  dateKeyPrefix: string;
  sectionKeyPrefix: string;
  dateOptions: MatchDateOption[];
  selectedDateKey: string;
  selectedTimeSection: TimeSection;
  slotOptions: MatchSlotOption[];
  selectedSlotStartAt: string;
  onSelectDate: (dateKey: string) => void;
  onSelectTimeSection: (section: TimeSection) => void;
  onSelectSlot: (startsAt: string) => void;
};

type BaseMatchSetupProps = {
  distanceKm: number;
  distanceText: string;
  showCustomDistanceInput: boolean;
  dateOptions: MatchDateOption[];
  selectedDateKey: string;
  selectedTimeSection: TimeSection;
  slotOptions: MatchSlotOption[];
  selectedSlotStartAt: string;
  isRequesting: boolean;
  matchState: RunningMatchState;
  matchStatus: RunningMatchStatusResponse | null;
  activeSlotStartAt: string;
  effectiveSlotLabel: string;
  startCountdownSeconds: number | null;
  matchNotice: string | null;
  needsManualRematch: boolean;
  isCancelingMatch: boolean;
  reservationLocked: boolean;
  canCreateMatch: boolean;
  blockingMatchHelperText: string | null;
  expiryCountdownLabel: string | null;
  onDistanceTextChange: (text: string) => void;
  onShowCustomDistanceInputChange: (show: boolean) => void;
  onSelectDate: (dateKey: string) => void;
  onSelectTimeSection: (section: TimeSection) => void;
  onSelectSlot: (startsAt: string) => void;
  onCancelMatch: () => void;
  onRequestMatch: () => void;
  onRequestTestMatch: () => void;
  onRequestRematch: () => void;
};

type DuelMatchSetupCardProps = BaseMatchSetupProps & {
  opponent: DuelMatchOpponent | null;
  waitingTitle: string;
  waitingMeta: string;
  waitingHint: string;
  opponentStatusLabel: string | null;
  liveGapKm: number | null;
};

type GroupMatchSetupCardProps = BaseMatchSetupProps & {
  isTestFlow: boolean;
  isLoadingDemandSummary: boolean;
  demandSummary: MatchDemandSummaryResponse | null;
  effectiveParticipantCount: number;
  effectiveSeedRank: number | null;
  participants: GroupMatchParticipant[];
};

function MatchDistanceSelector({
  distanceKm,
  distanceText,
  showCustomDistanceInput,
  chipKeyPrefix,
  onDistanceTextChange,
  onShowCustomDistanceInputChange,
}: DistanceSelectorProps) {
  return (
    <View style={styles.duelSection}>
      <View style={styles.duelSectionHeader}>
        <Text style={styles.duelSectionTitle}>거리</Text>
        <Pressable
          style={styles.distanceInputToggle}
          onPress={() => onShowCustomDistanceInputChange(!showCustomDistanceInput)}
        >
          <Text style={styles.distanceInputToggleText}>
            {showCustomDistanceInput ? '추천 거리' : '직접 입력'}
          </Text>
        </Pressable>
      </View>
      <View style={styles.matchDistanceChipRow}>
        {RECOMMENDED_MATCH_DISTANCES.map((recommendedDistanceKm) => {
          const isSelected = Math.abs(distanceKm - recommendedDistanceKm) < 0.15;

          return (
            <Pressable
              key={`${chipKeyPrefix}-${recommendedDistanceKm}`}
              style={[styles.matchDistanceChip, isSelected ? styles.matchDistanceChipSelected : undefined]}
              onPress={() => {
                onDistanceTextChange(String(recommendedDistanceKm));
                onShowCustomDistanceInputChange(false);
              }}
            >
              <Text style={[styles.matchDistanceChipText, isSelected ? styles.matchDistanceChipTextSelected : undefined]}>
                {recommendedDistanceKm}km
              </Text>
            </Pressable>
          );
        })}
      </View>
      {showCustomDistanceInput ? (
        <TextInput
          value={distanceText}
          onChangeText={onDistanceTextChange}
          placeholder="예: 5, 10, 21.1"
          placeholderTextColor="#98A2B3"
          keyboardType="decimal-pad"
          style={styles.duelDistanceInput}
        />
      ) : null}
      {!isRecommendedMatchDistance(distanceKm) ? (
        <Text style={styles.duelHelperText}>
          추천 거리 {findNearestRecommendedDistance(distanceKm)}km로 맞추면 더 빨리 비슷한 러너가 모여요.
        </Text>
      ) : null}
    </View>
  );
}

function MatchTimeSlotSelector({
  dateKeyPrefix,
  sectionKeyPrefix,
  dateOptions,
  selectedDateKey,
  selectedTimeSection,
  slotOptions,
  selectedSlotStartAt,
  onSelectDate,
  onSelectTimeSection,
  onSelectSlot,
}: TimeSlotSelectorProps) {
  return (
    <View style={styles.duelSection}>
      <View style={styles.duelSectionHeader}>
        <Text style={styles.duelSectionTitle}>출발 시간대</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.slotDateScrollContent}
        style={styles.slotDateScroll}
      >
        {dateOptions.map((dateOption) => {
          const isSelected = dateOption.key === selectedDateKey;

          return (
            <Pressable
              key={`${dateKeyPrefix}-${dateOption.key}`}
              style={[styles.slotDateChip, isSelected ? styles.slotDateChipSelected : undefined]}
              onPress={() => onSelectDate(dateOption.key)}
            >
              <Text style={[styles.slotDateChipLabel, isSelected ? styles.slotDateChipLabelSelected : undefined]}>
                {dateOption.label}
              </Text>
              <Text style={[styles.slotDateChipMeta, isSelected ? styles.slotDateChipMetaSelected : undefined]}>
                {dateOption.subtitle}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.slotSectionRow}>
        {[
          { key: 'am' as const, label: '오전' },
          { key: 'pm' as const, label: '오후' },
        ].map((section) => {
          const isSelected = selectedTimeSection === section.key;

          return (
            <Pressable
              key={`${sectionKeyPrefix}-${section.key}`}
              style={[styles.slotSectionChip, isSelected ? styles.slotSectionChipSelected : undefined]}
              onPress={() => onSelectTimeSection(section.key)}
            >
              <Text style={[styles.slotSectionChipText, isSelected ? styles.slotSectionChipTextSelected : undefined]}>
                {section.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.duelSlotGrid}>
        {slotOptions.map((slot) => {
          const isSelected = slot.startsAt === selectedSlotStartAt;

          return (
            <Pressable
              key={slot.startsAt}
              disabled={slot.isClosed}
              style={[
                styles.duelSlotChip,
                isSelected ? styles.duelSlotChipSelected : undefined,
                slot.isClosed ? styles.duelSlotChipDisabled : undefined,
              ]}
              onPress={() => {
                if (!slot.isClosed) {
                  onSelectSlot(slot.startsAt);
                }
              }}
            >
              <Text style={[styles.duelSlotLabel, isSelected ? styles.duelSlotLabelSelected : undefined]}>
                {slot.label}
              </Text>
              {slot.isClosed ? <Text style={styles.duelSlotClosedText}>마감</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function MatchNotice({
  notice,
  needsManualRematch,
  onRequestRematch,
}: {
  notice: string | null;
  needsManualRematch: boolean;
  onRequestRematch: () => void;
}) {
  if (!notice) {
    return null;
  }

  return (
    <View style={styles.matchNoticeBlock}>
      <Text style={styles.matchNoticeText}>{notice}</Text>
      {needsManualRematch ? (
        <Pressable style={styles.matchNoticeAction} onPress={onRequestRematch}>
          <Text style={styles.matchNoticeActionText}>같은 조건으로 다시 찾기</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function MatchActionButtons({
  matchState,
  cancelingLabel,
  waitingCancelLabel,
  matchedCancelLabel,
  requestLabel,
  testRequestLabel,
  isCancelingMatch,
  reservationLocked,
  canCreateMatch,
  blockingMatchHelperText,
  onCancelMatch,
  onRequestMatch,
  onRequestTestMatch,
}: {
  matchState: RunningMatchState;
  cancelingLabel: string;
  waitingCancelLabel: string;
  matchedCancelLabel: string;
  requestLabel: string;
  testRequestLabel: string;
  isCancelingMatch: boolean;
  reservationLocked: boolean;
  canCreateMatch: boolean;
  blockingMatchHelperText: string | null;
  onCancelMatch: () => void;
  onRequestMatch: () => void;
  onRequestTestMatch: () => void;
}) {
  return (
    <>
      {matchState === 'waiting' || matchState === 'matched' ? (
        <>
          <SecondaryButton
            label={isCancelingMatch ? cancelingLabel : matchState === 'matched' ? matchedCancelLabel : waitingCancelLabel}
            onPress={onCancelMatch}
            disabled={reservationLocked}
          />
          {reservationLocked ? <Text style={styles.matchCancelHelperText}>출발 1시간 전부터는 예약을 취소할 수 없어요.</Text> : null}
        </>
      ) : matchState === 'active' ? null : (
        <View style={styles.matchActionColumn}>
          <SecondaryButton label={requestLabel} onPress={onRequestMatch} disabled={!canCreateMatch} />
          <SecondaryButton label={testRequestLabel} onPress={onRequestTestMatch} disabled={!canCreateMatch} />
        </View>
      )}
      {!canCreateMatch && blockingMatchHelperText ? (
        <Text style={styles.matchCancelHelperText}>{blockingMatchHelperText}</Text>
      ) : null}
    </>
  );
}

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

      {isRequesting ? <ActivityIndicator size="small" color="#818CF8" /> : null}

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
  onRequestMatch,
  onRequestTestMatch,
  onRequestRematch,
}: GroupMatchSetupCardProps) {
  return (
    <View style={styles.duelSetupCard}>
      <MatchDistanceSelector
        chipKeyPrefix="group"
        distanceKm={distanceKm}
        distanceText={distanceText}
        showCustomDistanceInput={showCustomDistanceInput}
        onDistanceTextChange={onDistanceTextChange}
        onShowCustomDistanceInputChange={onShowCustomDistanceInputChange}
      />
      <MatchTimeSlotSelector
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
            {isLoadingDemandSummary ? <ActivityIndicator size="small" color="#818CF8" /> : null}
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

      {isRequesting ? <ActivityIndicator size="small" color="#818CF8" /> : null}

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
            {participants.slice(0, 3).map((participant) => (
              <View key={participant.id} style={styles.groupParticipantRow}>
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
            ))}
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
        testRequestLabel="그룹 테스트 매칭"
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

const styles = StyleSheet.create({
  duelSetupCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#4F46E5',
    backgroundColor: '#111827',
    padding: 12,
    gap: 12,
  },
  duelSection: {
    gap: 10,
  },
  duelSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  duelSectionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  distanceInputToggle: {
    borderRadius: 999,
    backgroundColor: '#1F2937',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  distanceInputToggleText: {
    color: '#C7D2FE',
    fontSize: 11,
    fontWeight: '800',
  },
  matchDistanceChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  matchDistanceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#1F2937',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  matchDistanceChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#312E81',
  },
  matchDistanceChipText: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '800',
  },
  matchDistanceChipTextSelected: {
    color: '#FFFFFF',
  },
  duelDistanceInput: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#0B1220',
    color: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '700',
  },
  duelHelperText: {
    color: '#A5B4FC',
    fontSize: 12,
    lineHeight: 18,
  },
  slotDateScroll: {
    marginHorizontal: -2,
  },
  slotDateScrollContent: {
    gap: 8,
    paddingHorizontal: 2,
  },
  slotDateChip: {
    minWidth: 70,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#0B1220',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  slotDateChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#312E81',
  },
  slotDateChipLabel: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '900',
  },
  slotDateChipLabelSelected: {
    color: '#FFFFFF',
  },
  slotDateChipMeta: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  slotDateChipMetaSelected: {
    color: '#C7D2FE',
  },
  slotSectionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  slotSectionChip: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#0B1220',
    paddingVertical: 9,
    alignItems: 'center',
  },
  slotSectionChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#312E81',
  },
  slotSectionChipText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '900',
  },
  slotSectionChipTextSelected: {
    color: '#FFFFFF',
  },
  duelSlotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  duelSlotChip: {
    width: '30%',
    minWidth: 76,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#0B1220',
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
  },
  duelSlotChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#312E81',
  },
  duelSlotChipDisabled: {
    opacity: 0.45,
  },
  duelSlotLabel: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '900',
  },
  duelSlotLabelSelected: {
    color: '#FFFFFF',
  },
  duelSlotClosedText: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '800',
  },
  duelResultCard: {
    borderRadius: 16,
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    padding: 14,
    gap: 7,
  },
  duelResultEyebrow: {
    color: '#C7D2FE',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  duelResultTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  duelResultMeta: {
    color: '#D1D5DB',
    fontSize: 12,
    lineHeight: 18,
  },
  matchCountdownPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#312E81',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  matchCountdownText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  matchNoticeBlock: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#818CF8',
    backgroundColor: '#1E1B4B',
    padding: 12,
    gap: 10,
  },
  matchNoticeText: {
    color: '#E0E7FF',
    fontSize: 12,
    lineHeight: 18,
  },
  matchNoticeAction: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  matchNoticeActionText: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: '900',
  },
  matchCancelHelperText: {
    color: '#A5B4FC',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  matchActionColumn: {
    gap: 8,
  },
  matchDemandCard: {
    borderRadius: 16,
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    padding: 14,
    gap: 8,
  },
  matchDemandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchDemandTitle: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '900',
  },
  matchDemandHeadline: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  matchDemandText: {
    color: '#D1D5DB',
    fontSize: 12,
    lineHeight: 18,
  },
  groupParticipantList: {
    gap: 8,
    marginTop: 4,
  },
  groupParticipantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  groupParticipantRank: {
    width: 24,
    color: '#C7D2FE',
    fontSize: 13,
    fontWeight: '900',
  },
  groupParticipantCopy: {
    flex: 1,
    gap: 2,
  },
  groupParticipantName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  groupParticipantMeta: {
    color: '#D1D5DB',
    fontSize: 11,
  },
});
