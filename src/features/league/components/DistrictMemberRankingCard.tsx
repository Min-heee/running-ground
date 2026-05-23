import { memo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { Card } from '@/components/Card';
import { RankingItemRow } from '@/components/ranking/RankingItemRow';
import { RankMarker } from '@/features/league/components/LeagueRankBadges';
import type { DistrictPersonalResponse } from '@/lib/api/types';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';
import { formatDistanceKm, formatPoints } from '@/utils/formatUnits';

type DistrictMemberRankingCardProps = {
  regionMembers: DistrictPersonalResponse;
  onCardLayout: (event: LayoutChangeEvent) => void;
  onMyRankLayout: (event: LayoutChangeEvent) => void;
  onScrollToMyRank: () => void;
};

type DistrictMemberRank = DistrictPersonalResponse['ranks'][number];

const DistrictMemberRankRow = memo(function DistrictMemberRankRow({
  runner,
  onMyRankLayout,
}: {
  runner: DistrictMemberRank;
  onMyRankLayout: (event: LayoutChangeEvent) => void;
}) {
  return (
    <RankingItemRow
      leading={<RankMarker rank={runner.rank} />}
      name={runner.name}
      detail={`${formatDistanceKm(runner.distanceKm)} / ${formatPoints(runner.points)}`}
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
  return (
    <Card onLayout={onCardLayout}>
      <View style={styles.memberHeader}>
        <View style={styles.memberHeaderCopy}>
          <Text style={styles.sectionTitle}>{regionMembers.districtName} 회원 순위</Text>
          <Text style={styles.memberHeaderText}>해당 지역 회원들이 이번 주에 달린 거리와 포인트 순으로 정렬돼 있어.</Text>
        </View>

        {regionMembers.myRank ? (
          <Pressable style={styles.myRankButton} onPress={onScrollToMyRank}>
            <Text style={styles.myRankButtonText}>내 순위 보기</Text>
          </Pressable>
        ) : null}
      </View>

      {regionMembers.myRank ? (
        <View style={styles.myRankSummary}>
          <Text style={styles.myRankSummaryText}>내 현재 순위 {regionMembers.myRank.rank}위</Text>
          <Text style={styles.myRankSummaryText}>
            {formatDistanceKm(regionMembers.myRank.distanceKm)} · {formatPoints(regionMembers.myRank.points)}
          </Text>
        </View>
      ) : null}

      {regionMembers.ranks.map((runner) => (
        <DistrictMemberRankRow
          key={runner.id}
          runner={runner}
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
