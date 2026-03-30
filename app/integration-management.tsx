import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { connectedSources } from '@/data/mock';

export default function IntegrationManagementScreen() {
  const connected = connectedSources.filter((source) => source.connected);
  const planned = connectedSources.filter((source) => !source.connected);

  return (
    <Screen>
      <AuthHeader title="기록 연동 관리" subtitle="러닝 기록이 들어오는 소스를 관리하고 연결 상태를 확인할 수 있어." />

      <Card>
        <Text style={styles.sectionTitle}>현재 연결된 소스</Text>
        {connected.map((source) => (
          <View key={source.sourceType} style={styles.row}>
            <View style={styles.meta}>
              <Text style={styles.name}>{source.displayName}</Text>
              <Text style={styles.detail}>연결됨 · 최근 동기화 가능</Text>
            </View>
            <Pressable style={styles.disconnectButton}>
              <Text style={styles.disconnectButtonText}>관리</Text>
            </Pressable>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>지원 예정 소스</Text>
        {planned.map((source) => (
          <View key={source.sourceType} style={styles.row}>
            <View style={styles.meta}>
              <Text style={styles.name}>{source.displayName}</Text>
              <Text style={styles.detail}>추후 연동 지원 예정</Text>
            </View>
            <View style={styles.plannedBadge}>
              <Text style={styles.plannedBadgeText}>예정</Text>
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECF0',
  },
  meta: { flex: 1, gap: 2 },
  name: { color: '#111827', fontWeight: '700' },
  detail: { color: '#667085' },
  disconnectButton: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  disconnectButtonText: {
    color: '#4F46E5',
    fontWeight: '800',
  },
  plannedBadge: {
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  plannedBadgeText: {
    color: '#C2410C',
    fontWeight: '800',
  },
});
