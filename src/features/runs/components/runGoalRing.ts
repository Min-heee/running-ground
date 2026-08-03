// 러닝 중 목표 링의 순수 계산 (오너 2026-08-03 재해석: 링 둘레 = 목표 거리).
//
// 링은 20칸 틱. 뛴 거리 ÷ 목표 거리만큼 12시부터 시계방향으로 채워진다. 목표를 넘으면
// 꽉 찬 채 유지 (러닝은 자동 종료되지 않는다 — 목표는 시각화 기준일 뿐).

export const GOAL_RING_TICK_COUNT = 20;

export type GoalRingModel = {
  tickCount: number;
  filledTicks: number;
  statusLine: string;
};

function formatKm(valueKm: number): string {
  return Number.isInteger(valueKm) ? String(valueKm) : valueKm.toFixed(1);
}

export function buildGoalRingModel(distanceKm: number, goalKm: number): GoalRingModel {
  const safeGoalKm = Number.isFinite(goalKm) && goalKm > 0 ? goalKm : 5;
  const safeDistanceKm = Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 0;

  if (safeDistanceKm >= safeGoalKm) {
    return {
      tickCount: GOAL_RING_TICK_COUNT,
      filledTicks: GOAL_RING_TICK_COUNT,
      statusLine: `목표 ${formatKm(safeGoalKm)}km 달성!`,
    };
  }

  const remainingKm = safeGoalKm - safeDistanceKm;

  return {
    tickCount: GOAL_RING_TICK_COUNT,
    filledTicks: Math.floor((safeDistanceKm / safeGoalKm) * GOAL_RING_TICK_COUNT),
    statusLine: `목표 ${formatKm(safeGoalKm)}km까지 ${remainingKm.toFixed(1)}km 남았어요`,
  };
}

// 히어로 숫자에 쓸 거리 라벨 분해 — '4.91km' → { number: '4.91', unit: 'km' }.
export function splitDistanceLabel(distanceLabel: string): { number: string; unit: string } {
  const match = /^([\d.,]+)\s*(.*)$/.exec(String(distanceLabel ?? '').trim());

  if (!match || !match[1]) {
    return { number: distanceLabel, unit: '' };
  }

  return { number: match[1], unit: match[2] || 'km' };
}
