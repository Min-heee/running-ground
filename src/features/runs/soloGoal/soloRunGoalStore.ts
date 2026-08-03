// RUN 목표 거리 (오너 2026-08-03) — 혼자 탭 RUN 블록에서 고르고, 러닝 중 링이 이 값을
// '한 바퀴 둘레'로 쓴다. 러닝 탭과 러닝 중 화면이 props로 이어져 있지 않아 모듈 싱글턴
// (liveRunSettingsStore와 같은 패턴). 목표는 링 시각화 기준일 뿐 러닝을 자동 종료하지
// 않는다.

import { useSyncExternalStore } from 'react';

export const SOLO_RUN_GOAL_OPTIONS_KM = [3, 5, 10] as const;
export const DEFAULT_SOLO_RUN_GOAL_KM = 5;

let goalKm: number = DEFAULT_SOLO_RUN_GOAL_KM;
const listeners = new Set<() => void>();

export function getSoloRunGoalKm(): number {
  return goalKm;
}

export function setSoloRunGoalKm(nextGoalKm: number) {
  if (!Number.isFinite(nextGoalKm) || nextGoalKm <= 0 || nextGoalKm === goalKm) {
    return;
  }

  goalKm = nextGoalKm;
  listeners.forEach((listener) => listener());
}

function subscribeSoloRunGoal(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSoloRunGoalKm(): number {
  return useSyncExternalStore(subscribeSoloRunGoal, getSoloRunGoalKm, getSoloRunGoalKm);
}
