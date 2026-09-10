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

      // 파티런 예약(2026-09-09): 예정 매치 카드에 '파티런'임을 드러내고(요약·상대 라벨·isPartyRun),
      // 취소는 출발 직전까지 허용한다 — 1시간 컷오프는 재큐잉이 필요한 공식 예약의 규칙이다.
      // 예약 파티런만 카드 라벨·취소 규칙이 다르다 — 방장 시작 파티런은 예전 그대로.
      const isPartyRun = session.isScheduledPartyRun === true;
      // 취소 확인 문구가 역할을 구분할 수 있게(방장은 예약 전체 취소, 게스트는 본인만 이탈).
      const isRoomHost = Boolean(linkedRoom && linkedRoom.hostUserId === currentUser.id);
      const slotSummary = `${buildMatchSlotDateLabel(session.slotStartAt)} ${formatDuelSlotLabelFromDateTime(session.slotStartAt)} · ${session.distanceKm.toFixed(1)}km`;
      const summary = isPartyRun ? `파티런 · ${slotSummary}` : slotSummary;

      if (session.mode === 'duel') {
        const opponent = buildSessionDuelOpponent(store, session, currentUser.id, now);
        const isTestMatch = isTestMatchSession(session);
        const cancelableUntilAt = buildMatchCancellationDeadline(session.slotStartAt, { isTestMatch, isPartyRun }).toISOString();
        return {
          matchId: session.id,
          ...(linkedRoom ? { roomId: linkedRoom.id } : {}),
          mode: 'duel',
          ...(isTestMatch ? { isTestMatch: true } : {}),
          ...(isPartyRun ? { isPartyRun: true, isRoomHost } : {}),
          distanceKm: session.distanceKm,
          slotStartAt: session.slotStartAt,
          slotLabel: formatDuelSlotLabelFromDateTime(session.slotStartAt),
          status: state,
          participantCount: 2,
          counterpartLabel: opponent?.name ?? '상대 미정',
          summary,
          canCancel: state === 'matched' && now.getTime() < new Date(cancelableUntilAt).getTime(),
          cancelableUntilAt,
        };
      }

      const participants = buildSessionGroupParticipants(store, session, now);
      const isTestMatch = isTestMatchSession(session);
      const cancelableUntilAt = buildMatchCancellationDeadline(session.slotStartAt, { isTestMatch, isPartyRun }).toISOString();
      // 레이스 이벤트 편성 세션이면 이벤트 정체를 실어 보낸다 — 홈 예약 카드가 이벤트명을
      // 보여주고, 탭 시 러닝 탭 대신 레이스 대기실로 라우팅한다 (오너 2026-08-13).
      const raceEvent = (store.offlineRaceEvents ?? []).find((event) => event.formedMatchId === session.id);
      return {
        matchId: session.id,
        ...(linkedRoom ? { roomId: linkedRoom.id } : {}),
        mode: 'group',
        ...(isTestMatch ? { isTestMatch: true } : {}),
        ...(isPartyRun ? { isPartyRun: true, isRoomHost } : {}),
        ...(raceEvent ? { raceEventId: raceEvent.id, raceEventTitle: raceEvent.title } : {}),
        distanceKm: session.distanceKm,
        slotStartAt: session.slotStartAt,
        slotLabel: formatDuelSlotLabelFromDateTime(session.slotStartAt),
        status: state,
        participantCount: participants.length,
        // 파티런임은 summary의 접두어가 말한다 — 여기까지 '파티런'이면 카드·리마인더에 두 번 찍힌다.
        counterpartLabel: raceEvent ? raceEvent.title : `${participants.length}명 그룹`,
        summary,
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
