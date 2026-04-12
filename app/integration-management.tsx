import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { connectIntegrationSource, disconnectIntegrationSource, fetchIntegrationStatus, syncIntegrationSources } from '@/lib/api/services';
import { IntegrationStatusResponse, IntegrationSyncResponse } from '@/lib/api/types';
import { RunSourceType } from '@/domain/types';
import {
  getCoverageSummary,
  getCurrentDevicePlatform,
  getPlatformLabel,
  getRecommendedSources,
  getSourceMetadata,
  splitSourcesByStatus,
} from '@/features/integrations/sourceCatalog';

export default function IntegrationManagementScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<IntegrationSyncResponse | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [actionSourceType, setActionSourceType] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadIntegrationStatus = () => {
    setLoading(true);
    setError(null);

    fetchIntegrationStatus()
      .then((data) => setIntegrationStatus(data))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '연동 정보를 불러오지 못했어.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadIntegrationStatus();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);

    try {
      const result = await syncIntegrationSources();
      setSyncResult(result);
      const refreshedStatus = await fetchIntegrationStatus();
      setIntegrationStatus(refreshedStatus);
    } catch (syncLoadError) {
      setSyncError(syncLoadError instanceof Error ? syncLoadError.message : '연동 동기화에 실패했어.');
    } finally {
      setSyncing(false);
    }
  };

  const handleConnect = async (sourceType: RunSourceType) => {
    setActionSourceType(sourceType);
    setActionError(null);
    setActionMessage(null);

    try {
      const result = await connectIntegrationSource(sourceType);
      setIntegrationStatus({ sources: result.sources });
      setActionMessage(`${result.source.displayName} 연결 준비가 끝났어.`);
    } catch (connectError) {
      setActionError(connectError instanceof Error ? connectError.message : '소스 연결에 실패했어.');
    } finally {
      setActionSourceType(null);
    }
  };

  const handleDisconnect = async (sourceType: RunSourceType) => {
    setActionSourceType(sourceType);
    setActionError(null);
    setActionMessage(null);

    try {
      const result = await disconnectIntegrationSource(sourceType);
      setIntegrationStatus({ sources: result.sources });
      setActionMessage(`${result.source.displayName} 연결을 해제했어.`);
    } catch (disconnectError) {
      setActionError(disconnectError instanceof Error ? disconnectError.message : '소스 연결 해제에 실패했어.');
    } finally {
      setActionSourceType(null);
    }
  };

  const platform = getCurrentDevicePlatform();
  const sources = integrationStatus?.sources ?? [];
  const { connected, available } = splitSourcesByStatus(sources);
  const recommendations = getRecommendedSources(sources, platform);
  const coverage = getCoverageSummary(sources, platform);
  const backHref = returnTo === 'connect-sources' ? '/connect-sources' : '/(tabs)/mypage';
  const backLabel = returnTo === 'connect-sources' ? '연동 시작으로 돌아가기' : '마이페이지로 돌아가기';

  return (
    <Screen>
      <AuthHeader
        title="기록 연동 관리"
        subtitle="러닝 기록이 들어오는 소스를 관리하고 연결 상태를 확인할 수 있어."
        showBack
        backHref={backHref}
        backLabel={backLabel}
      />

      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
      {!loading && error ? (
        <Card>
          <Text style={styles.stateTitle}>연동 정보를 아직 못 불러왔어</Text>
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton label="다시 불러오기" onPress={loadIntegrationStatus} />
        </Card>
      ) : null}

      {integrationStatus ? (
        <>
          <Card>
            <Text style={styles.sectionTitle}>연동 상태 요약</Text>
            <Text style={styles.summaryText}>
              현재 {connected.length}개 소스가 연결되어 있고, {getPlatformLabel(platform)} 기준 추천 소스 {coverage.recommendedCount}개 중 {coverage.connectedRecommendedCount}개가 준비됐어.
            </Text>
            <PrimaryButton label={syncing ? '동기화 중...' : '지금 동기화하기'} onPress={handleSync} />
            {syncResult ? (
              <Text style={styles.successText}>
                {syncResult.syncedSources}개 소스에서 {syncResult.syncedRuns}개 기록을 확인했고, 마지막 동기화 시각은 {syncResult.lastSyncedAt} 이야.
              </Text>
            ) : null}
            {syncError ? <Text style={styles.errorText}>{syncError}</Text> : null}
            {actionMessage ? <Text style={styles.successText}>{actionMessage}</Text> : null}
            {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
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
                  <Pressable
                    style={[styles.actionButton, source.connected ? styles.connectedBadge : styles.plannedBadge, actionSourceType === source.sourceType && styles.actionButtonDisabled]}
                    disabled={source.connected || actionSourceType === source.sourceType}
                    onPress={() => handleConnect(source.sourceType)}
                  >
                    <Text style={source.connected ? styles.connectedBadgeText : styles.plannedBadgeText}>
                      {source.connected ? '준비됨' : actionSourceType === source.sourceType ? '연결 중...' : '연결하기'}
                    </Text>
                  </Pressable>
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
                  <Pressable
                    style={[styles.actionButton, styles.connectedBadge, actionSourceType === source.sourceType && styles.actionButtonDisabled]}
                    disabled={actionSourceType === source.sourceType}
                    onPress={() => handleDisconnect(source.sourceType)}
                  >
                    <Text style={styles.connectedBadgeText}>
                      {actionSourceType === source.sourceType ? '처리 중...' : '연결 해제'}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
            {connected.length === 0 ? <Text style={styles.emptyText}>아직 연결된 기록 소스가 없어.</Text> : null}
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
                  <Pressable
                    style={[styles.actionButton, styles.plannedBadge, actionSourceType === source.sourceType && styles.actionButtonDisabled]}
                    disabled={actionSourceType === source.sourceType}
                    onPress={() => handleConnect(source.sourceType)}
                  >
                    <Text style={styles.plannedBadgeText}>
                      {actionSourceType === source.sourceType ? '연결 중...' : '연결하기'}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
            {available.length === 0 ? <Text style={styles.emptyText}>지금 바로 추가로 붙일 확장 소스가 없어.</Text> : null}
          </Card>

          <SecondaryButton label="연동 상태 새로고침" onPress={loadIntegrationStatus} />
          <SecondaryButton label={backLabel} onPress={() => router.replace(backHref)} />
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
  stateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  successText: {
    color: '#067647',
    fontWeight: '700',
    marginTop: 10,
    lineHeight: 20,
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
    marginTop: 10,
    lineHeight: 20,
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
  connectedBadge: {
    backgroundColor: '#ECFDF3',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionButton: {
    minWidth: 84,
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.7,
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
  emptyText: {
    color: '#667085',
    lineHeight: 20,
  },
});
