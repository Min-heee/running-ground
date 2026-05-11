import {
  connectedSources,
} from '@/data/mock';

import {
  RunSourceType,
} from '@/domain/types';

import {
  apiGet,
  apiPost,
} from '../client';

import { USE_MOCK_API } from '../config';

import {
  QueueIntegrationImportResponse,
  IntegrationSourceActionResponse,
  IntegrationSyncResponse,
  IntegrationStatusResponse,
} from '../types';

import {
  mockApiState,
  formatMockTimestamp,
  isExclusiveIntegrationSourceType,
  requireAccessToken,
} from './_shared';

export async function fetchIntegrationStatus(): Promise<IntegrationStatusResponse> {
  if (USE_MOCK_API) {
    return {
      sources: mockApiState.connectedSources,
    };
  }

  return apiGet<IntegrationStatusResponse>('/integrations/sources', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '연동 상태를 불러오지 못했어.',
  });
}

export async function syncIntegrationSources(): Promise<IntegrationSyncResponse> {
  if (USE_MOCK_API) {
    const lastSyncedAt = formatMockTimestamp();
    const connectedCount = mockApiState.connectedSources.filter((source) => source.connected).length;

    mockApiState.connectedSources = mockApiState.connectedSources.map((source) => (
      source.connected
        ? {
          ...source,
          lastSyncedAt,
        }
        : source
    ));

    return {
      success: true,
      syncedSources: connectedCount,
      scannedRuns: connectedCount * 3,
      importedRuns: connectedCount * 3,
      duplicateRuns: 0,
      syncedRuns: connectedCount * 3,
      lastSyncedAt,
    };
  }

  return apiPost<IntegrationSyncResponse>(
    '/integrations/sync',
    {},
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '연동 동기화에 실패했어.',
    },
  );
}

export async function connectIntegrationSource(sourceType: RunSourceType): Promise<IntegrationSourceActionResponse> {
  if (USE_MOCK_API) {
    const targetSource = mockApiState.connectedSources.find((source) => source.sourceType === sourceType);

    if (!targetSource) {
      throw new Error('연결할 소스를 찾지 못했어.');
    }

    mockApiState.connectedSources = mockApiState.connectedSources.map((source) => (
      source.sourceType === sourceType
        ? {
          ...source,
          connected: true,
          connectionStatus: 'connected',
          lastSyncedAt: source.lastSyncedAt ?? (source.sourceType === 'manual' ? formatMockTimestamp() : undefined),
        }
        : isExclusiveIntegrationSourceType(sourceType) && isExclusiveIntegrationSourceType(source.sourceType)
          ? {
            ...source,
            connected: false,
            connectionStatus: 'planned',
            lastSyncedAt: undefined,
            pendingImportCount: undefined,
          }
        : source
    ));

    const source = mockApiState.connectedSources.find((entry) => entry.sourceType === sourceType);

    if (!source) {
      throw new Error('연결된 소스를 다시 확인하지 못했어.');
    }

    return {
      success: true,
      source,
      sources: mockApiState.connectedSources,
    };
  }

  return apiPost<IntegrationSourceActionResponse>(
    `/integrations/sources/${sourceType}/connect`,
    {},
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '소스 연결에 실패했어.',
    },
  );
}

export async function disconnectIntegrationSource(sourceType: RunSourceType): Promise<IntegrationSourceActionResponse> {
  if (USE_MOCK_API) {
    const targetSource = mockApiState.connectedSources.find((source) => source.sourceType === sourceType);

    if (!targetSource) {
      throw new Error('해제할 소스를 찾지 못했어.');
    }

    mockApiState.connectedSources = mockApiState.connectedSources.map((source) => (
      source.sourceType === sourceType
        ? {
          ...source,
          connected: false,
          connectionStatus: 'planned',
          lastSyncedAt: undefined,
        }
        : source
    ));

    const source = mockApiState.connectedSources.find((entry) => entry.sourceType === sourceType);

    if (!source) {
      throw new Error('연결 해제된 소스를 다시 확인하지 못했어.');
    }

    return {
      success: true,
      source,
      sources: mockApiState.connectedSources,
    };
  }

  return apiPost<IntegrationSourceActionResponse>(
    `/integrations/sources/${sourceType}/disconnect`,
    {},
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '소스 연결 해제에 실패했어.',
    },
  );
}

export async function queueIntegrationImports(
  sourceType: Exclude<RunSourceType, 'manual'>,
  runs: Array<{
    externalId?: string;
    sourceLabel?: string;
    date: string;
    distanceKm: number;
    pace: string;
    startedAt?: string;
    endedAt?: string;
    durationSeconds?: number;
  }>,
): Promise<QueueIntegrationImportResponse> {
  if (USE_MOCK_API) {
    const source = mockApiState.connectedSources.find((entry) => entry.sourceType === sourceType);

    if (!source) {
      throw new Error('가져오기 대상 소스를 찾지 못했어.');
    }

    return {
      success: true,
      source: {
        ...source,
        pendingImportCount: (source.pendingImportCount ?? 0) + runs.length,
      },
      queuedRuns: runs.length,
      pendingRuns: (source.pendingImportCount ?? 0) + runs.length,
    };
  }

  return apiPost<QueueIntegrationImportResponse>(
    `/integrations/sources/${sourceType}/import`,
    {
      runs: runs.map((run) => ({
        ...(run.externalId ? { externalId: run.externalId.trim() } : {}),
        ...(run.sourceLabel ? { sourceLabel: run.sourceLabel.trim() } : {}),
        date: run.date.trim(),
        distanceKm: Number(run.distanceKm.toFixed(1)),
        pace: run.pace.trim(),
        ...(run.startedAt ? { startedAt: run.startedAt.trim() } : {}),
        ...(run.endedAt ? { endedAt: run.endedAt.trim() } : {}),
        ...(typeof run.durationSeconds === 'number' ? { durationSeconds: Math.max(1, Math.round(run.durationSeconds)) } : {}),
      })),
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '연동 기록 가져오기 요청에 실패했어.',
    },
  );
}
