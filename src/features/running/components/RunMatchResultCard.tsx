import { memo } from 'react';
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
  // Optional overrides for opening the dedicated match-result screen. The card normally
  // reads matchId/mode straight off the matchResult blob (run.matchResult.matchId/.mode);
  // these let the host screen (RunDetailScreen) thread the matchId it was navigated with as
  // a fallback for older records whose blob never persisted matchId.
  matchId?: string | null;
  mode?: 'duel' | 'group' | null;
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

function RunMatchResultCardBase({
  matchResult,
  myPaceLabel,
  myDurationSeconds,
  matchId,
  mode,
}: RunMatchResultCardProps) {
  // matchId is persisted on the run record's matchResult JSON blob (run.matchResult.matchId);
  // fall back to the matchId the host screen was navigated with. Trim defensively in case a
  // record stored a padded/empty string.
  const resultMatchId = matchResult.matchId?.trim() || matchId?.trim() || null;
  const resultMode = matchResult.mode ?? mode ?? undefined;
  const canOpenResult = Boolean(resultMatchId);
  const myDisplayPaceLabel = matchResult.myPaceLabel ?? myPaceLabel ?? null;
  const myDisplayDurationSeconds = matchResult.myDurationSeconds
    ?? (typeof myDurationSeconds === 'number' ? myDurationSeconds : undefined);
  const lpDelta = getEstimatedMatchLpDelta(matchResult);
  const isLpGain = lpDelta > 0;
  // A record is a ranked OFFICIAL match only when source === 'official'. Anything else —
  // a party run, OR a record whose source the backend hasn't persisted — is treated as a
  // party run: it shows the 파티런 label and NEVER rank LP (matches getRunKind's split).
  // This is why we gate on 'official' rather than '!== party': a missing source must not
  // leak rank LP onto a party-run record.
  const isOfficial = matchResult.source === 'official';
  const showLp = isOfficial && lpDelta !== 0;
  const lpPillStyle = isLpGain ? matchResultLpGainPillStyle : matchResultLpLossPillStyle;
  const lpPillTextStyle = isLpGain ? matchResultLpGainPillTextStyle : matchResultLpLossPillTextStyle;
  const isParty = !isOfficial;
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
