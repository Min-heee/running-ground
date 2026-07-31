import { useCallback, useMemo, useState } from 'react';
import { Animated, Pressable, Text, TextInput, View } from 'react-native';
import { HorizontalScrollIndicator } from '@/features/runs/components/matchSetupCards/HorizontalScrollIndicator';
import {
  MatchDateChip,
  MatchDistanceChip,
  MatchSlotChip,
  TIME_SECTIONS,
  TimeSectionChip,
  ValueTile,
} from '@/features/runs/components/matchSetupCards/matchSetupSelectorChips';
import { useHorizontalChipScrollMetrics } from '@/features/runs/components/matchSetupCards/useHorizontalChipScrollMetrics';
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

  // 타일에 띄우는 '지금 고른 값'. 시간은 slotOptions가 날짜/오전·오후로 필터된 목록이라
  // 선택 슬롯이 목록 밖일 수 있다 — 그때는 아직 고르는 중이라는 뜻으로 '선택'을 띄운다.
  const selectedDateOption = dateOptions.find((option) => option.key === selectedDateKey) ?? null;
  const dateValueLabel = selectedDateOption
    ? `${selectedDateOption.label} ${selectedDateOption.subtitle}`.trim()
    : '선택';
  const selectedSlot = slotOptions.find((slot) => slot.startsAt === selectedSlotStartAt) ?? null;
  const timeValueLabel = selectedSlot?.label ?? '선택';
  const distanceValueLabel = `${distanceKm}km`;

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
          <ValueTile label="날짜" value={dateValueLabel} active={activeTab === 'date'} onPress={handleSelectDateTab} />
          <ValueTile label="시간" value={timeValueLabel} active={activeTab === 'time'} onPress={handleSelectTimeTab} />
          <ValueTile label="거리" value={distanceValueLabel} active={activeTab === 'distance'} onPress={handleSelectDistanceTab} />
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
