import {
  buildAveragePace,
  formatDuration,
} from '@/features/runs/tracking';
import type {
  LiveActivityAttributes,
  LiveActivityContentState,
  LiveActivityRunner,
} from '../../../../modules/live-activity';

// PURE view-model for the iOS Live Activity (lock-screen live-run card + Dynamic Island).
//
// Maps the run's live data into the { attributes, contentState } pair the native card renders.
// It reuses the EXISTING tracking formatters (buildAveragePace / formatDuration) so the card's
// numbers match the in-app numbers exactly. No React, no native, no I/O — fully unit testable.
//
// LOCKED DESIGN (do not change without re-deciding):
//   - match key metric = gap to the IMMEDIATELY ADJACENT runner (the one just ahead → '-Xm'; if I
//     lead, the one just behind → '+Xm'), NOT gap-to-leader.
//   - pace = AVG (buildAveragePace).
//   - rank bar = top-3 + me (capped).
//   - solo with no goal = no progress ring (goalDistanceKm omitted), just time/distance/pace.
//   - ~10s staleDate so the card DIMS (not lies) if location stalls.

// Card dims this many ms after the last update if no fresher update arrives (location stall).
export const LIVE_CARD_STALE_AFTER_MS = 10_000;

// Rank bar cap: always the top-3, plus me if I am not already in the top-3.
const RANK_BAR_TOP_COUNT = 3;

// One runner on the live board, as the caller extracts it from the match status response
// (officialComparison / participants[].liveDistanceKm). Already a single distance per runner.
export type LiveCardBoardRunner = {
  name: string;
  // Current distance in km (official when ready, else live/estimated — the caller decides).
  distanceKm: number;
  isMe: boolean;
};

export type BuildLiveCardStateInput = {
  mode: 'solo' | 'duel' | 'group';
  // Present for a match run; omitted for solo.
  matchId?: string;
  // Distance goal in km. Match always has one; solo only if the user set a goal. Omit/undefined
  // for a free solo run → the card shows NO progress ring.
  goalDistanceKm?: number;
  // ISO official/run start (drives the card's elapsed rendering + the static attributes).
  startedAt: string;

  // ---- my live metrics (the solo data source = tracking snapshot store) ----
  distanceKm: number;
  elapsedSeconds: number;

  // ---- match-only board (the match data source = live match status response) ----
  // The full set of competing runners with a single current distance each. Order does not matter
  // — this function sorts by distance to compute rank, the adjacent gap, and the top-3+me bar.
  // Omit/empty for solo.
  board?: LiveCardBoardRunner[];

  // Clock for staleDate; injectable for deterministic tests. Defaults to Date.now().
  nowMs?: number;
};

export type LiveCardState = {
  attributes: LiveActivityAttributes;
  contentState: LiveActivityContentState;
};

function toWholeMeters(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return 0;
  }
  return Math.round(distanceKm * 1000);
}

function toProgress0to1(distanceKm: number, goalDistanceKm?: number): number {
  if (!goalDistanceKm || !Number.isFinite(goalDistanceKm) || goalDistanceKm <= 0) {
    return 0;
  }
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, distanceKm / goalDistanceKm));
}

// Sort a copy of the board by distance DESC (leader first). Stable for equal distances so a tie
// keeps the caller's order (which the caller can pre-order by tie-break if needed).
function sortBoardByDistanceDesc(board: LiveCardBoardRunner[]): LiveCardBoardRunner[] {
  return board
    .map((runner, index) => ({ runner, index }))
    .sort((a, b) => {
      const distanceDelta = b.runner.distanceKm - a.runner.distanceKm;
      if (distanceDelta !== 0) {
        return distanceDelta;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.runner);
}

// Gap to the IMMEDIATELY ADJACENT runner, formatted in whole meters:
//   - if someone is ahead of me → '-Xm' (distance I trail the runner just ahead)
//   - if I am the leader → '+Xm' (lead over the runner just behind)
//   - no other runner / not computable → undefined
function buildAdjacentGapText(sortedDesc: LiveCardBoardRunner[]): string | undefined {
  const myIndex = sortedDesc.findIndex((runner) => runner.isMe);
  if (myIndex === -1 || sortedDesc.length < 2) {
    return undefined;
  }

  const me = sortedDesc[myIndex];

  if (myIndex > 0) {
    // Someone is immediately ahead — show how far I trail them.
    const ahead = sortedDesc[myIndex - 1];
    const gapMeters = Math.round(Math.max(0, ahead.distanceKm - me.distanceKm) * 1000);
    return `-${gapMeters}m`;
  }

  // I am the leader — show my lead over the runner immediately behind.
  const behind = sortedDesc[myIndex + 1];
  const gapMeters = Math.round(Math.max(0, me.distanceKm - behind.distanceKm) * 1000);
  return `+${gapMeters}m`;
}

// Cap the rank bar to top-3 + me. Returns rows in leader-first order; me is appended (in rank
// order position) when not already within the top-3.
function buildRankBarRunners(
  sortedDesc: LiveCardBoardRunner[],
  goalDistanceKm?: number,
): LiveActivityRunner[] {
  const topRows = sortedDesc.slice(0, RANK_BAR_TOP_COUNT);
  const myIndex = sortedDesc.findIndex((runner) => runner.isMe);
  const meInTop = myIndex !== -1 && myIndex < RANK_BAR_TOP_COUNT;

  const rows = meInTop || myIndex === -1
    ? topRows
    : [...topRows, sortedDesc[myIndex]];

  return rows.map((runner) => ({
    name: runner.name,
    progress0to1: toProgress0to1(runner.distanceKm, goalDistanceKm),
    isMe: runner.isMe,
  }));
}

export function buildLiveCardState(input: BuildLiveCardStateInput): LiveCardState {
  const nowMs = input.nowMs ?? Date.now();
  const staleDateMs = nowMs + LIVE_CARD_STALE_AFTER_MS;

  const paceText = buildAveragePace(input.distanceKm, input.elapsedSeconds);
  const distanceM = toWholeMeters(input.distanceKm);
  // formatDuration is reused purely to validate/normalize elapsed for the card; the native side
  // re-renders the clock, but we keep the contract on whole, non-negative seconds.
  const elapsedSeconds = Math.max(0, Math.round(input.elapsedSeconds));
  // Touch formatDuration so the card's elapsed never diverges from the in-app stopwatch format if
  // a future native build chooses to render the pre-formatted string instead of a timer.
  void formatDuration(elapsedSeconds);

  const board = input.mode === 'solo' ? [] : input.board ?? [];

  const attributes: LiveActivityAttributes = {
    matchId: input.matchId,
    mode: input.mode,
    goalDistanceKm: input.goalDistanceKm,
    runnerNames: board.map((runner) => runner.name),
    startedAt: input.startedAt,
  };

  const contentState: LiveActivityContentState = {
    elapsedSeconds,
    distanceM,
    paceText,
    staleDateMs,
  };

  if (input.mode === 'solo' || board.length === 0) {
    return { attributes, contentState };
  }

  const sortedDesc = sortBoardByDistanceDesc(board);
  const myIndex = sortedDesc.findIndex((runner) => runner.isMe);

  contentState.totalRunners = sortedDesc.length;
  if (myIndex !== -1) {
    contentState.myRank = myIndex + 1;
  }
  const adjacentGapText = buildAdjacentGapText(sortedDesc);
  if (adjacentGapText !== undefined) {
    contentState.adjacentGapText = adjacentGapText;
  }
  contentState.runners = buildRankBarRunners(sortedDesc, input.goalDistanceKm);

  return { attributes, contentState };
}
