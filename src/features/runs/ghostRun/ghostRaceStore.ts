import { requestSoloRunAutoStart } from '@/features/runs/soloCoach/soloAutoStartStore';
import type { GhostRaceConfig } from './ghostRaceModel';

// Session-scoped hand-off between the 나와의 대결 대기방 and the run runtime.
// Mutually exclusive with the 페이스메이커 — the SETUP SCREENS clear the other
// feature's store before arming (kept out of the stores to avoid an import
// cycle), so a run never gets two competing voice tracks.

let activeConfig: GhostRaceConfig | null = null;

export function armGhostRace(config: GhostRaceConfig): void {
  activeConfig = config;
  requestSoloRunAutoStart();
}

export function getGhostRaceConfig(): GhostRaceConfig | null {
  return activeConfig;
}

export function clearGhostRace(): void {
  activeConfig = null;
}
