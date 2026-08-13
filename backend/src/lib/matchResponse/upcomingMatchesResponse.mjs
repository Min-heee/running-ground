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
      // 레이스 이벤트 편성 세션이면 이벤트 정체를 실어 보낸다 — 홈 예약 카드가 이벤트명을
      // 보여주고, 탭 시 러닝 탭 대신 레이스 대기실로 라우팅한다 (오너 2026-08-13).
      const raceEvent = (store.offlineRaceEvents ?? []).find((event) => event.formedMatchId === session.id);
      return {
        matchId: session.id,
        ...(linkedRoom ? { roomId: linkedRoom.id } : {}),
        mode: 'group',
        ...(isTestMatch ? { isTestMatch: true } : {}),
        ...(raceEvent ? { raceEventId: raceEvent.id, raceEventTitle: raceEvent.title } : {}),
        distanceKm: session.distanceKm,
        slotStartAt: session.slotStartAt,
        slotLabel: formatDuelSlotLabelFromDateTime(session.slotStartAt),
        status: state,
        participantCount: participants.length,
        counterpartLabel: raceEvent ? raceEvent.title : `${participants.length}명 그룹`,
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
