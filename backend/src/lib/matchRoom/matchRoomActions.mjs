import { ApiError } from '../../response/httpResponse.mjs';
import {
  MATCH_ROOM_HOST_MAX_LOADING_WAIT_SECONDS,
  MATCH_ROOM_RESERVATION_CLOSE_SECONDS,
} from '../matchConstants.mjs';
import { validateMatchSlotInput } from '../matchSlotValidation.mjs';
import {
  areAllRunningMatchRoomGuestsReady,
  areAllRunningMatchRoomParticipantsCountdownReady,
  getMatchRoomMinParticipants,
  normalizeMatchQueueDistance,
  normalizeMatchRoomMaxParticipants,
} from '../matchPureHelpers.mjs';
import { nextId } from '../idHelpers.mjs';
import { areFriends } from '../socialStoreHelpers.mjs';
import { appendUserNotification } from '../userNotifications.mjs';
import { ensureMatchRooms } from './matchRoomCore.mjs';
import {
  admitLateJoinerToReservedMatchRoom,
  armRunningMatchRoomCountdown,
  buildHostStartedMatchSlotStartAt,
  findRunningMatchRoomById,
  findRunningMatchRoomByInviteToken,
  syncMatchRooms,
} from './matchRoomSync.mjs';
import {
  buildRunningMatchBlockerApiDetails,
  buildRunningMatchRequestBlocker,
  buildRunningMatchRoomResponse,
  logRunningMatchRequestBlocker,
} from './matchRoomResponses.mjs';
import {
  assertUserCanRequestAnotherMatch,
  cleanupStaleRunningMatchRoomState,
} from './matchRoomCleanup.mjs';
import {
  buildMatchRoomSlotLabel,
  cancelReservedPartySession,
  findPendingReservedPartySession,
  releaseGuestFromReservedMatchRoom,
  resolveUserDisplayName,
} from './matchRoomReservation.mjs';
import {
  addParticipantToMatchSession,
  createMatchSession,
  findAnyReservedMatchSessionForUser,
} from '../runningMatchSessionStoreHelpers.mjs';

// 예약 수락·합류를 받는 마지막 시각(공유 상수) — 이 안에서 예약이 성립하면 로딩도 카운트다운도
// 없이 출발하고, 확정 뒤 로스터가 바뀌면 아레나·판정이 흔들린다.
const MATCH_ROOM_RESERVATION_CLOSE_MS = MATCH_ROOM_RESERVATION_CLOSE_SECONDS * 1000;

function createMatchRoomInviteToken(store) {
  const rooms = ensureMatchRooms(store);
  const existingTokens = new Set(rooms.map((room) => String(room.inviteToken ?? '').toUpperCase()).filter(Boolean));

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const token = Math.random().toString(36).slice(2, 8).toUpperCase();

    if (!existingTokens.has(token)) {
      return token;
    }
  }

  return nextId('room-invite').replace(/[^A-Z0-9]/gi, '').slice(-8).toUpperCase();
}

function getMatchRoomModeLabel(mode) {
  return mode === 'duel' ? '1대1' : '그룹';
}

function appendMatchRoomInviteNotifications(store, currentUser, room, invitedUserIds) {
  for (const invitedUserId of invitedUserIds) {
    appendUserNotification(store, {
      userId: invitedUserId,
      type: 'match_invite',
      title: '파티런 초대',
      body: `${currentUser.name}님이 ${getMatchRoomModeLabel(room.mode)} 파티런에 초대했어요.`,
      data: {
        roomId: room.id,
        inviteToken: room.inviteToken,
        mode: room.mode,
      },
    });
  }
}

