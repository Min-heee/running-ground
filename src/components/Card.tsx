import { PropsWithChildren } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';

import { colors, radii, spacing } from '@/theme/tokens';

export function Card({ children, style, ...rest }: PropsWithChildren<{ style?: StyleProp<ViewStyle> } & ViewProps>) {
  return <View style={[styles.card, style]} {...rest}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.s16,
    gap: spacing.xxl,
    // Split shadow vs elevation per platform — RN applies elevation on Android
    // even when shadow* are set, paying overdraw cost twice. Cards appear on
    // every screen, so this lands across the whole app.
    ...Platform.select({
      ios: {
        shadowColor: colors.black,
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 2,
      },
    }),
  },
});
