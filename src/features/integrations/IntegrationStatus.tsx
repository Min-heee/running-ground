import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { ConnectedSource } from '@/domain/types';
import { getSourceMetadata, splitSourcesByStatus } from './sourceCatalog';

export function IntegrationStatus({ sources }: { sources: ConnectedSource[] }) {
  const { connected, available } = splitSourcesByStatus(sources);

  return (
    <>
      <Card>
        <SectionTitle>연결된 소스</SectionTitle>
        {connected.map((source) => {
          const metadata = getSourceMetadata(source.sourceType);

          return (
            <View key={source.sourceType} style={styles.item}>
              <Text style={styles.name}>{source.displayName}</Text>
              <Text style={styles.detail}>{metadata.shortDescription}</Text>
              <Text style={styles.detail}>마지막 동기화 {source.lastSyncedAt ?? '정보 없음'}</Text>
              <Text style={styles.badge}>연결됨</Text>
            </View>
          );
        })}
        {connected.length === 0 ? <Text style={styles.empty}>아직 연결된 기록 소스가 없어.</Text> : null}
      </Card>

      <Card>
        <SectionTitle>다음으로 붙이기 좋은 소스</SectionTitle>
        {available.map((source) => {
          const metadata = getSourceMetadata(source.sourceType);

          return (
            <View key={source.sourceType} style={styles.item}>
              <Text style={styles.name}>{source.displayName}</Text>
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
  name: {
    color: '#111827',
    fontWeight: '700',
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
  empty: {
    color: '#667085',
    paddingVertical: 8,
  },
});
