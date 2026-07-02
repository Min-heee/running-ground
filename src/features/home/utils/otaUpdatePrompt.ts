// Pure decision logic for the OTA update adoption prompt (P1-5).
//
// The hook (useOtaUpdatePrompt) owns the expo-updates side effects; every yes/no
// decision lives here so it can be unit-tested without React or native modules.
//
// THE CRITICAL GUARD: never offer (and never reload) while a run/match could be
// active. A missed prompt is fine — a mid-run reload is a catastrophe — so every
// predicate here fails CLOSED (returns "don't act") on any ambiguous input.

// Foreground update checks are throttled to at most once per 15 minutes.
export const OTA_UPDATE_CHECK_THROTTLE_MS = 15 * 60 * 1000;

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
