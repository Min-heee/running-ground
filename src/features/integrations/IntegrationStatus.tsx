import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { ConnectedSource } from '@/domain';
import { getPrimarySourceForPlatform, sortSourcesByPriority, splitSourcesByStatus } from './sourceCatalog';

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
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  countText: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  item: {
    paddingVertical: 9,
    gap: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EAECF0',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  name: {
    color: '#111827',
    fontWeight: '700',
  },
  primaryBadge: {
    color: '#344054',
    backgroundColor: '#F2F4F7',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontSize: 11,
    fontWeight: '800',
  },
  detail: {
    color: '#667085',
    lineHeight: 18,
    fontSize: 12,
  },
  pending: {
    color: '#B54708',
    fontWeight: '700',
    lineHeight: 18,
    fontSize: 12,
  },
  empty: {
    color: '#667085',
    paddingVertical: 8,
  },
});
