import type { ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

type RankingItemRowProps = {
  leading: ReactNode;
  name: string;
  detail: string;
  friendLabel?: string;
  highlighted?: boolean;
  friend?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
};

export function RankingItemRow({
  leading,
  name,
  detail,
  friendLabel,
  highlighted = false,
  friend = false,
  onLayout,
}: RankingItemRowProps) {
  return (
    <View
      style={[styles.row, friend && styles.friendRow, highlighted && styles.highlightedRow]}
      onLayout={onLayout}
    >
      {leading}
      <View style={styles.meta}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{name}</Text>
          {friendLabel ? (
            <View style={styles.friendBadge}>
              <Text style={styles.friendBadgeText}>{friendLabel}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.detail}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.s12,
    alignItems: 'center',
    paddingVertical: spacing.s12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  highlightedRow: {
    backgroundColor: colors.purpleRow,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.s10,
  },
  friendRow: {
    backgroundColor: colors.successCard,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.s10,
  },
  meta: {
    flex: 1,
    gap: spacing.xxs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxl,
  },
  name: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  friendBadge: {
    backgroundColor: colors.success,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.sm,
  },
  friendBadgeText: {
    color: colors.white,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.extraBold,
  },
  detail: {
    color: colors.textSecondary,
  },
});
