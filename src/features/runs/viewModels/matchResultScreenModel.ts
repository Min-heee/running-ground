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
  }
  | {
    mode: 'group';
    rows: MatchResultScreenRow[];
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

    // Winner = the 'win' row, else rank 1, else the first row. Loser = the other row.
    const winnerIndex = (() => {
      const toneWin = participants.findIndex((participant) => participant.resultTone === 'win');
      if (toneWin >= 0) {
        return toneWin;
      }

      const rankOne = participants.findIndex((participant) => participant.rank === 1);
      if (rankOne >= 0) {
        return rankOne;
      }

      return 0;
    })();
    const loserIndex = winnerIndex === 0 ? rows.length - 1 : 0;

    return {
      mode: 'duel',
      winner: rows[winnerIndex],
      loser: rows[loserIndex] ?? rows[winnerIndex],
      ...(draw ? { draw: true } : {}),
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
  };
}
