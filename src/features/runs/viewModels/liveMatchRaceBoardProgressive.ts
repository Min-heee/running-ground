import type { LiveMatchRaceBoardRow } from '@/components/matches/LiveMatchRaceBoard';
import {
  isCurrentUserFinished,
  resolveParticipantViewState,
  shouldShowParticipantInRaceBoard,
} from '@/features/runs/viewModels/matchResultProgressive';

export type RaceBoardSourceRow = Omit<LiveMatchRaceBoardRow, 'rank'> & {
  rank?: number;
};

export type ProgressiveRaceBoardRowsResult<TRow extends RaceBoardSourceRow = RaceBoardSourceRow> = {
  currentUserFinished: boolean;
  hiddenRowCount: number;
  rows: TRow[];
};

export type ProgressiveSortedRaceBoardRowsResult = Omit<ProgressiveRaceBoardRowsResult, 'rows'> & {
  rows: LiveMatchRaceBoardRow[];
};

const PARTIAL_RACE_BOARD_SUBTITLE = '완주한 러너만 보여요. 본인도 완주하면 전체 순위가 보여요.';

export function sortRaceRows(rows: RaceBoardSourceRow[]): LiveMatchRaceBoardRow[] {
  return [...rows]
    .sort((left, right) => {
      const leftForfeited = left.liveStatus === 'forfeited';
      const rightForfeited = right.liveStatus === 'forfeited';

      if (leftForfeited !== rightForfeited) {
        return leftForfeited ? 1 : -1;
      }

      if (right.distanceKm !== left.distanceKm) {
        return right.distanceKm - left.distanceKm;
      }

      return left.isCurrentUser ? -1 : 1;
    })
    .map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
}

export function buildProgressiveRaceBoardRows<TRow extends RaceBoardSourceRow>(
  rows: TRow[],
): ProgressiveRaceBoardRowsResult<TRow> {
  const currentUserFinished = isCurrentUserFinished(rows);
  let hiddenRowCount = 0;
  const visibleRows = rows.reduce<TRow[]>((nextRows, row) => {
    const viewState = resolveParticipantViewState({
      participant: row,
      isCurrentUserFinished: currentUserFinished,
    });

    if (!shouldShowParticipantInRaceBoard(viewState)) {
      hiddenRowCount += 1;
      return nextRows;
    }

    nextRows.push({
      ...row,
      isProgressivePlaceholder: currentUserFinished && !row.isCurrentUser && viewState === 'running',
    });
    return nextRows;
  }, []);

  return {
    currentUserFinished,
    hiddenRowCount,
    rows: visibleRows,
  };
}

export function buildRaceBoardSubtitle({
  fallback,
  progressiveRows,
}: {
  fallback: string;
  progressiveRows: Pick<ProgressiveRaceBoardRowsResult, 'hiddenRowCount'>;
}) {
  return progressiveRows.hiddenRowCount > 0 ? PARTIAL_RACE_BOARD_SUBTITLE : fallback;
}

export function sortProgressiveRaceRows(rows: RaceBoardSourceRow[]): ProgressiveSortedRaceBoardRowsResult {
  const progressiveRows = buildProgressiveRaceBoardRows(rows);

  return {
    currentUserFinished: progressiveRows.currentUserFinished,
    hiddenRowCount: progressiveRows.hiddenRowCount,
    rows: sortRaceRows(progressiveRows.rows),
  };
}
