import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type {
  DuelMatchResultRow,
  GroupMatchResultRow,
} from '@/features/runs/types/matchResult';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export type { DuelMatchResultRow, GroupMatchResultRow } from '@/features/runs/types/matchResult';

export const DuelResultRow = memo(function DuelResultRow({ row }: { row: DuelMatchResultRow }) {
  const label = row.resultLabel === 'ING' ? '진행 중' : row.resultLabel;
  const rowStyle = useMemo(() => [
    styles.duelRow,
    row.resultLabel === 'WIN'
      ? styles.duelRowWin
      : row.resultLabel === 'LOSER'
        ? styles.duelRowLose
        : styles.duelRowDraw,
    row.isInProgress ? styles.duelRowInProgress : undefined,
  ], [row.isInProgress, row.resultLabel]);
  const labelStyle = useMemo(() => [
    styles.duelLabel,
    row.isInProgress ? styles.duelLabelInProgress : undefined,
  ], [row.isInProgress]);
  const nameStyle = useMemo(() => [
    styles.duelName,
    row.isInProgress ? styles.duelNameInProgress : undefined,
  ], [row.isInProgress]);
  const metaStyle = useMemo(() => [
    styles.meta,
    row.isInProgress ? styles.metaInProgress : undefined,
  ], [row.isInProgress]);

  return (
    <View style={rowStyle}>
      <View style={styles.duelLabelColumn}>
        <Text style={labelStyle}>{label}</Text>
      </View>
      <View style={styles.rowCopy}>
        <Text style={nameStyle}>
          {row.name}
          {row.isCurrentUser ? ' (나)' : ''}
        </Text>
        <Text style={metaStyle}>
          페이스 {row.paceLabel} · 시간 {row.durationLabel}
        </Text>
      </View>
    </View>
  );
});

export const GroupResultRow = memo(function GroupResultRow({ row }: { row: GroupMatchResultRow }) {
  const rankLabel = row.isInProgress ? '진행 중' : `${row.rank}등`;
  const rowStyle = useMemo(() => [
    styles.groupRow,
    row.isCurrentUser ? styles.groupRowCurrent : undefined,
    row.isInProgress ? styles.groupRowInProgress : undefined,
  ], [row.isCurrentUser, row.isInProgress]);
  const rankStyle = useMemo(() => [
    styles.groupRank,
    row.isInProgress ? styles.groupRankInProgress : undefined,
  ], [row.isInProgress]);
  const nameStyle = useMemo(() => [
    styles.groupName,
    row.isInProgress ? styles.groupNameInProgress : undefined,
  ], [row.isInProgress]);
  const metaStyle = useMemo(() => [
    styles.groupMeta,
    row.isInProgress ? styles.groupMetaInProgress : undefined,
  ], [row.isInProgress]);

  return (
    <View style={rowStyle}>
      <Text style={rankStyle}>{rankLabel}</Text>
      <View style={styles.groupCopy}>
        <Text style={nameStyle}>
          {row.name}
          {row.isCurrentUser ? ' (나)' : ''}
        </Text>
        <Text style={metaStyle}>
          페이스 {row.paceLabel} · 시간 {row.durationLabel}
        </Text>
      </View>
    </View>
  );
});

export function PointPill({ points }: { points: number }) {
  return (
    <View style={styles.pointPill}>
      <Text style={styles.pointPillText}>매치 포인트 +{points}P</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  duelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s12,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s14,
    borderWidth: 1,
  },
  duelRowWin: {
    borderColor: colors.matchResultWinBorder,
    backgroundColor: colors.matchResultWinBg,
  },
  duelRowLose: {
    borderColor: colors.matchResultLoseBorder,
    backgroundColor: colors.matchResultLoseBg,
  },
  duelRowDraw: {
    borderColor: colors.matchResultDrawBorder,
    backgroundColor: colors.matchResultDrawBg,
  },
  duelRowInProgress: {
    borderColor: colors.matchResultDrawBorder,
    backgroundColor: colors.matchResultInProgressBg,
  },
  duelLabelColumn: {
    minWidth: 54,
  },
  duelLabel: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.black,
    letterSpacing: 0.4,
  },
  duelLabelInProgress: {
    color: colors.textTertiary,
  },
  rowCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  duelName: {
    color: colors.white,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  duelNameInProgress: {
    color: colors.borderMuted,
  },
  meta: {
    color: colors.borderMuted,
    lineHeight: 19,
  },
  metaInProgress: {
    color: colors.textTertiary,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s12,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s12,
    backgroundColor: colors.slateDark,
    borderWidth: 1,
    borderColor: colors.groupResultRowBorder,
  },
  groupRowCurrent: {
    borderColor: colors.groupResultRowCurrentBorder,
    backgroundColor: colors.groupResultRowCurrentBg,
  },
  groupRowInProgress: {
    borderColor: colors.groupResultRowInProgressBorder,
    backgroundColor: colors.groupResultRowInProgressBg,
  },
  groupRank: {
    width: 52,
    color: colors.white,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.black,
  },
  groupRankInProgress: {
    color: colors.textTertiary,
    fontSize: fontSizes.sm,
  },
  groupCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  groupName: {
    color: colors.white,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  groupNameInProgress: {
    color: colors.borderMuted,
  },
  groupMeta: {
    color: colors.border,
    lineHeight: 19,
  },
  groupMetaInProgress: {
    color: colors.textTertiary,
  },
  pointPill: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    backgroundColor: colors.brandWash,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
  },
  pointPillText: {
    color: colors.brandStrong,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.black,
  },
});
