import { memo, useCallback, useMemo, useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import type { MyRunRecord } from '@/domain';
import { selectRecentRuns } from '@/features/home/utils/homeRecentRuns';
import { getRunSourceLabel } from '@/features/runs/utils/sourceLabel';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type HomeActivityStatusCardProps = {
  totalDistanceKm: number;
  totalRuns: number;
  streakDays: number;
  runs: MyRunRecord[];
};

const HomeActivityRunRow = memo(function HomeActivityRunRow({ run }: { run: MyRunRecord }) {
  return (
    <Link href={{ pathname: '/run-detail', params: { runId: run.id } }} asChild>
      <Pressable style={styles.recordRow}>
        <View style={styles.recordMeta}>
          <Text style={styles.recordDate}>{run.date}</Text>
          <Text style={styles.recordDetail}>
            {run.distanceKm}km · 페이스 {run.pace} · {getRunSourceLabel(run)}
          </Text>
        </View>
        <Text style={styles.recordLink}>보기</Text>
      </Pressable>
    </Link>
  );
});

function HomeActivityStatusCardImpl({
  totalDistanceKm,
  totalRuns,
  streakDays,
  runs,
}: HomeActivityStatusCardProps) {
  const [expanded, setExpanded] = useState(false);
  const recentRuns = useMemo(() => selectRecentRuns(runs), [runs]);
  const recentRunRows = useMemo(() => recentRuns.map((run) => (
    <HomeActivityRunRow key={run.id} run={run} />
  )), [recentRuns]);
  const handleToggleExpanded = useCallback(() => {
    setExpanded((current) => !current);
  }, []);

  return (
    <Card style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={handleToggleExpanded}
        style={styles.summaryButton}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>ACTIVITY</Text>
            <Text style={styles.sectionTitle}>내 러닝 기록</Text>
          </View>
          <Text style={styles.toggleText}>{expanded ? '접기' : '자세히'}</Text>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.statusMetric}>
            <Text style={styles.statusLabel}>이번 주 거리</Text>
            <Text style={styles.statusValue}>{totalDistanceKm}km</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusMetric}>
            <Text style={styles.statusLabel}>러닝</Text>
            <Text style={styles.statusValue}>{totalRuns}회</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusMetric}>
            <Text style={styles.statusLabel}>연속</Text>
            <Text style={styles.statusValue}>{streakDays}일</Text>
          </View>
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.detailPanel}>
          {recentRuns.length > 0 ? (
            <View>{recentRunRows}</View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>아직 저장된 러닝 기록이 없어.</Text>
              <Text style={styles.emptyText}>혼자 뛰거나 앱을 연동하면 여기에 기록이 쌓여.</Text>
            </View>
          )}
          <Link href="/my-activity" asChild>
            <Pressable accessibilityRole="button" style={styles.fullLinkButton}>
              <Text style={styles.fullLinkText}>전체 보기</Text>
            </Pressable>
          </Link>
        </View>
      ) : null}
    </Card>
  );
}

export const HomeActivityStatusCard = memo(HomeActivityStatusCardImpl);

const styles = StyleSheet.create({
  card: {
    gap: spacing.s12,
  },
  summaryButton: {
    gap: spacing.s14,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.s12,
    justifyContent: 'space-between',
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  eyebrow: {
    color: colors.brand,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 0.6,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  toggleText: {
    color: colors.brand,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    paddingVertical: spacing.xs,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 0,
    paddingTop: spacing.xs,
  },
  statusMetric: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  statusLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  statusValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.extraBold,
  },
  statusDivider: {
    backgroundColor: colors.borderMuted,
    height: 32,
    width: 1,
  },
  detailPanel: {
    borderTopColor: colors.borderSoft,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.s12,
    paddingTop: spacing.s12,
  },
  recordRow: {
    alignItems: 'center',
    borderBottomColor: colors.borderSoft,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.s12,
    justifyContent: 'space-between',
    paddingVertical: spacing.s12,
  },
  recordMeta: {
    flex: 1,
    gap: spacing.xxs,
  },
  recordDate: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  recordDetail: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  recordLink: {
    color: colors.brand,
    fontWeight: fontWeights.extraBold,
  },
  emptyState: {
    gap: spacing.sm,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
  },
  emptyText: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  fullLinkButton: {
    alignItems: 'center',
    borderTopColor: colors.borderSoft,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.s12,
  },
  fullLinkText: {
    color: colors.brand,
    fontWeight: fontWeights.extraBold,
  },
});
