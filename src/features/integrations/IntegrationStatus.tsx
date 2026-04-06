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
            </View>
          );
        })}
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
  badge: {
    color: '#067647',
    fontWeight: '700',
  },
  empty: {
    color: '#667085',
    paddingVertical: 8,
  },
});
