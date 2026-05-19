import { PropsWithChildren } from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors } from '@/theme/tokens';

export function SectionTitle({ children }: PropsWithChildren) {
  return <Text style={styles.title}>{children}</Text>;
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
});
