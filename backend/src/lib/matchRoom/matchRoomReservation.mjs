// 예약 파티런 (오너 2026-09-09): 친구 탭 '파티런 신청' → 대기방에서 방장이 날짜·시각을 고르고,
// 초대받은 친구가 수락(참가)하는 순간 방이 '예약 매칭'이 된다 — 공식 매칭 예약과 똑같이
// 예정 매치 카드·10/5/1분 리마인더·아레나 자동 진입을 탄다.
//
// 이 모듈은 예약이 성립한 뒤의 '되돌리기' 경로를 한곳에 모은다:
//   - 예약 취소(예정 매치 카드의 취소 = /running/matches/cancel, 세션.isPartyRun)
//   - 방장의 '방 삭제'(leave + deleteRoom) — 예약 방에서는 취소와 같은 뜻이다
//   - 게스트의 '나가기' — 1대1 예약에 한 사람만 남으면 예약은 의미가 없으므로 세션을 걷고
//     방을 예약 전(링크 없음)으로 되돌린다. 방장은 다시 초대할 수 있다.
// 공식 매칭 취소가 남은 사람을 매칭 큐에 다시 넣는 것과 달리, 파티런은 절대 재큐잉하지 않는다.

import {
  buildMatchSlotDateLabel,
  formatDuelSlotLabel,
} from '../dateTimeFormatting.mjs';
import {
  ensureMatchSessions,
  findMatchSessionById,
  hydrateMatchSessionState,
} from '../runningMatchSessionStoreHelpers.mjs';
import { removeFromMatchRoster } from '../matchRosters.mjs';
import { appendUserNotification } from '../userNotifications.mjs';
import { recordVanishedMatch } from '../vanishedMatchTombstones.mjs';
import { ensureMatchRooms } from './matchRoomCore.mjs';

// "6. 24. (수) 11:00" — 예정 매치 카드의 summary와 같은 조합. 시각만("11:00") 보내면 며칠 뒤
// 예약인지 알 수 없어 알림 본문에는 항상 날짜를 함께 싣는다.
export function buildMatchRoomSlotLabel(slotStartAt) {
  return `${buildMatchSlotDateLabel(slotStartAt)} ${formatDuelSlotLabel(slotStartAt)}`;
}

// 알림 본문용 이름 — findUserById는 404를 던지므로 (탈퇴 직후 등) 알림 때문에 요청이
// 실패하지 않게 조용히 폴백한다.
export function resolveUserDisplayName(store, userId) {
  const user = (store.users ?? []).find((entry) => entry?.id === userId);
  const name = typeof user?.name === 'string' ? user.name.trim() : '';
  return name || '친구';
}

// 예약이 확정됐지만(링크 O) 아직 출발 전(세션 'matched')인 예약 방의 세션. 방장 시작 방이나
// 이미 출발한(active) 방은 null — 그런 방의 뒷정리는 예전 규칙(대결 화면) 그대로다.
export function findPendingReservedPartySession(store, room, now = new Date()) {
  if (!room || room.startMode !== 'scheduled' || !room.linkedMatchId) {
    return null;
  }

  const session = findMatchSessionById(store, room.linkedMatchId);

  if (!isPendingScheduledPartySession(session, now)) {
    return null;
  }

  return session;
}

// 예약(대기방에서 시간을 정하고 수락으로 성립한) 세션이면서 아직 출발 전인가. isPartyRun만으로는
// 방장 시작 파티런까지 걸린다 — 그쪽은 예전 규칙(대결 화면에서 정리) 그대로여야 한다.
export function isPendingScheduledPartySession(session, now = new Date()) {
  if (!session || session.isScheduledPartyRun !== true) {
    return false;
  }

  const slotMs = Date.parse(session.slotStartAt ?? '');

  return Number.isFinite(slotMs)
    && slotMs > now.getTime()
    && hydrateMatchSessionState(session, now) === 'matched';
}

function removeMatchSession(store, sessionId) {
  store.matchSessions = ensureMatchSessions(store).filter((entry) => entry.id !== sessionId);
  // 상대 기기가 아직 이 matchId를 폴링할 수 있다 — 무한 404 재시도 대신 종결 410을 받게 한다.
  recordVanishedMatch(sessionId);
}

// 예약 취소 알림. 방이 함께 사라지는 경우(취소/방 삭제)에는 roomId를 싣지 않는다 — 이미 없는
// 방으로 보내는 링크가 되면 안 된다(방 폭파 알림과 같은 규칙). 방이 남는 경우(게스트 이탈)에는
// roomId를 실어 방장이 곧장 방으로 돌아가 다시 초대할 수 있게 한다.
function appendReservationCancelledNotifications(store, {
  actorUserId,
  mode,
  reason = null,
  recipientUserIds,
  roomId = null,
  slotStartAt,
}) {
  const slotLabel = buildMatchRoomSlotLabel(slotStartAt);
  // 사람이 취소한 게 아니라 다른 일정(레이스 편성)이 자리를 가져간 경우 — 취소한 사람이 없으므로
  // 예약에 있던 전원에게, 이유를 그대로 말한다.
  const body = reason === 'raceEvent'
    ? `레이스 참가 신청이 확정돼 ${slotLabel} 파티런 예약이 취소됐어요`
    : `${resolveUserDisplayName(store, actorUserId)}님이 ${slotLabel} 파티런 예약을 취소했어요`;

  for (const userId of [...new Set(recipientUserIds)].filter((id) => id && (!actorUserId || id !== actorUserId))) {
    appendUserNotification(store, {
      userId,
      type: 'match_room_closed',
      title: '파티런 예약이 취소됐어요',
      body,
      data: {
        mode,
        ...(roomId ? { roomId } : {}),
      },
    });
  }
}