// 방장이 방을 삭제해 쫓겨난 사람들에게 이유를 남긴다. 대기실이 갑자기 "열린 방이 없어요"로
// 바뀌는 것만으로는 왜 사라졌는지 알 길이 없다.
// data에 roomId를 싣지 않는 건 의도적이다 — 이미 없는 방으로 보내는 링크가 되면 안 된다.
function appendMatchRoomClosedNotifications(store, hostUser, room) {
  const kickedUserIds = [...new Set([
    ...room.participants.map((participant) => participant.userId),
    ...(Array.isArray(room.invitedFriendIds) ? room.invitedFriendIds : []),
  ])].filter((userId) => userId && userId !== hostUser.id);

  for (const kickedUserId of kickedUserIds) {
    appendUserNotification(store, {
      userId: kickedUserId,
      type: 'match_room_closed',
      title: '파티방이 사라졌어요',
      body: `${hostUser.name}님이 ${getMatchRoomModeLabel(room.mode)} 파티방을 삭제했어요.`,
      data: {
        mode: room.mode,
      },
    });
  }
}

export function createRunningMatchRoom(store, currentUser, {
  mode,
  distanceKm,
  startMode,
  slotStartAt,
  maxParticipants,
  invitedFriendIds = [],
}) {
  assertUserCanRequestAnotherMatch(store, currentUser);

  const normalizedInvitedFriendIds = [...new Set(invitedFriendIds
    .filter((userId) => typeof userId === 'string')
    .map((userId) => userId.trim())
    .filter((userId) => userId && userId !== currentUser.id))];

  for (const friendId of normalizedInvitedFriendIds) {
    if (!areFriends(store, currentUser.id, friendId)) {
      throw new ApiError(400, '친구 목록에 있는 러너만 방에 초대할 수 있어요.');
    }
  }

  const normalizedStartMode = startMode === 'host' ? 'host' : 'scheduled';
  const normalizedSlotStartAt = normalizedStartMode === 'host'
    ? new Date().toISOString()
    : validateMatchSlotInput(slotStartAt);
  const room = {
    id: nextId(`${mode}-room`),
    inviteToken: createMatchRoomInviteToken(store),
    hostUserId: currentUser.id,
    mode,
    startMode: normalizedStartMode,
    distanceKm: normalizeMatchQueueDistance(distanceKm),
    slotStartAt: normalizedSlotStartAt,
    maxParticipants: normalizeMatchRoomMaxParticipants(mode, maxParticipants),
    minParticipants: getMatchRoomMinParticipants(mode),
    invitedFriendIds: normalizedInvitedFriendIds,
    participants: [{
      userId: currentUser.id,
      isHost: true,
      isReady: false,
      isCountdownReady: false,
      invited: false,
      joinedAt: new Date().toISOString(),
    }],
    createdAt: new Date().toISOString(),
    linkedMatchId: null,
  };

  ensureMatchRooms(store).push(room);
  appendMatchRoomInviteNotifications(store, currentUser, room, normalizedInvitedFriendIds);
  syncMatchRooms(store);
  return buildRunningMatchRoomResponse(store, currentUser, room);
}

function requireJoinedRunningMatchRoomResponse(payload) {
  if (payload?.room?.roomId) {
    return payload;
  }

  throw new ApiError(
    404,
    '방 정보를 불러오지 못했습니다. 다시 시도해주세요.',
    { code: 'invalid_room_response' },
  );
}

