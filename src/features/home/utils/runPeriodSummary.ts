import type { MyRunRecord } from '@/domain';
import { resolveRunDurationSeconds } from '@/utils/runDuration';

export type RunPeriodMode = 'week' | 'month' | 'year';

export type RunPeriodOption = {
  key: string;
  label: string;
  startMs: number;
  endMs: number;
};

export type RunPeriodSummary = {
  distanceKm: number;
  runCount: number;
  durationSeconds: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PERIOD_CAP_BY_MODE: Record<RunPeriodMode, number> = {
  week: 26,
  month: 36,
  year: 10,
};
const EMPTY_PERIOD_COUNT_BY_MODE: Record<RunPeriodMode, number> = {
  week: 8,
  month: 6,
  year: 3,
};

function isFiniteTimestamp(value: number) {
  return Number.isFinite(value) && value > 0;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function parseDateOnlyMs(value?: string) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day);

  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== monthIndex
    || parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed.getTime();
}

export function parseRunDateMs(run: MyRunRecord): number | null {
  const dateOnlyMs = parseDateOnlyMs(run.date);

  if (dateOnlyMs !== null) {
    return dateOnlyMs;
  }

  if (typeof run.startedAt !== 'string') {
    return null;
  }

  const startedAtMs = new Date(run.startedAt).getTime();

  return isFiniteTimestamp(startedAtMs) ? startOfLocalDay(new Date(startedAtMs)) : null;
}

function getWeekStartMs(timestampMs: number) {
  const date = new Date(timestampMs);
  const dayOffsetFromMonday = (date.getDay() + 6) % 7;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - dayOffsetFromMonday);
  return start.getTime();
}

function getPeriodStartMs(mode: RunPeriodMode, timestampMs: number) {
  const date = new Date(timestampMs);

  if (mode === 'week') {
    return getWeekStartMs(timestampMs);
  }

  if (mode === 'month') {
    return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  }

  return new Date(date.getFullYear(), 0, 1).getTime();
}

function addPeriods(mode: RunPeriodMode, startMs: number, amount: number) {
  const start = new Date(startMs);

  if (mode === 'week') {
    const next = new Date(start);
    next.setDate(next.getDate() + (amount * 7));
    return next.getTime();
  }

  if (mode === 'month') {
    return new Date(start.getFullYear(), start.getMonth() + amount, 1).getTime();
  }

  return new Date(start.getFullYear() + amount, 0, 1).getTime();
}

function buildPeriodKey(mode: RunPeriodMode, startMs: number) {
  const date = new Date(startMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  if (mode === 'week') {
    return `week:${year}-${month}-${day}`;
  }

  if (mode === 'month') {
    return `month:${year}-${month}`;
  }

  return `year:${year}`;
}

function formatShortDate(timestampMs: number) {
  const date = new Date(timestampMs);
  return `${date.getMonth() + 1}. ${date.getDate()}.`;
}

function buildPeriodLabel(mode: RunPeriodMode, startMs: number, currentStartMs: number) {
  const date = new Date(startMs);

  if (mode === 'week') {
    if (startMs === currentStartMs) {
      return '이번 주';
    }

    if (startMs === addPeriods('week', currentStartMs, -1)) {
      return '지난주';
    }

    return `${formatShortDate(startMs)}~${formatShortDate(addPeriods('week', startMs, 1) - MS_PER_DAY)}`;
  }

  if (mode === 'month') {
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
  }

  return `${date.getFullYear()}년`;
}

export function resolveCurrentPeriodKey(mode: RunPeriodMode, nowMs: number) {
  const safeNowMs = isFiniteTimestamp(nowMs) ? nowMs : Date.now();
  return buildPeriodKey(mode, getPeriodStartMs(mode, safeNowMs));
}

export function buildRunPeriodOptions(
  runs: readonly MyRunRecord[] | null | undefined,
  mode: RunPeriodMode,
  nowMs: number,
): RunPeriodOption[] {
  const safeNowMs = isFiniteTimestamp(nowMs) ? nowMs : Date.now();
  const currentStartMs = getPeriodStartMs(mode, safeNowMs);
  const cap = PERIOD_CAP_BY_MODE[mode];
  const parsedRunDates = Array.isArray(runs)
    ? runs.map(parseRunDateMs).filter((value): value is number => typeof value === 'number')
    : [];
  const earliestRunMs = parsedRunDates.length > 0 ? Math.min(...parsedRunDates) : null;
  const fallbackStartMs = addPeriods(mode, currentStartMs, -(EMPTY_PERIOD_COUNT_BY_MODE[mode] - 1));
  const capStartMs = addPeriods(mode, currentStartMs, -(cap - 1));
  const earliestStartMs = earliestRunMs === null
    ? fallbackStartMs
    : getPeriodStartMs(mode, Math.min(earliestRunMs, safeNowMs));
  const startMs = Math.max(earliestStartMs, capStartMs);
  const options: RunPeriodOption[] = [];

  for (let cursorMs = startMs; cursorMs <= currentStartMs; cursorMs = addPeriods(mode, cursorMs, 1)) {
    options.push({
      key: buildPeriodKey(mode, cursorMs),
      label: buildPeriodLabel(mode, cursorMs, currentStartMs),
      startMs: cursorMs,
      endMs: addPeriods(mode, cursorMs, 1),
    });
  }

  return options;
}

export function summarizeRunsForPeriod(
  runs: readonly MyRunRecord[] | null | undefined,
  option: RunPeriodOption | null | undefined,
): RunPeriodSummary {
  if (!Array.isArray(runs) || !option) {
    return { distanceKm: 0, runCount: 0, durationSeconds: 0 };
  }

  return runs.reduce<RunPeriodSummary>((summary, run) => {
    const runDateMs = parseRunDateMs(run);

    if (runDateMs === null || runDateMs < option.startMs || runDateMs >= option.endMs) {
      return summary;
    }

    const distanceKm = Number.isFinite(run.distanceKm) && run.distanceKm > 0 ? run.distanceKm : 0;
    // durationSeconds가 없는 기록(예전 수동 추가)은 페이스 × 거리로 도출 —
    // 시간 합계가 0:00으로 비는 걸 막는다.
    const durationSeconds = resolveRunDurationSeconds(run) ?? 0;

    return {
      distanceKm: summary.distanceKm + distanceKm,
      runCount: summary.runCount + 1,
      durationSeconds: summary.durationSeconds + durationSeconds,
    };
  }, { distanceKm: 0, runCount: 0, durationSeconds: 0 });
}

export function formatRunPeriodDistanceKm(distanceKm: number) {
  const safeDistanceKm = Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : 0;
  return safeDistanceKm.toFixed(1);
}

export function formatRunPeriodDurationLabel(durationSeconds: number) {
  const safeSeconds = Number.isFinite(durationSeconds) ? Math.max(0, Math.round(durationSeconds)) : 0;
  const totalMinutes = Math.floor(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}:${String(minutes).padStart(2, '0')}`;
}
