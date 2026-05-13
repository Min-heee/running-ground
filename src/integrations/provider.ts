import { RunSourceType } from '@/domain';
import { queueIntegrationImports } from '@/services';
import { QueueIntegrationImportResponse } from '@/lib/api/types';

export type ImportableRunSourceType = Exclude<RunSourceType, 'manual'>;

export type NormalizedProviderRun = {
  externalId?: string;
  sourceLabel?: string;
  date: string;
  distanceKm: number;
  pace: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
};

export type ProviderRunImportPayload = {
  sourceType: ImportableRunSourceType;
  runs: NormalizedProviderRun[];
};

export function buildProviderRunImportPayload(
  sourceType: ImportableRunSourceType,
  runs: NormalizedProviderRun[],
): ProviderRunImportPayload {
  return {
    sourceType,
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
  };
}

export async function submitProviderRunImportPayload(
  payload: ProviderRunImportPayload,
): Promise<QueueIntegrationImportResponse> {
  return queueIntegrationImports(payload.sourceType, payload.runs);
}

export async function submitProviderRuns(
  sourceType: ImportableRunSourceType,
  runs: NormalizedProviderRun[],
): Promise<QueueIntegrationImportResponse> {
  return submitProviderRunImportPayload(buildProviderRunImportPayload(sourceType, runs));
}
