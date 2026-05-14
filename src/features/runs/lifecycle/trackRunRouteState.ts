import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';

export type TrackRunRouteKeyInput = {
  focusMatchId?: string | null;
  focusRoomId?: string | null;
  focusedDuelMatchId?: string | null;
  focusedGroupMatchId?: string | null;
  forceOpenActiveMatch: boolean;
  liveArenaPage: number;
  matchMode: RunMatchMode;
  matchRoomId?: string | null;
  roomLinkedMatchId?: string | null;
  visibleMatchRoomId?: string | null;
};

export function buildTrackRunRuntimeRouteKey({
  focusMatchId,
  focusRoomId,
  focusedDuelMatchId,
  focusedGroupMatchId,
  forceOpenActiveMatch,
  liveArenaPage,
  matchMode,
  matchRoomId,
  roomLinkedMatchId,
  visibleMatchRoomId,
}: TrackRunRouteKeyInput) {
  const routeRoomId = matchRoomId ?? visibleMatchRoomId ?? focusRoomId ?? null;
  const routeMatchId = focusedDuelMatchId
    ?? focusedGroupMatchId
    ?? roomLinkedMatchId
    ?? focusMatchId
    ?? null;

  return {
    correctedByRouteParams: Boolean(
      (!matchRoomId && !visibleMatchRoomId && focusRoomId && routeRoomId === focusRoomId)
      || (!focusedDuelMatchId && !focusedGroupMatchId && !roomLinkedMatchId && focusMatchId && routeMatchId === focusMatchId),
    ),
    matchId: routeMatchId,
    roomId: routeRoomId,
    routeKey: [
      'track-run',
      matchMode,
      routeRoomId ?? 'no-room',
      routeMatchId ?? 'no-match',
      forceOpenActiveMatch ? 'arena' : `page-${liveArenaPage}`,
    ].join(':'),
  };
}
