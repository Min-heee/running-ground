import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import {
  DuelResultRow,
  GroupResultRow,
  PointPill,
  type DuelMatchResultRow,
  type GroupMatchResultRow,
} from '@/features/runs/components/MatchResultRows';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export type { DuelMatchResultRow, GroupMatchResultRow } from '@/features/runs/components/MatchResultRows';

type MatchResultPanelProps = {
  mode: 'duel' | 'group';
  estimatedBonusPoints: number;
  duelRows: DuelMatchResultRow[];
  groupRows: GroupMatchResultRow[];
  groupStatusLabel?: string | null;
};

export function MatchResultPanel({
  mode,
  estimatedBonusPoints,
  duelRows,
  groupRows,
  groupStatusLabel,
}: MatchResultPanelProps) {
  const hasDuelInProgressRows = duelRows.some((row) => row.isInProgress);
  const hasGroupInProgressRows = groupRows.some((row) => row.isInProgress);

  if (mode === 'duel' && duelRows.length) {
    return (
      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>DUEL RESULT</Text>
            <Text style={styles.title}>1대1 대결 결과</Text>
            <Text style={styles.subtitle}>
              {hasDuelInProgressRows
                ? '상대가 완주하면 자동으로 결과가 업데이트돼요.'
                : '먼저 들어온 러너가 위에 정렬돼요.'}
            </Text>
          </View>
          <PointPill points={estimatedBonusPoints} />
        </View>
        <View style={styles.list}>
          {duelRows.map((row) => (
            <DuelResultRow key={row.id} row={row} />
          ))}
        </View>
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
            <Text style={styles.subtitle}>
              {hasGroupInProgressRows
                ? '다음 러너 완주를 기다리는 중이에요.'
                : '들어오는 기록 순서대로 계속 업데이트돼요.'}
            </Text>
          </View>
          <PointPill points={estimatedBonusPoints} />
        </View>
        <View style={styles.list}>
          {groupRows.map((row) => (
            <GroupResultRow key={row.id} row={row} />
          ))}
        </View>
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

const styles = StyleSheet.create({
  card: {
    gap: spacing.s16,
    padding: spacing.s18,
    borderRadius: radii.cardLarge,
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
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.matchResultPanelHighlightBorder,
    backgroundColor: colors.matchResultPanelHighlightBg,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
  },
  statusText: {
    color: colors.brandWashStrong,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
});
