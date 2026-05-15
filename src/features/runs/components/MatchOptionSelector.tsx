import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { beginRgInputTrace } from '@/utils/rgInputTrace';

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
    gap: 10,
  },
  option: {
    width: '48%',
    gap: 4,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIdle: {
    borderColor: '#374151',
    backgroundColor: '#111827',
  },
  optionSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#1E1B4B',
  },
  optionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  optionTitleSelected: {
    color: '#FFFFFF',
  },
});
