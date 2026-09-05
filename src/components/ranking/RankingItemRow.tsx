import type { ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type RankingItemRowProps = {
  leading: ReactNode;
  name: string;
  detail: string;
  // 월간 랭킹 우승 별 개수 — 이름 옆 금색 별 (3개까지 낱개, 그 이상은 ★N).
  stars?: number;
  // 주 연속 러닝 (오너 2026-09-05: 별 있던 자리에 남들도 보게) — 2주 미만이면 생략/미표시.
  weeklyStreakWeeks?: number;
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
  weeklyStreakWeeks = 0,
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
          {/* 긴 닉네임은 이름만 줄임 — 별/주연속/친구 뱃지가 행 밖으로 밀리지 않게. */}
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {stars > 0 ? (
            <Text style={styles.stars}>{stars <= 3 ? '★'.repeat(stars) : `★${stars}`}</Text>
          ) : null}
          {weeklyStreakWeeks >= 2 ? (
            <View style={styles.weeklyStreakPill}>
              <Text style={styles.weeklyStreakPillText}>{weeklyStreakWeeks}주 연속</Text>
            </View>
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
    // RN 기본 flexShrink:0이면 이름이 절대 안 줄어 뒤따르는 뱃지들이 행을 넘친다.
    flexShrink: 1,
  },
  stars: {
    color: colors.podiumGold,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  // 고정 워시 배경 + 고정 딥 텍스트 — 홈 주 연속 뱃지와 같은 테마 불변 페어링.
  weeklyStreakPill: {
    backgroundColor: fixedColors.brandWashStrong,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.sm,
  },
  weeklyStreakPillText: {
    color: fixedColors.brandDeep,
    fontSize: fontSizes.xxs,
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
