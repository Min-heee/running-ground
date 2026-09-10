// ─────────────────────────────────────────────────────────────────────────────
// Measuring-phase quiesce for the 1Hz synced countdown ticker.
//
// The ticker (useSyncedCountdownTicker → setNowMs) is REACT STATE at the top of
// the match lifecycle, so every tick re-renders the entire runtime model. That
// reactivity is REQUIRED around a match start — the slot-gated effects
// (arming → 로딩중 hold → digit → slot crossing → arena open) re-evaluate off the
// per-second syncedNowMs — but it is pure waste for the LONG measuring phase:
// every during-measuring display already updates via the leaf metric store /
// GPS-cadence state, and every remaining time read goes through the
// NON-reactive getSyncedNowMs().
//
// Rule: once THIS phone's arena force-open has fired (the single slot-gated
// opener — it only fires at/after the slot) and a grace window has passed, the
// keep-alive terms (isRunning / focused match / linked room / has-upcoming)
// stop holding the ticker on. Everything around a start is an ALWAYS-ON term,
// byte-identical to the pre-quiesce gate, so the countdown funnel never sees a
// changed gate.
//
// Loop-proofing (this surface has crashed twice before):
//  - No setState here — this is a pure boolean fed to useSyncedCountdownTicker,
//    whose own effect tears the interval down when `enabled` flips false.
//  - The quiesce condition is monotone within a run: arenaOpenAtMs is a fixed
//    stamp, freshSyncedNowMs only grows, so quiesced cannot flap back on its
//    own inputs. Wake-ups are DIFFERENT terms (an upcoming slot entering its
//    window, a room re-entering arming/countdown, a new countdown entry).
//  - Once the ticker stops, the STATE clock (syncedNowMs) freezes — so every
//    time comparison here uses freshSyncedNowMs (a getSyncedNowMs() read taken
//    during the current render). Renders keep arriving at heartbeat/poll/GPS
//    cadence (~2-3s) during measuring, which is what re-evaluates this gate and
//    wakes the ticker ~2min before the next upcoming slot.
// ─────────────────────────────────────────────────────────────────────────────

// How long after the arena force-open the ticker keeps running. Covers every
// at-slot consumer (post-slot flow snapshot, slot-started booleans, arming
// grace) with ~30 renders of margin before the tree goes quiet.
export const MEASURING_TICKER_QUIESCE_GRACE_MS = 30_000;

// Wake the ticker when any upcoming match slot comes within this window, so its
// countdown pill/overlay ticks again long before the visible digit window.
// Re-evaluated at heartbeat/poll cadence (~2-3s), ~40× inside the margin.
export const MEASURING_TICKER_UPCOMING_WAKE_WINDOW_MS = 120_000;

type UpcomingSlotLike = {
  slotStartAt?: string | null;
};

export type CountdownTickerGateInput = {
  heavyTickersFocusGate: boolean;
  shouldRunCountdownTicker: boolean;
  isStarting: boolean;
  isRunning: boolean;
  hasHydratedFocusMatch: boolean;
  hasVisibleCountdownEntry: boolean;
  hasRoomCountdownEntry: boolean;
  hasNextStartingMatch: boolean;
  hasActiveUpcomingMatch: boolean;
  upcomingMatches: readonly UpcomingSlotLike[];
  duelMatchState: string | null | undefined;
  groupMatchState: string | null | undefined;
  matchRoomLinkedMatchId: string | null | undefined;
  matchRoomState: string | null | undefined;
  // 예약 파티런 방은 슬롯까지 며칠 동안 'arming'으로 보고된다 — 그 동안 1Hz 티커를 켜 두면
  // 러닝 탭 전체가 초당 한 번씩 다시 그려진다 (적대 검증 2026-09-10). 카운트다운 창(30초)에
  // 들어오면 false가 되어 예전의 always-on 규칙이 그대로 돌아온다.
  matchRoomReservedForFuture?: boolean;
  // The slot-gated arena force-open flag (forceOpenActiveMatch) — true only
  // at/after this phone's slot, cleared on finish/leave.
  arenaOpenFired: boolean;
  // The synced-clock instant the force-open flipped true (ref-stamped in an
  // effect); null until it fires or after it clears.
  arenaOpenAtMs: number | null;
  // A FRESH getSyncedNowMs() read from the current render — NOT the state
  // syncedNowMs, which freezes the moment this gate returns false.
  freshSyncedNowMs: number;
};

export function isMeasuringTickerQuiesced({
  isRunning,
  arenaOpenFired,
  arenaOpenAtMs,
  freshSyncedNowMs,
  upcomingMatches,
}: Pick<
  CountdownTickerGateInput,
  'isRunning' | 'arenaOpenFired' | 'arenaOpenAtMs' | 'freshSyncedNowMs' | 'upcomingMatches'
>): boolean {
  if (!isRunning || !arenaOpenFired || arenaOpenAtMs === null) {
    return false;
  }

  if (freshSyncedNowMs - arenaOpenAtMs < MEASURING_TICKER_QUIESCE_GRACE_MS) {
    return false;
  }

  for (const upcoming of upcomingMatches) {
    if (!upcoming.slotStartAt) {
      continue;
    }
    const slotMs = Date.parse(upcoming.slotStartAt);
    if (!Number.isFinite(slotMs)) {
      // Unparseable slot: stay conservative — keep the ticker running rather
      // than risk a silent frozen countdown for that match.
      return false;
    }
    if (slotMs - freshSyncedNowMs < MEASURING_TICKER_UPCOMING_WAKE_WINDOW_MS) {
      return false;
    }
  }

  return true;
}

export function shouldEnableCountdownTicker(input: CountdownTickerGateInput): boolean {
  if (!input.heavyTickersFocusGate || !input.shouldRunCountdownTicker) {
    return false;
  }

  // ALWAYS-ON terms — byte-identical to the pre-quiesce gate. Everything the
  // countdown funnel touches (starting, visible entries, matched states, room
  // arming/countdown) holds the ticker on unconditionally, so the game-grade
  // start sequence can never be affected by the quiesce.
  if (
    input.isStarting
    || input.hasVisibleCountdownEntry
    || input.hasRoomCountdownEntry
    || input.hasNextStartingMatch
    || input.hasActiveUpcomingMatch
    || input.duelMatchState === 'matched'
    || input.groupMatchState === 'matched'
    || (input.matchRoomState === 'arming' && !input.matchRoomReservedForFuture)
    || input.matchRoomState === 'countdown'
  ) {
    return true;
  }

  if (isMeasuringTickerQuiesced(input)) {
    return false;
  }

  // KEEP-ALIVE terms — the original gate's remaining reasons to tick. Active
  // outside the quiesced measuring window (idle with a reserved match, a
  // linked room pre-arming, a hydrated focus before the arena opens).
  return Boolean(
    input.isRunning
    || input.hasHydratedFocusMatch
    || input.matchRoomLinkedMatchId
    || input.upcomingMatches.length > 0,
  );
}
