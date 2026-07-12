import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';

import { Card } from '@/components/Card';
import {
  MATCH_PROVISIONAL_NOTICE_LABEL,
  MATCH_REVISED_NOTICE_LABEL,
} from '@/features/runs/viewModels/matchResultModel';
import {
  buildRunMatchResultCardModel,
  type RunMatchResultCardModelInput,
} from '@/features/running/viewModels/runMatchResultCardModel';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type RunMatchResultCardProps = RunMatchResultCardModelInput;

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

function RunMatchResultCardBase({
  matchResult,
  myPaceLabel,
  myDurationSeconds,
  matchId,
  mode,
}: RunMatchResultCardProps) {
  // All display derivation (link target, LP gating, labels) is pure and pinned by
  // runMatchResultCardModel.test.ts.
  const {
    resultMatchId,
    resultMode,
    canOpenResult,
    myDisplayPaceLabel,
    myDurationLabel,
    opponentDurationLabel,
    lpDelta,
    isLpGain,
    showLp,
    typeLabel,
    showDuelComparison,
    gapText,
    groupRankText,
  } = buildRunMatchResultCardModel({ matchResult, myPaceLabel, myDurationSeconds, matchId, mode });
  const lpPillStyle = isLpGain ? matchResultLpGainPillStyle : matchResultLpLossPillStyle;
  const lpPillTextStyle = isLpGain ? matchResultLpGainPillTextStyle : matchResultLpLossPillTextStyle;
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
  const card = (
    <Card style={styles.matchResultCard}>
      <Text style={styles.matchResultLabel}>{typeLabel}</Text>
      <View style={badgeStyle}>
        <Text style={styles.matchResultBadgeText}>{matchResult.badgeLabel}</Text>
      </View>
      {/* §3-⑨ fair-verdict notices — display-only flags set ONLY on the run-detail reconcile
          overlay (never persisted); absent everywhere else, so nothing renders then. */}
      {matchResult.provisional ? (
        <Text style={styles.provisionalNotice}>{MATCH_PROVISIONAL_NOTICE_LABEL}</Text>
      ) : null}
      {matchResult.revised ? (
        <Text style={styles.revisedNotice}>{MATCH_REVISED_NOTICE_LABEL}</Text>
      ) : null}
      {showDuelComparison ? (
        <>
          <View style={styles.duelComparisonRow}>
            <RunnerColumn
              name="나"
              paceLabel={myDisplayPaceLabel}
              durationLabel={myDurationLabel}
              highlight
            />
            <Text style={styles.duelVersus}>vs</Text>
            <RunnerColumn
              name={matchResult.opponentName ?? '상대'}
              paceLabel={matchResult.opponentPaceLabel ?? null}
              durationLabel={opponentDurationLabel}
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
      {canOpenResult ? <Text style={styles.profileLinkText}>결과 보기 ›</Text> : null}
    </Card>
  );

  // Preserve a way to reach the opponent profile for duels. The whole card now opens the
  // dedicated match-result screen, so the opponent-profile link is a SEPARATE secondary
  // affordance rendered as a sibling below the card (never nested inside the card's own
  // Pressable, which would make a profile tap ambiguous with the card tap).
  const opponentProfileLink = matchResult.mode === 'duel' && matchResult.opponentId ? (
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
      <Pressable accessibilityRole="button" hitSlop={spacing.xs} style={styles.opponentProfileLink}>
        <Text style={styles.profileLinkText}>상대 프로필 ›</Text>
      </Pressable>
    </Link>
  ) : null;

  // The whole card opens the dedicated match-result screen, fetched by matchId from the
  // backend (works for both duel and group, official and party). Group records — which have
  // no opponentId — are now tappable too. Falls back to a static card only when matchId is
  // absent (e.g. an old record saved before the backend persisted run.matchResult.matchId).
  if (!canOpenResult || !resultMatchId) {
    if (!opponentProfileLink) {
      return card;
    }
    return (
      <View style={styles.matchResultWrap}>
        {card}
        {opponentProfileLink}
      </View>
    );
  }

  const tappableCard = (
    <Link
      href={{
        pathname: '/match-result',
        params: {
          matchId: resultMatchId,
          ...(resultMode ? { matchMode: resultMode } : {}),
        },
      }}
      asChild
    >
      <Pressable accessibilityRole="button" style={styles.matchResultPressable}>
        {card}
      </Pressable>
    </Link>
  );

  if (!opponentProfileLink) {
    return tappableCard;
  }

  return (
    <View style={styles.matchResultWrap}>
      {tappableCard}
      {opponentProfileLink}
    </View>
  );
}

export const RunMatchResultCard = memo(RunMatchResultCardBase);

const styles = StyleSheet.create({
  matchResultWrap: {
    flex: 1,
    gap: spacing.xxs,
  },
  matchResultPressable: {
    flex: 1,
  },
  opponentProfileLink: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xxs,
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
  provisionalNotice: {
    color: colors.orangeText,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  revisedNotice: {
    color: colors.brand,
    fontSize: fontSizes.sm,
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
