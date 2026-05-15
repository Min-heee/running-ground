import { memo, useCallback, useMemo } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import {
  RECOMMENDED_MATCH_DISTANCES,
  findNearestRecommendedDistance,
  isRecommendedMatchDistance,
} from '@/features/runs/utils/matchScheduling';
import type { RunningMatchState } from '@/lib/api/types';
import type {
  DistanceSelectorProps,
  TimeSlotSelectorProps,
} from '@/features/runs/components/matchSetupCards/types';
import { matchSetupCardStyles as styles } from '@/features/runs/components/matchSetupCards/styles';

const TIME_SECTIONS = [
  { key: 'am' as const, label: '오전' },
  { key: 'pm' as const, label: '오후' },
];
type TimeSectionKey = (typeof TIME_SECTIONS)[number]['key'];

export function MatchDistanceSelector({
  distanceKm,
  distanceText,
  showCustomDistanceInput,
  chipKeyPrefix,
  onDistanceTextChange,
  onShowCustomDistanceInputChange,
}: DistanceSelectorProps) {
  const handleToggleCustomDistanceInput = useCallback(() => {
    onShowCustomDistanceInputChange(!showCustomDistanceInput);
  }, [onShowCustomDistanceInputChange, showCustomDistanceInput]);

  const distanceChips = useMemo(() => RECOMMENDED_MATCH_DISTANCES.map((recommendedDistanceKm) => (
    <MatchDistanceChip
      key={`${chipKeyPrefix}-${recommendedDistanceKm}`}
      distanceKm={recommendedDistanceKm}
      onDistanceTextChange={onDistanceTextChange}
      onShowCustomDistanceInputChange={onShowCustomDistanceInputChange}
      selected={Math.abs(distanceKm - recommendedDistanceKm) < 0.15}
    />
  )), [chipKeyPrefix, distanceKm, onDistanceTextChange, onShowCustomDistanceInputChange]);

  return (
    <View style={styles.duelSection}>
      <View style={styles.duelSectionHeader}>
        <Text style={styles.duelSectionTitle}>거리</Text>
        <Pressable
          style={styles.distanceInputToggle}
          onPress={handleToggleCustomDistanceInput}
        >
          <Text style={styles.distanceInputToggleText}>
            {showCustomDistanceInput ? '추천 거리' : '직접 입력'}
          </Text>
        </Pressable>
      </View>
      <View style={styles.matchDistanceChipRow}>
        {distanceChips}
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

const MatchDistanceChip = memo(function MatchDistanceChip({
  distanceKm,
  onDistanceTextChange,
  onShowCustomDistanceInputChange,
  selected,
}: {
  distanceKm: number;
  onDistanceTextChange: (value: string) => void;
  onShowCustomDistanceInputChange: (value: boolean) => void;
  selected: boolean;
}) {
  const handlePress = useCallback(() => {
    onDistanceTextChange(String(distanceKm));
    onShowCustomDistanceInputChange(false);
  }, [distanceKm, onDistanceTextChange, onShowCustomDistanceInputChange]);

  return (
    <Pressable
      style={[styles.matchDistanceChip, selected ? styles.matchDistanceChipSelected : undefined]}
      onPress={handlePress}
    >
      <Text style={[styles.matchDistanceChipText, selected ? styles.matchDistanceChipTextSelected : undefined]}>
        {distanceKm}km
      </Text>
    </Pressable>
  );
});

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
  const dateChips = useMemo(() => dateOptions.map((dateOption) => (
    <MatchDateChip
      key={`${dateKeyPrefix}-${dateOption.key}`}
      dateOption={dateOption}
      onSelectDate={onSelectDate}
      selected={dateOption.key === selectedDateKey}
    />
  )), [dateKeyPrefix, dateOptions, onSelectDate, selectedDateKey]);

  const sectionChips = useMemo(() => TIME_SECTIONS.map((section) => (
    <TimeSectionChip
      key={`${sectionKeyPrefix}-${section.key}`}
      onSelectTimeSection={onSelectTimeSection}
      section={section}
      selected={selectedTimeSection === section.key}
    />
  )), [onSelectTimeSection, sectionKeyPrefix, selectedTimeSection]);

  const slotChips = useMemo(() => slotOptions.map((slot) => (
    <MatchSlotChip
      key={slot.startsAt}
      onSelectSlot={onSelectSlot}
      selected={slot.startsAt === selectedSlotStartAt}
      slot={slot}
    />
  )), [onSelectSlot, selectedSlotStartAt, slotOptions]);

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
        {dateChips}
      </ScrollView>
      <View style={styles.slotSectionRow}>
        {sectionChips}
      </View>
      <View style={styles.duelSlotGrid}>
        {slotChips}
      </View>
    </View>
  );
}

const MatchDateChip = memo(function MatchDateChip({
  dateOption,
  onSelectDate,
  selected,
}: {
  dateOption: TimeSlotSelectorProps['dateOptions'][number];
  onSelectDate: (dateKey: string) => void;
  selected: boolean;
}) {
  const handlePress = useCallback(() => {
    onSelectDate(dateOption.key);
  }, [dateOption.key, onSelectDate]);

  return (
    <Pressable
      style={[styles.slotDateChip, selected ? styles.slotDateChipSelected : undefined]}
      onPress={handlePress}
    >
      <Text style={[styles.slotDateChipLabel, selected ? styles.slotDateChipLabelSelected : undefined]}>
        {dateOption.label}
      </Text>
      <Text style={[styles.slotDateChipMeta, selected ? styles.slotDateChipMetaSelected : undefined]}>
        {dateOption.subtitle}
      </Text>
    </Pressable>
  );
});

const TimeSectionChip = memo(function TimeSectionChip({
  onSelectTimeSection,
  section,
  selected,
}: {
  onSelectTimeSection: (sectionKey: TimeSectionKey) => void;
  section: { key: TimeSectionKey; label: string };
  selected: boolean;
}) {
  const handlePress = useCallback(() => {
    onSelectTimeSection(section.key);
  }, [onSelectTimeSection, section.key]);

  return (
    <Pressable
      style={[styles.slotSectionChip, selected ? styles.slotSectionChipSelected : undefined]}
      onPress={handlePress}
    >
      <Text style={[styles.slotSectionChipText, selected ? styles.slotSectionChipTextSelected : undefined]}>
        {section.label}
      </Text>
    </Pressable>
  );
});

const MatchSlotChip = memo(function MatchSlotChip({
  onSelectSlot,
  selected,
  slot,
}: {
  onSelectSlot: (slotStartAt: string) => void;
  selected: boolean;
  slot: TimeSlotSelectorProps['slotOptions'][number];
}) {
  const handlePress = useCallback(() => {
    if (!slot.isClosed) {
      onSelectSlot(slot.startsAt);
    }
  }, [onSelectSlot, slot.isClosed, slot.startsAt]);

  return (
    <Pressable
      disabled={slot.isClosed}
      style={[
        styles.duelSlotChip,
        selected ? styles.duelSlotChipSelected : undefined,
        slot.isClosed ? styles.duelSlotChipDisabled : undefined,
      ]}
      onPress={handlePress}
    >
      <Text style={[styles.duelSlotLabel, selected ? styles.duelSlotLabelSelected : undefined]}>
        {slot.label}
      </Text>
      {slot.isClosed ? <Text style={styles.duelSlotClosedText}>마감</Text> : null}
    </Pressable>
  );
});

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