export function joinRunningMatchRoom(store, currentUser, { inviteToken, acceptSlot = false }) {
  const room = findRunningMatchRoomByInviteToken(store, inviteToken);

  if (!room) {
    throw new ApiError(404, '참여할 방을 찾지 못했어요. 초대 코드가 잘못됐거나 방이 삭제됐을 수 있어요.', {
      code: 'room_not_found',
    });
  }

  if (room.participants.some((participant) => participant.userId === currentUser.id)) {
    return requireJoinedRunningMatchRoomResponse(buildRunningMatchRoomResponse(store, currentUser, room));
  }

  const initialBlocker = buildRunningMatchRequestBlocker(store, currentUser);
  const initialBlockerRoomId = initialBlocker?.details?.roomId;
  const blocksDifferentRoom = initialBlocker && (
    initialBlocker.legacyBlocker !== 'activeRoom' || !initialBlockerRoomId || initialBlockerRoomId !== room.id
  );

  if (blocksDifferentRoom) {
    const cleanup = cleanupStaleRunningMatchRoomState(store, currentUser);
    const blockerRoomId = cleanup.blockerDetails?.roomId;
    const stillBlocksDifferentRoom = cleanup.blocker && (
      cleanup.blocker !== 'activeRoom' || !blockerRoomId || blockerRoomId !== room.id
    );

    if (!stillBlocksDifferentRoom) {
      return joinRunningMatchRoom(store, currentUser, { inviteToken, acceptSlot });
    }

    const blocker = {
      legacyBlocker: cleanup.blocker,
      source: cleanup.blockerSource ?? cleanup.blocker,
      details: cleanup.blockerDetails ?? null,
    };
    logRunningMatchRequestBlocker('running_match_join_blocked', currentUser, blocker);
    throw new ApiError(400, cleanup.message ?? '이미 진행 중인 매칭 상태가 있어요.', buildRunningMatchBlockerApiDetails(blocker));
  }

  // 예약 방은 수락 즉시 세션이 생기므로(syncScheduledMatchRoom), 출발이 코앞이거나 이미 지난
  // 방에 들어오면 로딩도 카운트다운도 없는 매치가 만들어진다. 그 창에서는 받지 않는다.
  if (room.startMode === 'scheduled') {
    const remainingMs = new Date(room.slotStartAt).getTime() - Date.now();

    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
      throw new ApiError(400, '예약 시간이 이미 지난 방이라 참여할 수 없어요.', { code: 'room_slot_passed' });
    }

    if (remainingMs <= MATCH_ROOM_RESERVATION_CLOSE_MS) {
      throw new ApiError(400, '출발이 얼마 남지 않아 지금은 예약에 참여할 수 없어요.', { code: 'room_slot_closing' });
    }
  }

  if (room.participants.length >= room.maxParticipants) {
    throw new ApiError(400, '이 방은 이미 정원이 다 찼어요.');
  }

  const now = new Date();
  // 예약이 이미 확정된(링크된) 방: 그룹은 최소 인원이 수락하는 순간 세션이 생기므로 아직
  // 답하지 않은 초대 친구가 남는다 — 출발 전이면 방과 세션 양쪽에 합류시킨다. 예약 수락을
  // 모르는 옛 앱(acceptSlot 없음)은 받지 않는다. 방장 시작 방·이미 출발한 방은 예전 그대로 거절.
  const pendingReservedSession = findPendingReservedPartySession(store, room, now);

  if (room.linkedMatchId && !pendingReservedSession) {
    throw new ApiError(400, '이미 시작 준비에 들어간 방이라 지금은 참여할 수 없어요.');
  }

  if (room.startMode === 'scheduled' && !acceptSlot) {
    throw new ApiError(400, '예약 파티런에 참여하려면 앱을 최신 버전으로 업데이트해 주세요.', { code: 'app_update_required' });
  }

  const participant = {
    userId: currentUser.id,
    isHost: false,
    // 예약 방(시간이 정해진 방)에 들어오는 것은 그 시간을 수락하는 것이다 — 초대 카드에 시간이
    // 보이고, 게스트 전원이 수락하면 syncScheduledMatchRoom이 그 자리에서 예약(세션)을 만든다.
    // 새 앱만 acceptSlot을 보내므로 옛 앱은 위에서 걸러진다(옛 앱은 예약 화면이 없다).
    // 방장 시작 방은 예전 그대로 대기실의 '준비' 버튼으로 준비한다.
    isReady: room.startMode === 'scheduled',
    isCountdownReady: false,
    invited: room.invitedFriendIds.includes(currentUser.id),
    joinedAt: now.toISOString(),
  };

  if (pendingReservedSession) {
    if (new Date(pendingReservedSession.slotStartAt).getTime() - now.getTime() <= MATCH_ROOM_RESERVATION_CLOSE_MS) {
      throw new ApiError(400, '출발이 얼마 남지 않아 지금은 예약에 참여할 수 없어요.', { code: 'room_slot_closing' });
    }

    admitLateJoinerToReservedMatchRoom(store, room, pendingReservedSession, participant, now);
    return requireJoinedRunningMatchRoomResponse(buildRunningMatchRoomResponse(store, currentUser, room, now));
  }

  room.participants.push(participant);

  syncMatchRooms(store, now);
  return requireJoinedRunningMatchRoomResponse(buildRunningMatchRoomResponse(store, currentUser, room, now));
}

