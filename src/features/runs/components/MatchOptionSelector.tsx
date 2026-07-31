import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  buildMatchOptionSegments,
  resolveActiveMatchOptionSegment,
  resolveSegmentSelection,
} from '@/features/runs/components/matchOptionSegments';
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
  isWide,
  onSelect,
  option,
  selectedMode,
}: {
  isSelected: boolean;
  isWide: boolean;
  onSelect: (option: MatchOptionItem) => void;
  option: MatchOptionItem;
  selectedMode: MatchOptionMode;
}) {
  const optionStyle = useMemo(() => [
    styles.option,
    isWide ? styles.optionWide : styles.optionHalf,
    isSelected ? styles.optionSelected : styles.optionIdle,
  ], [isSelected, isWide]);
  const titleStyle = useMemo(() => [
    styles.optionTitle,
    isSelected ? styles.optionTitleSelected : undefined,
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
      <Text style={titleStyle}>{option.title}</Text>
      {option.pickerSummary ? (
        <Text style={isSelected ? styles.optionSummarySelected : styles.optionSummary} numberOfLines={2}>
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

  const optionButtons = useMemo(() => (activeSegment?.options ?? []).map((option) => (
    <MatchOptionButton
      key={option.mode}
      isSelected={option.mode === selectedMode}
      isWide={(activeSegment?.options.length ?? 0) === 1}
      onSelect={onSelect}
      option={option}
      selectedMode={selectedMode}
    />
  )), [activeSegment, onSelect, selectedMode]);

  return (
    <View style={styles.container}>
      <View style={styles.segmentRow} accessibilityRole="tablist">
        {segmentTabs}
      </View>
      <View style={styles.row}>
        {optionButtons}
      </View>
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
    backgroundColor: fixedColors.textPrimary,
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
    backgroundColor: colors.indigoInk,
  },
  segmentLabel: {
    color: colors.textTertiary,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.bold,
  },
  segmentLabelActive: {
    color: colors.white,
    fontWeight: fontWeights.extraBold,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.s10,
  },
  option: {
    gap: spacing.xxs,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s14,
    // 묶음당 카드가 1~2개뿐이라 예전 높이(68)로는 상단이 얇게 뜬다.
    minHeight: 84,
    justifyContent: 'center',
  },
  optionHalf: {
    width: '48%',
  },
  optionWide: {
    width: '100%',
  },
  optionIdle: {
    borderColor: colors.darkSoft,
    backgroundColor: fixedColors.textPrimary,
  },
  optionSelected: {
    borderColor: colors.brandLight,
    backgroundColor: colors.indigoInk,
  },
  optionTitle: {
    color: colors.white,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  optionTitleSelected: {
    color: colors.white,
  },
  optionSummary: {
    color: colors.textTertiary,
    fontSize: fontSizes.sm,
  },
  optionSummarySelected: {
    color: colors.brandLighter,
    fontSize: fontSizes.sm,
  },
});
