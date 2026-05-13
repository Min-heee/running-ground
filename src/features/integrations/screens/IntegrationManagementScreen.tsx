import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { IntegrationResultCard } from '@/features/integrations/components/IntegrationResultCard';
import { AvailableSourcesCard, ConnectedSourcesCard } from '@/features/integrations/components/IntegrationSourcesCards';
import { NativeImportDiagnosticCard } from '@/features/integrations/components/NativeImportDiagnosticCard';
import { NrcBridgeGuideCard } from '@/features/integrations/NrcBridgeGuideCard';
import {
  getCurrentDevicePlatform,
  getConnectedExclusiveSources,
  isExclusiveIntegrationSourceType,
  sortSourcesByPriority,
  splitSourcesByStatus,
} from '@/features/integrations/sourceCatalog';
import { buildSyncSummary } from '@/features/integrations/utils/integrationMessages';
import {
  NativeHealthImportResult,
  getRecommendedNativeHealthReadiness,
  importRunsFromRecommendedNativeHealthSource,
} from '@/integrations/nativeHealth';
import {
  connectIntegrationSource,
  disconnectIntegrationSource,
  fetchIntegrationStatus,
  syncIntegrationSources,
} from '@/services';
import { IntegrationStatusResponse, IntegrationSyncResponse } from '@/lib/api/types';
import { RunSourceType } from '@/domain';

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
  const [deviceImporting, setDeviceImporting] = useState(false);
  const [lastImportResult, setLastImportResult] = useState<NativeHealthImportResult | null>(null);

  const loadIntegrationStatus = useCallback(() => {
    setLoading(true);
    setError(null);

    fetchIntegrationStatus()
      .then((data) => setIntegrationStatus(data))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '연동 정보를 불러오지 못했어.'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => {
    loadIntegrationStatus();
  }, [loadIntegrationStatus]));

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    setLastImportResult(null);
    setActionMessage(null);
    setActionError(null);

    try {
      const result = await syncIntegrationSources();
      setSyncResult(result);
      setActionMessage(buildSyncSummary(result));
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
    setSyncError(null);
    setLastImportResult(null);

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
      setActionError(connectError instanceof Error ? connectError.message : '소스 연결에 실패했어.');
    } finally {
      setActionSourceType(null);
    }
  };

  const handleDisconnect = async (sourceType: RunSourceType) => {
    setActionSourceType(sourceType);
    setActionError(null);
    setActionMessage(null);
    setSyncError(null);
    setLastImportResult(null);

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
  const connectedExclusiveSources = getConnectedExclusiveSources(sources);
  const { connected, available } = splitSourcesByStatus(sources);
  const connectedSources = sortSourcesByPriority(connected);
  const availableSources = sortSourcesByPriority(available);
  const nativeHealthReadiness = getRecommendedNativeHealthReadiness(sources);
  const backHref = returnTo === 'connect-sources' ? '/connect-sources' : '/(tabs)/mypage';
  const backLabel = returnTo === 'connect-sources' ? '연동 시작으로 돌아가기' : '마이페이지로 돌아가기';

  const handleImportFromDevice = async () => {
    if (deviceImporting) {
      return;
    }

    setDeviceImporting(true);
    setActionError(null);
    setActionMessage(null);
    setSyncError(null);
    setLastImportResult(null);

    try {
      const result = await importRunsFromRecommendedNativeHealthSource(sources);
      setLastImportResult(result);

      if (result.syncResult) {
        setSyncResult(result.syncResult);
      }

      const refreshedStatus = await fetchIntegrationStatus();
      setIntegrationStatus(refreshedStatus);

      if (result.fetchedRuns === 0) {
        setActionMessage(`${result.sourceLabel}에서 아직 가져올 새 기록을 찾지 못했어.`);
      } else if (result.syncResult?.importedRuns === 0 && result.syncResult.duplicateRuns > 0) {
        setActionMessage('이미 가져온 기록만 있어서 업데이트할 게 없었어.');
      } else if (result.syncResult) {
        setActionMessage(`${result.sourceLabel}에서 ${result.syncResult.importedRuns}개 기록을 새로 반영했어.`);
      } else {
        setActionMessage(`${result.sourceLabel}에서 ${result.fetchedRuns}개 기록을 읽어 가져오기 대기열에 올렸어.`);
      }
    } catch (deviceImportError) {
      setActionError(deviceImportError instanceof Error ? deviceImportError.message : '기기 기록을 아직 읽어오지 못했어.');
    } finally {
      setDeviceImporting(false);
    }
  };

  return (
    <Screen>
      <AuthHeader
        title="기록 연동 관리"
        subtitle=""
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
          <NrcBridgeGuideCard
            sources={sources}
            platform={platform}
            actionSourceType={actionSourceType}
            syncing={syncing}
            importing={deviceImporting}
            nativeHealthReady={nativeHealthReadiness?.state === 'config_ready'}
            onConnectSource={handleConnect}
            onImportDevice={handleImportFromDevice}
            onSync={handleSync}
          />

          <IntegrationResultCard
            actionMessage={actionMessage}
            actionError={actionError}
            syncError={syncError}
            syncResult={syncResult}
          />

          <NativeImportDiagnosticCard result={lastImportResult} />

          <ConnectedSourcesCard
            sources={connectedSources}
            platform={platform}
            actionSourceType={actionSourceType}
            onDisconnectSource={handleDisconnect}
          />

          <AvailableSourcesCard
            sources={availableSources}
            platform={platform}
            actionSourceType={actionSourceType}
            onConnectSource={handleConnect}
          />

          <SecondaryButton label="연동 상태 새로고침" onPress={loadIntegrationStatus} />
          <SecondaryButton label={backLabel} onPress={() => router.replace(backHref)} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
    marginTop: 10,
    lineHeight: 20,
  },
});
