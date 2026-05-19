import { PropsWithChildren } from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors, fontSizes, fontWeights } from '@/theme/tokens';

export function SectionTitle({ children }: PropsWithChildren) {
  return <Text style={styles.title}>{children}</Text>;
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
});
