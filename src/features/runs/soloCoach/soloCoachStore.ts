import { setSoloRunGoalKm } from '@/features/runs/soloGoal/soloRunGoalStore';
import { requestSoloRunAutoStart } from './soloAutoStartStore';
import type { SoloCoachConfig } from './soloCoachModel';

// Module-scoped hand-off between the 대기방 (SoloCoachSetupScreen) and the run
// runtime: the setup screen arms a config + an auto-start request (shared
// soloAutoStartStore), navigates to the 러닝 탭, and the runtime consumes both.
// Session-scoped on purpose — a fresh app start begins without a coach until
// the user sets one up again. Mutually exclusive with the 나와의 대결 — the
// setup screens clear the other feature's store before arming.

let activeConfig: SoloCoachConfig | null = null;

export function armSoloCoach(config: SoloCoachConfig): void {
  activeConfig = config;

  // 러닝 중 목표 링이 페이스메이커의 목표 거리를 한 바퀴 둘레로 쓰게 (오너 2026-08-03:
  // 페이스메이커도 같은 러닝 화면). 거리 목표 없는 설정이면 기존 RUN 목표 유지.
  if (typeof config.goalDistanceKm === 'number' && config.goalDistanceKm > 0) {
    setSoloRunGoalKm(config.goalDistanceKm);
  }

  requestSoloRunAutoStart();
}

export function getSoloCoachConfig(): SoloCoachConfig | null {
  return activeConfig;
}

export function clearSoloCoach(): void {
  activeConfig = null;
}