export function startRunningMatchRoom(store, currentUser, { roomId }) {
  const room = findRunningMatchRoomById(store, roomId);

  if (!room) {
    throw new ApiError(404, '시작할 방을 찾지 못했어요.', { code: 'room_not_found' });
  }

  if (room.hostUserId !== currentUser.id) {
    throw new ApiError(403, '방장만 시작할 수 있어요.');
  }

  if (room.startMode !== 'host') {
    throw new ApiError(400, '예약 시작 방은 시간에 맞춰 자동으로 시작돼요.');
  }

  if (room.linkedMatchId) {
    return buildRunningMatchRoomResponse(store, currentUser, room);
  }

  if (room.participants.length < room.minParticipants) {
    throw new ApiError(400, `최소 ${room.minParticipants}명은 모여야 시작할 수 있어요.`);
  }

  if (!areAllRunningMatchRoomGuestsReady(room)) {
    throw new ApiError(400, '모든 참가자가 준비 완료해야 시작할 수 있어요.');
  }

  const now = new Date();
  const slotStartAt = buildHostStartedMatchSlotStartAt(now, MATCH_ROOM_HOST_MAX_LOADING_WAIT_SECONDS);
  room.slotStartAt = slotStartAt;
  room.participants = room.participants.map((participant) => ({
    ...participant,
    isCountdownReady: participant.userId === currentUser.id,
  }));
  const session = createMatchSession(
    store,
    room.mode,
    room.distanceKm,
    slotStartAt,
    room.participants.map((participant, index) => ({
      id: participant.userId,
      seedRank: index + 1,
    })),
    { isPartyRun: true },
  );
  room.linkedMatchId = session.id;

  // arm-delivery trace anchor: every guest /rooms/my poll after this line should show
  // linked=y. The gap between this log and each guest's first linked=y poll IS the delivery
  // latency the 로딩중 buffer must cover (measured 12-14s on 2026-07-03 → 14s buffer).
  globalThis.console.log(
    `[arm-delivery] START room=${String(room.roomId ?? '').slice(-6)} slot=${slotStartAt}`
    + ` participants=${room.participants.length}`,
  );

  return buildRunningMatchRoomResponse(store, currentUser, room);
}

