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
  requestSoloRunAutoStart();
}

export function getSoloCoachConfig(): SoloCoachConfig | null {
  return activeConfig;
}

export function clearSoloCoach(): void {
  activeConfig = null;
}
