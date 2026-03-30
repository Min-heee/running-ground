import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { connectedSources } from '@/data/mock';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { InfoCard } from '@/components/ui/InfoCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';

export default function ConnectSourcesScreen() {
  const recommended = connectedSources.filter((source) => ['apple_health', 'health_connect', 'manual'].includes(source.sourceType));

  return (
    <Screen>
      <AuthHeader title="기록 연동 시작" subtitle="이제 러닝 기록이 들어올 소스를 연결하면 경쟁에 바로 반영할 수 있어." />

      <Card>
        <Text style={styles.sectionTitle}>추천 연동</Text>
        <View style={styles.list}>
          {recommended.map((source) => (
            <View key={source.sourceType} style={styles.sourceRow}>
              <View>
                <Text style={styles.sourceName}>{source.displayName}</Text>
                <Text style={styles.sourceDetail}>{source.connected ? '이미 연결됨' : '연결 권장'}</Text>
              </View>
              <Pressable style={source.connected ? styles.badgeConnected : styles.badge}>
                <Text style={source.connected ? styles.badgeConnectedText : styles.badgeText}>
                  {source.connected ? '연결됨' : '연결'}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      </Card>

      <InfoCard title="왜 필요한가요?">기록 연동은 로그인과 별개야. Apple Health, Health Connect, Garmin 같은 소스를 연결하면 달린 기록이 자동으로 랭킹과 경쟁에 반영돼.</InfoCard>

      <View style={styles.actions}>
        <Link href="/(tabs)/mypage" asChild>
          <View>
            <SecondaryButton label="연동 상태는 마이페이지에서 보기" />
          </View>
        </Link>
        <Link href="/(tabs)/home" asChild>
          <View>
            <PrimaryButton label="지금은 홈으로 갈게" />
          </View>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  badgeText: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  badgeConnectedText: {
    color: '#067647',
    fontWeight: '700',
  },
  actions: { gap: 10 },
});
