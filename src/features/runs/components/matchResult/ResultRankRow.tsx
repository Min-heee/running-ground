import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MatchResultScreenRow } from '@/features/runs/viewModels/matchResultScreenModel';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type ResultRankRowProps = {
  row: MatchResultScreenRow;
};

// One slim ranked row for the GROUP result list: a 'N등' rank chip + name (마크 '나' for
// isMe) + a 지역 · 페이스 · 시간 stat block. Top-3 get a subtle accent on the chip. This is
// the SAVED/FINAL result list — intentionally NOT the live progress-track row (no track
// dot / animated lane); it reuses the dark race-board palette via @/theme/tokens only.
export const ResultRankRow = memo(function ResultRankRow({ row }: ResultRankRowProps) {
  const rankLabel = typeof row.rank === 'number' ? `${row.rank}등` : '-';
  const isTopThree = typeof row.rank === 'number' && row.rank >= 1 && row.rank <= 3;

  return (
    <View style={[styles.row, row.isMe ? styles.rowMe : null]}>
      <View style={[styles.rankChip, isTopThree ? styles.rankChipTop : null]}>
        <Text style={[styles.rankChipText, isTopThree ? styles.rankChipTextTop : null]}>
          {rankLabel}
        </Text>
      </View>

      <View style={styles.nameColumn}>
        <Text style={styles.nameText} numberOfLines={1}>
          {row.name}
        </Text>
        {row.isMe ? <Text style={styles.meTag}>나</Text> : null}
      </View>

      <View style={styles.statColumn}>
        <Text style={styles.statValue} numberOfLines={1}>
          {row.regionLabel || '-'}
        </Text>
        <Text style={styles.statCaption}>지역</Text>
      </View>
      <View style={styles.statColumn}>
        <Text style={styles.statValue} numberOfLines={1}>
          {row.paceLabel}
        </Text>
        <Text style={styles.statCaption}>페이스</Text>
      </View>
      <View style={styles.statColumn}>
        <Text style={styles.statValue} numberOfLines={1}>
          {row.timeLabel}
        </Text>
        <Text style={styles.statCaption}>시간</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s10,
    borderRadius: radii.cardLarge,
    borderWidth: 1,
    borderColor: colors.groupResultRowBorder,
    backgroundColor: colors.raceBoardRowBg,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s14,
  },
  rowMe: {
    borderColor: colors.groupResultRowCurrentBorder,
    backgroundColor: colors.groupResultRowCurrentBg,
  },
  rankChip: {
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.raceBoardRowBg,
    borderWidth: 1,
    borderColor: colors.groupResultRowBorder,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
  },
  rankChipTop: {
    backgroundColor: colors.matchResultPanelHighlightBg,
    borderColor: colors.matchResultPanelHighlightBorder,
  },
  rankChipText: {
    color: colors.brandTint,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  rankChipTextTop: {
    color: colors.white,
  },
  nameColumn: {
    width: 64,
    gap: spacing.xxs,
  },
  nameText: {
    color: colors.white,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  meTag: {
    color: colors.brandLighter,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.extraBold,
  },
  statColumn: {
    flex: 1,
    alignItems: 'flex-end',
    gap: spacing.xxs,
  },
  statValue: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  statCaption: {
    color: colors.textTertiary,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.bold,
  },
});
