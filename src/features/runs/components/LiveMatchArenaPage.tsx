import { memo } from 'react';
import { LiveMatchArena } from '@/components/matches/LiveMatchArena';
import type { LiveMatchArenaViewModel } from '@/features/runs/liveMatchArenaViewModel';

export type LiveMatchArenaPageProps = {
  viewModel: LiveMatchArenaViewModel | null;
  onLiveMatchMounted?: (input: { matchId?: string | null; mode: 'duel' | 'group'; source: string }) => void;
};

export const LiveMatchArenaPage = memo(function LiveMatchArenaPage({
  viewModel,
  onLiveMatchMounted,
}: LiveMatchArenaPageProps) {
  if (!viewModel) {
    return null;
  }

  return (
    <LiveMatchArena
      {...viewModel}
      onMounted={onLiveMatchMounted}
    />
  );
});