// 예약 파티런 세션을 통째로 걷는다: 세션 삭제 + 툼스톤 + 연결된 방 삭제 + 남은 사람들에게
// 취소 알림. 재큐잉은 없다(파티런은 친구끼리의 약속이지 매칭 풀이 아니다).
// 반환: 지운 방 id 목록 (없으면 빈 배열 — 방이 먼저 정리된 세션도 취소는 된다).
export function cancelReservedPartySession(store, session, { actorUser, reason = null }) {
  const linkedRooms = ensureMatchRooms(store).filter((room) => room.linkedMatchId === session.id);
  const recipientUserIds = [
    ...session.participants.map((participant) => participant.userId),
    ...linkedRooms.flatMap((room) => [
      ...room.participants.map((participant) => participant.userId),
      ...(Array.isArray(room.invitedFriendIds) ? room.invitedFriendIds : []),
    ]),
  ];

  removeMatchSession(store, session.id);
  store.matchRooms = ensureMatchRooms(store).filter((room) => room.linkedMatchId !== session.id);
  appendReservationCancelledNotifications(store, {
    actorUserId: actorUser?.id ?? null,
    mode: session.mode,
    reason,
    recipientUserIds,
    slotStartAt: session.slotStartAt,
  });

  return { removedRoomIds: linkedRooms.map((room) => room.id) };
}

// 게스트가 예약 방에서 나간다. 세션(수락한 사람들)의 남은 인원이 최소 인원 밑으로 떨어지면
// (1대1은 항상) 세션을 걷고 방을 예약 전 상태로 되돌린다 — 방은 살아남고, 방장은 같은 시간으로
// 다른 친구를 초대할 수 있다. 그룹처럼 최소 인원이 아직 채워져 있으면 세션은 유지하고 나간
// 사람만 세션 참가자에서 뺀 뒤 남은 사람들에게 알린다(세션을 갈아엎으면 matchId가 바뀌어
// 남은 사람들의 리마인더·카드가 전부 흔들린다). 아직 수락 전이라 세션 밖이던 참가자의 이탈은
// 예약과 무관하다.
export function releaseGuestFromReservedMatchRoom(store, room, session, guestUser, now = new Date()) {
  const nowIso = now.toISOString();
  const wasInSession = session.participants.some((participant) => participant.userId === guestUser.id);

  room.invitedFriendIds = (room.invitedFriendIds ?? []).filter((userId) => userId !== guestUser.id);
  room.participants = room.participants.filter((participant) => participant.userId !== guestUser.id);
  room.updatedAt = nowIso;

  if (!wasInSession) {
    return { reservationCancelled: false };
  }

  const remainingSessionParticipants = session.participants.filter((participant) => participant.userId !== guestUser.id);

  if (remainingSessionParticipants.length >= room.minParticipants) {
    session.participants = remainingSessionParticipants;
    // 세션이 살아남는 경우에도 내구 로스터에서 빼야 한다 — 안 빼면 세션이 사라진 뒤 그룹 판정이
    // '아직 안 낸 사람'을 영원히 기다린다.
    removeFromMatchRoster(store, session.id, guestUser.id);
    const actorName = resolveUserDisplayName(store, guestUser.id);
    const slotLabel = buildMatchRoomSlotLabel(session.slotStartAt);

    for (const participant of remainingSessionParticipants) {
      appendUserNotification(store, {
        userId: participant.userId,
        type: 'match_reserved',
        title: '파티런 예약 인원이 바뀌었어요',
        body: `${actorName}님이 예약에서 빠졌어요 · ${slotLabel} 시작 · ${remainingSessionParticipants.length}명`,
        data: {
          roomId: room.id,
          matchId: session.id,
          mode: room.mode,
          slotStartAt: session.slotStartAt,
        },
      });
    }

    return { reservationCancelled: false };
  }

  removeMatchSession(store, session.id);
  room.linkedMatchId = null;
  delete room.countdownArmedAt;
  room.participants = room.participants.map((participant) => ({
    ...participant,
    isCountdownReady: false,
  }));
  appendReservationCancelledNotifications(store, {
    actorUserId: guestUser.id,
    mode: room.mode,
    recipientUserIds: room.participants.map((participant) => participant.userId),
    roomId: room.id,
    slotStartAt: session.slotStartAt,
  });

  return { reservationCancelled: true };
}

// 예정 매치 카드의 '예약 취소'와 대결 화면의 '나가기'(leaveRunningMatch)가 출발 전 파티런 예약을
// 만났을 때의 역할별 되돌리기 — 방장이면 예약 전체 취소, 게스트면 자기만 빠진다(방은 남아
// 방장이 다시 초대할 수 있다). 대기실의 '나가기'와 같은 규칙이라 어느 화면에서 눌러도 결과가
// 같다(적대 검증 2026-09-10: 카드 취소가 방장의 방까지 지우던 불일치).
export function withdrawFromReservedPartySession(store, session, actorUser, now = new Date()) {
  const linkedRoom = ensureMatchRooms(store).find((room) => room.linkedMatchId === session.id);
  const isGuestOfRoom = Boolean(linkedRoom)
    && linkedRoom.hostUserId !== actorUser.id
    && linkedRoom.participants.some((participant) => participant.userId === actorUser.id);

  if (isGuestOfRoom) {
    return { ...releaseGuestFromReservedMatchRoom(store, linkedRoom, session, actorUser, now), roomId: linkedRoom.id };
  }

  return { ...cancelReservedPartySession(store, session, { actorUser }), reservationCancelled: true };
}
