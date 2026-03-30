import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { connectedSources } from '@/data/mock';

export default function ConnectSourcesScreen() {
  const recommended = connectedSources.filter((source) => ['apple_health', 'health_connect', 'manual'].includes(source.sourceType));

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>기록 연동 시작</Text>
        <Text style={styles.subtitle}>로그인은 끝났어. 이제 러닝 기록이 들어올 소스를 연결하면 경쟁에 바로 반영할 수 있어.</Text>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>추천 연동</Text>
        <View style={styles.list}>
          {recommended.map((source) => (
            <View key={source.sourceType} style={styles.sourceRow}>
              <View>
                <Text style={styles.sourceName}>{source.displayName}</Text>
                <Text style={styles.sourceDetail}>{source.connected ? '이미 연결됨' : '연결 권장'}</Text>
              </View>
              <Pressable style={[styles.badge, source.connected && styles.badgeConnected]}>
                <Text style={[styles.badgeText, source.connected && styles.badgeConnectedText]}>
                  {source.connected ? '연결됨' : '연결'}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>왜 필요한가요?</Text>
        <Text style={styles.body}>기록 연동은 로그인과 별개야. Apple Health, Health Connect, Garmin 같은 소스를 연결하면 달린 기록이 자동으로 랭킹과 경쟁에 반영돼.</Text>
      </Card>

      <View style={styles.actions}>
        <Link href="/(tabs)/integrations" asChild>
          <Pressable style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>연동 화면 자세히 보기</Text>
          </Pressable>
        </Link>
        <Link href="/(tabs)/home" asChild>
          <Pressable style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>지금은 홈으로 갈게</Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, paddingTop: 10 },
  title: { fontSize: 32, fontWeight: '800', color: '#101828' },
  subtitle: { color: '#475467', lineHeight: 22 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  list: { gap: 12, marginTop: 8 },
  sourceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sourceName: { color: '#101828', fontWeight: '700' },
  sourceDetail: { color: '#667085', marginTop: 2 },
  badge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  badgeConnected: {
    backgroundColor: '#ECFDF3',
  },
  badgeText: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  badgeConnectedText: {
    color: '#067647',
  },
  body: {
    color: '#475467',
    lineHeight: 21,
    marginTop: 8,
  },
  actions: { gap: 10 },
  primaryButton: {
    backgroundColor: '#6D5EF7',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D0D5DD',
  },
  secondaryButtonText: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 16,
  },
});
