import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';

import { Card } from '@/components/Card';
import type { MyRunRecord } from '@/domain';
import { selectRecentRuns } from '@/features/home/utils/homeRecentRuns';
import { getRunSourceLabel } from '@/features/runs/utils/sourceLabel';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type HomeRecentRunsCardProps = {
  runs: MyRunRecord[];
};

const HomeRecentRunRow = memo(function HomeRecentRunRow({ run }: { run: MyRunRecord }) {
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

function HomeRecentRunsCardImpl({ runs }: HomeRecentRunsCardProps) {
  const recentRuns = useMemo(() => selectRecentRuns(runs), [runs]);
  const recentRunRows = useMemo(() => recentRuns.map((run) => (
    <HomeRecentRunRow key={run.id} run={run} />
  )), [recentRuns]);

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>ACTIVITY</Text>
          <Text style={styles.sectionTitle}>내 러닝 기록</Text>
        </View>
        <Link href="/my-activity" asChild>
          <Pressable accessibilityRole="button" style={styles.fullLinkButton}>
            <Text style={styles.fullLinkText}>전체 보기</Text>
          </Pressable>
        </Link>
      </View>

      {recentRuns.length > 0 ? (
        <View>{recentRunRows}</View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>아직 저장된 러닝 기록이 없어.</Text>
          <Text style={styles.emptyText}>혼자 뛰거나 앱을 연동하면 여기에 기록이 쌓여.</Text>
        </View>
      )}
    </Card>
  );
}

export const HomeRecentRunsCard = memo(HomeRecentRunsCardImpl);

const styles = StyleSheet.create({
  card: {
    gap: spacing.s12,
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
  fullLinkButton: {
    paddingVertical: spacing.xs,
  },
  fullLinkText: {
    color: colors.brand,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
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
    paddingTop: spacing.sm,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
  },
  emptyText: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
