import type { RunningMatchStatusResponse } from '@/lib/api/types';

export type MatchExitSource = 'duel' | 'group';

export type RoomLinkedMatchContext = {
  mode: MatchExitSource;
  matchId: string;
} | null;

export function resolveMatchExitId({
  source,
  duelMatchId,
  groupMatchId,
  roomLinkedMatchContext,
}: {
  source: MatchExitSource;
  duelMatchId?: string | null;
  groupMatchId?: string | null;
  roomLinkedMatchContext: RoomLinkedMatchContext;
}) {
  const roomLinkedMatchId = roomLinkedMatchContext?.mode === source
    ? roomLinkedMatchContext.matchId
    : null;

  return source === 'duel'
    ? duelMatchId ?? roomLinkedMatchId
    : groupMatchId ?? roomLinkedMatchId;
}

export function markDuelStatusForfeited(
  currentStatus: RunningMatchStatusResponse | null,
  matchId: string,
) {
  return currentStatus?.matchId === matchId
    ? { ...currentStatus, currentUserLiveStatus: 'forfeited' as const }
    : currentStatus;
}

export function markGroupStatusForfeited(
  currentStatus: RunningMatchStatusResponse | null,
  matchId: string,
) {
  if (currentStatus?.matchId !== matchId) {
    return currentStatus;
  }

  return {
    ...currentStatus,
    currentUserLiveStatus: 'forfeited' as const,
    participants: currentStatus.participants?.map((participant) => (
      participant.seedRank === (currentStatus.mySeedRank ?? 1)
        ? { ...participant, liveStatus: 'forfeited' as const }
        : participant
    )),
  };
}
