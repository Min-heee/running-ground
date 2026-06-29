// ─────────────────────────────────────────────────────────────────────────────
// PURE live-match slot core. ONE fact drives countdown visibility, arena open,
// and GPS start: has THIS phone's synced clock reached THIS match's slot? i.e.
//   Date.now() + offset >= slotStartMs
// Everything here is O(1)/client (one server slot + one scalar synced-now), so it
// scales to a 30+ group: no peer math, no per-participant state.
//
// HARD RULE: nothing in this module reads clockReady / a lock / a tombstone / a
// monotonic re-baseline. The synced offset is best-available and self-correcting;
// gating display or phase on clockReady is exactly the race that skipped the
// non-host's countdown. The number simply follows the converging offset.
// ─────────────────────────────────────────────────────────────────────────────

import { freezeSlotStartMsForMatch } from '@/features/runs/lifecycle/countdownLockStore';

export type ActiveMatchSlot = {
  matchId: string;
  slotStartMs: number;
};

// Minimal slot-bearing shapes — kept structural (NOT the full API types) so the
// pure core has no dependency on the network layer and is trivially testable.
export type SlotBearingRoom = {
  linkedMatchId?: string | null;
  linkedMatchSlotStartAt?: string | null;
  slotStartAt?: string | null;
};

export type SlotBearingMatch = {
  matchId?: string | null;
  slotStartAt?: string | null;
};

export type ResolveActiveMatchSlotInput = {
  // The runtime room whose linked match drives a party-run countdown. Its
  // linkedMatchSlotStartAt is preferred over the room's own slotStartAt.
  room?: SlotBearingRoom | null;
  // The direct matched duel/group status (no room), used when there is no room.
  directMatch?: SlotBearingMatch | null;
  // The next upcoming matched match (the upcoming-list overlay fallback), used
  // when neither a room nor a direct match is present.
  upcomingMatch?: SlotBearingMatch | null;
  // The live synced clock. When provided, lets the per-match freeze swap a STALE
  // (already-elapsed) frozen instant for a fresh future re-arm — so an early
  // transient slot can't pin the countdown to a dead past instant. Optional so the
  // pure unit tests can omit it (original first-value-wins freeze).
  syncedNowMs?: number;
};

function parseSlotMs(slotStartAt: string | null | undefined): number | null {
  if (!slotStartAt) {
    return null;
  }
  const ms = Date.parse(slotStartAt);
  return Number.isFinite(ms) ? ms : null;
}

// Pick the single authoritative slot for the currently-relevant live match, in
// priority order: room linked slot → direct match → upcoming match. The first
// slotStartMs observed per matchId is frozen (reuse freezeSlotStartMsForMatch) so
// a later status echo / re-queue that nudges the slot can't rotate the instant
// mid-countdown and re-flash. Returns null when no parseable slot is present.
type SlotCandidate = {
  matchId: string | null | undefined;
  slotStartAt: string | null | undefined;
};

export function resolveActiveMatchSlot({
  room,
  directMatch,
  upcomingMatch,
  syncedNowMs,
}: ResolveActiveMatchSlotInput): ActiveMatchSlot | null {
  const candidates: SlotCandidate[] = [
    room?.linkedMatchId
      ? { matchId: room.linkedMatchId, slotStartAt: room.linkedMatchSlotStartAt ?? room.slotStartAt }
      : { matchId: null, slotStartAt: null },
    { matchId: directMatch?.matchId, slotStartAt: directMatch?.slotStartAt },
    { matchId: upcomingMatch?.matchId, slotStartAt: upcomingMatch?.slotStartAt },
  ];

  for (const candidate of candidates) {
    if (!candidate.matchId) {
      continue;
    }
    const slotStartMs = parseSlotMs(candidate.slotStartAt);
    if (slotStartMs === null) {
      continue;
    }
    const frozenMs = freezeSlotStartMsForMatch(candidate.matchId, slotStartMs, syncedNowMs);
    return { matchId: candidate.matchId, slotStartMs: frozenMs };
  }

  return null;
}

// The countdown digit. Returns ceil((slot - now) / 1000) whenever the remaining
// is in (0, window], else null. PURE — no clockReady, no lock, no tombstone, no
// monotonic re-baseline. A digit therefore renders whenever the slot is within
// the visible window, on the best-available offset, on every phone.
export function selectCountdownDigit({
  slotStartMs,
  syncedNowMs,
  windowSeconds,
}: {
  slotStartMs: number | null | undefined;
  syncedNowMs: number;
  windowSeconds: number;
}): number | null {
  if (typeof slotStartMs !== 'number' || !Number.isFinite(slotStartMs)) {
    return null;
  }

  const remainingMs = slotStartMs - syncedNowMs;
  if (remainingMs <= 0) {
    return null;
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  if (remainingSeconds > windowSeconds) {
    return null;
  }

  return remainingSeconds;
}

export type SlotPhase = 'pre' | 'countdown' | 'active';

// The single slot phase. Derived ONLY from the slot vs the synced clock:
//   remaining > window  → 'pre'
//   0 < remaining ≤ win → 'countdown'
//   remaining ≤ 0       → 'active'
// serverActive is corroboration ONLY: it may promote to 'active' when remaining
// ≤ 0, never pre-empt a still-running countdown. So a SHARED session that
// hydrates 'active' early (host warm-up) can never skip this phone's countdown.
export function deriveSlotPhase({
  slotStartMs,
  syncedNowMs,
  windowSeconds,
  serverActive = false,
}: {
  slotStartMs: number | null | undefined;
  syncedNowMs: number;
  windowSeconds: number;
  serverActive?: boolean;
}): SlotPhase {
  if (typeof slotStartMs !== 'number' || !Number.isFinite(slotStartMs)) {
    // No parseable slot: server-active is the only signal we have. (A re-join into
    // an already-running match with no slot relies on this.)
    return serverActive ? 'active' : 'pre';
  }

  const remainingMs = slotStartMs - syncedNowMs;
  if (remainingMs <= 0) {
    return 'active';
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  if (remainingSeconds > windowSeconds) {
    return 'pre';
  }

  return 'countdown';
}
