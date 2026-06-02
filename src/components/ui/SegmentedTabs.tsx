import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export type SegmentedTabOption<T extends string> = {
  key: T;
  label: string;
};

type SegmentedTabsProps<T extends string> = {
  options: readonly SegmentedTabOption<T>[];
  value: T;
  onChange: (key: T) => void;
};

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
}: SegmentedTabsProps<T>) {
  return (
    <View style={styles.segmentedTabs}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.key)}
            style={[
              styles.segmentedTab,
              selected ? styles.segmentedTabActive : styles.segmentedTabIdle,
            ]}
          >
            <Text
              style={[
                styles.segmentedTabText,
                selected ? styles.segmentedTabTextActive : styles.segmentedTabTextIdle,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segmentedTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  segmentedTab: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s10,
  },
  segmentedTabActive: {
    backgroundColor: colors.brand,
  },
  segmentedTabIdle: {
    backgroundColor: colors.surfaceSubtle,
  },
  segmentedTabText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  segmentedTabTextActive: {
    color: colors.white,
  },
  segmentedTabTextIdle: {
    color: colors.textSecondary,
  },
});
