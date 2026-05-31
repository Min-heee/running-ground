import type { MyRunRecord } from '@/domain';

export const HOME_RECENT_RUNS_LIMIT = 4;

export function selectRecentRuns(
  runs: readonly MyRunRecord[] | null | undefined,
  limit = HOME_RECENT_RUNS_LIMIT,
): MyRunRecord[] {
  if (!Array.isArray(runs)) {
    return [];
  }

  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : HOME_RECENT_RUNS_LIMIT;

  return runs.slice(0, safeLimit);
}
