import { memo } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';
import { formatDistanceValue } from '@/utils/formatUnits';

// 홈 '이번 주' 카드 (오너 2026-09-16: 내 러닝 기록이 기록 탭으로 간 뒤 "홈이 너무 허하다" →
// 시연 세 장 중 ③ 선택). 그래프 없이 숫자 세 칸 — 거리 · 러닝 · 주 목표 달성률. 자세한 건
// 오른쪽 '기록 ›'가 기록 탭으로 보낸다. 카드 결은 옆의 포인트 게이지·랭크 카드와 같다
// (회색 작은 제목 + 오른쪽 링크, 흰 카드) — 오너가 "현재 홈이랑 너무 벗어나지 말라"고 했다.

// 서버가 weeklyGoalKm를 안 보내는 구버전 응답의 폴백 — 서버 상수(homeBuilders WEEKLY_GOAL_KM)와 같다.
const DEFAULT_WEEKLY_GOAL_KM = 50;

type HomeWeeklyStatusCardProps = {
  totalDistanceKm: number;
  totalRuns: number;
  goalAchievementRate: number;
  weeklyGoalKm?: number;
};

function clampPercent(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

function HomeWeeklyStatusCardImpl({
  totalDistanceKm,
  totalRuns,
  goalAchievementRate,
  weeklyGoalKm,
}: HomeWeeklyStatusCardProps) {
  const goalKm = typeof weeklyGoalKm === 'number' && Number.isFinite(weeklyGoalKm) && weeklyGoalKm > 0
    ? weeklyGoalKm
    : DEFAULT_WEEKLY_GOAL_KM;
  const distanceKm = Number.isFinite(totalDistanceKm) && totalDistanceKm > 0 ? totalDistanceKm : 0;
  const runCount = Number.isFinite(totalRuns) && totalRuns > 0 ? Math.round(totalRuns) : 0;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>이번 주</Text>
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
            {formatDistanceValue(distanceKm)}
            <Text style={styles.metricUnit}>km</Text>
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>러닝</Text>
          <Text style={styles.metricValue}>
            {runCount}
            <Text style={styles.metricUnit}>회</Text>
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>{`목표 ${goalKm}km`}</Text>
          <Text style={styles.metricValue}>
            {clampPercent(goalAchievementRate)}
            <Text style={styles.metricUnit}>%</Text>
          </Text>
        </View>
      </View>
    </Card>
  );
}

export const HomeWeeklyStatusCard = memo(HomeWeeklyStatusCardImpl);

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
