// RUN 목표 거리 (오너 2026-08-03) — 혼자 탭 RUN 블록에서 고르고, 러닝 중 링이 이 값을
// '한 바퀴 둘레'로 쓴다. 러닝 탭과 러닝 중 화면이 props로 이어져 있지 않아 모듈 싱글턴
// (liveRunSettingsStore와 같은 패턴). 목표는 링 시각화 기준일 뿐 러닝을 자동 종료하지
// 않는다.

import { useSyncExternalStore } from 'react';

export const DEFAULT_SOLO_RUN_GOAL_KM = 5;

// 직접 입력 정규화 (오너 2026-08-03: 칩 → 직접 입력). 쉼표 소수점 허용, 0.5~99.9km로
// 클램프, 소수 한 자리 반올림. 못 읽는 입력은 null — 호출자가 이전 값을 유지한다.
export function parseGoalInputKm(raw: string): number | null {
  const parsed = Number(String(raw ?? '').trim().replace(',', '.'));

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.min(99.9, Math.max(0.5, Math.round(parsed * 10) / 10));
}

// 입력창 표시용 — 정수는 '5', 소수는 '5.5'.
export function formatGoalInputKm(valueKm: number): string {
  return Number.isInteger(valueKm) ? String(valueKm) : valueKm.toFixed(1);
}

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
