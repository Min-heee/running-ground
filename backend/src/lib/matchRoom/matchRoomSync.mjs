import {
  MATCH_ROOM_HOST_LOADING_SECONDS,
  MATCH_ROOM_HOST_START_DELAY_SECONDS,
  MATCH_ROOM_RESERVATION_CLOSE_SECONDS,
} from '../matchConstants.mjs';
import {
  areAllRunningMatchRoomGuestsReady,
  areAllRunningMatchRoomParticipantsCountdownReady,
  isMatchRoomVisibleToUser,
} from '../matchPureHelpers.mjs';
import {
  addParticipantToMatchSession,
  createMatchSession,
  findAnyReservedMatchSessionForUser,
  findMatchSessionById,
} from '../runningMatchSessionStoreHelpers.mjs';
import { appendUserNotification } from '../userNotifications.mjs';
import {
  getMatchRoomLinkedSession,
  pruneMatchRooms,
} from './matchRoomCore.mjs';
import {
  buildMatchRoomSlotLabel,
  resolveUserDisplayName,
} from './matchRoomReservation.mjs';

export function buildHostStartedMatchSlotStartAt(now = new Date(), loadingSeconds = MATCH_ROOM_HOST_LOADING_SECONDS) {
  return new Date(now.getTime() + (loadingSeconds + MATCH_ROOM_HOST_START_DELAY_SECONDS) * 1000).toISOString();
}

// 예약이 성립한 순간의 알림 (C5). 1대1은 방장에게(수락한 게스트는 자기 화면이 곧 바뀐다),
// 그룹은 참가자 전원에게. data.roomId로 대기방, matchId로 예정 매치 카드가 이어진다.
// 1대1의 게스트는 한 명이라 "누가 수락했는지"가 확정적이다. 그룹은 마지막 수락자를 상태만으로는
// 알 수 없어(참가·'예약 수락' 버튼 어느 쪽이든 링크를 완성할 수 있다) 인원수로 말한다.
function appendMatchRoomReservedNotifications(store, room, session) {
  const guests = room.participants.filter((participant) => !participant.isHost && participant.userId !== room.hostUserId);
  const slotLabel = buildMatchRoomSlotLabel(session.slotStartAt);
  const body = room.mode === 'duel'
    ? `${resolveUserDisplayName(store, guests[0]?.userId)}님이 수락했어요 · ${slotLabel} 시작`
    : `참가자 ${room.participants.length}명이 모두 수락했어요 · ${slotLabel} 시작`;
  const recipientUserIds = room.mode === 'duel'
    ? [room.hostUserId]
    : room.participants.map((participant) => participant.userId);

  for (const userId of [...new Set(recipientUserIds)]) {
    appendUserNotification(store, {
      userId,
      type: 'match_reserved',
      title: '파티런 예약 완료',
      body,
      data: {
        roomId: room.id,
        matchId: session.id,
        mode: room.mode,
        slotStartAt: session.slotStartAt,
      },
    });
  }
}

// 예약 방은 최소 인원이 모이고 게스트 전원이 그 시간을 수락한 순간 바로 세션을 만든다 (오너
// 2026-09-09). 예전에는 슬롯 10초 전까지 기다렸는데, 그러면 예약이 홈의 예정 매치 카드·리마인더·
// 아레나 자동 진입 어디에도 안 잡힌다 — 그것들은 전부 matchSessions만 본다. 세션이 곧 예약이다.
//
// '수락' = participant.isReady. 시간이 정해진 방에 초대 수락으로 들어오는 게스트는 join에서 ready로
// 들어오고(초대 카드에 시간이 보인다), 시간이 정해지기 전에 들어와 있던 게스트는 대기실의
// '예약 수락' 버튼으로 수락한다. 방장이 시작 방식/시간을 바꾸면 수락은 전부 풀린다
// (updateRunningMatchRoom) — 그래서 방장의 어떤 저장도 혼자서는 예약을 잠그지 못한다. 안 그러면
// '예약 시작' 칩을 누르는 순간 기본 슬롯(가장 이른 정시)이 이미 들어와 있던 게스트와 함께 그대로
// 확정돼 버린다(적대 검증 2026-09-09). 방장 시작 방(startMode 'host')은 이 함수를 아예 타지
// 않는다 — 그쪽은 바이트 단위로 예전 그대로.
function syncScheduledMatchRoom(room, store, now = new Date()) {
  if (!room || room.startMode !== 'scheduled' || room.linkedMatchId) {
    return room;
  }

  if (room.participants.length < room.minParticipants || !areAllRunningMatchRoomGuestsReady(room)) {
    return room;
  }

  const slotStartAtMs = new Date(room.slotStartAt).getTime();

  // 지난 슬롯은 예약이 아니고, 출발이 코앞인 슬롯도 아니다 — 그 안에서 링크되면 로딩·카운트다운
  // 없이 곧장 출발해 버린다. 방장은 카드에서 '예약한 시간이 지났어요'를 보고 새 시간을 고른다.
  if (!Number.isFinite(slotStartAtMs) || slotStartAtMs - now.getTime() <= MATCH_ROOM_RESERVATION_CLOSE_SECONDS * 1000) {
    return room;
  }

  // createMatchSession은 참가자들의 같은 모드 세션을 통째로 지운다(clearUsersFromMatchSessions —
  // 레이스 이벤트 편성 세션이면 다른 등록자 전원의 세션까지). 누군가 다른 매치를 안고 있으면
  // 링크하지 않는다 — 수락 자체는 join/ready에서 막히지만, 수락 뒤에 서버가 편성한 세션은
  // 여기서만 걸러진다(적대 검증 2026-09-10).
  if (room.participants.some((participant) => findAnyReservedMatchSessionForUser(store, participant.userId, now))) {
    return room;
  }

  const session = createMatchSession(
    store,
    room.mode,
    room.distanceKm,
    room.slotStartAt,
    room.participants.map((participant, index) => ({
      id: participant.userId,
      seedRank: index + 1,
    })),
    { isPartyRun: true, isScheduledPartyRun: true, now },
  );

  room.linkedMatchId = session.id;
  room.updatedAt = now.toISOString();
  appendMatchRoomReservedNotifications(store, room, session);
  return room;
}

