import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  buildMatchOptionSegments,
  resolveActiveMatchOptionSegment,
  resolveSegmentSelection,
  shouldRenderMatchOptionCards,
} from '@/features/runs/components/matchOptionSegments';
import { matchPickerCardStyles } from '@/features/runs/components/matchPickerCardStyles';
import { beginRgInputTrace } from '@/utils/rgInputTrace';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export type MatchOptionMode = 'solo' | 'duel' | 'group' | 'room' | 'chase';

export type MatchOptionItem = {
  mode: MatchOptionMode;
  title: string;
  // 선택 카드에 붙는 한 줄 설명. 모드 상세 문구(summary)는 문장이라 카드에 넣기엔 길다.
  pickerSummary?: string;
};

type MatchOptionSelectorProps = {
  options: MatchOptionItem[];
  selectedMode: MatchOptionMode;
  onSelect: (option: MatchOptionItem) => void;
};

const SegmentTab = memo(function SegmentTab({
  isActive,
  label,
  onPress,
  segmentId,
}: {
  isActive: boolean;
  label: string;
  onPress: (segmentId: string) => void;
  segmentId: string;
}) {
  const tabStyle = useMemo(() => [
    styles.segmentTab,
    isActive ? styles.segmentTabActive : undefined,
  ], [isActive]);
  const labelStyle = useMemo(() => [
    styles.segmentLabel,
    isActive ? styles.segmentLabelActive : undefined,
  ], [isActive]);
  const handlePress = useCallback(() => onPress(segmentId), [onPress, segmentId]);

  return (
    <Pressable style={tabStyle} onPress={handlePress} accessibilityRole="tab" accessibilityState={{ selected: isActive }}>
      <Text style={labelStyle}>{label}</Text>
    </Pressable>
  );
});

const MatchOptionButton = memo(function MatchOptionButton({
  isSelected,
  onSelect,
  option,
  selectedMode,
}: {
  isSelected: boolean;
  onSelect: (option: MatchOptionItem) => void;
  option: MatchOptionItem;
  selectedMode: MatchOptionMode;
}) {
  const optionStyle = useMemo(() => [
    matchPickerCardStyles.card,
    isSelected ? matchPickerCardStyles.cardSelected : matchPickerCardStyles.cardIdle,
  ], [isSelected]);
  const handlePress = useCallback(() => {
    const trace = beginRgInputTrace('run mode select', {
      mode: option.mode,
      selectedMode,
    });
    onSelect(option);
    trace.markFeedback('mode state dispatch');
  }, [onSelect, option, selectedMode]);

  return (
    <Pressable
      style={optionStyle}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
    >
      <Text style={matchPickerCardStyles.cardTitle}>{option.title}</Text>
      {option.pickerSummary ? (
        <Text
          style={isSelected ? matchPickerCardStyles.cardSummarySelected : matchPickerCardStyles.cardSummary}
          numberOfLines={2}
        >
          {option.pickerSummary}
        </Text>
      ) : null}
    </Pressable>
  );
});

export function MatchOptionSelector({
  options,
  selectedMode,
  onSelect,
}: MatchOptionSelectorProps) {
  const segments = useMemo(() => buildMatchOptionSegments(options), [options]);
  const activeSegment = useMemo(
    () => resolveActiveMatchOptionSegment(segments, selectedMode),
    [segments, selectedMode],
  );

  // 묶음을 누르면 그 묶음의 첫 모드를 고른다 — 탭만 눌러 놓고 아래 설정은 그대로인 상태가
  // 생기지 않게. 이미 그 묶음 안이면 아무것도 바꾸지 않는다.
  const handleSelectSegment = useCallback((segmentId: string) => {
    const nextOption = resolveSegmentSelection(segments, segmentId, selectedMode);

    if (nextOption) {
      onSelect(nextOption);
    }
  }, [onSelect, segments, selectedMode]);

  const segmentTabs = useMemo(() => segments.map((segment) => (
    <SegmentTab
      key={segment.id}
      isActive={segment.id === activeSegment?.id}
      label={segment.label}
      onPress={handleSelectSegment}
      segmentId={segment.id}
    />
  )), [activeSegment?.id, handleSelectSegment, segments]);

  const optionButtons = useMemo(() => (shouldRenderMatchOptionCards(activeSegment)
    ? (activeSegment?.options ?? []).map((option) => (
      <MatchOptionButton
        key={option.mode}
        isSelected={option.mode === selectedMode}
        onSelect={onSelect}
        option={option}
        selectedMode={selectedMode}
      />
    ))
    : []), [activeSegment, onSelect, selectedMode]);

  return (
    <View style={styles.container}>
      <View style={styles.segmentRow} accessibilityRole="tablist">
        {segmentTabs}
      </View>
      {optionButtons.length ? (
        <View style={matchPickerCardStyles.row}>
          {optionButtons}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.s12,
  },
  segmentRow: {
    flexDirection: 'row',
    padding: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(142, 123, 255, 0.35)',
    backgroundColor: 'rgba(109, 94, 247, 0.10)',
  },
  segmentTab: {
    flex: 1,
    paddingVertical: spacing.s10,
    // 바깥 라운드(18) - 인셋(4) = 14. 안쪽 모서리가 바깥과 어긋나 보이지 않게.
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentTabActive: {
    backgroundColor: fixedColors.brand,
  },
  segmentLabel: {
    color: colors.brandMuted,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.bold,
  },
  segmentLabelActive: {
    color: fixedColors.white,
    fontWeight: fontWeights.extraBold,
  },
});
