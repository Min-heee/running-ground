import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { ConnectedSource } from '@/domain/types';
import { getPrimarySourceForPlatform, getSourceMetadata, sortSourcesByPriority, splitSourcesByStatus } from './sourceCatalog';

export function IntegrationStatus({ sources }: { sources: ConnectedSource[] }) {
  const { connected, available } = splitSourcesByStatus(sources);
  const primarySource = getPrimarySourceForPlatform(sources);
  const connectedSources = sortSourcesByPriority(connected);
  const availableSources = sortSourcesByPriority(available);

  return (
    <>
      <Card>
        <SectionTitle>연결된 소스</SectionTitle>
        {connectedSources.map((source) => {
          const metadata = getSourceMetadata(source.sourceType);
          const isPrimary = primarySource?.sourceType === source.sourceType;

          return (
            <View key={source.sourceType} style={styles.item}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{source.displayName}</Text>
                {isPrimary ? <Text style={styles.primaryBadge}>기본</Text> : null}
              </View>
              <Text style={styles.detail}>{metadata.shortDescription}</Text>
              <Text style={styles.detail}>마지막 동기화 {source.lastSyncedAt ?? '정보 없음'}</Text>
              {source.pendingImportCount ? <Text style={styles.pending}>대기 중인 가져오기 {source.pendingImportCount}개</Text> : null}
              <Text style={styles.badge}>연결됨</Text>
            </View>
          );
        })}
        {connected.length === 0 ? <Text style={styles.empty}>아직 연결된 기록 소스가 없어.</Text> : null}
      </Card>

      <Card>
        <SectionTitle>다음으로 붙이기 좋은 소스</SectionTitle>
        {availableSources.map((source) => {
          const metadata = getSourceMetadata(source.sourceType);
          const isPrimary = primarySource?.sourceType === source.sourceType;

          return (
            <View key={source.sourceType} style={styles.item}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{source.displayName}</Text>
                {isPrimary ? <Text style={styles.primaryBadge}>우선</Text> : null}
              </View>
              <Text style={styles.detail}>{metadata.shortDescription}</Text>
              <Text style={styles.hint}>{metadata.setupHint}</Text>
            </View>
          );
        })}
        {available.length === 0 ? <Text style={styles.empty}>지금 바로 추가로 열어둘 소스가 없어.</Text> : null}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  item: {
    paddingVertical: 8,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    color: '#111827',
    fontWeight: '700',
  },
  primaryBadge: {
    color: '#4F46E5',
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '800',
  },
  detail: {
    color: '#667085',
    lineHeight: 20,
  },
  hint: {
    color: '#6D5EF7',
    fontWeight: '700',
    lineHeight: 18,
    fontSize: 12,
  },
  badge: {
    color: '#067647',
    fontWeight: '700',
  },
  pending: {
    color: '#C2410C',
    fontWeight: '700',
    lineHeight: 18,
    fontSize: 12,
  },
  empty: {
    color: '#667085',
    paddingVertical: 8,
  },
});
