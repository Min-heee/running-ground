import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';

import { colors, radii, spacing } from '@/theme/tokens';

export function Card({ children, style, ...rest }: PropsWithChildren<{ style?: StyleProp<ViewStyle> } & ViewProps>) {
  return <View style={[styles.card, style]} {...rest}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.s16,
    shadowColor: colors.black,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    gap: spacing.xxl,
  },
});
