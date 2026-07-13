import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { getPodiumTheme } from '@/features/league/utils/leagueRanking';
import type { MatchResultScreenRow } from '@/features/runs/viewModels/matchResultScreenModel';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type ResultRankRowProps = {
  row: MatchResultScreenRow;
};

// One slim ranked row for the GROUP result list: a rank chip + name (마크 '나' for isMe) + a
// 지역 · 페이스 · 시간 stat block. Top-3 get a 금/은/동 crown chip matching the 지역 랭킹 podium
// (getPodiumTheme); 4등+ keep a plain '4등' chip. Every row uses the SAME background — the
// current user is marked only by the small '나' tag, not a tinted row. This is the SAVED/FINAL
// result list — intentionally NOT the live progress-track row (no track dot / animated lane).
export const ResultRankRow = memo(function ResultRankRow({ row }: ResultRankRowProps) {
  const rankLabel = typeof row.rank === 'number' ? `${row.rank}등` : '-';
  const podiumTheme = typeof row.rank === 'number' ? getPodiumTheme(row.rank) : null;

  return (
    <View style={styles.row}>
      {podiumTheme ? (
        <View
          style={[
            styles.rankChip,
            styles.rankChipPodium,
            { backgroundColor: podiumTheme.backgroundColor, borderColor: podiumTheme.borderColor },
          ]}
        >
          <MaterialCommunityIcons name="crown" size={13} color={podiumTheme.iconColor} />
          <Text style={[styles.rankChipText, { color: podiumTheme.textColor }]}>{rankLabel}</Text>
        </View>
      ) : (
        <View style={styles.rankChip}>
          <Text style={styles.rankChipText}>{rankLabel}</Text>
        </View>
      )}

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
  rankChipPodium: {
    flexDirection: 'row',
    gap: spacing.xxxs,
    paddingHorizontal: spacing.md,
  },
  rankChipText: {
    color: colors.brandTint,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
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
    color: fixedColors.textTertiary,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.bold,
  },
});
