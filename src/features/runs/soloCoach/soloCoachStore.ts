import type { SoloCoachConfig } from './soloCoachModel';

// Module-scoped hand-off between the 대기방 (SoloCoachSetupScreen) and the run
// runtime: the setup screen arms a config + an auto-start request, navigates to
// the 러닝 탭, and the runtime consumes both. Session-scoped on purpose — a
// fresh app start begins without a coach until the user sets one up again.

let activeConfig: SoloCoachConfig | null = null;
let autoStartRequestedAtMs: number | null = null;

// The auto-start request goes stale quickly: it must only fire on the
// navigation it was armed for, never minutes later from an unrelated render.
const AUTO_START_FRESH_MS = 30_000;

export function armSoloCoach(config: SoloCoachConfig, nowMs = Date.now()): void {
  activeConfig = config;
  autoStartRequestedAtMs = nowMs;
}

export function getSoloCoachConfig(): SoloCoachConfig | null {
  return activeConfig;
}

export function clearSoloCoach(): void {
  activeConfig = null;
  autoStartRequestedAtMs = null;
}

// Consume the pending auto-start exactly once (the config itself stays armed
// for the run that follows).
export function consumeSoloCoachAutoStart(nowMs = Date.now()): boolean {
  if (autoStartRequestedAtMs === null || nowMs - autoStartRequestedAtMs > AUTO_START_FRESH_MS) {
    autoStartRequestedAtMs = null;
    return false;
  }

  autoStartRequestedAtMs = null;
  return true;
}

export function hasPendingSoloCoachAutoStart(nowMs = Date.now()): boolean {
  return autoStartRequestedAtMs !== null && nowMs - autoStartRequestedAtMs <= AUTO_START_FRESH_MS;
}
