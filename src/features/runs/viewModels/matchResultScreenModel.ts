import {
  formatDuration,
  formatPaceFromSecondsPerKm,
} from '@/features/runs/tracking';
import type {
  MatchResultParticipant,
  MatchResultParticipantTone,
  MatchResultResponse,
} from '@/lib/api/types';

// A single rendered runner row, derived once from a MatchResultParticipant so the
// screen never re-derives labels per render. Pace/time come from the OFFICIAL frozen
// values on the response and are formatted with the SAME formatters the live arena /
// saved-record cards use, so the dedicated result screen can never disagree with them.
export type MatchResultScreenRow = {
  userId: string | null;
  name: string;
  // districtName, gracefully '' when the backend has no region for this runner.
  regionLabel: string;
  // formatPaceFromSecondsPerKm output, '기권' when forfeited, '-' when no pace.
  paceLabel: string;
  // formatDuration output, '-' when finishElapsedSeconds is null.
  timeLabel: string;
  distanceKm: number;
  rank: number | null;
  resultTone: MatchResultParticipantTone | null;
  isMe: boolean;
  // Gender is DEFERRED — optional slot left empty (always undefined for now).
  genderLabel?: undefined;
};

export type MatchResultScreenModel =
  | {
    mode: 'duel';
    winner: MatchResultScreenRow;
    loser: MatchResultScreenRow;
    // true when the duel resolved to a draw (both rows carry resultTone 'draw').
    draw?: boolean;
    // true when NOTHING in the payload identifies a winner (e.g. one side's record is still
    // PENDING). The winner/loser slots then carry no meaning beyond render order, so the screen
    // must not paint WIN/LOSE badges.
    unresolved?: boolean;
    // Fair-verdict additive server fields — absent on old backends (render nothing then).
    // provisional → "가확정 · 상대 기록 수신 대기 중" badge; revised → the 정정 reason banner.
    provisional?: boolean;
    revised?: boolean;
  }
  | {
    mode: 'group';
    rows: MatchResultScreenRow[];
    provisional?: boolean;
    revised?: boolean;
  };

// '-' for a missing pace, '기권' for a forfeit, otherwise the frozen official pace.
function buildRowPaceLabel(participant: MatchResultParticipant): string {
  if (participant.forfeited) {
    return '기권';
  }

  if (
    typeof participant.paceSecondsPerKm !== 'number'
    || !Number.isFinite(participant.paceSecondsPerKm)
    || participant.paceSecondsPerKm <= 0
  ) {
    return '-';
  }

  return formatPaceFromSecondsPerKm(participant.paceSecondsPerKm);
}

// '-' when the runner has no frozen finish time; otherwise the formatted duration.
function buildRowTimeLabel(participant: MatchResultParticipant): string {
  if (
    typeof participant.finishElapsedSeconds !== 'number'
    || !Number.isFinite(participant.finishElapsedSeconds)
  ) {
    return '-';
  }

  return formatDuration(participant.finishElapsedSeconds);
}

function buildRow(participant: MatchResultParticipant): MatchResultScreenRow {
  return {
    userId: participant.userId,
    name: participant.name,
    regionLabel: participant.districtName ?? '',
    paceLabel: buildRowPaceLabel(participant),
    timeLabel: buildRowTimeLabel(participant),
    distanceKm: participant.distanceKm,
    rank: participant.rank,
    resultTone: participant.resultTone,
    isMe: participant.isMe,
    genderLabel: undefined,
  };
}

// Pure: maps the by-matchId result response into the discriminated shape the result
// screen renders. Reuses the existing pace/duration formatters — labels are derived
// from the official frozen values, never recomputed. Group rows are ordered by rank
// ascending (1등 first); the duel winner is the resultTone 'win' row (or rank 1).
export function buildMatchResultScreenModel(
  response: MatchResultResponse,
): MatchResultScreenModel {
  if (response.mode === 'duel') {
    const rows = response.participants.map(buildRow);
    const participants = response.participants;
    const draw = participants.some((participant) => participant.resultTone === 'draw');

    // Winner = the 'win' row; else the OTHER row when exactly one side says 'lose' (a duel has two
    // sides, so a single definite loser names the winner); else rank 1. Loser = the other row.
    //
    // 오너 실기기 대결 2026-08-09: the old last resort was "else the first row", which crowned
    // whoever the server happened to sort first. When one runner's blob is still PENDING (no
    // resultTone) the server orders the explicit 'lose' row FIRST, so the screen showed the runner
    // who had just declared themselves the LOSER as the WINNER — contradicting both the finish
    // times and that row's own tone. Never invent a winner: with nothing to identify one the duel
    // is reported unresolved and the badges render neutrally.
    const winnerIndex = (() => {
      const toneWin = participants.findIndex((participant) => participant.resultTone === 'win');
      if (toneWin >= 0) {
        return toneWin;
      }

      const loseIndexes = participants
        .map((participant, index) => (participant.resultTone === 'lose' ? index : -1))
        .filter((index) => index >= 0);
      if (participants.length === 2 && loseIndexes.length === 1) {
        return loseIndexes[0] === 0 ? 1 : 0;
      }

      const rankOne = participants.findIndex((participant) => participant.rank === 1);
      if (rankOne >= 0) {
        return rankOne;
      }

      return -1;
    })();
    const unresolved = winnerIndex < 0;
    const resolvedWinnerIndex = unresolved ? 0 : winnerIndex;
    const loserIndex = resolvedWinnerIndex === 0 ? rows.length - 1 : 0;

    return {
      mode: 'duel',
      winner: rows[resolvedWinnerIndex],
      loser: rows[loserIndex] ?? rows[resolvedWinnerIndex],
      ...(unresolved ? { unresolved: true } : {}),
      ...(draw ? { draw: true } : {}),
      ...(response.provisional === true ? { provisional: true } : {}),
      ...(response.revised === true ? { revised: true } : {}),
    };
  }

  const rows = response.participants
    .map(buildRow)
    .sort((left, right) => {
      // Rank ascending (1등 first); rows without a rank sink to the bottom, stable order.
      const leftRank = left.rank ?? Number.POSITIVE_INFINITY;
      const rightRank = right.rank ?? Number.POSITIVE_INFINITY;
      return leftRank - rightRank;
    });

  return {
    mode: 'group',
    rows,
    ...(response.provisional === true ? { provisional: true } : {}),
    ...(response.revised === true ? { revised: true } : {}),
  };
}
