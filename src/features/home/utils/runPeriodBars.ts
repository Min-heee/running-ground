// 내 러닝 기록 카드의 기간 그래프 (오너 2026-08-01) — 순수 계산만.
//
// 주 모드: 선택한 주의 요일별(월~일) 거리 막대.
// 월 모드: 선택한 달이 속한 해의 1~12월 거리 막대.
// 년 모드: 첫 기록 연도부터 올해까지 연도별 거리 막대 (출시 첫해면 한 개).
//
// '지금'에 해당하는 칸(오늘/이번 달/올해)은 따로 표시한다 — 혼자 탭 H안에서 확정했던
// "오늘 칸이 비어 있는 게 보이는 것" 그 신호를 그대로 가져온다.

import type { MyRunRecord } from '@/domain';
import {
  parseRunDateMs,
  type RunPeriodMode,
  type RunPeriodOption,
} from '@/features/home/utils/runPeriodSummary';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

export type RunPeriodBar = {
  key: string;
  label: string;
  distanceKm: number;
  // 오늘/이번 달/올해 — 그래프에서 강조되는 칸.
  isCurrent: boolean;
};

function sumDistanceInWindow(runs: readonly MyRunRecord[], startMs: number, endMs: number) {
  let totalKm = 0;

  for (const run of runs) {
    const runDayMs = parseRunDateMs(run);

    if (runDayMs === null || runDayMs < startMs || runDayMs >= endMs) {
      continue;
    }

    const distanceKm = Number(run.distanceKm);

    if (Number.isFinite(distanceKm) && distanceKm > 0) {
      totalKm += distanceKm;
    }
  }

  return totalKm;
}

export function buildRunPeriodBars(
  runs: readonly MyRunRecord[] | null | undefined,
  mode: RunPeriodMode,
  selectedOption: RunPeriodOption | null | undefined,
  nowMs: number,
): RunPeriodBar[] {
  const safeRuns = Array.isArray(runs) ? runs : [];

  if (mode === 'week') {
    if (!selectedOption) {
      return [];
    }

    // 옵션의 startMs는 이미 그 주의 월요일 자정(로컬)이다 (runPeriodSummary가 보장).
    return WEEKDAY_LABELS.map((label, index) => {
      const dayStartMs = selectedOption.startMs + index * MS_PER_DAY;
      const dayEndMs = dayStartMs + MS_PER_DAY;

      return {
        key: `day-${index}`,
        label,
        distanceKm: sumDistanceInWindow(safeRuns, dayStartMs, dayEndMs),
        isCurrent: nowMs >= dayStartMs && nowMs < dayEndMs,
      };
    });
  }

  if (mode === 'month') {
    // 선택한 달이 속한 해의 1~12월. 다른 해의 달을 고르면 그 해 그래프가 된다.
    const year = new Date(selectedOption?.startMs ?? nowMs).getFullYear();

    return Array.from({ length: 12 }, (unused, monthIndex) => {
      const monthStartMs = new Date(year, monthIndex, 1).getTime();
      const monthEndMs = new Date(year, monthIndex + 1, 1).getTime();

      return {
        key: `month-${year}-${monthIndex + 1}`,
        label: String(monthIndex + 1),
        distanceKm: sumDistanceInWindow(safeRuns, monthStartMs, monthEndMs),
        isCurrent: nowMs >= monthStartMs && nowMs < monthEndMs,
      };
    });
  }

  // 년: 첫 기록 연도(없으면 올해)부터 올해까지 — 출시 첫해에는 자연히 한 칸.
  const currentYear = new Date(nowMs).getFullYear();
  const parsedRunDates = safeRuns
    .map(parseRunDateMs)
    .filter((value): value is number => typeof value === 'number');
  const earliestYear = parsedRunDates.length
    ? Math.min(currentYear, new Date(Math.min(...parsedRunDates)).getFullYear())
    : currentYear;

  return Array.from({ length: currentYear - earliestYear + 1 }, (unused, offset) => {
    const year = earliestYear + offset;
    const yearStartMs = new Date(year, 0, 1).getTime();
    const yearEndMs = new Date(year + 1, 0, 1).getTime();

    return {
      key: `year-${year}`,
      label: String(year),
      distanceKm: sumDistanceInWindow(safeRuns, yearStartMs, yearEndMs),
      isCurrent: year === currentYear,
    };
  });
}
