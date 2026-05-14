import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';

export type TrackRunRouteKeyInput = {
  focusMatchId?: string | null;
  focusRoomId?: string | null;
  focusedDuelMatchId?: string | null;
  focusedGroupMatchId?: string | null;
  forceOpenActiveMatch: boolean;
  hydratedMatchId?: string | null;
  hydratedMatchMode?: Extract<RunMatchMode, 'duel' | 'group'> | null;
  hydratedRoomId?: string | null;
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
  hydratedMatchId,
  hydratedMatchMode,
  hydratedRoomId,
  liveArenaPage,
  matchMode,
  matchRoomId,
  roomLinkedMatchId,
  visibleMatchRoomId,
}: TrackRunRouteKeyInput) {
  const routeRoomId = matchRoomId ?? visibleMatchRoomId ?? focusRoomId ?? hydratedRoomId ?? null;
  const routeMatchId = focusedDuelMatchId
    ?? focusedGroupMatchId
    ?? roomLinkedMatchId
    ?? focusMatchId
    ?? hydratedMatchId
    ?? null;
  const routeMatchMode = routeMatchId
    && hydratedMatchMode
    && (matchMode === 'solo' || matchMode === 'room')
    ? hydratedMatchMode
    : matchMode;

  return {
    correctedByRouteParams: Boolean(
      (!matchRoomId && !visibleMatchRoomId && ((focusRoomId && routeRoomId === focusRoomId) || (hydratedRoomId && routeRoomId === hydratedRoomId)))
      || (!focusedDuelMatchId && !focusedGroupMatchId && !roomLinkedMatchId && (
        (focusMatchId && routeMatchId === focusMatchId)
        || (hydratedMatchId && routeMatchId === hydratedMatchId)
      )),
    ),
    matchId: routeMatchId,
    matchMode: routeMatchMode,
    roomId: routeRoomId,
    routeKey: [
      'track-run',
      routeMatchMode,
      routeRoomId ?? 'no-room',
      routeMatchId ?? 'no-match',
      forceOpenActiveMatch ? 'arena' : `page-${liveArenaPage}`,
    ].join(':'),
  };
}
