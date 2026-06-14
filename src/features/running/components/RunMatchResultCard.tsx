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
  // My own pace/time fallback from the saved run record — used for the '나' column when
  // the matchResult itself didn't persist them (e.g. records saved before the backend
  // accepts the new fields). The opponent's pace/time only come from the matchResult.
  myPaceLabel?: string | null;
  myDurationSeconds?: number | null;
};

function formatDurationLabel(durationSeconds?: number) {
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
    return null;
  }

  const totalSeconds = Math.round(durationSeconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const padded = (value: number) => String(value).padStart(2, '0');

  return hours > 0
    ? `${hours}:${padded(minutes)}:${padded(seconds)}`
    : `${padded(minutes)}:${padded(seconds)}`;
}

function RunnerColumn({
  name,
  paceLabel,
  durationLabel,
  highlight,
}: {
  name: string;
  paceLabel: string | null;
  durationLabel: string | null;
  highlight: boolean;
}) {
  return (
    <View style={styles.runnerColumn}>
      <Text style={[styles.runnerName, highlight ? styles.runnerNameMe : null]} numberOfLines={1}>
        {name}
      </Text>
      {paceLabel ? <Text style={styles.runnerMetric}>{paceLabel}</Text> : null}
      {durationLabel ? <Text style={styles.runnerMetric}>{durationLabel}</Text> : null}
    </View>
  );
}

export function RunMatchResultCard({ matchResult, myPaceLabel, myDurationSeconds }: RunMatchResultCardProps) {
  const myDisplayPaceLabel = matchResult.myPaceLabel ?? myPaceLabel ?? null;
  const myDisplayDurationSeconds = matchResult.myDurationSeconds
    ?? (typeof myDurationSeconds === 'number' ? myDurationSeconds : undefined);
  const lpDelta = getEstimatedMatchLpDelta(matchResult);
  const isLpGain = lpDelta > 0;
  // Party runs never carry rank LP — in either direction.
  const showLp = matchResult.source !== 'party' && lpDelta !== 0;
  const lpPillStyle = isLpGain ? matchResultLpGainPillStyle : matchResultLpLossPillStyle;
  const lpPillTextStyle = isLpGain ? matchResultLpGainPillTextStyle : matchResultLpLossPillTextStyle;
  const isParty = matchResult.source === 'party';
  const typeLabel = matchResult.mode === 'duel'
    ? isParty ? '1대1 파티런' : '1대1 대결'
    : isParty ? '그룹 파티런' : '그룹 대결';
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
  const showDuelComparison = matchResult.mode === 'duel' && Boolean(matchResult.opponentName);
  const gapText = typeof matchResult.gapKm === 'number'
    ? `차이 ${matchResult.gapKm.toFixed(2)}km`
    : null;
  const groupRankText = typeof matchResult.rank === 'number' && typeof matchResult.participantCount === 'number'
    ? `${matchResult.participantCount}명 중 ${matchResult.rank}위`
    : null;
  const card = (
    <Card style={styles.matchResultCard}>
      <Text style={styles.matchResultLabel}>{typeLabel}</Text>
      <View style={badgeStyle}>
        <Text style={styles.matchResultBadgeText}>{matchResult.badgeLabel}</Text>
      </View>
      {showDuelComparison ? (
        <>
          <View style={styles.duelComparisonRow}>
            <RunnerColumn
              name="나"
              paceLabel={myDisplayPaceLabel}
              durationLabel={formatDurationLabel(myDisplayDurationSeconds)}
              highlight
            />
            <Text style={styles.duelVersus}>vs</Text>
            <RunnerColumn
              name={matchResult.opponentName ?? '상대'}
              paceLabel={matchResult.opponentPaceLabel ?? null}
              durationLabel={formatDurationLabel(matchResult.opponentDurationSeconds)}
              highlight={false}
            />
          </View>
          {gapText ? <Text style={styles.matchResultMeta}>{gapText}</Text> : null}
        </>
      ) : (
        <>
          {matchResult.opponentName ? (
            <Text style={styles.matchResultOpponent}>vs {matchResult.opponentName}</Text>
          ) : null}
          {gapText ?? groupRankText ? (
            <Text style={styles.matchResultMeta}>{gapText ?? groupRankText}</Text>
          ) : null}
        </>
      )}
      {showLp ? (
        <View style={lpPillStyle}>
          <Text style={lpPillTextStyle}>
            랭크 {isLpGain ? '+' : ''}{lpDelta} LP
          </Text>
        </View>
      ) : null}
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
  duelComparisonRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  duelVersus: {
    color: colors.textMuted,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
    // Line up 'vs' with the name row (both columns are centered), so it reads
    // 나  vs  상대 with vs sitting between the two names.
    lineHeight: fontSizes.md + spacing.xs,
  },
  runnerColumn: {
    flex: 1,
    gap: spacing.xxs,
    alignItems: 'center',
  },
  runnerName: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
    textAlign: 'center',
  },
  runnerNameMe: {
    color: colors.brandStrong,
  },
  runnerMetric: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
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
