import { Pressable, StyleSheet, Text, View } from 'react-native';

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

export function MatchOptionSelector({
  options,
  selectedMode,
  onSelect,
}: MatchOptionSelectorProps) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const isSelected = option.mode === selectedMode;

        return (
          <Pressable
            key={option.mode}
            style={[styles.option, isSelected ? styles.optionSelected : styles.optionIdle]}
            onPress={() => onSelect(option)}
          >
            <Text style={[styles.optionTitle, isSelected ? styles.optionTitleSelected : undefined]}>
              {option.title}
            </Text>
          </Pressable>
        );
      })}
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
