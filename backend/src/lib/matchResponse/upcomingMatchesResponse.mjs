import { isParticipantDoneWithMatch } from '../matchPureHelpers.mjs';
import {
  buildMatchSlotDateLabel,
  formatDuelSlotLabel as formatDuelSlotLabelFromDateTime,
} from '../dateTimeFormatting.mjs';
import {
  buildMatchCancellationDeadline,
  isTestMatchSession,
} from '../matchScheduleHelpers.mjs';
import { countDuelQueueBySlot } from '../matchQueueStoreHelpers.mjs';
import {
  hydrateMatchSessionState,
  pruneMatchSessions,
} from '../runningMatchSessionStoreHelpers.mjs';
import { syncMatchRooms } from '../matchRoomStoreHelpers.mjs';
import {
  buildSessionDuelOpponent,
  buildSessionGroupParticipants,
} from './matchResponseParticipants.mjs';

export function buildUpcomingRunningMatchesResponse(store, currentUser) {
  const now = new Date();
  const rooms = syncMatchRooms(store, now);
  const sessions = pruneMatchSessions(store)
    .filter((session) => session.participants.some((participant) => (
      participant.userId === currentUser.id
      && !isParticipantDoneWithMatch(participant, now)
    )))
    .map((session) => {
      const state = hydrateMatchSessionState(session, now);

      if (!['matched', 'active'].includes(state)) {
        return null;
      }

      const linkedRoom = rooms.find((room) => (
        room.linkedMatchId === session.id
        && room.participants.some((participant) => participant.userId === currentUser.id)
      ));

      if (session.mode === 'duel') {
        const opponent = buildSessionDuelOpponent(store, session, currentUser.id, now);
        const isTestMatch = isTestMatchSession(session);
        const cancelableUntilAt = buildMatchCancellationDeadline(session.slotStartAt, { isTestMatch }).toISOString();
        return {
          matchId: session.id,
          ...(linkedRoom ? { roomId: linkedRoom.id } : {}),
          mode: 'duel',
          ...(isTestMatch ? { isTestMatch: true } : {}),
          distanceKm: session.distanceKm,
          slotStartAt: session.slotStartAt,
          slotLabel: formatDuelSlotLabelFromDateTime(session.slotStartAt),
          status: state,
          participantCount: 2,
          counterpartLabel: opponent?.name ?? '상대 미정',
          summary: `${buildMatchSlotDateLabel(session.slotStartAt)} ${formatDuelSlotLabelFromDateTime(session.slotStartAt)} · ${session.distanceKm.toFixed(1)}km`,
          canCancel: state === 'matched' && now.getTime() < new Date(cancelableUntilAt).getTime(),
          cancelableUntilAt,
        };
      }

      const participants = buildSessionGroupParticipants(store, session, now);
      const isTestMatch = isTestMatchSession(session);
      const cancelableUntilAt = buildMatchCancellationDeadline(session.slotStartAt, { isTestMatch }).toISOString();
      return {
        matchId: session.id,
        ...(linkedRoom ? { roomId: linkedRoom.id } : {}),
        mode: 'group',
        ...(isTestMatch ? { isTestMatch: true } : {}),
        distanceKm: session.distanceKm,
        slotStartAt: session.slotStartAt,
        slotLabel: formatDuelSlotLabelFromDateTime(session.slotStartAt),
        status: state,
        participantCount: participants.length,
        counterpartLabel: `${participants.length}명 그룹`,
        summary: `${buildMatchSlotDateLabel(session.slotStartAt)} ${formatDuelSlotLabelFromDateTime(session.slotStartAt)} · ${session.distanceKm.toFixed(1)}km`,
        canCancel: state === 'matched' && now.getTime() < new Date(cancelableUntilAt).getTime(),
        cancelableUntilAt,
      };
    })
    .filter(Boolean)
    .sort((left, right) => new Date(left.slotStartAt).getTime() - new Date(right.slotStartAt).getTime());

  return {
    serverNow: now.toISOString(),
    items: sessions,
    // Per-slot+distance count of REAL duel searchers (excludes testMode AND the viewer's
    // own waiting entry). Keyed by `${slotStartAt}|${normalizedDistanceKm}`; buckets with
    // 0 OTHER searchers are absent. The client reads this as
    // duelSlotCounts: Record<string, number> and looks up the bucket for its selected
    // distance, so "N명 대기" means N OTHER runners the viewer could actually match.
    duelSlotCounts: countDuelQueueBySlot(store, { now, currentUserId: currentUser.id }),
  };
}
