import {
  MatchResultPanel,
  type DuelMatchResultRow,
  type GroupMatchResultRow,
} from '@/features/runs/components/MatchResultPanel';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';

export type LiveMatchResultPageProps = {
  matchMode: RunMatchMode;
  estimatedBonusPoints: number;
  estimatedLpDelta: number;
  duelRows: DuelMatchResultRow[];
  groupRows: GroupMatchResultRow[];
  groupStatusLabel?: string | null;
};

export function LiveMatchResultPage({
  matchMode,
  estimatedBonusPoints,
  estimatedLpDelta,
  duelRows,
  groupRows,
  groupStatusLabel,
}: LiveMatchResultPageProps) {
  return (
    <MatchResultPanel
      mode={matchMode === 'group' ? 'group' : 'duel'}
      estimatedBonusPoints={estimatedBonusPoints}
      estimatedLpDelta={estimatedLpDelta}
      duelRows={duelRows}
      groupRows={groupRows}
      groupStatusLabel={groupStatusLabel}
    />
  );
}
