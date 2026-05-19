import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { beginRgInputTrace } from '@/utils/rgInputTrace';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export type MatchOptionMode = 'solo' | 'duel' | 'group' | 'room';

export type MatchOptionItem = {
  mode: MatchOptionMode;
  title: string;
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
    styles.option,
    isSelected ? styles.optionSelected : styles.optionIdle,
  ], [isSelected]);
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
    >
      <Text style={titleStyle}>{option.title}</Text>
    </Pressable>
  );
});

export function MatchOptionSelector({
  options,
  selectedMode,
  onSelect,
}: MatchOptionSelectorProps) {
  const optionButtons = useMemo(() => options.map((option) => (
    <MatchOptionButton
      key={option.mode}
      isSelected={option.mode === selectedMode}
      onSelect={onSelect}
      option={option}
      selectedMode={selectedMode}
    />
  )), [onSelect, options, selectedMode]);

  return (
    <View style={styles.row}>
      {optionButtons}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.s10,
  },
  option: {
    width: '48%',
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s12,
    minHeight: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIdle: {
    borderColor: colors.darkSoft,
    backgroundColor: colors.textPrimary,
  },
  optionSelected: {
    borderColor: colors.brandLight,
    backgroundColor: colors.indigoInk,
  },
  optionTitle: {
    color: colors.white,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
    textAlign: 'center',
  },
  optionTitleSelected: {
    color: colors.white,
  },
});
