import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  NativeHealthImportResult,
  NativeHealthSourceFilter,
  importRunsFromRecommendedNativeHealthSource,
} from '@/integrations/nativeHealth';
import { RunSourceType } from '@/domain';
import type { IntegrationStatusResponse, IntegrationSyncResponse } from '@/lib/api/types';
import {
  connectIntegrationSource,
  disconnectIntegrationSource,
  fetchIntegrationStatus,
  getApiErrorMessage,
  syncIntegrationSources,
} from '@/services';
import {
  getConnectedExclusiveSources,
  isExclusiveIntegrationSourceType,
} from '@/features/integrations/sourceCatalog';
import { buildZeroImportGuidance } from '@/features/integrations/utils/integrationMessages';
import {
  appendPreLaunchSkipNotice,
  buildAllPreLaunchImportMessage,
  didSkipAllFetchedRunsAsPreLaunch,
} from '@/integrations/importCutoff';

type UseIntegrationActionsOptions = {
  loadErrorMessage: string;
  connectErrorMessage: string;
  syncErrorMessage?: string;
  disconnectErrorMessage?: string;
  deviceImportErrorMessage?: string;
  formatSyncMessage?: (result: IntegrationSyncResponse) => string;
  formatDeviceImportMessage?: (result: NativeHealthImportResult) => string;
  mirrorSyncErrorToActionError?: boolean;
  preferConfiguredLoadError?: boolean;
};

function buildDefaultSyncMessage(result: IntegrationSyncResponse) {
  return `총 ${result.importedRuns}개 기록을 새로 반영했고 ${result.duplicateRuns}개는 중복으로 건너뛰었어요.`;
}

// App-filtered read that matched nothing: the honest message is about the
// SELECTED app, not permissions — other apps' records were there and skipped.
function buildAppFilterZeroMatchMessage(result: NativeHealthImportResult) {
  const excluded = result.excludedBySourceFilter ?? 0;

  if (excluded > 0) {
    return `${result.sourceLabel}에서 ${result.appFilterLabel} 기록을 찾지 못했어요. 다른 앱 기록 ${excluded}개는 선택한 앱이 아니라서 제외했어요. ${result.appFilterLabel}(으)로 달린 기록이 맞는지 확인해주세요.`;
  }

  return `${result.sourceLabel}에서 ${result.appFilterLabel} 기록을 찾지 못했어요. ${result.appFilterLabel}(으)로 달린 기록이 허브에 저장됐는지 1단계 설정을 확인해주세요.`;
}

function buildDefaultDeviceImportMessage(result: NativeHealthImportResult) {
  if (result.appFilterLabel && result.fetchedRuns === 0) {
    return buildAppFilterZeroMatchMessage(result);
  }

  if (result.fetchedRuns === 0) {
    return buildZeroImportGuidance();
  }

  // All fetched records predate the launch cutoff — say so instead of the
  // permission guidance (설정 안내는 여기서 오답이야).
  if (didSkipAllFetchedRunsAsPreLaunch(result)) {
    return buildAllPreLaunchImportMessage(result.skippedPreLaunchRuns);
  }

  return appendPreLaunchSkipNotice(
    `${result.sourceLabel}에서 ${describeImportedBatch(result, result.fetchedRuns)}을 읽었고, ${result.syncResult?.importedRuns ?? 0}개를 새로 반영했어요.`,
    result.skippedPreLaunchRuns,
  );
}

// '기록 3개' vs '스트라바 기록 3개' — names the selected app when a guided
// per-app filter produced this batch.
function describeImportedBatch(result: NativeHealthImportResult, count: number) {
  return result.appFilterLabel ? `${result.appFilterLabel} 기록 ${count}개` : `기록 ${count}개`;
}

function buildManagementDeviceImportMessage(result: NativeHealthImportResult) {
  if (result.appFilterLabel && result.fetchedRuns === 0) {
    return buildAppFilterZeroMatchMessage(result);
  }

  if (result.fetchedRuns === 0) {
    return buildZeroImportGuidance();
  }

  if (didSkipAllFetchedRunsAsPreLaunch(result)) {
    return buildAllPreLaunchImportMessage(result.skippedPreLaunchRuns);
  }

  if (result.syncResult?.importedRuns === 0 && result.syncResult.duplicateRuns > 0) {
    return appendPreLaunchSkipNotice('이미 가져온 기록만 있어서 업데이트할 게 없었어요.', result.skippedPreLaunchRuns);
  }

  if (result.syncResult) {
    return appendPreLaunchSkipNotice(
      `${result.sourceLabel}에서 ${describeImportedBatch(result, result.syncResult.importedRuns)}를 새로 반영했어요.`,
      result.skippedPreLaunchRuns,
    );
  }

  return appendPreLaunchSkipNotice(
    `${result.sourceLabel}에서 ${describeImportedBatch(result, result.fetchedRuns)}를 읽어 가져오기 대기열에 올렸어요.`,
    result.skippedPreLaunchRuns,
  );
}

