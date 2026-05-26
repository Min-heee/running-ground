import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  RECOMMENDED_MATCH_DISTANCES,
  findNearestRecommendedDistance,
  isRecommendedMatchDistance,
} from '@/features/runs/utils/matchScheduling';
import type {
  DistanceSelectorProps,
  TimeSlotSelectorProps,
} from '@/features/runs/components/matchSetupCards/types';
import { matchSetupCardStyles as styles } from '@/features/runs/components/matchSetupCards/styles';
import { colors } from '@/theme/tokens';

const TIME_SECTIONS = [{ key: 'am' as const, label: '오전' }, { key: 'pm' as const, label: '오후' }];
type TimeSectionKey = (typeof TIME_SECTIONS)[number]['key'];
type TabKey = 'distance' | 'date' | 'time';
type MatchSetupTabbedSelectorProps = DistanceSelectorProps & TimeSlotSelectorProps;

export function MatchSetupTabbedSelector({
  distanceKm,
  distanceText,
  showCustomDistanceInput,
  chipKeyPrefix,
  onDistanceTextChange,
  onShowCustomDistanceInputChange,
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
}: MatchSetupTabbedSelectorProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('distance');

  const handleSelectDistanceTab = useCallback(() => {
    setActiveTab('distance');
  }, []);

  const handleSelectDateTab = useCallback(() => {
    setActiveTab('date');
  }, []);

  const handleSelectTimeTab = useCallback(() => {
    setActiveTab('time');
  }, []);

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
      <View style={styles.tabBar}>
        <TabPill label="거리" active={activeTab === 'distance'} onPress={handleSelectDistanceTab} />
        <TabPill label="날짜" active={activeTab === 'date'} onPress={handleSelectDateTab} />
        <TabPill label="시간" active={activeTab === 'time'} onPress={handleSelectTimeTab} />
      </View>

      {activeTab === 'distance' ? (
        <>
          <View style={styles.distanceTabHeader}>
            <Pressable style={styles.distanceInputToggle} onPress={handleToggleCustomDistanceInput}>
              <Text style={styles.distanceInputToggleText}>
                {showCustomDistanceInput ? '추천 거리' : '직접 입력'}
              </Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.matchDistanceScrollContent}
            style={styles.matchDistanceScroll}
          >
            {distanceChips}
          </ScrollView>
          {showCustomDistanceInput ? (
            <TextInput
              value={distanceText}
              onChangeText={onDistanceTextChange}
              placeholder="예: 5, 10, 21.1"
              placeholderTextColor={colors.textTertiary}
              keyboardType="decimal-pad"
              style={styles.duelDistanceInput}
            />
          ) : null}
          {!isRecommendedMatchDistance(distanceKm) ? (
            <Text style={styles.duelHelperText}>
              추천 거리 {findNearestRecommendedDistance(distanceKm)}km로 맞추면 더 빨리 비슷한 러너가 모여요.
            </Text>
          ) : null}
        </>
      ) : null}

      {activeTab === 'date' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.slotDateScrollContent}
          style={styles.slotDateScroll}
        >
          {dateChips}
        </ScrollView>
      ) : null}

      {activeTab === 'time' ? (
        <>
          <View style={styles.slotSectionRow}>
            {sectionChips}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.duelSlotScrollContent}
            style={styles.duelSlotScroll}
          >
            {slotChips}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

const TabPill = memo(function TabPill({ active, label, onPress }: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.tabPill, active ? styles.tabPillActive : undefined]}
      onPress={onPress}
    >
      <Text style={[styles.tabPillLabel, active ? styles.tabPillLabelActive : undefined]}>
        {label}
      </Text>
    </Pressable>
  );
});

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