export function updateRunningMatchRoomReady(store, currentUser, {
  roomId,
  ready,
  acceptSlot = false,
}) {
  const now = new Date();
  const room = findRunningMatchRoomById(store, roomId, now);

  if (!room) {
    throw new ApiError(404, '준비 상태를 바꿀 방을 찾지 못했어요.', { code: 'room_not_found' });
  }

  const participant = room.participants.find((entry) => entry.userId === currentUser.id);

  if (!participant) {
    throw new ApiError(404, '이 방 참가자 목록에서 사용자를 찾지 못했어요.');
  }

  if (participant.isHost) {
    throw new ApiError(400, '방장은 준비 버튼 대신 시작 버튼을 사용해주세요.');
  }

  // 예약 방의 준비 = 그 시간을 수락한다는 뜻(2026-09-09). 새 앱만 acceptSlot을 보낸다 — 예약
  // 화면이 없는 옛 앱의 '준비'가 예약을 성립시키면 그 사람은 옛 화면(로딩 오버레이)에 갇힌다.
  if (room.startMode === 'scheduled' && !acceptSlot) {
    throw new ApiError(400, '예약 파티런을 수락하려면 앱을 최신 버전으로 업데이트해 주세요.', { code: 'app_update_required' });
  }

  if (room.linkedMatchId) {
    // 링크 뒤의 늦은 수락: 그룹 예약이 최소 인원으로 먼저 확정된 방에서 아직 수락 전이던
    // 참가자가 수락하면 세션에 합류한다. 수락 취소는 '나가기'로만(세션 인원은 되돌리지 않는다).
    const pendingReservedSession = findPendingReservedPartySession(store, room, now);

    if (pendingReservedSession && !participant.isReady && ready
      && new Date(pendingReservedSession.slotStartAt).getTime() - now.getTime() <= MATCH_ROOM_RESERVATION_CLOSE_MS) {
      throw new ApiError(400, '출발이 얼마 남지 않아 지금은 예약에 참여할 수 없어요.', { code: 'room_slot_closing' });
    }

    if (!pendingReservedSession || participant.isReady || !ready) {
      throw new ApiError(400, room.startMode === 'scheduled'
        ? '이미 예약이 확정된 방이에요. 빠지려면 나가기를 눌러 주세요.'
        : '이미 시작 준비에 들어간 방은 준비 상태를 바꿀 수 없어요.');
    }

    assertParticipantFreeToReserve(store, currentUser, now);
    participant.isReady = true;
    room.updatedAt = now.toISOString();
    addParticipantToMatchSession(store, pendingReservedSession, { id: currentUser.id });
    return buildRunningMatchRoomResponse(store, currentUser, room, now);
  }

  if (room.startMode === 'scheduled' && ready) {
    // 수락은 곧 예약 성립이므로 출발이 코앞이면 받지 않는다 (같은 창을 join과 공유).
    const remainingMs = new Date(room.slotStartAt).getTime() - now.getTime();

    if (Number.isFinite(remainingMs) && remainingMs > 0 && remainingMs <= MATCH_ROOM_RESERVATION_CLOSE_MS) {
      throw new ApiError(400, '출발이 얼마 남지 않아 지금은 예약을 수락할 수 없어요.', { code: 'room_slot_closing' });
    }

    assertParticipantFreeToReserve(store, currentUser, now);
  }

  participant.isReady = Boolean(ready);
  // 준비 토글은 '이 대기실은 살아 있다'는 신호 — 대기방 만료(MATCH_ROOM_WAITING_TTL_MS)의
  // 기준 시각을 여기서 밀어준다. 안 밀면 사람이 계속 준비를 눌러도 방이 2시간에 죽는다.
  room.updatedAt = now.toISOString();
  syncMatchRooms(store, now);
  return buildRunningMatchRoomResponse(store, currentUser, room, now);
}

// 예약 수락은 곧 세션 생성이고, createMatchSession은 같은 모드의 다른 세션을 지운다 — 수락하는
// 사람이 다른 매치(공식 예약·레이스 편성)를 안고 있으면 거절한다. 방 참가(join)는
// buildRunningMatchRequestBlocker가 같은 일을 이미 하지만, 방에 들어온 뒤 생긴 세션은 여기서만 잡힌다.
function assertParticipantFreeToReserve(store, currentUser, now) {
  const reserved = findAnyReservedMatchSessionForUser(store, currentUser.id, now);

  if (reserved) {
    throw new ApiError(400, '이미 예약된 매치가 있어 이 파티런을 수락할 수 없어요. 기존 매치를 먼저 정리해 주세요.', {
      code: 'match_session_blocked',
      matchId: reserved.session.id,
    });
  }
}

export function acknowledgeRunningMatchRoomCountdown(store, currentUser, { roomId }) {
  const now = new Date();
  const room = findRunningMatchRoomById(store, roomId, now);

  if (!room) {
    throw new ApiError(404, '카운트다운 준비 상태를 반영할 방을 찾지 못했어요.', { code: 'room_not_found' });
  }

  if (!room.linkedMatchId) {
    throw new ApiError(400, '아직 시작 준비가 시작되지 않은 방이에요.');
  }

  const participant = room.participants.find((entry) => entry.userId === currentUser.id);

  if (!participant) {
    throw new ApiError(404, '이 방 참가자 목록에서 사용자를 찾지 못했어요.');
  }

  participant.isCountdownReady = true;
  if (!room.countdownArmedAt && areAllRunningMatchRoomParticipantsCountdownReady(room)) {
    armRunningMatchRoomCountdown(store, room, now);
  }
  syncMatchRooms(store, now);
  return buildRunningMatchRoomResponse(store, currentUser, room, now);
}

