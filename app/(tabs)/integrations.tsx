import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { IntegrationJourneyCard } from '@/features/integrations/IntegrationJourneyCard';
import { IntegrationStatus } from '@/features/integrations/IntegrationStatus';
import { NrcBridgeGuideCard } from '@/features/integrations/NrcBridgeGuideCard';
import { NativeHealthReadinessCard } from '@/features/integrations/NativeHealthReadinessCard';
import { Card } from '@/components/Card';
import { fetchIntegrationStatus, syncIntegrationSources, connectIntegrationSource } from '@/lib/api/services';
import { IntegrationStatusResponse, IntegrationSyncResponse } from '@/lib/api/types';
import {
  getConnectedExclusiveSources,
  getCoverageSummary,
  getCurrentDevicePlatform,
  getPlatformLabel,
  getRecommendationCopy,
  isExclusiveIntegrationSourceType,
} from '@/features/integrations/sourceCatalog';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { getRecommendedNativeHealthReadiness, importRunsFromRecommendedNativeHealthSource } from '@/integrations/nativeHealth';
import { RunSourceType } from '@/domain/types';

export default function IntegrationsScreen() {
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSourceType, setActionSourceType] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<IntegrationSyncResponse | null>(null);
  const [deviceImporting, setDeviceImporting] = useState(false);

  const loadIntegrations = useCallback(() => {
    setLoading(true);
    setError(null);

    fetchIntegrationStatus()
      .then((data) => setIntegrationStatus(data))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '연동 상태를 불러오지 못했어.'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => {
    loadIntegrations();
  }, [loadIntegrations]));

  const platform = getCurrentDevicePlatform();
  const sources = integrationStatus?.sources ?? [];
  const connectedExclusiveSources = getConnectedExclusiveSources(sources);
  const coverage = integrationStatus ? getCoverageSummary(sources, platform) : null;
  const nativeHealthReadiness = getRecommendedNativeHealthReadiness(sources);

  const handleConnect = async (sourceType: RunSourceType) => {
    setActionSourceType(sourceType);
    setActionError(null);
    setActionMessage(null);

    try {
      const result = await connectIntegrationSource(sourceType);
      setIntegrationStatus({ sources: result.sources });
      if (isExclusiveIntegrationSourceType(sourceType)) {
        const replacedSource = connectedExclusiveSources.find((source) => source.sourceType !== sourceType);
        setActionMessage(
          replacedSource
            ? `${result.source.displayName}로 기록 연동을 바꿨어. ${replacedSource.displayName}는 자동으로 해제돼.`
            : `${result.source.displayName} 연결 준비가 끝났어. 자동 기록 소스는 한 번에 1개만 연결돼.`,
        );
      } else {
        setActionMessage(`${result.source.displayName} 연결 준비가 끝났어.`);
      }
    } catch (connectError) {
      setActionError(connectError instanceof Error ? connectError.message : '연동 연결에 실패했어.');
    } finally {
      setActionSourceType(null);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setActionError(null);
    setActionMessage(null);

    try {
      const result = await syncIntegrationSources();
      setSyncResult(result);
      const refreshedStatus = await fetchIntegrationStatus();
      setIntegrationStatus(refreshedStatus);
      setActionMessage(`총 ${result.importedRuns}개 기록을 새로 반영했고 ${result.duplicateRuns}개는 중복으로 건너뛰었어.`);
    } catch (syncError) {
      setActionError(syncError instanceof Error ? syncError.message : '지금 동기화하지 못했어.');
    } finally {
      setSyncing(false);
    }
  };

  const handleImportFromDevice = async () => {
    if (deviceImporting) {
      return;
    }

    setDeviceImporting(true);
    setActionError(null);
    setActionMessage(null);

    try {
      const result = await importRunsFromRecommendedNativeHealthSource(sources);

      if (result.syncResult) {
        setSyncResult(result.syncResult);
      }

      const refreshedStatus = await fetchIntegrationStatus();
      setIntegrationStatus(refreshedStatus);

      if (result.fetchedRuns === 0) {
        setActionMessage(`${result.sourceLabel}에서 아직 가져올 새 기록을 찾지 못했어.`);
      } else {
        setActionMessage(`${result.sourceLabel}에서 ${result.fetchedRuns}개 기록을 읽었고, ${result.syncResult?.importedRuns ?? 0}개를 새로 반영했어.`);
      }
    } catch (deviceImportError) {
      setActionError(deviceImportError instanceof Error ? deviceImportError.message : '기기 기록을 아직 읽어오지 못했어.');
    } finally {
      setDeviceImporting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>기록 연동</Text>
        <Text style={styles.subtitle}>로그인 이후 연결한 기록 소스들이 자동 반영되는 영역.</Text>
      </View>

      <Card>
        <Text style={styles.tipTitle}>{getPlatformLabel(platform)} 기준 추천 시작 순서</Text>
        <Text style={styles.tipBody}>{getRecommendationCopy(platform)}</Text>
        <Text style={styles.policyText}>자동 기록 소스는 한 번에 1개만 연결돼. 새로 연결하면 이전 자동 연동은 자동으로 해제돼.</Text>
        {coverage ? (
          <Text style={styles.coverageText}>
            추천 소스 {coverage.recommendedCount}개 중 {coverage.connectedRecommendedCount}개가 이미 준비됐어.
          </Text>
        ) : null}
        {syncResult ? <Text style={styles.syncText}>마지막 동기화에서 {syncResult.importedRuns}개 새 기록을 반영했어.</Text> : null}
        {actionMessage ? <Text style={styles.successText}>{actionMessage}</Text> : null}
        {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
      </Card>

      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
      {!loading && error ? (
        <Card>
          <Text style={styles.errorTitle}>연동 상태를 아직 못 불러왔어</Text>
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton label="다시 불러오기" onPress={loadIntegrations} />
        </Card>
      ) : null}
      {integrationStatus ? (
        <>
          <NativeHealthReadinessCard sources={sources}>
            {nativeHealthReadiness?.state === 'config_ready' ? (
              <PrimaryButton
                label={deviceImporting ? '기기 기록 가져오는 중...' : '기기에서 기록 가져오기'}
                onPress={handleImportFromDevice}
              />
            ) : null}
          </NativeHealthReadinessCard>
          <NrcBridgeGuideCard
            sources={sources}
            platform={platform}
            actionSourceType={actionSourceType}
            syncing={syncing}
            onConnectSource={handleConnect}
            onSync={handleSync}
          />
          <IntegrationJourneyCard
            sources={sources}
            nativeHealthReadiness={nativeHealthReadiness}
            actionSourceType={actionSourceType}
            syncing={syncing}
            importing={deviceImporting}
            onConnectSource={handleConnect}
            onImportDevice={handleImportFromDevice}
            onSync={handleSync}
            onAddManualRun={() => router.push('/add-run')}
          />
          <IntegrationStatus sources={sources} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6 },
  title: { fontSize: 28, fontWeight: '800', color: '#101828' },
  subtitle: { color: '#475467', lineHeight: 21 },
  tipTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  tipBody: { color: '#475467', lineHeight: 21, marginTop: 6 },
  policyText: { color: '#667085', lineHeight: 20, marginTop: 8 },
  coverageText: { color: '#6D5EF7', fontWeight: '700', marginTop: 8 },
  syncText: { color: '#475467', lineHeight: 20, marginTop: 8 },
  successText: { color: '#067647', fontWeight: '700', marginTop: 8, lineHeight: 20 },
  errorTitle: { color: '#111827', fontWeight: '800', fontSize: 18 },
  errorText: { color: '#B42318', fontWeight: '700', lineHeight: 20, marginTop: 10 },
});
