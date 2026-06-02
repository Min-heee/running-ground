import { StyleSheet, Text, View } from 'react-native';

import { colors, fontWeights, spacing } from '@/theme/tokens';

type RunRouteMapPlaceholderProps = {
  emptyTitle: string;
  emptyText: string;
};

export function RunRouteMapPlaceholder({ emptyTitle, emptyText }: RunRouteMapPlaceholderProps) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{emptyTitle}</Text>
      <Text style={styles.emptyText}>{emptyText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s24,
    gap: spacing.xxl,
    backgroundColor: colors.borderMuted,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
    textAlign: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
