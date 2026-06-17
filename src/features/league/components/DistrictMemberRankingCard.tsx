import { memo, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { Card } from '@/components/Card';
import { RankingItemRow } from '@/components/ranking/RankingItemRow';
import { DistrictMetricSwitch } from '@/features/league/components/DistrictMetricSwitch';
import { RankMarker } from '@/features/league/components/LeagueRankBadges';
import { sortDistrictRanksByMetric } from '@/features/league/utils/leagueRanking';
import type { DistrictPersonalMetric } from '@/domain';
import type { DistrictPersonalResponse } from '@/lib/api/types';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';
import { formatDistanceKm, formatRankScore } from '@/utils/formatUnits';

type DistrictMemberRankingCardProps = {
  regionMembers: DistrictPersonalResponse;
  onCardLayout: (event: LayoutChangeEvent) => void;
  onMyRankLayout: (event: LayoutChangeEvent) => void;
  onScrollToMyRank: () => void;
};

type DistrictMemberRank = DistrictPersonalResponse['ranks'][number];

const DEFAULT_METRIC: DistrictPersonalMetric = 'rankScore';

const METRIC_DESCRIPTION: Record<DistrictPersonalMetric, string> = {
  rankScore: '해당 지역 회원들을 랭크 점수가 높은 순으로 정렬했어.',
  monthlyDistance: '해당 지역 회원들을 이번 달 누적 거리가 많은 순으로 정렬했어.',
};

function formatMetricValue(runner: DistrictMemberRank, metric: DistrictPersonalMetric) {
  return metric === 'monthlyDistance'
    ? formatDistanceKm(runner.monthlyDistanceKm)
    : formatRankScore(runner.rankScore);
}

const DistrictMemberRankRow = memo(function DistrictMemberRankRow({
  runner,
  metric,
  onMyRankLayout,
}: {
  runner: DistrictMemberRank;
  metric: DistrictPersonalMetric;
  onMyRankLayout: (event: LayoutChangeEvent) => void;
}) {
  return (
    <RankingItemRow
      leading={<RankMarker rank={runner.rank} />}
      name={runner.name}
      detail={formatMetricValue(runner, metric)}
      friendLabel={runner.isFriend && !runner.isMe ? '친구' : undefined}
      friend={runner.isFriend}
      highlighted={runner.isMe}
      onLayout={runner.isMe ? onMyRankLayout : undefined}
    />
  );
});

export const DistrictMemberRankingCard = memo(function DistrictMemberRankingCard({
  regionMembers,
  onCardLayout,
  onMyRankLayout,
  onScrollToMyRank,
}: DistrictMemberRankingCardProps) {
  const [metric, setMetric] = useState<DistrictPersonalMetric>(DEFAULT_METRIC);

  const sortedRanks = useMemo(
    () => sortDistrictRanksByMetric(regionMembers.ranks, metric),
    [regionMembers.ranks, metric],
  );
  const myRank = useMemo(
    () => sortedRanks.find((runner) => runner.isMe) ?? null,
    [sortedRanks],
  );

  return (
    <Card onLayout={onCardLayout}>
      <View style={styles.memberHeader}>
        <View style={styles.memberHeaderCopy}>
          <Text style={styles.sectionTitle}>{regionMembers.districtName} 회원 순위</Text>
          <Text style={styles.memberHeaderText}>{METRIC_DESCRIPTION[metric]}</Text>
        </View>

        {myRank ? (
          <Pressable style={styles.myRankButton} onPress={onScrollToMyRank}>
            <Text style={styles.myRankButtonText}>내 순위 보기</Text>
          </Pressable>
        ) : null}
      </View>

      <DistrictMetricSwitch metric={metric} onChange={setMetric} />

      {myRank ? (
        <View style={styles.myRankSummary}>
          <Text style={styles.myRankSummaryText}>내 현재 순위 {myRank.rank}위</Text>
          <Text style={styles.myRankSummaryText}>{formatMetricValue(myRank, metric)}</Text>
        </View>
      ) : null}

      {sortedRanks.map((runner) => (
        <DistrictMemberRankRow
          key={runner.id}
          runner={runner}
          metric={metric}
          onMyRankLayout={onMyRankLayout}
        />
      ))}
    </Card>
  );
});

const styles = StyleSheet.create({
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  memberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.s12,
  },
  memberHeaderCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  memberHeaderText: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  myRankButton: {
    backgroundColor: colors.dark,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s10,
  },
  myRankButtonText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  myRankSummary: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radii.md,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.s10,
  },
  myRankSummaryText: {
    color: colors.textStrongMuted,
    fontWeight: fontWeights.bold,
  },
});
