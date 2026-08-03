import { requestSoloRunAutoStart } from '@/features/runs/soloCoach/soloAutoStartStore';
import { setSoloRunGoalKm } from '@/features/runs/soloGoal/soloRunGoalStore';
import type { GhostRaceConfig } from './ghostRaceModel';

// Session-scoped hand-off between the 나와의 대결 대기방 and the run runtime.
// Mutually exclusive with the 페이스메이커 — the SETUP SCREENS clear the other
// feature's store before arming (kept out of the stores to avoid an import
// cycle), so a run never gets two competing voice tracks.

let activeConfig: GhostRaceConfig | null = null;

export function armGhostRace(config: GhostRaceConfig): void {
  activeConfig = config;

  // 러닝 중 목표 링이 그때 기록의 거리를 한 바퀴 둘레로 쓰게 (오너 2026-08-03:
  // 자신과 대결도 같은 러닝 화면) — 링이 다 차면 고스트 코스를 끝까지 뛴 것.
  const ghostDistanceKm = config.ghost.distanceM / 1000;

  if (Number.isFinite(ghostDistanceKm) && ghostDistanceKm > 0) {
    setSoloRunGoalKm(Math.max(0.5, Math.round(ghostDistanceKm * 10) / 10));
  }

  requestSoloRunAutoStart();
}

export function getGhostRaceConfig(): GhostRaceConfig | null {
  return activeConfig;
}

export function clearGhostRace(): void {
  activeConfig = null;
}
