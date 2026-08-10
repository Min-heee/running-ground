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

// A session whose tracking began BEFORE the slot is a warmup-era session: its first meters/seconds
// belong to the countdown, not the match, and the official-start baseline must rebase it at the
// slot. Restore paths use this to re-mark a session after process death — the warmup ref does not
// survive the process, but the snapshot's own startedAt does (적대 검증 2026-08-11: without the
// re-mark, a crash-restored warmup session baked its countdown meters and seconds into the
// official result because both baseline builders key on the ref).
export function isWarmupEraSnapshot(startedAt: string | null | undefined, slotStartAt: string | null | undefined): boolean {
  const startedMs = Date.parse(startedAt ?? '');
  const slotMs = Date.parse(slotStartAt ?? '');

  if (!Number.isFinite(startedMs) || !Number.isFinite(slotMs)) {
    return false;
  }

  return startedMs < slotMs;
}

// How far past the slot an armed warmup may wait for its official start before it is declared an
// orphan (match dissolved mid-countdown) and dropped. Promotion lag is poll-RTT-scale (seconds);
// two minutes is generous without leaving GPS+FGS spinning on a dead match.
export const WARMUP_ORPHAN_BACKSTOP_AFTER_SLOT_MS = 120_000;

function isInsideWarmupWindow(candidate: { slotStartAt: string }, nowMs: number): boolean {
  const slotStartMs = Date.parse(candidate.slotStartAt);

  if (!Number.isFinite(slotStartMs)) {
    return false;
  }

  const untilSlotMs = slotStartMs - nowMs;
  return untilSlotMs <= PRE_SLOT_WARMUP_WINDOW_MS && untilSlotMs >= -PRE_SLOT_WARMUP_STALE_AFTER_MS;
}

export function resolvePreSlotWarmupTarget(input: {
  matchMode: string;
  duelMatchStatus?: PreSlotMatchSnapshot;
  groupMatchStatus?: PreSlotMatchSnapshot;
  roomLinkedMatchContext?: RoomLinkedSnapshot;
  nowMs: number;
}): { matchId: string; slotStartAt: string } | null {
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

  // Same precedence as the active path — the mode-specific status first, the room-linked context
  // as the party-run fallback — but the window is judged PER CANDIDATE (적대 검증 2026-08-11): a
  // scheduled duel matched hours out must not SHADOW an in-window party-run room countdown, or the
  // party match would silently lose its warmup and reproduce the incident this file exists to fix.
  const candidate = [statusCandidate, roomCandidate].find(
    (entry): entry is NonNullable<typeof entry> => entry !== null && isInsideWarmupWindow(entry, input.nowMs),
  ) ?? null;

  if (!candidate) {
    return null;
  }

  return { matchId: candidate.matchId, slotStartAt: candidate.slotStartAt };
}
