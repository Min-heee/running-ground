import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { NrcBridgeGuideCard } from '@/features/integrations/NrcBridgeGuideCard';
import {
  getCurrentDevicePlatform,
  getConnectedExclusiveSources,
  getSourceMetadata,
  isExclusiveIntegrationSourceType,
  sortSourcesByPriority,
  splitSourcesByStatus,
} from '@/features/integrations/sourceCatalog';
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
} from '@/lib/api/services';
import { IntegrationStatusResponse, IntegrationSyncResponse } from '@/lib/api/types';
import { RunSourceType } from '@/domain/types';

function buildSyncSummary(result: IntegrationSyncResponse) {
  if (result.importedRuns === 0 && result.duplicateRuns > 0) {
    return `이미 가져온 기록만 있어서 업데이트할 게 없었어. 마지막 확인 시각은 ${result.lastSyncedAt} 이야.`;
  }

  if (result.importedRuns > 0 && result.duplicateRuns > 0) {
    return `${result.importedRuns}개 기록을 새로 반영했고, ${result.duplicateRuns}개는 이미 가져온 기록이라 건너뛰었어.`;
  }

  if (result.importedRuns > 0) {
    return `${result.importedRuns}개 기록을 새로 반영했어.`;
  }

  return `${result.syncedSources}개 소스를 확인했지만 아직 새로 반영할 기록은 없었어.`;
}

function buildImportDiagnosisHint(result: NativeHealthImportResult) {
  if (result.fetchedRuns === 0) {
    return '기기 허브 쪽에 아직 새 러닝이 없거나, 권한/동기화가 덜 끝난 상태일 가능성이 커.';
  }

  if (!result.syncResult) {
    return '기기에서 읽은 기록을 가져오기 대기열에 올려둔 상태야. 이어서 동기화가 돌아야 실제 기록으로 보이게 돼.';
  }

  if (result.syncResult.importedRuns === 0 && result.syncResult.duplicateRuns > 0) {
    return '이번 기록은 이미 들어와 있어서 중복 방지 규칙에 따라 건너뛴 상태야.';
  }

  if (result.syncResult.importedRuns > 0) {
    return '기기에서 읽은 기록이 실제 러닝 기록으로 정상 반영됐어.';
  }

  return '기록을 확인했지만 아직 반영할 새 변화는 없었어.';
}

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

          {(actionMessage || actionError || syncError || syncResult) ? (
            <Card>
              <Text style={styles.sectionTitle}>최근 연동 결과</Text>
              {actionMessage ? <Text style={styles.successText}>{actionMessage}</Text> : null}
              {!actionMessage && syncResult ? <Text style={styles.successText}>{buildSyncSummary(syncResult)}</Text> : null}
              {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
              {syncError ? <Text style={styles.errorText}>{syncError}</Text> : null}
            </Card>
          ) : null}

          {lastImportResult ? (
            <Card>
              <Text style={styles.sectionTitle}>이번 가져오기 진단</Text>
              <View style={styles.diagnosticGrid}>
                <View style={styles.diagnosticChip}>
                  <Text style={styles.diagnosticLabel}>확인한 소스</Text>
                  <Text style={styles.diagnosticValue}>{lastImportResult.sourceLabel}</Text>
                </View>
                <View style={styles.diagnosticChip}>
                  <Text style={styles.diagnosticLabel}>기기에서 읽음</Text>
                  <Text style={styles.diagnosticValue}>{lastImportResult.fetchedRuns}개</Text>
                </View>
                <View style={styles.diagnosticChip}>
                  <Text style={styles.diagnosticLabel}>대기열 등록</Text>
                  <Text style={styles.diagnosticValue}>{lastImportResult.queuedRuns}개</Text>
                </View>
                <View style={styles.diagnosticChip}>
                  <Text style={styles.diagnosticLabel}>새 반영</Text>
                  <Text style={styles.diagnosticValue}>{lastImportResult.syncResult?.importedRuns ?? 0}개</Text>
                </View>
                <View style={styles.diagnosticChip}>
                  <Text style={styles.diagnosticLabel}>중복 건너뜀</Text>
                  <Text style={styles.diagnosticValue}>{lastImportResult.syncResult?.duplicateRuns ?? 0}개</Text>
                </View>
                <View style={styles.diagnosticChip}>
                  <Text style={styles.diagnosticLabel}>마지막 확인</Text>
                  <Text style={styles.diagnosticValue}>{lastImportResult.syncResult?.lastSyncedAt ?? '아직 없음'}</Text>
                </View>
              </View>
              <Text style={styles.helperText}>{buildImportDiagnosisHint(lastImportResult)}</Text>
            </Card>
          ) : null}

          <Card>
            <Text style={styles.sectionTitle}>지금 연결된 소스</Text>
            <Text style={styles.helperText}>자동 기록 소스는 한 번에 1개만 연결돼. 새로 연결하면 이전 자동 연동은 자동으로 해제돼.</Text>
            {connectedSources.map((source) => {
              const metadata = getSourceMetadata(source.sourceType, platform);

              return (
                <View key={source.sourceType} style={styles.row}>
                  <View style={styles.meta}>
                    <Text style={styles.name}>{source.displayName}</Text>
                    <Text style={styles.detail}>마지막 동기화 {source.lastSyncedAt ?? '아직 없음'}</Text>
                    {source.pendingImportCount ? <Text style={styles.pendingText}>대기 중인 가져오기 {source.pendingImportCount}개</Text> : null}
                    <Text style={styles.platform}>{metadata.shortDescription}</Text>
                  </View>
                  <Pressable
                    style={[styles.actionButton, styles.connectedBadge, actionSourceType === source.sourceType && styles.actionButtonDisabled]}
                    disabled={actionSourceType === source.sourceType}
                    onPress={() => handleDisconnect(source.sourceType)}
                  >
                    <Text style={styles.connectedBadgeText}>
                      {actionSourceType === source.sourceType ? '처리 중...' : '해제'}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
            {connectedSources.length === 0 ? <Text style={styles.emptyText}>아직 연결된 기록 소스가 없어.</Text> : null}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>추가로 붙일 수 있는 소스</Text>
            {availableSources.map((source) => {
              const metadata = getSourceMetadata(source.sourceType, platform);

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
            {availableSources.length === 0 ? <Text style={styles.emptyText}>지금 바로 추가로 붙일 확장 소스가 없어.</Text> : null}
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
  stateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  helperText: {
    color: '#667085',
    lineHeight: 20,
    marginTop: 8,
  },
  diagnosticGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  diagnosticChip: {
    minWidth: '47%',
    flexGrow: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  diagnosticLabel: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  diagnosticValue: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
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
  meta: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: '#111827',
    fontWeight: '700',
  },
  detail: {
    color: '#667085',
  },
  platform: {
    color: '#6D5EF7',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 18,
  },
  pendingText: {
    color: '#C2410C',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 18,
  },
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
