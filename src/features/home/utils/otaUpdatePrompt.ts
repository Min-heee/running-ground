// Pure decision logic for the OTA update adoption prompt (P1-5).
//
// The hook (useOtaUpdatePrompt) owns the expo-updates side effects; every yes/no
// decision lives here so it can be unit-tested without React or native modules.
//
// THE CRITICAL GUARD: never offer (and never reload) while a run/match could be
// active. A missed prompt is fine — a mid-run reload is a catastrophe — so every
// predicate here fails CLOSED (returns "don't act") on any ambiguous input.

// Foreground update checks are throttled to at most once per 60 minutes. Raised
// from 15m: a published OTA is not urgent, and the check + bundle fetch competes for
// the JS thread / network, so we sample it far less often.
export const OTA_UPDATE_CHECK_THROTTLE_MS = 60 * 60 * 1000;

export type OtaUpdateCheckGateInput = {
  // __DEV__ — expo-updates throws in dev, so checks are skipped entirely.
  isDev: boolean;
  // Updates.isEnabled — false in Expo Go / dev clients without EAS Updates.
  isUpdatesEnabled: boolean;
  // Strong active-run signal (tracking snapshot not idle OR a live match mounted).
  isRunActive: boolean;
  nowMs: number;
  // Epoch ms of the last check attempt, or null when never checked.
  lastCheckAtMs: number | null;
};

// Whether the hook may hit the network to check/fetch an update right now.
// Skipped mid-run on purpose: the check itself is harmless, but there is no
// point paying network/CPU cost during a run for a banner we will not show.
export function shouldRunOtaUpdateCheck({
  isDev,
  isUpdatesEnabled,
  isRunActive,
  nowMs,
  lastCheckAtMs,
}: OtaUpdateCheckGateInput): boolean {
  if (isDev || !isUpdatesEnabled) {
    return false;
  }

  if (isRunActive) {
    return false;
  }

  if (!Number.isFinite(nowMs)) {
    return false;
  }

  if (lastCheckAtMs !== null && Number.isFinite(lastCheckAtMs) && nowMs - lastCheckAtMs < OTA_UPDATE_CHECK_THROTTLE_MS) {
    return false;
  }

  return true;
}

export type OtaUpdateOfferInput = {
  // A new update bundle has been fully fetched and is ready to apply on reload.
  hasUpdateReady: boolean;
  // Strong active-run signal (tracking snapshot not idle OR a live match mounted).
  isRunActive: boolean;
  isDev: boolean;
};

// Whether the "새 버전이 준비됐어요" banner may be shown. Also re-checked
// immediately before Updates.reloadAsync() — the banner being on screen is
// never, by itself, permission to reload.
export function shouldOfferOtaUpdate({ hasUpdateReady, isRunActive, isDev }: OtaUpdateOfferInput): boolean {
  return hasUpdateReady && !isRunActive && !isDev;
}

// A cached /rooms/my check younger than this that shows the user IN a party room
// suppresses the prompt. This closes the adversarial-review "arming blind window":
// a guest idling on HOME when the host presses start has a few seconds where the
// linked match exists server-side but no arena is mounted and GPS has not started —
// both strong signals read clear. While the user is in ANY room the caches refresh
// every ~1.5-2s, so this signal is live exactly when the blind window can occur.
// Failure direction is suppression-only (a stale cache hides the prompt for at most
// this window after leaving a room) — never a mid-run reload.
export const OTA_ROOM_SIGNAL_FRESH_MS = 120_000;

export type RoomCheckSignalInput = {
  // roomId from the cached /rooms/my payload, if any.
  roomId: string | null | undefined;
  // When that cache entry completed.
  completedAtMs: number;
  nowMs: number;
};

export function isRoomCheckSignalActive({ roomId, completedAtMs, nowMs }: RoomCheckSignalInput): boolean {
  if (!roomId) {
    return false;
  }

  if (!Number.isFinite(completedAtMs) || !Number.isFinite(nowMs)) {
    // Unreadable clock input: fail CLOSED (treat as active → suppress the prompt).
    return true;
  }

  return nowMs - completedAtMs <= OTA_ROOM_SIGNAL_FRESH_MS;
}


// 자동 적용 (오너 2026-08-13): "강제종료 두 번" 없이 최신이 되게 — 앱을 켠 직후(런치 창 안)에
// 다운로드가 끝난 업데이트는 묻지 않고 바로 reload한다. 창 밖(포그라운드 복귀 등 사용 중일 때)
// 이나 러닝/대결 신호가 있으면 기존 카드로 강등 — 갑작스러운 화면 리셋은 켠 직후에만 허용.
// 세션당 1회: reload 실패 시 재시도 루프를 막는다 (성공하면 새 세션이라 자연히 리셋).
export const OTA_AUTO_APPLY_LAUNCH_WINDOW_MS = 60_000;

export type OtaAutoApplyInput = {
  isDev: boolean;
  isRunActive: boolean;
  hasUpdateReady: boolean;
  // 앱 프로세스 시작 후 경과 ms.
  appAgeMs: number;
  autoAppliedThisSession: boolean;
};

export function shouldAutoApplyOtaUpdate({
  isDev,
  isRunActive,
  hasUpdateReady,
  appAgeMs,
  autoAppliedThisSession,
}: OtaAutoApplyInput): boolean {
  if (isDev || isRunActive || !hasUpdateReady || autoAppliedThisSession) {
    return false;
  }

  return Number.isFinite(appAgeMs) && appAgeMs >= 0 && appAgeMs <= OTA_AUTO_APPLY_LAUNCH_WINDOW_MS;
}
