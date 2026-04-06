import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { fetchIntegrationStatus } from '@/lib/api/services';
import { IntegrationStatusResponse } from '@/lib/api/types';
import {
  getCoverageSummary,
  getCurrentDevicePlatform,
  getPlatformLabel,
  getRecommendedSources,
  getSourceMetadata,
  splitSourcesByStatus,
} from '@/features/integrations/sourceCatalog';

export default function IntegrationManagementScreen() {
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);

  useEffect(() => {
    fetchIntegrationStatus()
      .then((data) => setIntegrationStatus(data))
      .catch(() => setError('연동 정보를 불러오지 못했어.'))
      .finally(() => setLoading(false));
  }, []);

  const handleSync = () => {
    setSyncing(true);
    setSyncDone(false);
    setTimeout(() => {
      setSyncing(false);
      setSyncDone(true);
      setTimeout(() => setSyncDone(false), 2000);
    }, 1000);
  };

  const platform = getCurrentDevicePlatform();
  const sources = integrationStatus?.sources ?? [];
  const { connected, available } = splitSourcesByStatus(sources);
  const recommendations = getRecommendedSources(sources, platform);
  const coverage = getCoverageSummary(sources, platform);

  return (
    <Screen>
      <AuthHeader title="기록 연동 관리" subtitle="러닝 기록이 들어오는 소스를 관리하고 연결 상태를 확인할 수 있어." />

      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
      {error ? <Text>{error}</Text> : null}

      {integrationStatus ? (
        <>
          <Card>
            <Text style={styles.sectionTitle}>연동 상태 요약</Text>
            <Text style={styles.summaryText}>
              현재 {connected.length}개 소스가 연결되어 있고, {getPlatformLabel(platform)} 기준 추천 소스 {coverage.recommendedCount}개 중 {coverage.connectedRecommendedCount}개가 준비됐어.
            </Text>
            <PrimaryButton label={syncing ? '동기화 중...' : '지금 동기화하기'} onPress={handleSync} />
            {syncDone ? <Text style={styles.successText}>동기화가 완료됐어.</Text> : null}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>우선 연결 추천</Text>
            {recommendations.map((source) => {
              const metadata = getSourceMetadata(source.sourceType);

              return (
                <View key={source.sourceType} style={styles.row}>
                  <View style={styles.meta}>
                    <Text style={styles.name}>{source.displayName}</Text>
                    <Text style={styles.detail}>{metadata.shortDescription}</Text>
                    <Text style={styles.platform}>{metadata.capabilities.join(' · ')}</Text>
                  </View>
                  <View style={source.connected ? styles.connectedBadge : styles.plannedBadge}>
                    <Text style={source.connected ? styles.connectedBadgeText : styles.plannedBadgeText}>
                      {source.connected ? '준비됨' : '추천'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>현재 연결된 소스</Text>
            {connected.map((source) => {
              const metadata = getSourceMetadata(source.sourceType);

              return (
                <View key={source.sourceType} style={styles.row}>
                  <View style={styles.meta}>
                    <Text style={styles.name}>{source.displayName}</Text>
                    <Text style={styles.detail}>마지막 동기화 {source.lastSyncedAt ?? '정보 없음'}</Text>
                    <Text style={styles.platform}>{metadata.setupHint}</Text>
                  </View>
                  <Pressable style={styles.manageButton}>
                    <Text style={styles.manageButtonText}>관리</Text>
                  </Pressable>
                </View>
              );
            })}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>추가 확장 소스</Text>
            {available.map((source) => {
              const metadata = getSourceMetadata(source.sourceType);

              return (
                <View key={source.sourceType} style={styles.row}>
                  <View style={styles.meta}>
                    <Text style={styles.name}>{source.displayName}</Text>
                    <Text style={styles.detail}>{metadata.shortDescription}</Text>
                    <Text style={styles.platform}>{metadata.setupHint}</Text>
                  </View>
                  <View style={styles.plannedBadge}>
                    <Text style={styles.plannedBadgeText}>대기</Text>
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      ) : null}
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
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECF0',
  },
  meta: { flex: 1, gap: 2 },
  name: { color: '#111827', fontWeight: '700' },
  detail: { color: '#667085' },
  platform: { color: '#6D5EF7', fontWeight: '700', fontSize: 12, lineHeight: 18 },
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
  connectedBadge: {
    backgroundColor: '#ECFDF3',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  connectedBadgeText: {
    color: '#067647',
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
