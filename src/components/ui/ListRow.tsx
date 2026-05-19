import { Text, StyleSheet } from 'react-native';

import { colors, spacing, fontWeights } from '@/theme/tokens';

export function ListRow({ children }: { children: string }) {
  return <Text style={styles.row}>{children}</Text>;
}

const styles = StyleSheet.create({
  row: {
    color: colors.textStrongMuted,
    paddingVertical: spacing.xxl,
    fontWeight: fontWeights.semibold,
  },
});
