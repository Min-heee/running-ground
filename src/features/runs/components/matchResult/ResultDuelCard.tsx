import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ResultBadge } from '@/components/matches/liveMatchArena/ResultBadge';
import type { ArenaResultLabel } from '@/components/matches/liveMatchArena/types';
import type { MatchResultScreenRow } from '@/features/runs/viewModels/matchResultScreenModel';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type ResultDuelCardProps = {
  row: MatchResultScreenRow;
  // 'win' emphasizes the card with a brand accent; 'lose' renders muted.
  variant: 'win' | 'lose';
  // The badge label is derived by the screen (draw collapses both cards to DRAW).
  badgeLabel: ArenaResultLabel;
};

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>
        {value || '-'}
      </Text>
    </View>
  );
}

// A single duel result card (one per runner). Winner card uses the brand/tier accent;
// loser card is muted. The 지역/페이스/시간 stat block reads the pre-derived Row labels so
// it can never disagree with the live arena. A gender slot is left for v1 but renders
// nothing — genderLabel is always undefined until gender ships.
export const ResultDuelCard = memo(function ResultDuelCard({
  row,
  variant,
  badgeLabel,
}: ResultDuelCardProps) {
  const isWin = variant === 'win';

  return (
    <View style={[styles.card, isWin ? styles.cardWin : styles.cardLose]}>
      <View style={styles.headerRow}>
        <ResultBadge label={badgeLabel} />
        <View style={styles.nameWrap}>
          <Text style={styles.name} numberOfLines={1}>
            {row.name}
          </Text>
          {row.isMe ? (
            <View style={styles.meBadge}>
              <Text style={styles.meBadgeText}>나</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.statRow}>
        <StatBlock label="지역" value={row.regionLabel} />
        <StatBlock label="페이스" value={row.paceLabel} />
        <StatBlock label="시간" value={row.timeLabel} />
        {/* Gender slot (deferred): renders only when genderLabel is present — never in v1. */}
        {row.genderLabel ? <StatBlock label="성별" value={row.genderLabel} /> : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: spacing.s14,
    borderRadius: radii.heroLg,
    borderWidth: 1,
    padding: spacing.s16,
  },
  cardWin: {
    borderColor: colors.matchResultWinBorder,
    backgroundColor: colors.matchResultWinBg,
  },
  cardLose: {
    borderColor: colors.matchResultLoseBorder,
    backgroundColor: colors.matchResultLoseBg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s10,
  },
  nameWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  name: {
    color: colors.white,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.extraBold,
    flexShrink: 1,
  },
  meBadge: {
    borderRadius: radii.pill,
    backgroundColor: colors.matchResultPanelHighlightBg,
    borderWidth: 1,
    borderColor: colors.matchResultPanelHighlightBorder,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxs,
  },
  meBadgeText: {
    color: colors.brandLighter,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.extraBold,
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  statBlock: {
    flex: 1,
    gap: spacing.xxs,
  },
  statLabel: {
    color: colors.textTertiary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  statValue: {
    color: colors.white,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
});