// 클라는 설정을 저장할 때마다 현재 startMode/slotStartAt을 그대로 되돌려 보낸다 (C1 — 예전엔
// 'host'를 박아 보내 예약이 조용히 풀렸다). 같은 시각을 다시 보낸 것이면 재검증하지 않는다:
// 예약 30분 전에 초대 한 명 더 추가하는 저장이 "출발 30분 전이 지난 시간대"로 거절되면 안 된다.
// 시각이 바뀌었을 때만 validateMatchSlotInput(정시 정렬·7일 이내·30분 전)이 돈다.
function resolveUpdatedScheduledSlotStartAt(room, slotStartAt) {
  const requestedMs = Date.parse(typeof slotStartAt === 'string' ? slotStartAt : '');
  const currentMs = Date.parse(typeof room.slotStartAt === 'string' ? room.slotStartAt : '');

  if (room.startMode === 'scheduled' && Number.isFinite(requestedMs) && requestedMs === currentMs) {
    return new Date(currentMs).toISOString();
  }

  return validateMatchSlotInput(slotStartAt);
}

export function updateRunningMatchRoom(store, currentUser, {
  roomId,
  distanceKm,
  startMode,
  slotStartAt,
  maxParticipants,
  invitedFriendIds = [],
}) {
  const room = findRunningMatchRoomById(store, roomId);

  if (!room) {
    throw new ApiError(404, '설정할 방을 찾지 못했어요.', { code: 'room_not_found' });
  }

  if (room.hostUserId !== currentUser.id) {
    throw new ApiError(403, '방장만 방 설정을 바꿀 수 있어요.');
  }

  if (room.linkedMatchId) {
    // 예약이 확정된(링크된) 예약 방은 시간을 바꿀 수 없다 (C1) — 세션의 슬롯이 곧 상대의
    // 리마인더·카드·아레나 진입 시각이라, 바꾸려면 취소하고 다시 예약해야 한다.
    throw new ApiError(400, room.startMode === 'scheduled'
      ? '예약이 확정된 방은 시간을 바꿀 수 없어요.'
      : '이미 시작 준비에 들어간 방은 설정을 바꿀 수 없어요.');
  }

  const normalizedInvitedFriendIds = [...new Set(invitedFriendIds
    .filter((userId) => typeof userId === 'string')
    .map((userId) => userId.trim())
    .filter((userId) => userId && userId !== currentUser.id))];

  for (const friendId of normalizedInvitedFriendIds) {
    if (!areFriends(store, currentUser.id, friendId)) {
      throw new ApiError(400, '친구 목록에 있는 러너만 방에 초대할 수 있어요.');
    }
  }

  const previousInvitedFriendIds = new Set(room.invitedFriendIds ?? []);
  const nextStartMode = startMode === 'host' ? 'host' : 'scheduled';
  // 슬롯은 방을 건드리기 전에 확정한다 — 검증이 실패하면 방은 그대로여야 한다.
  const nextSlotStartAt = nextStartMode === 'host'
    ? new Date().toISOString()
    : resolveUpdatedScheduledSlotStartAt(room, slotStartAt);

  // 시작 방식이나 시간이 바뀌면 게스트의 수락(isReady)은 전부 풀린다 — 수락은 '그 시간'에 대한
  // 것이다. 이 되돌림이 있어야 방장이 '예약 시작' 칩을 누르는 순간 이미 들어와 있던 게스트와
  // 함께 기본 슬롯이 그대로 확정되는 함정이 없다(syncScheduledMatchRoom은 게스트 전원 수락을
  // 본다). 거리·초대만 바꾸는 저장은 수락을 건드리지 않는다.
  const startChanged = nextStartMode !== room.startMode
    || (nextStartMode === 'scheduled' && Date.parse(nextSlotStartAt) !== Date.parse(room.slotStartAt ?? ''));

  // 수락해 뒀던 게스트는 시간이 바뀌었다는 걸 알아야 다시 수락한다 — 그룹 예약(최소 인원 전)에서만
  // 생기는 상황이고, 카드는 정시를 고를 때만 저장하므로 알림이 칩 탭마다 튀지 않는다.
  const previouslyAcceptedGuestIds = startChanged
    ? room.participants
      .filter((participant) => !participant.isHost && participant.userId !== room.hostUserId && participant.isReady)
      .map((participant) => participant.userId)
    : [];

  room.distanceKm = normalizeMatchQueueDistance(distanceKm);
  room.startMode = nextStartMode;
  room.slotStartAt = nextSlotStartAt;
  if (startChanged) {
    room.participants = room.participants.map((participant) => (
      participant.isHost || participant.userId === room.hostUserId
        ? participant
        : { ...participant, isReady: false, isCountdownReady: false }
    ));
    appendMatchRoomStartChangedNotifications(store, currentUser, room, previouslyAcceptedGuestIds);
  }
  room.maxParticipants = normalizeMatchRoomMaxParticipants(room.mode, maxParticipants);
  room.invitedFriendIds = normalizedInvitedFriendIds;
  room.updatedAt = new Date().toISOString();
  appendMatchRoomInviteNotifications(
    store,
    currentUser,
    room,
    normalizedInvitedFriendIds.filter((userId) => !previousInvitedFriendIds.has(userId)),
  );
  syncMatchRooms(store);

  return buildRunningMatchRoomResponse(store, currentUser, room);
}

