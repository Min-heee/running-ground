import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { ActivityRunRow } from '@/features/profile/components/ActivityRunRow';
import type { ActivityMonthGroup } from '@/features/profile/utils/activityMonthGroups';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';
import { formatDistanceValue } from '@/utils/formatUnits';

// 달 하나 = 머리글(맨바닥) + 기록 흰 블록 하나. 카드 안에 카드 없음, 한 겹이 전부다.
// 이번 달만 히어로 크기로 서고 지난 달은 한 줄로 접힌다 — 위계를 색이 아니라 높이로 낸다.

export const ActivityMonthSection = memo(function ActivityMonthSection({
  group,
}: {
  group: ActivityMonthGroup;
}) {
  return (
    <View style={group.isCurrentMonth ? styles.currentSection : styles.pastSection}>
      {group.isCurrentMonth ? (
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>{group.label}</Text>
          <Text style={styles.heroValue}>
            {formatDistanceValue(group.distanceKm)}
            <Text style={styles.heroUnit}>km</Text>
          </Text>
          <Text style={styles.heroMeta}>{group.metaLine}</Text>
        </View>
      ) : (
        <View style={styles.pastHeader}>
          <Text style={styles.pastTitle}>{group.label}</Text>
          <Text style={styles.pastMeta}>{group.metaLine}</Text>
        </View>
      )}

      {group.runs.length > 0 ? (
        <Card style={styles.monthCard}>
          {group.runs.map((run, index) => (
            <ActivityRunRow key={run.id} run={run} isFirst={index === 0} />
          ))}
        </Card>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  currentSection: {
    gap: spacing.s12,
  },
  pastSection: {
    gap: spacing.xxl,
  },
  hero: {
    gap: spacing.xs,
  },
  heroLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
  },
  heroValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.heroLarge,
    fontWeight: fontWeights.black,
    lineHeight: fontSizes.heroLarge + 6,
    includeFontPadding: false,
  },
  heroUnit: {
    color: colors.textSecondary,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.extraBold,
  },
  heroMeta: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
  pastHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  pastTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  pastMeta: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
  // 행 눌림 배경이 카드 라운드를 넘어 각지게 삐져나오지 않도록 잘라낸다.
  monthCard: {
    padding: 0,
    gap: 0,
    overflow: 'hidden',
  },
});
