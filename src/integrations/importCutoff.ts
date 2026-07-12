// Launch-date import cutoff — CLIENT-SIDE MIRROR.
//
// The AUTHORITATIVE enforcement lives on the server in
// backend/src/lib/integrationImportCutoff.mjs (IMPORT_MIN_RUN_DATE, overridable via
// BACKEND_IMPORT_MIN_RUN_DATE): the /integrations import route drops pre-launch-dated
// entries no matter which app version sends them. This mirror only trims the upload
// payload before it leaves the device and powers the honest UX messaging — keep the
// value in lockstep with the server default.
//
// Owner decision (final): health-store imports (Apple Health / Health Connect) may
// only bring in runs dated ON/AFTER launch day. Historical records would inflate the
// display level/lifetime distance and bloat the store even though they mint no points.
export const IMPORT_MIN_RUN_DATE = '2026-07-13';

// YYYY-MM-DD strings compare lexicographically === chronologically, no timezone math.
export function isPreLaunchImportRunDate(date: string): boolean {
  return date < IMPORT_MIN_RUN_DATE;
}

export function partitionRunsByLaunchCutoff<T extends { date: string }>(
  runs: T[],
): { importableRuns: T[]; skippedPreLaunchRuns: number } {
  const importableRuns = runs.filter((run) => !isPreLaunchImportRunDate(run.date));

  return {
    importableRuns,
    skippedPreLaunchRuns: runs.length - importableRuns.length,
  };
}

export type DeviceImportCutoffCounts = {
  fetchedRuns: number;
  skippedPreLaunchRuns: number;
};

// True when the device DID return runs but every single one predates launch — the
// 0-import message must then explain the cutoff instead of steering the user to
// permission settings (the permission guidance would be dishonest here).
export function didSkipAllFetchedRunsAsPreLaunch({ fetchedRuns, skippedPreLaunchRuns }: DeviceImportCutoffCounts): boolean {
  return fetchedRuns > 0 && skippedPreLaunchRuns >= fetchedRuns;
}

export function buildPreLaunchSkipNotice(skippedPreLaunchRuns: number): string {
  return `출시(${IMPORT_MIN_RUN_DATE}) 이전 기록 ${skippedPreLaunchRuns}개는 가져오지 않았어 — 러닝그라운드는 출시 이후 기록만 반영해.`;
}

export function buildAllPreLaunchImportMessage(skippedPreLaunchRuns: number): string {
  return `기기에서 읽은 ${skippedPreLaunchRuns}개가 모두 출시(${IMPORT_MIN_RUN_DATE}) 이전 기록이라 가져오지 않았어 — 러닝그라운드는 출시 이후 기록만 반영해.`;
}

// Tacks the honest skip one-liner onto an import result message when some (but not
// necessarily all) fetched records were excluded by the cutoff.
export function appendPreLaunchSkipNotice(message: string, skippedPreLaunchRuns: number): string {
  if (skippedPreLaunchRuns <= 0) {
    return message;
  }

  return `${message} ${buildPreLaunchSkipNotice(skippedPreLaunchRuns)}`;
}