// 예약 파티런(2026-09-09) 방에서의 이탈. 예약은 세션이라 방만 건드려서는 안 된다:
//   - 방장 '방 삭제' → 예정 매치 카드의 취소와 같다(세션·툼스톤·방 삭제, 남은 사람에게 알림).
//   - 방장의 의사표시 없는 이탈 → 예전 규칙(400). 자동 복구 경로가 남의 예약을 걷으면 안 된다.
//   - 게스트 '나가기' → 남은 인원이 최소 인원 밑이면(1대1은 항상) 세션을 걷고 방을 예약 전으로
//     되돌린다. 방장은 남아서 다른 친구를 다시 초대할 수 있다.
//   - 초대만 받고 참가하지 않은 친구의 거절 → 초대 목록에서만 뺀다(예약과 무관).
function leaveReservedRunningMatchRoom(store, currentUser, room, session, { deleteRoom }) {
  const participantIndex = room.participants.findIndex((participant) => participant.userId === currentUser.id);

  if (participantIndex === -1) {
    if (room.invitedFriendIds.includes(currentUser.id)) {
      room.invitedFriendIds = room.invitedFriendIds.filter((userId) => userId !== currentUser.id);
      room.updatedAt = new Date().toISOString();
    }

    return buildRunningMatchRoomResponse(store, currentUser, room);
  }

  if (room.hostUserId === currentUser.id) {
    if (!deleteRoom) {
      throw new ApiError(400, '이미 대결 세션이 만들어진 방은 대결 화면에서 정리해주세요.');
    }

    cancelReservedPartySession(store, session, { actorUser: currentUser });
    return { success: true, room: null };
  }

  releaseGuestFromReservedMatchRoom(store, room, session, currentUser);
  return buildRunningMatchRoomResponse(store, currentUser, room);
}

// 방장이 시작 방식/시간을 바꿔 수락이 풀린 게스트에게 — 대기방으로 이어지는 알림(match_reserved
// 라우팅 = /match-room)이라 그 자리에서 다시 수락할 수 있다.
function appendMatchRoomStartChangedNotifications(store, hostUser, room, guestUserIds) {
  if (!guestUserIds.length) {
    return;
  }

  const hostName = resolveUserDisplayName(store, hostUser.id);
  const body = room.startMode === 'scheduled'
    ? `${hostName}님이 예약 시간을 바꿨어요 · ${buildMatchRoomSlotLabel(room.slotStartAt)} 시작 · 대기방에서 다시 수락해 주세요`
    : `${hostName}님이 방장 시작으로 바꿨어요 · 대기방에서 준비를 눌러 주세요`;

  for (const userId of guestUserIds) {
    appendUserNotification(store, {
      userId,
      type: 'match_reserved',
      title: '파티런 시작 시간이 바뀌었어요',
      body,
      data: {
        roomId: room.id,
        mode: room.mode,
        ...(room.startMode === 'scheduled' ? { slotStartAt: room.slotStartAt } : {}),
      },
    });
  }
}

