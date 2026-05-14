import { memo, useEffect } from 'react';
import { LiveMatchRaceBoard } from '@/components/matches/LiveMatchRaceBoard';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { LiveMatchRaceBoardViewModel } from '@/features/runs/viewModels/liveMatchRaceBoardViewModel';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import { useDevRenderCounter } from '@/utils/useDevRenderCounter';

export type LiveMatchRaceBoardPageProps = {
  matchMode: RunMatchMode;
  viewModel: LiveMatchRaceBoardViewModel | null;
};

export const LiveMatchRaceBoardPage = memo(function LiveMatchRaceBoardPage({
  matchMode,
  viewModel,
}: LiveMatchRaceBoardPageProps) {
  useDevRenderCounter(`LiveMatchRaceBoardPage:${matchMode}`);
  useEffect(() => {
    rgPerfMark('race board mount', {
      matchMode,
    });

    return () => {
      rgPerfMark('race board unmount', {
        matchMode,
      });
    };
  }, [matchMode]);

  if (viewModel) {
    return <LiveMatchRaceBoard {...viewModel} />;
  }

  return null;
});
