import type { LiveMatchArenaMode } from '@/components/matches/liveMatchArena/liveMatchArenaMountTypes';

export function buildLiveMatchScreenIdentity({
  matchId,
  mode,
}: {
  matchId?: string | null;
  mode: LiveMatchArenaMode;
}) {
  return `${mode}:${matchId ?? 'pending'}`;
}
