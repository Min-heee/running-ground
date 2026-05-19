import { memo, useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { ListRenderItem } from 'react-native';
import { Card } from '@/components/Card';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export type DuelMatchResultRow = {
  id: string;
  resultLabel: string;
  name: string;
  paceLabel: string;
  durationLabel: string;
  isCurrentUser: boolean;
};

export type GroupMatchResultRow = {
  id: string;
  rank: number;
  name: string;
  paceLabel: string;
  durationLabel: string;
  isCurrentUser: boolean;
};

type MatchResultPanelProps = {
  mode: 'duel' | 'group';
  estimatedBonusPoints: number;
  duelRows: DuelMatchResultRow[];
  groupRows: GroupMatchResultRow[];
  groupStatusLabel?: string | null;
};

const DuelResultRow = memo(function DuelResultRow({ row }: { row: DuelMatchResultRow }) {
  return (
    <View
      style={[
        styles.duelRow,
        row.resultLabel === 'WIN'
          ? styles.duelRowWin
          : row.resultLabel === 'LOSER'
            ? styles.duelRowLose
            : styles.duelRowDraw,
      ]}
    >
      <View style={styles.duelLabelColumn}>
        <Text style={styles.duelLabel}>{row.resultLabel}</Text>
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.duelName}>
          {row.name}
          {row.isCurrentUser ? ' (나)' : ''}
        </Text>
        <Text style={styles.meta}>
          페이스 {row.paceLabel} · 시간 {row.durationLabel}
        </Text>
      </View>
    </View>
  );
});

const GroupResultRow = memo(function GroupResultRow({ row }: { row: GroupMatchResultRow }) {
  return (
    <View style={[styles.groupRow, row.isCurrentUser ? styles.groupRowCurrent : undefined]}>
      <Text style={styles.groupRank}>{row.rank}등</Text>
      <View style={styles.groupCopy}>
        <Text style={styles.groupName}>
          {row.name}
          {row.isCurrentUser ? ' (나)' : ''}
        </Text>
        <Text style={styles.groupMeta}>
          페이스 {row.paceLabel} · 시간 {row.durationLabel}
        </Text>
      </View>
    </View>
  );
});

export function MatchResultPanel({
  mode,
  estimatedBonusPoints,
  duelRows,
  groupRows,
  groupStatusLabel,
}: MatchResultPanelProps) {
  const keyExtractor = useCallback((row: DuelMatchResultRow | GroupMatchResultRow) => row.id, []);
  const renderDuelRow = useCallback<ListRenderItem<DuelMatchResultRow>>(({ item }) => (
    <DuelResultRow row={item} />
  ), []);
  const renderGroupRow = useCallback<ListRenderItem<GroupMatchResultRow>>(({ item }) => (
    <GroupResultRow row={item} />
  ), []);

  if (mode === 'duel' && duelRows.length) {
    return (
      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>DUEL RESULT</Text>
            <Text style={styles.title}>1대1 대결 결과</Text>
            <Text style={styles.subtitle}>먼저 들어온 러너가 위에 정렬돼요.</Text>
          </View>
          <PointPill points={estimatedBonusPoints} />
        </View>
        <FlatList
          data={duelRows}
          keyExtractor={keyExtractor}
          renderItem={renderDuelRow}
          contentContainerStyle={styles.list}
          scrollEnabled={false}
        />
      </Card>
    );
  }

  if (mode === 'group' && groupRows.length) {
    return (
      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>GROUP RESULT</Text>
            <Text style={styles.title}>그룹 대결 순위표</Text>
            <Text style={styles.subtitle}>들어오는 기록 순서대로 계속 업데이트돼요.</Text>
          </View>
          <PointPill points={estimatedBonusPoints} />
        </View>
        <FlatList
          data={groupRows}
          keyExtractor={keyExtractor}
          renderItem={renderGroupRow}
          contentContainerStyle={styles.list}
          scrollEnabled={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
        />
        {groupStatusLabel ? (
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{groupStatusLabel}</Text>
          </View>
        ) : null}
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>결과를 정리하는 중이에요</Text>
      <Text style={styles.subtitle}>조금만 더 지나면 여기서 바로 결과를 볼 수 있어요.</Text>
    </Card>
  );
}

function PointPill({ points }: { points: number }) {
  return (
    <View style={styles.pointPill}>
      <Text style={styles.pointPillText}>매치 포인트 +{points}P</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s16,
    padding: spacing.s18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.indigoDeep,
    backgroundColor: colors.textPrimary,
  },
  header: {
    gap: spacing.s12,
  },
  headerCopy: {
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.brandLighter,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 0.4,
  },
  title: {
    color: colors.white,
    fontSize: fontSizes.comingSoon,
    fontWeight: fontWeights.extraBold,
  },
  subtitle: {
    color: colors.border,
    lineHeight: 20,
  },
  list: {
    gap: spacing.s10,
  },
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
    borderColor: 'rgba(129, 140, 248, 0.42)',
    backgroundColor: 'rgba(67, 56, 202, 0.24)',
  },
  duelRowLose: {
    borderColor: 'rgba(244, 114, 182, 0.28)',
    backgroundColor: 'rgba(136, 19, 55, 0.22)',
  },
  duelRowDraw: {
    borderColor: 'rgba(148, 163, 184, 0.32)',
    backgroundColor: 'rgba(30, 41, 59, 0.72)',
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
  rowCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  duelName: {
    color: colors.white,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  meta: {
    color: colors.borderMuted,
    lineHeight: 19,
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
    borderColor: 'rgba(255,255,255,0.06)',
  },
  groupRowCurrent: {
    borderColor: 'rgba(129, 140, 248, 0.48)',
    backgroundColor: 'rgba(67, 56, 202, 0.18)',
  },
  groupRank: {
    width: 34,
    color: colors.white,
    fontSize: 15,
    fontWeight: fontWeights.black,
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
  groupMeta: {
    color: colors.border,
    lineHeight: 19,
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
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.28)',
    backgroundColor: 'rgba(79, 70, 229, 0.18)',
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
  },
  statusText: {
    color: colors.brandWashStrong,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
});
