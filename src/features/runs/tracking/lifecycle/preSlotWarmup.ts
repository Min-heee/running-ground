// PRE-SLOT GPS WARMUP TARGET (회원K 파티런 2026-08-10, duel-match-80d88038).
//
// Stage 4 moved the ENTIRE tracking arm to state === 'active' — i.e. countdown END. On Android
// that arm is a chain of JS timers (2.5s status-poll promotion → 1.5s render-detached start →
// permission awaits → startBackgroundRunTracking), and the foreground service that would keep
// those timers alive with the screen off is the very thing the chain has not started yet. A runner
// who locks the phone 1-2s after the countdown reaches zero therefore freezes the arm mid-chain:
// the run shows 0.00km until the next unlock resumes JS and completes it. 회원F's iPhone survived
// the same lock because iOS grants ~30s of background grace after locking — enough for its
// immediate (non-delayed) arm to finish.
//
// The countdown itself is the natural arm window: the runner is WATCHING it, so the screen is
// guaranteed on. This helper picks the match to warm up during that window. Measuring semantics do
// not change — a warmup start records preStartWarmupMatchIdRef, and the active path replaces the
// warmup's few meters with an official-start baseline at the slot (useMatchAutoTrackingEffects),
// the same handoff the solo warmup flow uses. So "measuring starts at the slot" (the Stage 4
// invariant) is preserved; only the PLUMBING starts early.
//
// Pure and separately testable on purpose; the effect supplies live inputs.

type PreSlotMatchSnapshot = {
  matchId?: string | null;
  state?: string | null;
  slotStartAt?: string | null;
} | null | undefined;

type RoomLinkedSnapshot = (PreSlotMatchSnapshot & { mode?: string | null }) | null | undefined;

// The old (pre-Stage-4) warmup gate was ≤20s before the slot — the arena auto-open window, so a
// scheduled match's arena mount always re-evaluates inside it. Party-run room countdowns are 10s,
// also inside it.
export const PRE_SLOT_WARMUP_WINDOW_MS = 20_000;

// A 'matched' context whose slot is long past is stale junk (abandoned match awaiting prune) —
// arming GPS for it would spin the sensor for nothing. Anything moderately past the slot is still
// worth arming: the server may simply not have flipped to 'active' on this device's poll yet, and
// arming is exactly what that promotion lag needs.
export const PRE_SLOT_WARMUP_STALE_AFTER_MS = 10 * 60 * 1000;

function readCandidate(candidate: PreSlotMatchSnapshot): { matchId: string; slotStartAt: string } | null {
  if (!candidate || candidate.state !== 'matched') {
    return null;
  }

  const matchId = typeof candidate.matchId === 'string' && candidate.matchId ? candidate.matchId : null;
  const slotStartAt = typeof candidate.slotStartAt === 'string' && candidate.slotStartAt ? candidate.slotStartAt : null;

  if (!matchId || !slotStartAt) {
    return null;
  }

  return { matchId, slotStartAt };
}

export function resolvePreSlotWarmupTarget(input: {
  matchMode: string;
  duelMatchStatus?: PreSlotMatchSnapshot;
  groupMatchStatus?: PreSlotMatchSnapshot;
  roomLinkedMatchContext?: RoomLinkedSnapshot;
  nowMs: number;
}): { matchId: string } | null {
  // Live matches only — solo has its own warmup flow, chase arms on entry.
  if (input.matchMode !== 'duel' && input.matchMode !== 'group') {
    return null;
  }

  const roomCandidate = input.roomLinkedMatchContext && input.roomLinkedMatchContext.mode === input.matchMode
    ? readCandidate(input.roomLinkedMatchContext)
    : null;
  const statusCandidate = input.matchMode === 'duel'
    ? readCandidate(input.duelMatchStatus)
    : readCandidate(input.groupMatchStatus);

  // Same precedence as the active path: the mode-specific status wins, the room-linked context is
  // the party-run fallback.
  const candidate = statusCandidate ?? roomCandidate;

  if (!candidate) {
    return null;
  }

  const slotStartMs = Date.parse(candidate.slotStartAt);

  if (!Number.isFinite(slotStartMs)) {
    return null;
  }

  const untilSlotMs = slotStartMs - input.nowMs;

  if (untilSlotMs > PRE_SLOT_WARMUP_WINDOW_MS) {
    return null;
  }

  if (untilSlotMs < -PRE_SLOT_WARMUP_STALE_AFTER_MS) {
    return null;
  }

  return { matchId: candidate.matchId };
}
