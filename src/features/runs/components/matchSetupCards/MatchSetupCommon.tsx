import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import {
  RECOMMENDED_MATCH_DISTANCES,
  findNearestRecommendedDistance,
  isRecommendedMatchDistance,
} from '@/features/runs/matchScheduling';
import type { RunningMatchState } from '@/lib/api/types';
import type {
  DistanceSelectorProps,
  TimeSlotSelectorProps,
} from '@/features/runs/components/matchSetupCards/types';
import { matchSetupCardStyles as styles } from '@/features/runs/components/matchSetupCards/styles';

export function MatchDistanceSelector({
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

export function MatchTimeSlotSelector({
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

export function MatchNotice({
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

export function MatchActionButtons({
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
