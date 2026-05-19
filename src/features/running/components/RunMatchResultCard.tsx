import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import type { RunDetailResponse } from '@/lib/api/types';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type RunRecord = RunDetailResponse['run'];
type MatchResult = NonNullable<RunRecord['matchResult']>;

type RunMatchResultCardProps = {
  matchResult: MatchResult;
  matchBonusPoints: number;
};

export function RunMatchResultCard({ matchResult, matchBonusPoints }: RunMatchResultCardProps) {
  return (
    <Card style={styles.matchResultCard}>
      <View style={styles.matchResultHeader}>
        <View>
          <Text style={styles.matchResultLabel}>
            {matchResult.mode === 'duel' ? '1대1 대결 결과' : '그룹 대결 결과'}
          </Text>
          <Text style={styles.matchResultTitle}>{matchResult.title}</Text>
        </View>
        <View
          style={[
            styles.matchResultBadge,
            matchResult.resultTone === 'win'
              ? styles.matchResultBadgeWin
              : matchResult.resultTone === 'lose'
                ? styles.matchResultBadgeLose
                : matchResult.resultTone === 'draw'
                  ? styles.matchResultBadgeDraw
                  : null,
          ]}
        >
          <Text style={styles.matchResultBadgeText}>{matchResult.badgeLabel}</Text>
        </View>
      </View>
      <Text style={styles.matchResultSummary}>{matchResult.summary}</Text>
      <View style={styles.matchResultPointPill}>
        <Text style={styles.matchResultPointPillText}>매치 포인트 +{matchBonusPoints}P</Text>
      </View>
      <View style={styles.matchResultMetaRow}>
        {matchResult.opponentName ? (
          <Text style={styles.matchResultMeta}>상대 {matchResult.opponentName}</Text>
        ) : null}
        {typeof matchResult.rank === 'number' && typeof matchResult.participantCount === 'number' ? (
          <Text style={styles.matchResultMeta}>
            {matchResult.participantCount}명 중 {matchResult.rank}위
          </Text>
        ) : null}
        {typeof matchResult.gapKm === 'number' ? (
          <Text style={styles.matchResultMeta}>
            거리 차이 {matchResult.gapKm.toFixed(2)}km
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  matchResultCard: {
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.purpleSoft,
    gap: spacing.s10,
  },
  matchResultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.s12,
  },
  matchResultLabel: {
    color: colors.brand,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  matchResultTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    marginTop: spacing.sm,
  },
  matchResultBadge: {
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s10,
    backgroundColor: colors.textPrimary,
  },
  matchResultBadgeWin: {
    backgroundColor: colors.successGoogle,
  },
  matchResultBadgeLose: {
    backgroundColor: colors.orange,
  },
  matchResultBadgeDraw: {
    backgroundColor: colors.textNeutral,
  },
  matchResultBadgeText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  matchResultSummary: {
    color: colors.textStrongMuted,
    fontWeight: fontWeights.bold,
    lineHeight: 20,
  },
  matchResultPointPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
    borderRadius: radii.pill,
    backgroundColor: colors.brandWash,
  },
  matchResultPointPillText: {
    color: colors.brandDeep,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  matchResultMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxl,
  },
  matchResultMeta: {
    color: colors.textMuted,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
});
