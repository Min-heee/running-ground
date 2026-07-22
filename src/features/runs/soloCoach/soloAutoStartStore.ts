// Shared solo-run auto-start hand-off: the 페이스메이커 대기방 AND the 나와의
// 대결 대기방 both arm their config, request an auto-start here, and navigate
// to the 러닝 탭 where useSoloCoachAutoStart consumes the request and fires the
// same ready action as the 러닝 시작 button.

let autoStartRequestedAtMs: number | null = null;

// The request goes stale quickly: it must only fire on the navigation it was
// armed for, never minutes later from an unrelated render.
const AUTO_START_FRESH_MS = 30_000;

export function requestSoloRunAutoStart(nowMs = Date.now()): void {
  autoStartRequestedAtMs = nowMs;
}

export function consumeSoloRunAutoStart(nowMs = Date.now()): boolean {
  if (autoStartRequestedAtMs === null || nowMs - autoStartRequestedAtMs > AUTO_START_FRESH_MS) {
    autoStartRequestedAtMs = null;
    return false;
  }

  autoStartRequestedAtMs = null;
  return true;
}

export function hasPendingSoloRunAutoStart(nowMs = Date.now()): boolean {
  return autoStartRequestedAtMs !== null && nowMs - autoStartRequestedAtMs <= AUTO_START_FRESH_MS;
}
