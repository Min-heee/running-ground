import { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { connectedSources } from '@/data/mock';
import { PrimaryButton } from '@/components/ui/PrimaryButton';

export default function IntegrationManagementScreen() {
  const connected = connectedSources.filter((source) => source.connected);
  const planned = connectedSources.filter((source) => !source.connected);
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);

  const handleSync = () => {
    setSyncing(true);
    setSyncDone(false);
    setTimeout(() => {
      setSyncing(false);
      setSyncDone(true);
      setTimeout(() => setSyncDone(false), 2000);
    }, 1000);
  };

  return (
    <Screen>
      <AuthHeader title="기록 연동 관리" subtitle="러닝 기록이 들어오는 소스를 관리하고 연결 상태를 확인할 수 있어." />

      <Card>
        <Text style={styles.sectionTitle}>연동 상태 요약</Text>
        <Text style={styles.summaryText}>현재 {connected.length}개 소스가 연결되어 있고, 최신 기록이 경쟁 화면에 반영될 수 있어.</Text>
        <PrimaryButton label={syncing ? '동기화 중...' : '지금 동기화하기'} onPress={handleSync} />
        {syncDone ? <Text style={styles.successText}>동기화가 완료됐어.</Text> : null}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>현재 연결된 소스</Text>
        {connected.map((source) => (
          <View key={source.sourceType} style={styles.row}>
            <View style={styles.meta}>
              <Text style={styles.name}>{source.displayName}</Text>
              <Text style={styles.detail}>마지막 동기화 {source.lastSyncedAt ?? '정보 없음'}</Text>
              <Text style={styles.platform}>{source.recommendedPlatform === 'ios' ? 'iPhone 추천' : source.recommendedPlatform === 'android' ? 'Android 추천' : '공통 사용 가능'}</Text>
            </View>
            <Pressable style={styles.manageButton}>
              <Text style={styles.manageButtonText}>관리</Text>
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
              <Text style={styles.platform}>{source.recommendedPlatform === 'ios' ? 'iPhone 추천' : source.recommendedPlatform === 'android' ? 'Android 추천' : '공통 사용 가능'}</Text>
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
  summaryText: {
    color: '#475467',
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 12,
  },
  successText: {
    color: '#067647',
    fontWeight: '700',
    marginTop: 10,
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
  platform: { color: '#6D5EF7', fontWeight: '700', fontSize: 12 },
  manageButton: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  manageButtonText: {
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
