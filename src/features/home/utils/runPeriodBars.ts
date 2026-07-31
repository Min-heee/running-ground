// 내 러닝 기록 카드의 기간 그래프 (오너 2026-08-01, 나이키 활동 화면 스타일 확정) — 순수 계산만.
//
// 입도는 나이키와 동일:
//   주 = 선택한 주의 요일별(월~일)
//   월 = 선택한 달의 일별(1~말일, x축 라벨은 1/5/12/19/26/말일만)
//   년 = 선택한 해의 월별(1월~12월)
//
// 점선 평균 = 총거리 ÷ 기록 있는 칸 수 (나이키 검증: 9.9km/2회→5.0, 313.6/9개월→34.8).
// '지금' 칸(오늘/이번 달)은 강조 — H안에서 확정한 "오늘 칸이 비어 있는 게 보이는" 신호.

import type { MyRunRecord } from '@/domain';
import {
  parseRunDateMs,
  type RunPeriodMode,
  type RunPeriodOption,
} from '@/features/home/utils/runPeriodSummary';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
// 월(일별) 모드의 x축 라벨을 붙일 날 — 나이키와 같은 눈금.
const MONTH_TICK_DAYS = [1, 5, 12, 19, 26];

export type RunPeriodBar = {
  key: string;
  label: string;
  distanceKm: number;
  isCurrent: boolean;
};

export type RunPeriodChartModel = {
  bars: RunPeriodBar[];
  // 기록 있는 칸들의 평균 — 점선 위치. 기록이 없으면 null(점선 없음).
  averageKm: number | null;
  // y축 눈금 한 칸 값. 눈금은 tickStep×1..3, 차트 최대값은 tickStep×3.
  tickStepKm: number;
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
    // 선택한 달의 일별 막대 (나이키 월 탭과 동일). 옵션 startMs = 그 달 1일 자정.
    const monthStart = new Date(selectedOption?.startMs ?? nowMs);
    const year = monthStart.getFullYear();
    const monthIndex = monthStart.getMonth();
    const dayCount = new Date(year, monthIndex + 1, 0).getDate();

    return Array.from({ length: dayCount }, (unused, dayOffset) => {
      const day = dayOffset + 1;
      const dayStartMs = new Date(year, monthIndex, day).getTime();
      const dayEndMs = dayStartMs + MS_PER_DAY;

      return {
        key: `date-${year}-${monthIndex + 1}-${day}`,
        // x축 라벨은 눈금 날짜와 말일에만 — 31칸 전부에 붙이면 겹쳐서 못 읽는다.
        label: MONTH_TICK_DAYS.includes(day) || day === dayCount ? String(day) : '',
        distanceKm: sumDistanceInWindow(safeRuns, dayStartMs, dayEndMs),
        isCurrent: nowMs >= dayStartMs && nowMs < dayEndMs,
      };
    });
  }

  // 년: 선택한 해의 월별 (나이키 년 탭과 동일). 옵션 startMs = 그 해 1월 1일.
  const year = new Date(selectedOption?.startMs ?? nowMs).getFullYear();

  return Array.from({ length: 12 }, (unused, monthIndex) => {
    const monthStartMs = new Date(year, monthIndex, 1).getTime();
    const monthEndMs = new Date(year, monthIndex + 1, 1).getTime();

    return {
      key: `month-${year}-${monthIndex + 1}`,
      label: `${monthIndex + 1}월`,
      distanceKm: sumDistanceInWindow(safeRuns, monthStartMs, monthEndMs),
      isCurrent: nowMs >= monthStartMs && nowMs < monthEndMs,
    };
  });
}

// y축 눈금 한 칸 — 1·2·5×10^n 중에서 눈금 3개(×3)가 최대값을 덮는 가장 작은 값.
// 기록이 없으면 나이키처럼 0/3/6/9km 기본 축을 쓴다.
export function resolveChartTickStepKm(maxDistanceKm: number): number {
  if (!Number.isFinite(maxDistanceKm) || maxDistanceKm <= 0) {
    return 3;
  }

  const candidates = [1, 2, 3, 5];

  for (let scale = 1; scale <= 1_000_000; scale *= 10) {
    for (const base of candidates) {
      const step = base * scale;

      if (step * 3 >= maxDistanceKm) {
        return step;
      }
    }
  }

  return maxDistanceKm / 3;
}

export function buildRunPeriodChartModel(
  runs: readonly MyRunRecord[] | null | undefined,
  mode: RunPeriodMode,
  selectedOption: RunPeriodOption | null | undefined,
  nowMs: number,
): RunPeriodChartModel {
  const bars = buildRunPeriodBars(runs, mode, selectedOption, nowMs);
  const activeBars = bars.filter((bar) => bar.distanceKm > 0);
  const totalKm = activeBars.reduce((total, bar) => total + bar.distanceKm, 0);
  const maxDistanceKm = activeBars.length ? Math.max(...activeBars.map((bar) => bar.distanceKm)) : 0;

  // 표시 총거리(1dp)를 먼저 만들고 나눈다 — 원시 합(5.6+4.3=9.8999…)을 그대로 나누면
  // 평균이 4.9로 나와 카드의 총거리 9.9와 어긋난다 (나이키도 9.9/2→5.0).
  const displayTotalKm = Number(totalKm.toFixed(1));

  return {
    bars,
    averageKm: activeBars.length ? Math.round((displayTotalKm / activeBars.length) * 10) / 10 : null,
    tickStepKm: resolveChartTickStepKm(maxDistanceKm),
  };
}
