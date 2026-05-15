import { memo, useEffect, useRef } from 'react';
import { LiveMatchArena } from '@/components/matches/LiveMatchArena';
import type { LiveMatchArenaViewModel } from '@/features/runs/viewModels/liveMatchArenaViewModel';
import { rgPerfMark } from '@/utils/rgPerfTrace';

export type LiveMatchArenaPageProps = {
  stableMatchId?: string | null;
  viewModel: LiveMatchArenaViewModel | null;
  onLiveMatchMounted?: (input: { matchId?: string | null; mode: 'duel' | 'group'; source: string }) => void;
};

export const LiveMatchArenaPage = memo(function LiveMatchArenaPage({
  stableMatchId,
  viewModel,
  onLiveMatchMounted,
}: LiveMatchArenaPageProps) {
  const lastViewModelRef = useRef<LiveMatchArenaViewModel | null>(null);
  const lastLoggedStableKeyRef = useRef<string | null>(null);

  if (viewModel?.matchId) {
    lastViewModelRef.current = viewModel;
  } else if (viewModel && !lastViewModelRef.current) {
    lastViewModelRef.current = viewModel;
  }

  const preservedViewModel = !viewModel && stableMatchId && lastViewModelRef.current?.matchId === stableMatchId
    ? lastViewModelRef.current
    : null;
  const effectiveViewModel = viewModel ?? preservedViewModel;
  const preservedMatchId = preservedViewModel?.matchId ?? null;
  const preservedMode = preservedViewModel?.mode ?? null;

  useEffect(() => {
    if (!effectiveViewModel?.matchId || lastLoggedStableKeyRef.current === effectiveViewModel.matchId) {
      return;
    }

    lastLoggedStableKeyRef.current = effectiveViewModel.matchId;
    rgPerfMark('live match key stable', {
      matchId: effectiveViewModel.matchId,
      mode: effectiveViewModel.mode,
      source: 'LiveMatchArenaPage',
    });
  }, [effectiveViewModel?.matchId, effectiveViewModel?.mode]);

  useEffect(() => {
    if (!preservedViewModel) {
      return;
    }

    rgPerfMark('live match unmount prevented same match', {
      matchId: preservedMatchId,
      mode: preservedMode,
      reason: 'missing viewModel',
      source: 'LiveMatchArenaPage',
    });
    rgPerfMark('live match preserved through tracking transition', {
      matchId: preservedMatchId,
      mode: preservedMode,
      source: 'LiveMatchArenaPage',
    });
  }, [preservedMatchId, preservedMode, preservedViewModel]);

  if (!effectiveViewModel) {
    return null;
  }

  return (
    <LiveMatchArena
      {...effectiveViewModel}
      onMounted={onLiveMatchMounted}
    />
  );
});
