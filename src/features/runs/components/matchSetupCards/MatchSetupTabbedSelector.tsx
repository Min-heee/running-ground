import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { HorizontalScrollIndicator } from '@/features/runs/components/matchSetupCards/HorizontalScrollIndicator';
import {
  getMatchSetupActiveTab,
  setMatchSetupActiveTab,
  type MatchSetupTabKey,
} from '@/features/runs/components/matchSetupCards/matchSetupTabStore';
import {
  RECOMMENDED_MATCH_DISTANCES,
  buildDuelSlotCountKey,
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
type MatchSetupTabbedSelectorProps = DistanceSelectorProps & TimeSlotSelectorProps;

function useHorizontalChipScrollMetrics() {
  const scrollX = useRef(new Animated.Value(0)).current;
  const [contentWidth, setContentWidth] = useState(0);
  const [visibleWidth, setVisibleWidth] = useState(0);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setVisibleWidth(event.nativeEvent.layout.width);
  }, []);
  const handleContentSizeChange = useCallback((width: number) => {
    setContentWidth(width);
  }, []);
  const handleScroll = useMemo(() => Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: true },
  ), [scrollX]);

  return {
    contentWidth,
    handleContentSizeChange,
    handleLayout,
    handleScroll,
    scrollX,
    visibleWidth,
  };
}

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
  slotDuelCounts,
  onSelectDate,
  onSelectTimeSection,
  onSelectSlot,
}: MatchSetupTabbedSelectorProps) {
  const [activeTab, setActiveTabState] = useState<MatchSetupTabKey>(() => getMatchSetupActiveTab(chipKeyPrefix));
  const distanceScrollMetrics = useHorizontalChipScrollMetrics();
  const dateScrollMetrics = useHorizontalChipScrollMetrics();
  const slotScrollMetrics = useHorizontalChipScrollMetrics();
  const setActiveTab = useCallback((tab: MatchSetupTabKey) => {
    setMatchSetupActiveTab(chipKeyPrefix, tab);
    setActiveTabState(tab);
  }, [chipKeyPrefix]);

  const handleSelectDistanceTab = useCallback(() => {
    setActiveTab('distance');
  }, [setActiveTab]);

  const handleSelectDateTab = useCallback(() => {
    setActiveTab('date');
  }, [setActiveTab]);

  const handleSelectTimeTab = useCallback(() => {
    setActiveTab('time');
  }, [setActiveTab]);

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
      // duelSlotCounts is keyed by slot + selected distance and already excludes the
      // viewer's own waiting entry server-side, so this is the count of OTHER runners the
      // viewer could match at this exact time AND distance.
      count={slotDuelCounts?.[buildDuelSlotCountKey(slot.startsAt, distanceKm)] ?? 0}
      onSelectSlot={onSelectSlot}
      selected={slot.startsAt === selectedSlotStartAt}
      slot={slot}
    />
  )), [distanceKm, onSelectSlot, selectedSlotStartAt, slotDuelCounts, slotOptions]);

  return (
    <View style={styles.duelSection}>
      <View style={styles.tabBarWrapper}>
        <View style={styles.tabBar}>
          <TabPill label="날짜" active={activeTab === 'date'} onPress={handleSelectDateTab} />
          <TabPill label="시간" active={activeTab === 'time'} onPress={handleSelectTimeTab} />
          <TabPill label="거리" active={activeTab === 'distance'} onPress={handleSelectDistanceTab} />
        </View>
      </View>

      {activeTab === 'distance' ? (
        <>
          <Animated.ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.matchDistanceScrollContent}
            style={styles.matchDistanceScroll}
            onContentSizeChange={distanceScrollMetrics.handleContentSizeChange}
            onLayout={distanceScrollMetrics.handleLayout}
            onScroll={distanceScrollMetrics.handleScroll}
            scrollEventThrottle={16}
          >
            <Pressable style={styles.distanceInputToggleChip} onPress={handleToggleCustomDistanceInput}>
              <Text style={styles.distanceInputToggleText}>
                {showCustomDistanceInput ? '추천 거리' : '직접 입력'}
              </Text>
            </Pressable>
            {distanceChips}
          </Animated.ScrollView>
          <HorizontalScrollIndicator
            contentWidth={distanceScrollMetrics.contentWidth}
            scrollX={distanceScrollMetrics.scrollX}
            visibleWidth={distanceScrollMetrics.visibleWidth}
          />
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
        <>
          <Animated.ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.slotDateScrollContent}
            style={styles.slotDateScroll}
            onContentSizeChange={dateScrollMetrics.handleContentSizeChange}
            onLayout={dateScrollMetrics.handleLayout}
            onScroll={dateScrollMetrics.handleScroll}
            scrollEventThrottle={16}
          >
            {dateChips}
          </Animated.ScrollView>
          <HorizontalScrollIndicator
            contentWidth={dateScrollMetrics.contentWidth}
            scrollX={dateScrollMetrics.scrollX}
            visibleWidth={dateScrollMetrics.visibleWidth}
          />
        </>
      ) : null}

      {activeTab === 'time' ? (
        <>
          <View style={styles.slotSectionRow}>
            {sectionChips}
          </View>
          <Animated.ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.duelSlotScrollContent}
            style={styles.duelSlotScroll}
            onContentSizeChange={slotScrollMetrics.handleContentSizeChange}
            onLayout={slotScrollMetrics.handleLayout}
            onScroll={slotScrollMetrics.handleScroll}
            scrollEventThrottle={16}
          >
            {slotChips}
          </Animated.ScrollView>
          <HorizontalScrollIndicator
            contentWidth={slotScrollMetrics.contentWidth}
            scrollX={slotScrollMetrics.scrollX}
            visibleWidth={slotScrollMetrics.visibleWidth}
          />
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
  count,
  onSelectSlot,
  selected,
  slot,
}: {
  count: number;
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
      {count > 0 ? <Text style={styles.duelSlotWaitingCount}>{count}명 대기</Text> : null}
      {slot.isClosed ? <Text style={styles.duelSlotClosedText}>마감</Text> : null}
    </Pressable>
  );
});
