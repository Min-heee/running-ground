import type { RunningMatchStatusResponse } from '@/lib/api/types';

export type RunDetailMatchTransitionReason = 'opponent-finished' | 'session-vanished';

export function shouldTransitionRunDetailToMatchRecord({
  matchId,
  mode,
  status,
  vanishedConfirmed,
}: {
  matchId: string | null;
  mode: 'duel' | 'group' | null;
  status: RunningMatchStatusResponse | null;
  vanishedConfirmed: boolean;
}): RunDetailMatchTransitionReason | null {
  if (!matchId || !mode) {
    return null;
  }

  if (vanishedConfirmed) {
    return 'session-vanished';
  }

  if (!status || status.matchId !== matchId || status.mode !== mode) {
    return null;
  }

  if (mode === 'duel' && status.opponent?.liveStatus === 'finished') {
    return 'opponent-finished';
  }

  if (mode === 'group' && status.participants?.some((participant) => participant.liveStatus === 'finished')) {
    return 'opponent-finished';
  }

  return null;
}
