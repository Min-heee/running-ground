import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  NativeHealthImportResult,
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
  return `총 ${result.importedRuns}개 기록을 새로 반영했고 ${result.duplicateRuns}개는 중복으로 건너뛰었어.`;
}

function buildDefaultDeviceImportMessage(result: NativeHealthImportResult) {
  if (result.fetchedRuns === 0) {
    return buildZeroImportGuidance();
  }

  return `${result.sourceLabel}에서 ${result.fetchedRuns}개 기록을 읽었고, ${result.syncResult?.importedRuns ?? 0}개를 새로 반영했어.`;
}

function buildManagementDeviceImportMessage(result: NativeHealthImportResult) {
  if (result.fetchedRuns === 0) {
    return buildZeroImportGuidance();
  }

  if (result.syncResult?.importedRuns === 0 && result.syncResult.duplicateRuns > 0) {
    return '이미 가져온 기록만 있어서 업데이트할 게 없었어.';
  }

  if (result.syncResult) {
    return `${result.sourceLabel}에서 ${result.syncResult.importedRuns}개 기록을 새로 반영했어.`;
  }

  return `${result.sourceLabel}에서 ${result.fetchedRuns}개 기록을 읽어 가져오기 대기열에 올렸어.`;
}

export function useIntegrationActions({
  loadErrorMessage,
  connectErrorMessage,
  syncErrorMessage = '연동 동기화에 실패했어.',
  disconnectErrorMessage = '소스 연결 해제에 실패했어.',
  deviceImportErrorMessage = '기기 기록을 아직 읽어오지 못했어.',
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
            ? `${result.source.displayName}로 기록 연동을 바꿨어. ${replacedSource.displayName}는 자동으로 해제돼.`
            : `${result.source.displayName} 연결 준비가 끝났어. 가져오기 소스는 한 번에 1개만 연결돼.`,
        );
      } else {
        setActionMessage(`${result.source.displayName} 연결 준비가 끝났어.`);
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
      setActionMessage(`${result.source.displayName} 연결을 해제했어.`);
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

  const handleImportFromDevice = useCallback(async () => {
    if (deviceImporting) {
      return;
    }

    setDeviceImporting(true);
    setActionError(null);
    setActionMessage(null);
    setSyncError(null);
    setLastImportResult(null);

    try {
      const result = await importRunsFromRecommendedNativeHealthSource();
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

  return {
    actionError,
    actionMessage,
    actionSourceType,
    deviceImporting,
    error,
    handleConnect,
    handleDisconnect,
    handleImportFromDevice,
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
