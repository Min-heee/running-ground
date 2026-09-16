import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { ActivityRunRow } from '@/features/profile/components/ActivityRunRow';
import type { ActivityMonthGroup } from '@/features/profile/utils/activityMonthGroups';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

// 달 하나 = 머리글(맨바닥 한 줄) + 기록 흰 블록 하나. 카드 안에 카드 없음, 한 겹이 전부다.
// 화면의 히어로(큰 숫자)는 위의 기간 블록(ActivityPeriodBlock)이 맡으므로 (오너 2026-09-16,
// 홈의 내 러닝 기록을 여기로 옮기며) 달 머리글은 이번 달도 지난 달과 같은 한 줄이다 —
// 한 화면에 큰 숫자는 하나여야 한다.

export const ActivityMonthSection = memo(function ActivityMonthSection({
  group,
}: {
  group: ActivityMonthGroup;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{group.label}</Text>
        <Text style={styles.meta}>{group.metaLine}</Text>
      </View>

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
  section: {
    gap: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  meta: {
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