// deleteRoom: 방장이 대기실의 '방 삭제' 버튼을 눌렀다는 명시적 의사표시. 이 플래그가 있을 때만
// 방이 폭파된다(참가자 전원 퇴장).
//
// 왜 플래그가 필요한가: 이 함수는 사람이 누르는 버튼만 부르는 게 아니다. 클라의 자동 복구
// 경로들(방 만들기 blocker 회수, 빈 대기실 화해)이 같은 엔드포인트를 조용히 호출한다. 방장이
// 나가면 무조건 폭파하게 두면, 폴링 한 번 실패한 것만으로 아무도 누르지 않았는데 남의 파티방이
// 사라진다. 그래서 '삭제'는 의사표시가 있을 때만이고, 의사표시 없는 이탈은 예전처럼 방장 위임이다.
export function leaveRunningMatchRoom(store, currentUser, { roomId, deleteRoom = false }) {
  const room = findRunningMatchRoomById(store, roomId);

  if (!room) {
    return { success: true, room: null };
  }

  if (room.linkedMatchId) {
    // 예약 파티런(링크됐지만 아직 출발 전)은 여기서 되돌린다 — 방장 시작 방과 이미 출발한
    // 방은 예전 규칙 그대로 대결 화면에서 정리한다.
    const reservedSession = findPendingReservedPartySession(store, room);

    if (!reservedSession) {
      throw new ApiError(400, '이미 대결 세션이 만들어진 방은 대결 화면에서 정리해주세요.');
    }

    return leaveReservedRunningMatchRoom(store, currentUser, room, reservedSession, { deleteRoom });
  }

  const participantIndex = room.participants.findIndex((participant) => participant.userId === currentUser.id);
  const wasInvitedOnly = room.invitedFriendIds.includes(currentUser.id) && participantIndex === -1;

  if (participantIndex === -1 && !wasInvitedOnly) {
    return buildRunningMatchRoomResponse(store, currentUser, room);
  }

  // 방장이 누르는 버튼은 '방 나가기'가 아니라 '방 삭제'다 (오너 2026-07-31). 방장이 삭제하면
  // 방은 폭파되고 참가자 전원이 퇴장한다 — 라벨이 곧 동작이다.
  if (deleteRoom && room.hostUserId === currentUser.id) {
    store.matchRooms = ensureMatchRooms(store).filter((entry) => entry.id !== room.id);
    appendMatchRoomClosedNotifications(store, currentUser, room);
    return { success: true, room: null };
  }

  room.invitedFriendIds = room.invitedFriendIds.filter((userId) => userId !== currentUser.id);

  if (participantIndex !== -1) {
    const wasHost = room.participants[participantIndex].isHost || room.hostUserId === currentUser.id;
    room.participants.splice(participantIndex, 1);

    if (!room.participants.length) {
      store.matchRooms = ensureMatchRooms(store).filter((entry) => entry.id !== room.id);
      return { success: true, room: null };
    }

    if (wasHost) {
      room.hostUserId = room.participants[0].userId;
      room.participants = room.participants.map((participant, index) => ({
        ...participant,
        isHost: index === 0,
      }));
    }
  }

  // 사람이 빠지는 것도 '이 방은 아직 살아 있다'는 활동이다. 여기서 안 찍으면, 방금 들어온
  // 참가자가 나갈 때 그 사람의 joinedAt이 사라지면서 방의 마지막 활동 시각이 과거로 되감기고
  // (getMatchRoomLastActivityAtMs는 참가자 joinedAt의 최댓값을 본다) 멀쩡한 대기실이 다음
  // prune에서 만료 처리될 수 있다.
  room.updatedAt = new Date().toISOString();

  return buildRunningMatchRoomResponse(store, currentUser, room);
}