export function useIntegrationActions({
  loadErrorMessage,
  connectErrorMessage,
  syncErrorMessage = '연동 동기화에 실패했어요.',
  disconnectErrorMessage = '소스 연결 해제에 실패했어요.',
  deviceImportErrorMessage = '기기 기록을 아직 읽어오지 못했어요.',
  formatSyncMessage = buildDefaultSyncMessage,
  formatDeviceImportMessage = buildDefaultDeviceImportMessage,
  mirrorSyncErrorToActionError = false,
  preferConfiguredLoadError = false,
}: UseIntegrationActionsOptions) {
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

  const sources = useMemo(() => integrationStatus?.sources ?? [], [integrationStatus?.sources]);
  const connectedExclusiveSources = useMemo(() => getConnectedExclusiveSources(sources), [sources]);

  const loadIntegrationStatus = useCallback(() => {
    setLoading(true);
    setError(null);

    fetchIntegrationStatus()
      .then((data) => setIntegrationStatus(data))
      .catch((loadError) => setError(
        preferConfiguredLoadError
          ? loadErrorMessage
          : getApiErrorMessage(loadError, loadErrorMessage),
      ))
      .finally(() => setLoading(false));
  }, [loadErrorMessage, preferConfiguredLoadError]);

  useFocusEffect(useCallback(() => {
    loadIntegrationStatus();
  }, [loadIntegrationStatus]));

  const handleConnect = useCallback(async (sourceType: RunSourceType) => {
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
            ? `${result.source.displayName}로 기록 연동을 바꿨어요. ${replacedSource.displayName}는 자동으로 해제돼요.`
            : `${result.source.displayName} 연결 준비가 끝났어요. 가져오기 소스는 한 번에 1개만 연결돼요.`,
        );
      } else {
        setActionMessage(`${result.source.displayName} 연결 준비가 끝났어요.`);
      }
    } catch (connectError) {
      setActionError(getApiErrorMessage(connectError, connectErrorMessage));
    } finally {
      setActionSourceType(null);
    }
  }, [connectErrorMessage, connectedExclusiveSources]);

  const handleDisconnect = useCallback(async (sourceType: RunSourceType) => {
    setActionSourceType(sourceType);
    setActionError(null);
    setActionMessage(null);
    setSyncError(null);
    setLastImportResult(null);

    try {
      const result = await disconnectIntegrationSource(sourceType);
      setIntegrationStatus({ sources: result.sources });
      setActionMessage(`${result.source.displayName} 연결을 해제했어요.`);
    } catch (disconnectError) {
      setActionError(getApiErrorMessage(disconnectError, disconnectErrorMessage));
    } finally {
      setActionSourceType(null);
    }
  }, [disconnectErrorMessage]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    setLastImportResult(null);
    setActionMessage(null);
    setActionError(null);

    try {
      const result = await syncIntegrationSources();
      setSyncResult(result);
      setActionMessage(formatSyncMessage(result));
      const refreshedStatus = await fetchIntegrationStatus();
      setIntegrationStatus(refreshedStatus);
    } catch (syncLoadError) {
      const message = getApiErrorMessage(syncLoadError, syncErrorMessage);
      setSyncError(message);
      if (mirrorSyncErrorToActionError) {
        setActionError(message);
      }
    } finally {
      setSyncing(false);
    }
  }, [formatSyncMessage, mirrorSyncErrorToActionError, syncErrorMessage]);

  const runDeviceImport = useCallback(async (sourceFilter?: NativeHealthSourceFilter) => {
    if (deviceImporting) {
      return;
    }

    setDeviceImporting(true);
    setActionError(null);
    setActionMessage(null);
    setSyncError(null);
    setLastImportResult(null);

    try {
      const result = await importRunsFromRecommendedNativeHealthSource(
        sourceFilter ? { sourceFilter } : {},
      );
      setLastImportResult(result);

      if (result.syncResult) {
        setSyncResult(result.syncResult);
      }

      const refreshedStatus = await fetchIntegrationStatus();
      setIntegrationStatus(refreshedStatus);
      setActionMessage(formatDeviceImportMessage(result));
    } catch (deviceImportError) {
      setActionError(getApiErrorMessage(deviceImportError, deviceImportErrorMessage));
    } finally {
      setDeviceImporting(false);
    }
  }, [deviceImportErrorMessage, deviceImporting, formatDeviceImportMessage]);

  // No-arg wrapper so Pressable onPress can't leak its event object in as a
  // filter — the unfiltered import keeps its original behavior everywhere.
  const handleImportFromDevice = useCallback(async () => runDeviceImport(), [runDeviceImport]);

  // Guided-connect step 3: import ONLY the selected app's records from the hub.
  const handleImportFromDeviceForApp = useCallback(
    async (sourceFilter: NativeHealthSourceFilter) => runDeviceImport(sourceFilter),
    [runDeviceImport],
  );

  return {
    actionError,
    actionMessage,
    actionSourceType,
    deviceImporting,
    error,
    handleConnect,
    handleDisconnect,
    handleImportFromDevice,
    handleImportFromDeviceForApp,
    handleSync,
    integrationStatus,
    lastImportResult,
    loadIntegrationStatus,
    loading,
    setActionMessage,
    sources,
    syncError,
    syncing,
    syncResult,
  };
}

export const integrationDeviceImportMessages = {
  default: buildDefaultDeviceImportMessage,
  management: buildManagementDeviceImportMessage,
};
