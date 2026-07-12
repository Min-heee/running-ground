// Launch-date import cutoff for health-store integrations (owner decision, final):
// Apple Health / Health Connect imports (and every brand source routed through the
// same /api/integrations/sources/:sourceType/import queue) may only bring in runs
// dated ON/AFTER launch day. Historical pre-launch records must never enter the app —
// imported runs already mint zero points and stay out of every competitive surface,
// but bulk-importing years of history would still inflate the DISPLAY level/lifetime
// distance on home/profile and bloat the whole-store blob with run records.
//
// This module is the single authority for the cutoff value. The client mirrors it in
// src/integrations/importCutoff.ts for UX-side trimming/messaging, but the server-side
// filter in routes/socialRoutes.mjs (handleQueueIntegrationImports) is what old app
// versions cannot bypass.
//
// All comparisons are plain string comparisons on YYYY-MM-DD dates — lexicographic
// order equals chronological order for that shape, and it sidesteps timezone math.

export const DEFAULT_IMPORT_MIN_RUN_DATE = '2026-07-13';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Resolve the effective cutoff from an env-provided override. Anything that is not a
// real calendar date in YYYY-MM-DD form falls back to the launch-day default.
export function resolveImportMinRunDate(rawValue) {
  if (typeof rawValue !== 'string') {
    return DEFAULT_IMPORT_MIN_RUN_DATE;
  }

  const trimmed = rawValue.trim();

  if (!DATE_ONLY_PATTERN.test(trimmed)) {
    return DEFAULT_IMPORT_MIN_RUN_DATE;
  }

  const parsed = new Date(`${trimmed}T00:00:00Z`);

  // Round-trip check rejects impossible dates like 2026-02-30 that pass the regex.
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    return DEFAULT_IMPORT_MIN_RUN_DATE;
  }

  return trimmed;
}

export const IMPORT_MIN_RUN_DATE = resolveImportMinRunDate(process.env.BACKEND_IMPORT_MIN_RUN_DATE);

export function isPreLaunchImportRunDate(date, minRunDate = IMPORT_MIN_RUN_DATE) {
  return String(date ?? '') < minRunDate;
}

// Split normalized import entries (each already carrying a validated YYYY-MM-DD `date`
// from normalizeImportedRun) into the ones allowed past the launch cutoff and a count
// of dropped pre-launch entries. Order of the surviving entries is preserved.
export function partitionImportRunsByLaunchCutoff(normalizedRuns, minRunDate = IMPORT_MIN_RUN_DATE) {
  const importableRuns = [];
  let skippedPreLaunch = 0;

  for (const run of normalizedRuns) {
    if (isPreLaunchImportRunDate(run.date, minRunDate)) {
      skippedPreLaunch += 1;
    } else {
      importableRuns.push(run);
    }
  }

  return { importableRuns, skippedPreLaunch };
}
