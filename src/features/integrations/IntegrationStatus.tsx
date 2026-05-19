import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { ConnectedSource } from '@/domain';
import { getPrimarySourceForPlatform, sortSourcesByPriority, splitSourcesByStatus } from './sourceCatalog';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

const ConnectedSourceRow = memo(function ConnectedSourceRow({
  isPrimary,
  source,
}: {
  isPrimary: boolean;
  source: ConnectedSource;
}) {
  return (
    <View style={styles.item}>
      <View style={styles.nameRow}>
        <Text style={styles.name}>{source.displayName}</Text>
        {isPrimary ? <Text style={styles.primaryBadge}>기본</Text> : null}
      </View>
      <Text style={styles.detail}>마지막 동기화 {source.lastSyncedAt ?? '정보 없음'}</Text>
      {source.pendingImportCount ? <Text style={styles.pending}>대기 중인 가져오기 {source.pendingImportCount}개</Text> : null}
    </View>
  );
});

export function IntegrationStatus({ sources }: { sources: ConnectedSource[] }) {
  const { connected } = useMemo(() => splitSourcesByStatus(sources), [sources]);
  const primarySource = useMemo(() => getPrimarySourceForPlatform(sources), [sources]);
  const connectedSources = useMemo(() => sortSourcesByPriority(connected), [connected]);
  const connectedSourceRows = useMemo(() => connectedSources.map((source) => (
    <ConnectedSourceRow
      key={source.sourceType}
      isPrimary={primarySource?.sourceType === source.sourceType}
      source={source}
    />
  )), [connectedSources, primarySource?.sourceType]);

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <SectionTitle>연결된 소스</SectionTitle>
        <Text style={styles.countText}>{connectedSources.length}개</Text>
      </View>
      {connectedSourceRows}
      {connected.length === 0 ? <Text style={styles.empty}>아직 연결된 기록 소스가 없어.</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  countText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  item: {
    paddingVertical: 9,
    gap: spacing.xxs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxl,
    flexWrap: 'wrap',
  },
  name: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  primaryBadge: {
    color: colors.textStrongMuted,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    overflow: 'hidden',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xs,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
  },
  detail: {
    color: colors.textSecondary,
    lineHeight: 18,
    fontSize: fontSizes.sm,
  },
  pending: {
    color: colors.warningText,
    fontWeight: fontWeights.bold,
    lineHeight: 18,
    fontSize: fontSizes.sm,
  },
  empty: {
    color: colors.textSecondary,
    paddingVertical: spacing.xxl,
  },
});
