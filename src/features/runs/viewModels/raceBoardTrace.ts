import type { LiveMatchRaceBoardRow } from '@/components/matches/LiveMatchRaceBoard';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { rgPerfMark } from '@/utils/rgPerfTrace';

export function traceRaceBoardRows({
  matchMode,
  rows,
  source,
}: {
  matchMode: RunMatchMode;
  rows: LiveMatchRaceBoardRow[];
  source: string;
}) {
  const selfRows = rows.filter((row) => row.isCurrentUser).length;
  const opponentRows = rows.length - selfRows;

  rgPerfMark('live match race board rows built', {
    matchMode,
    opponentRows,
    rowCount: rows.length,
    selfRows,
    source,
  });
  rgPerfMark('live match race board self/opponent rows', {
    matchMode,
    opponentRows,
    rowCount: rows.length,
    selfRows,
    source,
  });
}