// 예약이 확정된 뒤(링크 뒤) 들어오는 늦은 합류자 — 그룹 예약은 최소 인원(3)이 수락하는 순간
// 세션이 생기는데, 그때 아직 답하지 않은 초대 친구가 남아 있다. 방과 세션 양쪽에 같은 사람을
// 넣는다(addParticipantToMatchSession = 창립 참가자와 같은 모양 + 내구 로스터). 방장에게만
// 알린다 — 카드·리마인더는 세션을 보므로 따로 손댈 게 없다.
export function admitLateJoinerToReservedMatchRoom(store, room, session, participant, now = new Date()) {
  room.participants.push(participant);
  room.updatedAt = now.toISOString();
  addParticipantToMatchSession(store, session, { id: participant.userId });
  appendUserNotification(store, {
    userId: room.hostUserId,
    type: 'match_reserved',
    title: '파티런 예약에 합류했어요',
    body: `${resolveUserDisplayName(store, participant.userId)}님이 합류했어요 · ${buildMatchRoomSlotLabel(session.slotStartAt)} 시작`,
    data: {
      roomId: room.id,
      matchId: session.id,
      mode: room.mode,
      slotStartAt: session.slotStartAt,
    },
  });
  return room;
}

export function syncMatchRooms(store, now = new Date()) {
  const rooms = pruneMatchRooms(store, now);
  return rooms
    .map((room) => syncScheduledMatchRoom(room, store, now))
    .map((room) => syncHostStartedMatchRoomCountdown(room, store, now));
}

export function findRunningMatchRoomById(store, roomId, now = new Date()) {
  return syncMatchRooms(store, now).find((room) => room.id === roomId) ?? null;
}

export function findRunningMatchRoomByInviteToken(store, inviteToken, now = new Date()) {
  const normalizedToken = String(inviteToken ?? '').trim().toUpperCase();

  if (!normalizedToken) {
    return null;
  }

  return syncMatchRooms(store, now).find((room) => String(room.inviteToken).toUpperCase() === normalizedToken) ?? null;
}

