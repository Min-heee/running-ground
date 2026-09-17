import { memo } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';
import { formatDistanceValue } from '@/utils/formatUnits';

// 홈 '이번 달' 카드 (오너 2026-09-19: "이번주 카드 이번 달로 바꿔줘"). 연속 러닝과 포인트 게이지
// 사이, 예전 '내 러닝 기록' 그래프가 있던 자리다. 그래프 없이 숫자 세 칸 — 거리 · 러닝 · 포인트.
// 주 단위 카드의 셋째 칸은 '주 목표 50km 달성률'이었는데 월 목표는 없어서, 이 달에 번 포인트로
// 바꿨다(바로 아래 포인트 게이지와 이어지고, 기록 탭에는 없는 숫자다). 자세한 건 '기록 ›'.
// 카드 결은 옆 카드들과 같다 — 오너가 "현재 홈이랑 너무 벗어나지 말라"고 했다.

type HomeMonthlyStatusCardProps = {
  distanceKm: number;
  runCount: number;
  points: number;
};

function HomeMonthlyStatusCardImpl({ distanceKm, runCount, points }: HomeMonthlyStatusCardProps) {
  const safeDistanceKm = Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 0;
  const safeRunCount = Number.isFinite(runCount) && runCount > 0 ? Math.round(runCount) : 0;
  const safePoints = Number.isFinite(points) && points > 0 ? Math.round(points) : 0;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>이번 달</Text>
        {/* 함수형 style 금지 — Link asChild는 자식 style을 배열로 병합해 함수를 삼킨다. */}
        <Link href="/(tabs)/records" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="기록 탭 열기"
            style={styles.linkGroup}
            hitSlop={8}
          >
            <Text style={styles.linkTitle}>기록</Text>
            <Text style={styles.linkChevron}>›</Text>
          </Pressable>
        </Link>
      </View>

      <View style={styles.metricRow}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>거리</Text>
          <Text style={styles.metricValue}>
            {formatDistanceValue(safeDistanceKm)}
            <Text style={styles.metricUnit}>km</Text>
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>러닝</Text>
          <Text style={styles.metricValue}>
            {safeRunCount}
            <Text style={styles.metricUnit}>회</Text>
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>포인트</Text>
          <Text style={styles.metricValue}>
            {safePoints.toLocaleString('ko-KR')}
            <Text style={styles.metricUnit}>P</Text>
          </Text>
        </View>
      </View>
    </Card>
  );
}

export const HomeMonthlyStatusCard = memo(HomeMonthlyStatusCardImpl);

const styles = StyleSheet.create({
  card: {
    gap: spacing.s12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  eyebrow: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  linkGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  linkTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  linkChevron: {
    color: colors.textTertiary,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.extraBold,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.extraBold,
    includeFontPadding: false,
  },
  metricUnit: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: colors.borderMuted,
  },
});
