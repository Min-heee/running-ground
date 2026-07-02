import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { STEP_ORDER } from './welcomeTourData';
import { colors, spacing, radii } from '@/theme/tokens';

export const StepDots = memo(function StepDots({ activeIndex }: { activeIndex: number }) {
  return (
    <View style={styles.dots} accessibilityLabel={`${activeIndex + 1} / ${STEP_ORDER.length}`}>
      {STEP_ORDER.map((step, index) => (
        <View key={step} style={index === activeIndex ? styles.dotActive : styles.dot} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  dots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  dot: {
    backgroundColor: colors.slateSoft,
    borderRadius: radii.pill,
    height: 8,
    width: 8,
  },
  dotActive: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    height: 8,
    width: 26,
  },
});
