import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SegmentSwitch } from '@/components/ui/SegmentSwitch';
import { TourTarget } from '@/features/tour/TourTarget';
import {
  buildMatchOptionSegments,
  resolveActiveMatchOptionSegment,
  resolveSegmentSelection,
  shouldRenderMatchOptionCards,
} from '@/features/runs/components/matchOptionSegments';
import { matchPickerCardStyles } from '@/features/runs/components/matchPickerCardStyles';
import { beginRgInputTrace } from '@/utils/rgInputTrace';
import { spacing } from '@/theme/tokens';

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

  const segmentItems = useMemo(
    () => segments.map((segment) => ({ id: segment.id, label: segment.label })),
    [segments],
  );

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
      <TourTarget id="running-modes">
        <SegmentSwitch
          items={segmentItems}
          activeId={activeSegment?.id ?? ''}
          onSelect={handleSelectSegment}
        />
      </TourTarget>
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
});
