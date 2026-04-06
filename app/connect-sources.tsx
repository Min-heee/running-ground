import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { InfoCard } from '@/components/ui/InfoCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { fetchIntegrationStatus } from '@/lib/api/services';
import { IntegrationStatusResponse } from '@/lib/api/types';
import {
  getCurrentDevicePlatform,
  getPlatformLabel,
  getRecommendedSources,
  getRecommendationCopy,
  getSourceMetadata,
} from '@/features/integrations/sourceCatalog';

export default function ConnectSourcesScreen() {
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchIntegrationStatus()
      .then((data) => setIntegrationStatus(data))
      .catch(() => setError('추천 연동 목록을 불러오지 못했어.'))
      .finally(() => setLoading(false));
  }, []);

  const platform = getCurrentDevicePlatform();
  const recommended = integrationStatus ? getRecommendedSources(integrationStatus.sources, platform) : [];

  return (
    <Screen>
      <AuthHeader title="기록 연동 시작" subtitle="출시 MVP에선 기록이 자동 또는 안정적으로 들어오는 연동 경로를 먼저 연결하고 홈으로 들어가는 흐름이 가장 중요해." />

      <InfoCard title="현재 단계">로그인/회원가입은 끝났고, 이제 기록 소스를 연결한 뒤 홈으로 들어가면 돼.</InfoCard>

      <Card>
        <Text style={styles.sectionTitle}>{getPlatformLabel(platform)} 기준 추천 연동</Text>
        <Text style={styles.sectionBody}>{getRecommendationCopy(platform)}</Text>

        {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.list}>
          {recommended.map((source) => {
            const metadata = getSourceMetadata(source.sourceType);

            return (
              <View key={source.sourceType} style={styles.sourceRow}>
                <View style={styles.sourceMeta}>
                  <Text style={styles.sourceName}>{source.displayName}</Text>
                  <Text style={styles.sourceDetail}>{metadata.shortDescription}</Text>
                  <Text style={styles.sourceHint}>{metadata.setupHint}</Text>
                </View>
                <Pressable style={source.connected ? styles.badgeConnected : styles.badge}>
                  <Text style={source.connected ? styles.badgeConnectedText : styles.badgeText}>
                    {source.connected ? '연결됨' : '연결'}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </Card>

      <InfoCard title="왜 필요한가요?">기록 연동은 로그인과 별개야. Apple Health, Health Connect, Manual 같은 경로를 연결하면 달린 기록이 홈, 내 활동, 친구 경쟁에 반영돼.</InfoCard>

      <View style={styles.actions}>
        <SecondaryButton label="연동 설정 자세히 보기" onPress={() => router.push('/integration-management')} />
        <PrimaryButton label="연동하고 홈으로 들어가기" onPress={() => router.push('/(tabs)/home')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  sectionBody: { color: '#475467', lineHeight: 21, marginTop: 6 },
  list: { gap: 12, marginTop: 12 },
  sourceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  sourceMeta: {
    flex: 1,
    gap: 2,
  },
  sourceName: { color: '#101828', fontWeight: '700' },
  sourceDetail: { color: '#667085', marginTop: 2 },
  sourceHint: { color: '#6D5EF7', fontSize: 12, lineHeight: 18, marginTop: 2 },
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
  errorText: { color: '#B42318', marginTop: 8 },
});
