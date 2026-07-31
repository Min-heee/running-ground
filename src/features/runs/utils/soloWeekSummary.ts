// 혼자 탭의 '이번 주 흐름' 계산 (오너 2026-07-31, 시안 H) — 순수 로직만.
//
// 요일별 막대는 기기 로컬(=한국) 달력의 이번 주 월~일이다. 러닝 기록의 날짜는
// 'YYYY-MM-DD' 문자열이라 UTC로 파싱하면 자정 근처 기록이 하루씩 밀린다 — 그래서 기존
// parseRunDateMs(로컬 자정으로 정규화)를 그대로 쓴다.

import type { MyRunRecord } from '@/domain';
import { parseRunDateMs } from '@/features/home/utils/runPeriodSummary';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

export type SoloWeekBar = {
  key: string;
  label: string;
  distanceKm: number;
  isToday: boolean;
  // 아직 오지 않은 요일 — 기록이 없는 게 당연하므로 '안 뛴 날'과 다르게 그린다.
  isFuture: boolean;
};

export type SoloWeekSummary = {
  bars: SoloWeekBar[];
  totalDistanceKm: number;
  runCount: number;
  todayDistanceKm: number;
  maxDistanceKm: number;
};

// 월요일 자정(로컬)을 이번 주의 시작으로 본다.
export function getWeekStartMs(nowMs: number): number {
  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  // getDay(): 0=일 … 6=토 → 월요일까지 며칠 뒤로 갈지.
  const daysFromMonday = (now.getDay() + 6) % 7;

  return startOfToday - daysFromMonday * MS_PER_DAY;
}

export function buildSoloWeekSummary(runs: MyRunRecord[], nowMs: number = Date.now()): SoloWeekSummary {
  const weekStartMs = getWeekStartMs(nowMs);
  const todayIndex = Math.floor((nowMs - weekStartMs) / MS_PER_DAY);
  const distanceByDay = new Array<number>(7).fill(0);
  let runCount = 0;

  for (const run of runs ?? []) {
    const runDayMs = parseRunDateMs(run);

    if (runDayMs === null) {
      continue;
    }

    const dayIndex = Math.round((runDayMs - weekStartMs) / MS_PER_DAY);

    if (dayIndex < 0 || dayIndex > 6) {
      continue;
    }

    const distanceKm = Number(run.distanceKm);

    if (!Number.isFinite(distanceKm) || distanceKm < 0) {
      continue;
    }

    distanceByDay[dayIndex] += distanceKm;
    runCount += 1;
  }

  const bars = distanceByDay.map((distanceKm, index) => ({
    key: `day-${index}`,
    label: WEEKDAY_LABELS[index],
    distanceKm,
    isToday: index === todayIndex,
    isFuture: index > todayIndex,
  }));

  return {
    bars,
    totalDistanceKm: distanceByDay.reduce((total, distanceKm) => total + distanceKm, 0),
    runCount,
    todayDistanceKm: todayIndex >= 0 && todayIndex <= 6 ? distanceByDay[todayIndex] : 0,
    maxDistanceKm: Math.max(...distanceByDay),
  };
}
