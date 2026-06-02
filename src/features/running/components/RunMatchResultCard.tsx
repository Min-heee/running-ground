import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';

import { Card } from '@/components/Card';
import { getEstimatedMatchLpDelta } from '@/features/runs/utils/matchScheduling';
import type { RunDetailResponse } from '@/lib/api/types';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type RunRecord = RunDetailResponse['run'];
type MatchResult = NonNullable<RunRecord['matchResult']>;

type RunMatchResultCardProps = {
  matchResult: MatchResult;
};

export function RunMatchResultCard({ matchResult }: RunMatchResultCardProps) {
  const lpDelta = getEstimatedMatchLpDelta(matchResult);
  const isLpGain = lpDelta > 0;
  const showLp = matchResult.source !== 'party' && lpDelta !== 0;
  const lpPillStyle = isLpGain ? matchResultLpGainPillStyle : matchResultLpLossPillStyle;
  const lpPillTextStyle = isLpGain ? matchResultLpGainPillTextStyle : matchResultLpLossPillTextStyle;
  const sourceLabel = matchResult.source === 'party'
    ? '파티런'
    : matchResult.source === 'official' ? '공식' : '';
  const modeLabel = matchResult.mode === 'duel' ? '1대1 대결' : '그룹 대결';
  const typeLabel = sourceLabel ? `${sourceLabel} ${modeLabel}` : modeLabel;
  const badgeStyle = [
    styles.matchResultBadge,
    matchResult.resultTone === 'win'
      ? styles.matchResultBadgeWin
      : matchResult.resultTone === 'lose'
        ? styles.matchResultBadgeLose
        : matchResult.resultTone === 'draw'
          ? styles.matchResultBadgeDraw
          : null,
  ];
  const metaText = typeof matchResult.gapKm === 'number'
    ? `차이 ${matchResult.gapKm.toFixed(2)}km`
    : typeof matchResult.rank === 'number' && typeof matchResult.participantCount === 'number'
      ? `${matchResult.participantCount}명 중 ${matchResult.rank}위`
      : null;
  const card = (
    <Card style={styles.matchResultCard}>
      <Text style={styles.matchResultLabel}>{typeLabel}</Text>
      <View style={badgeStyle}>
        <Text style={styles.matchResultBadgeText}>{matchResult.badgeLabel}</Text>
      </View>
      {matchResult.opponentName ? (
        <Text style={styles.matchResultOpponent}>vs {matchResult.opponentName}</Text>
      ) : null}
      {showLp ? (
        <View style={lpPillStyle}>
          <Text style={lpPillTextStyle}>
            랭크 {isLpGain ? '+' : ''}{lpDelta} LP
          </Text>
        </View>
      ) : null}
      {metaText ? <Text style={styles.matchResultMeta}>{metaText}</Text> : null}
      {matchResult.opponentId ? <Text style={styles.profileLinkText}>프로필 보기 ›</Text> : null}
    </Card>
  );

  if (!matchResult.opponentId) {
    return card;
  }

  return (
    <Link
      href={{
        pathname: '/opponent-profile',
        params: {
          userId: matchResult.opponentId,
          name: matchResult.opponentName ?? '',
        },
      }}
      asChild
    >
      <Pressable accessibilityRole="button" style={styles.matchResultPressable}>
        {card}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  matchResultPressable: {
    flex: 1,
  },
  matchResultCard: {
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.purpleSoft,
    flex: 1,
    gap: spacing.s10,
    justifyContent: 'space-between',
  },
  matchResultLabel: {
    color: colors.brand,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.extraBold,
  },
  matchResultBadge: {
    alignSelf: 'flex-start',
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s12,
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
  matchResultOpponent: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
  matchResultLpPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  matchResultLpPillGain: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successCardBorder,
  },
  matchResultLpPillLoss: {
    backgroundColor: colors.dangerWash,
    borderColor: colors.dangerBorder,
  },
  matchResultLpPillText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  matchResultLpPillTextGain: {
    color: colors.successStrong,
  },
  matchResultLpPillTextLoss: {
    color: colors.danger,
  },
  matchResultMeta: {
    color: colors.textMuted,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
  profileLinkText: {
    color: colors.brand,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
});

const matchResultLpGainPillStyle = [styles.matchResultLpPill, styles.matchResultLpPillGain];
const matchResultLpLossPillStyle = [styles.matchResultLpPill, styles.matchResultLpPillLoss];
const matchResultLpGainPillTextStyle = [
  styles.matchResultLpPillText,
  styles.matchResultLpPillTextGain,
];
const matchResultLpLossPillTextStyle = [
  styles.matchResultLpPillText,
  styles.matchResultLpPillTextLoss,
];
