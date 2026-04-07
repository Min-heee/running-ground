import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { IntegrationStatus } from '@/features/integrations/IntegrationStatus';
import { Card } from '@/components/Card';
import { fetchIntegrationStatus } from '@/lib/api/services';
import { IntegrationStatusResponse } from '@/lib/api/types';
import { getCoverageSummary, getCurrentDevicePlatform, getPlatformLabel, getRecommendationCopy } from '@/features/integrations/sourceCatalog';
import { PrimaryButton } from '@/components/ui/PrimaryButton';

export default function IntegrationsScreen() {
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadIntegrations = () => {
    setLoading(true);
    setError(null);

    fetchIntegrationStatus()
      .then((data) => setIntegrationStatus(data))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '연동 상태를 불러오지 못했어.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadIntegrations();
  }, []);

  const platform = getCurrentDevicePlatform();
  const coverage = integrationStatus ? getCoverageSummary(integrationStatus.sources, platform) : null;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>기록 연동</Text>
        <Text style={styles.subtitle}>로그인 이후 연결한 기록 소스들이 자동 반영되는 영역.</Text>
      </View>

      <Card>
        <Text style={styles.tipTitle}>{getPlatformLabel(platform)} 기준 추천 시작 순서</Text>
        <Text style={styles.tipBody}>{getRecommendationCopy(platform)}</Text>
        {coverage ? (
          <Text style={styles.coverageText}>
            추천 소스 {coverage.recommendedCount}개 중 {coverage.connectedRecommendedCount}개가 이미 준비됐어.
          </Text>
        ) : null}
      </Card>

      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
      {!loading && error ? (
        <Card>
          <Text style={styles.errorTitle}>연동 상태를 아직 못 불러왔어</Text>
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton label="다시 불러오기" onPress={loadIntegrations} />
        </Card>
      ) : null}
      {integrationStatus ? <IntegrationStatus sources={integrationStatus.sources} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6 },
  title: { fontSize: 28, fontWeight: '800', color: '#101828' },
  subtitle: { color: '#475467', lineHeight: 21 },
  tipTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  tipBody: { color: '#475467', lineHeight: 21, marginTop: 6 },
  coverageText: { color: '#6D5EF7', fontWeight: '700', marginTop: 8 },
  errorTitle: { color: '#111827', fontWeight: '800', fontSize: 18 },
  errorText: { color: '#B42318', fontWeight: '700', lineHeight: 20, marginTop: 10 },
});
