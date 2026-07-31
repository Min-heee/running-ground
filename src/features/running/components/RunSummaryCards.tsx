// 기록 상세 히어로 (오너 2026-08-01: 나이키식 '탁 트인' 상세 — 카드 상자 없이 맨바닥에
// 날짜 + 초대형 거리). 어두운 히어로 카드였던 이전 모습은 답답하다는 피드백으로 걷어냈다.

import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type RunHeroCardProps = {
  startedLabel: string;
  distanceKm: number;
};

export function RunHeroCard({ startedLabel, distanceKm }: RunHeroCardProps) {
  return (
    <View style={styles.hero}>
      <Text style={styles.heroDate}>{startedLabel}</Text>
      <Text style={styles.heroDistance}>
        {distanceKm}
        <Text style={styles.heroUnit}>km</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: spacing.xs,
  },
  heroDate: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  heroDistance: {
    color: colors.textPrimary,
    fontSize: fontSizes.heroXL,
    fontWeight: fontWeights.black,
    // 초대형 숫자는 기본 lineHeight가 위아래 여백을 크게 남긴다 — 딱 붙인다.
    lineHeight: fontSizes.heroXL + 6,
  },
  heroUnit: {
    color: colors.textSecondary,
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.extraBold,
  },
});
