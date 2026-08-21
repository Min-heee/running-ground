import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

export function TabHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerCopy}>
        <Text style={styles.headerBrand}>RunningSpace</Text>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      {right ? <View style={styles.headerActions}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
  headerCopy: {
    gap: spacing.sm,
  },
  headerBrand: {
    color: colors.brand,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 0.4,
  },
  headerTitle: {
    color: colors.textHeading,
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.extraBold,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
