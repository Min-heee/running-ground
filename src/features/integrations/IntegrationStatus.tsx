import { StyleSheet, Text } from 'react-native';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { ConnectedSource } from '@/domain/types';
import { colors } from '@/theme';

export function IntegrationStatus({ sources }: { sources: ConnectedSource[] }) {
  const connected = sources.filter((source) => source.connected);
  const planned = sources.filter((source) => !source.connected);

  return (
    <>
      <Card>
        <SectionTitle>연결된 소스</SectionTitle>
        {connected.map((source) => (
          <Text key={source.sourceType} style={styles.row}>{source.displayName} · 연결됨</Text>
        ))}
      </Card>

      <Card>
        <SectionTitle>지원 예정</SectionTitle>
        {planned.map((source) => (
          <Text key={source.sourceType} style={styles.row}>{source.displayName}</Text>
        ))}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: { color: colors.textBody, paddingVertical: 8, fontWeight: '600' },
});
