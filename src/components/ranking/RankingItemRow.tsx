import type { ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type RankingItemRowProps = {
  leading: ReactNode;
  name: string;
  detail: string;
  // 월간 랭킹 우승 별 개수 — 이름 옆 금색 별 (3개까지 낱개, 그 이상은 ★N).
  stars?: number;
  friendLabel?: string;
  highlighted?: boolean;
  friend?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
  // 있으면 행이 탭 가능해진다 (사람 탭 → 프로필/친구신청 분기).
  onPress?: () => void;
};

export function RankingItemRow({
  leading,
  name,
  detail,
  stars = 0,
  friendLabel,
  highlighted = false,
  friend = false,
  onLayout,
  onPress,
}: RankingItemRowProps) {
  const rowStyle = [styles.row, friend && styles.friendRow, highlighted && styles.highlightedRow];
  const content = (
    <>
      {leading}
      <View style={styles.meta}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{name}</Text>
          {stars > 0 ? (
            <Text style={styles.stars}>{stars <= 3 ? '★'.repeat(stars) : `★${stars}`}</Text>
          ) : null}
          {friendLabel ? (
            <View style={styles.friendBadge}>
              <Text style={styles.friendBadgeText}>{friendLabel}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.detail}>{detail}</Text>
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [...rowStyle, pressed && styles.pressedRow]}
        onLayout={onLayout}
        onPress={onPress}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={rowStyle} onLayout={onLayout}>
      {content}
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
  pressedRow: {
    opacity: 0.65,
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
  stars: {
    color: colors.podiumGold,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
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
