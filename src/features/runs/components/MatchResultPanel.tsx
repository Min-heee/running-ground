import { memo, useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { ListRenderItem } from 'react-native';
import { Card } from '@/components/Card';
import { colors } from '@/theme/tokens';

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
    gap: 16,
    padding: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.indigoDeep,
    backgroundColor: colors.textPrimary,
  },
  header: {
    gap: 12,
  },
  headerCopy: {
    gap: 4,
  },
  eyebrow: {
    color: colors.brandLighter,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  title: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.border,
    lineHeight: 20,
  },
  list: {
    gap: 10,
  },
  duelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
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
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  duelName: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
  },
  meta: {
    color: colors.borderMuted,
    lineHeight: 19,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
    fontWeight: '900',
  },
  groupCopy: {
    flex: 1,
    gap: 2,
  },
  groupName: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  groupMeta: {
    color: colors.border,
    lineHeight: 19,
  },
  pointPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: colors.brandWash,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pointPillText: {
    color: colors.brandStrong,
    fontSize: 12,
    fontWeight: '900',
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.28)',
    backgroundColor: 'rgba(79, 70, 229, 0.18)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusText: {
    color: colors.brandWashStrong,
    fontSize: 12,
    fontWeight: '800',
  },
});