// 내가 참가자인 방이 초대만 받은 방보다 먼저다 — 예약 방은 며칠을 살기 때문에 그 사이 들어온
// 새 초대가 /rooms/my를 덮어 내 예약 대기실을 가리면 안 된다(적대 검증 2026-09-10). 같은 부류
// 안에서는 예전처럼 최신 방.
export function findRunningMatchRoomForUser(store, userId, now = new Date()) {
  const isJoined = (room) => room.hostUserId === userId
    || room.participants.some((participant) => participant.userId === userId);
  const rooms = syncMatchRooms(store, now)
    .filter((room) => isMatchRoomVisibleToUser(room, userId))
    .sort((left, right) => (
      (Number(isJoined(right)) - Number(isJoined(left)))
      || (new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    ));

  return rooms[0] ?? null;
}

// 참가자로 들어가 있는 방만 — 매칭 차단(blocker) 판정용. 초대만 받은 방은 답하지 않은 채 며칠이
// 갈 수 있는데, 그것 때문에 공식 매칭·다른 파티런이 막히면 안 된다. 초대 카드는
// findRunningMatchRoomForUser/InviteInbox가 그대로 보여준다.
export function findRunningMatchRoomJoinedByUser(store, userId, now = new Date()) {
  const rooms = syncMatchRooms(store, now)
    .filter((room) => room.hostUserId === userId || room.participants.some((participant) => participant.userId === userId))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  return rooms[0] ?? null;
}

export function findRunningMatchRoomInviteInboxForUser(store, currentUser, now = new Date()) {
  const identityAliases = new Set([
    currentUser?.id,
    currentUser?.publicTag,
  ].map((value) => String(value ?? '').trim()).filter(Boolean));
  const rooms = syncMatchRooms(store, now)
    .filter((room) => (
      !room.participants.some((participant) => identityAliases.has(participant.userId))
      && Array.isArray(room.invitedFriendIds)
      && room.invitedFriendIds.some((invitedUserId) => identityAliases.has(String(invitedUserId ?? '').trim()))
    ))
    .sort((left, right) => new Date(right.updatedAt ?? right.createdAt).getTime() - new Date(left.updatedAt ?? left.createdAt).getTime());

  return rooms[0] ?? null;
}

export function armRunningMatchRoomCountdown(store, room, now = new Date()) {
  if (!room?.linkedMatchId) {
    return room;
  }

  const linkedSession = findMatchSessionById(store, room.linkedMatchId);
  if (!linkedSession) {
    return room;
  }

  // Already armed → the shared start instant is locked; a re-entry (a status echo / re-queue
  // path that re-reaches arm) must NOT re-stamp the slot. Re-stamping here is the key-churn
  // re-flash vector at the source: it moves slotStartAt, which rotates the client countdownKey
  // (`${matchId}:${slotStartAt}`) and re-mints the locked countdown mid-flight. Additive,
  // idempotent guard — once armed, arming is a no-op for the slot.
  if (room.countdownArmedAt) {
    return room;
  }

  // Arming signals "everyone is ready" — it must NOT move the shared start time. The
  // host has no room-update channel once linkedMatchId is set, so rewriting the slot
  // here left the host counting against the slot agreed at start while guests counted
  // against the rewritten one: the two countdowns finished apart by however long the
  // last ack took (observed live as a variable 0.4s–7s gap).
  //
  // GAME-GRADE RULE: a still-FUTURE slot is NEVER moved — not even when a straggler's ack
  // lands inside the final 10s. The old "keep only if >= now+10s, else rebuild to now+15s"
  // branch re-stamped the slot mid-countdown (observed live: room slot :08 vs re-stamped
  // duel slot :17 — the host counted 3-2-1 on the original instant while the guest's digit
  // died at ~6). A late joiner simply gets a SHORTER visible countdown and joins at the
  // current digit; every phone still starts at the SAME instant, which also scales to 30+
  // (one late ack can no longer slide the start for everyone). Rebuild ONLY when the slot
  // is missing/unparseable or already elapsed (a stale/aborted start needing a fresh slot).
  const existingSlotMs = Date.parse(linkedSession.slotStartAt ?? room.slotStartAt ?? '');
  const slotStartAt = Number.isFinite(existingSlotMs) && existingSlotMs > now.getTime()
    ? new Date(existingSlotMs).toISOString()
    : buildHostStartedMatchSlotStartAt(now);
  room.slotStartAt = slotStartAt;
  room.countdownArmedAt = now.toISOString();
  linkedSession.slotStartAt = slotStartAt;
  delete linkedSession.startedAt;
  return room;
}

function syncHostStartedMatchRoomCountdown(room, store, now = new Date()) {
  if (!room || room.startMode !== 'host' || !room.linkedMatchId) {
    return room;
  }

  const linkedSession = getMatchRoomLinkedSession(room, store);
  if (!linkedSession || room.countdownArmedAt) {
    return room;
  }

  const allParticipantsCountdownReady = areAllRunningMatchRoomParticipantsCountdownReady(room);
  const ceilingSlotStartAtMs = new Date(linkedSession.slotStartAt ?? room.slotStartAt).getTime();
  const maxLoadingWindowEnded = Number.isFinite(ceilingSlotStartAtMs)
    && now.getTime() >= ceilingSlotStartAtMs - MATCH_ROOM_HOST_START_DELAY_SECONDS * 1000;

  if (allParticipantsCountdownReady || maxLoadingWindowEnded) {
    return armRunningMatchRoomCountdown(store, room, now);
  }

  return room;
}
