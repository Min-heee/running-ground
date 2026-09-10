// 예약 파티런 (오너 2026-09-09) — 대기방에서 방장이 시간을 고르고 친구가 수락하면 그 순간
// 예약 매칭(세션)이 된다. 여기서 못 박는 계약:
//   C1 방 설정은 startMode/slotStartAt을 받고, 예약 확정(링크) 뒤에는 시간 변경을 거부한다.
//   C2 수락 = 즉시 링크(슬롯 10초 전까지 기다리지 않는다). 최소 인원 미만이면 링크 없음.
//      방장 시작 방은 바이트 단위로 예전 그대로(참가로는 링크되지 않고 시작으로만).
//   C4 게스트 이탈은 세션을 걷고 방을 예약 전으로 되돌린다. 방장 '방 삭제'는 취소와 같다.
//   C5 예약 성립 알림 'match_reserved' (1대1: 방장, 그룹: 전원).
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSeedStore } from '../../seed.mjs';
import { MATCH_ROOM_HOST_START_DELAY_SECONDS } from '../matchConstants.mjs';
import { buildMatchRoomSlotLabel, withdrawFromReservedPartySession } from './matchRoomReservation.mjs';
import { leaveRunningMatch } from '../matchActionHandlers.mjs';
import { findMatchSessionById } from '../runningMatchSessionStoreHelpers.mjs';
import { findMatchRoster } from '../matchRosters.mjs';
import {
  clearVanishedMatchTombstones,
  isMatchTombstoned,
} from '../vanishedMatchTombstones.mjs';
import {
  createRunningMatchRoom,
  joinRunningMatchRoom,
  leaveRunningMatchRoom,
  startRunningMatchRoom,
  updateRunningMatchRoom,
  updateRunningMatchRoomReady,
} from './matchRoomActions.mjs';
import { forceResetRunningMatchStateForUser } from './matchRoomCleanup.mjs';
import { getRunningMatchRoomState } from './matchRoomCore.mjs';
import { buildRunningMatchRequestBlocker } from './matchRoomResponses.mjs';

function iso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function createRunner(id, name) {
  return {
    id,
    username: id,
    name,
    realName: name,
    publicTag: id,
    provinceName: '경기도',
    cityName: '고양시',
    districtName: '일산서구',
    connectedSources: [],
    notificationSettings: { friendAlerts: true, districtAlerts: true, marketAlerts: true },
    createdAt: iso(-24 * 60 * 60 * 1000),
  };
}

function createRun(userId) {
  const startedAt = iso(-24 * 60 * 60 * 1000);
  return {
    id: `${userId}-run`,
    userId,
    date: startedAt.slice(0, 10),
    distanceKm: 5,
    pace: '06:20/km',
    source: 'RunningGround',
    sourceType: 'runningground',
    startedAt,
    endedAt: iso(-24 * 60 * 60 * 1000 + 32 * 60 * 1000),
    durationSeconds: 32 * 60,
    createdAt: startedAt,
  };
}

// 정시 정렬 + 예약 창(7일) 안 + 마감(30분 전) 전인 슬롯.
function createSelectableSlot(hoursAhead = 2) {
  const slot = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  slot.setMinutes(0, 0, 0);
  return slot.toISOString();
}

function createStore() {
  const store = createSeedStore();
  store.users.push(
    createRunner('host-user', '방장 러너'),
    createRunner('guest-user', '참가 러너'),
    createRunner('third-user', '세번째 러너'),
    createRunner('fourth-user', '네번째 러너'),
  );
  store.runs.push(createRun('host-user'), createRun('guest-user'), createRun('third-user'), createRun('fourth-user'));
  for (const friendId of ['guest-user', 'third-user', 'fourth-user']) {
    store.friendships.push({ id: `friendship-host-${friendId}`, userIds: ['host-user', friendId], createdAt: iso(-60_000) });
  }
  const users = Object.fromEntries(store.users.map((user) => [user.id, user]));
  return { store, users };
}

function notificationsFor(store, userId, type) {
  return store.notifications.filter((item) => item.userId === userId && item.type === type);
}

function rawRoom(store, roomId) {
  return store.matchRooms.find((room) => room.id === roomId);
}

test.beforeEach(() => {
  clearVanishedMatchTombstones();
});

test('C2/C5 duel: the invited friend\'s accept links the party session at once and tells the host', () => {
  const { store, users } = createStore();
  const slotStartAt = createSelectableSlot();
  const created = createRunningMatchRoom(store, users['host-user'], {
    mode: 'duel',
    distanceKm: 5,
    startMode: 'scheduled',
    slotStartAt,
    invitedFriendIds: ['guest-user'],
  });
  assert.equal(created.room.startMode, 'scheduled');
  assert.equal(created.room.linkedMatchId, undefined, '혼자서는 예약이 아니다');
  assert.equal(created.room.slotLabel, buildMatchRoomSlotLabel(slotStartAt), '예약 방 라벨은 날짜까지');

  const joined = joinRunningMatchRoom(store, users['guest-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });

  assert.equal(typeof joined.room.linkedMatchId, 'string');
  assert.equal(joined.room.linkedMatchStatus, 'matched');
  assert.equal(joined.room.linkedMatchSlotStartAt, slotStartAt);
  assert.equal(joined.room.slotStartAt, slotStartAt, '링크가 슬롯을 옮기면 안 된다');
  assert.equal(joined.room.state, 'arming');
  assert.equal(joined.room.canStart, false);

  const session = findMatchSessionById(store, joined.room.linkedMatchId);
  assert.equal(session.isPartyRun, true);
  assert.equal(session.mode, 'duel');
  assert.equal(session.slotStartAt, slotStartAt);
  assert.deepEqual(session.participants.map((participant) => participant.userId), ['host-user', 'guest-user']);

  const hostNotices = notificationsFor(store, 'host-user', 'match_reserved');
  assert.equal(hostNotices.length, 1);
  assert.equal(hostNotices[0].title, '파티런 예약 완료');
  assert.match(hostNotices[0].body, /^참가 러너님이 수락했어요 · .+ 시작$/);
  assert.deepEqual(hostNotices[0].data, {
    roomId: created.room.roomId,
    matchId: session.id,
    mode: 'duel',
    slotStartAt,
  });
  assert.equal(notificationsFor(store, 'guest-user', 'match_reserved').length, 0, '수락한 본인에게는 안 간다');

  // 예약된 사람은 공식 예약과 마찬가지로 다른 매칭을 신청할 수 없다 (수용된 동작).
  assert.equal(buildRunningMatchRequestBlocker(store, users['host-user'])?.legacyBlocker, 'matchSession');
});

test('C2 group: no link below the group minimum; the third runner links and everyone is told', () => {
  const { store, users } = createStore();
  const slotStartAt = createSelectableSlot();
  const created = createRunningMatchRoom(store, users['host-user'], {
    mode: 'group',
    distanceKm: 5,
    startMode: 'scheduled',
    slotStartAt,
    maxParticipants: 10,
    invitedFriendIds: ['guest-user', 'third-user'],
  });

  const second = joinRunningMatchRoom(store, users['guest-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });
  assert.equal(second.room.linkedMatchId, undefined, '2명은 그룹 최소 인원 미만');
  assert.equal(store.matchSessions.length, 0);
  assert.equal(store.notifications.filter((item) => item.type === 'match_reserved').length, 0);

  const third = joinRunningMatchRoom(store, users['third-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });
  assert.equal(typeof third.room.linkedMatchId, 'string');
  assert.equal(third.room.state, 'arming');

  for (const userId of ['host-user', 'guest-user', 'third-user']) {
    const notices = notificationsFor(store, userId, 'match_reserved');
    assert.equal(notices.length, 1, `${userId}에게 예약 완료 알림`);
    assert.match(notices[0].body, /^참가자 3명이 모두 수락했어요 · .+ 시작$/);
    assert.equal(notices[0].data.mode, 'group');
  }
});

// 게스트가 시간이 정해지기 전에 들어와 있던 경우: 방장의 저장은 혼자서 예약을 잠그지 못한다.
// 게스트가 대기실에서 그 시간을 수락(ready)해야 링크되고, 방장이 시간을 바꾸면 수락은 풀린다.
test('C2 join-first: the host\'s slot save never links by itself; the guest accepts in the room, a slot change clears acceptance', () => {
  const { store, users } = createStore();
  const created = createRunningMatchRoom(store, users['host-user'], {
    mode: 'duel',
    distanceKm: 5,
    startMode: 'host',
    invitedFriendIds: ['guest-user'],
  });
  const roomId = created.room.roomId;
  const joined = joinRunningMatchRoom(store, users['guest-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });
  assert.equal(joined.room.participants.find((p) => p.userId === 'guest-user').isReady, false, '방장 시작 방 참가는 준비가 아니다');

  // 방장이 '예약 시작'을 누른다(기본 슬롯) — 게스트는 이미 있지만 수락 전이라 링크되지 않는다.
  const firstSlot = createSelectableSlot(2);
  const scheduled = updateRunningMatchRoom(store, users['host-user'], {
    roomId, distanceKm: 5, startMode: 'scheduled', slotStartAt: firstSlot, invitedFriendIds: ['guest-user'],
  });
  assert.equal(scheduled.room.linkedMatchId, undefined);
  assert.equal(store.matchSessions.length, 0);

  // 방장이 시간을 바꿔도 여전히 안 잠긴다 — 이 여유가 없으면 첫 칩이 곧 확정이 된다.
  const secondSlot = createSelectableSlot(5);
  const rescheduled = updateRunningMatchRoom(store, users['host-user'], {
    roomId, distanceKm: 5, startMode: 'scheduled', slotStartAt: secondSlot, invitedFriendIds: ['guest-user'],
  });
  assert.equal(rescheduled.room.linkedMatchId, undefined);

  // 게스트가 대기실에서 수락 → 그 자리에서 예약.
  const accepted = updateRunningMatchRoomReady(store, users['guest-user'], { roomId, ready: true, acceptSlot: true });
  assert.equal(typeof accepted.room.linkedMatchId, 'string');
  assert.equal(findMatchSessionById(store, accepted.room.linkedMatchId).slotStartAt, secondSlot);
  assert.match(notificationsFor(store, 'host-user', 'match_reserved')[0].body, /^참가 러너님이 수락했어요 · .+ 시작$/);
});

test('C2 a slot change after acceptance clears the acceptance, so the guest must accept the new time', () => {
  const { store, users } = createStore();
  const created = createRunningMatchRoom(store, users['host-user'], {
    mode: 'group',
    distanceKm: 5,
    startMode: 'host',
    maxParticipants: 10,
    invitedFriendIds: ['guest-user', 'third-user'],
  });
  const roomId = created.room.roomId;
  const guestReady = () => rawRoom(store, roomId).participants.find((p) => p.userId === 'guest-user').isReady;
  const save = (overrides) => updateRunningMatchRoom(store, users['host-user'], {
    roomId, distanceKm: 5, startMode: 'scheduled', slotStartAt: rawRoom(store, roomId).slotStartAt, maxParticipants: 10, invitedFriendIds: ['guest-user', 'third-user'], ...overrides,
  });
  joinRunningMatchRoom(store, users['guest-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });
  save({ slotStartAt: createSelectableSlot(2) });
  updateRunningMatchRoomReady(store, users['guest-user'], { roomId, ready: true, acceptSlot: true });
  assert.equal(guestReady(), true);

  // 거리만 바꾸는 저장은 수락을 건드리지 않는다.
  save({ distanceKm: 3 });
  assert.equal(guestReady(), true);

  // 시간을 바꾸면 풀린다.
  save({ slotStartAt: createSelectableSlot(4) });
  assert.equal(guestReady(), false);

  // 세 번째가 초대 수락으로 들어와도(수락 상태) 첫 게스트가 다시 수락하기 전엔 링크되지 않는다.
  const third = joinRunningMatchRoom(store, users['third-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });
  assert.equal(third.room.participants.find((p) => p.userId === 'third-user').isReady, true, '예약 방 참가 = 수락');
  assert.equal(third.room.linkedMatchId, undefined);
  const accepted = updateRunningMatchRoomReady(store, users['guest-user'], { roomId, ready: true, acceptSlot: true });
  assert.equal(typeof accepted.room.linkedMatchId, 'string');
});

test('host-start rooms are byte-identical: a join never links, only the host\'s start does, and no match_reserved is sent', () => {
  const { store, users } = createStore();
  const created = createRunningMatchRoom(store, users['host-user'], { mode: 'duel', distanceKm: 5, startMode: 'host' });
  const joined = joinRunningMatchRoom(store, users['guest-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });

  assert.equal(joined.room.linkedMatchId, undefined);
  assert.equal(joined.room.state, 'waiting');
  assert.equal(joined.room.slotLabel, '방장 시작');
  assert.equal(store.matchSessions.length, 0);

  updateRunningMatchRoomReady(store, users['guest-user'], { roomId: created.room.roomId, ready: true, acceptSlot: true });
  const started = startRunningMatchRoom(store, users['host-user'], { roomId: created.room.roomId });

  assert.equal(typeof started.room.linkedMatchId, 'string');
  assert.equal(started.room.state, 'arming');
  assert.equal(store.notifications.filter((item) => item.type === 'match_reserved').length, 0);
});

test('C1 update: the host schedules a host room, re-saving the same slot skips validation, a changed slot is validated', () => {
  const { store, users } = createStore();
  const slotStartAt = createSelectableSlot();
  const created = createRunningMatchRoom(store, users['host-user'], { mode: 'duel', distanceKm: 5, startMode: 'host' });
  const roomId = created.room.roomId;

  const scheduled = updateRunningMatchRoom(store, users['host-user'], {
    roomId,
    distanceKm: 5,
    startMode: 'scheduled',
    slotStartAt,
    invitedFriendIds: [],
  });
  assert.equal(scheduled.room.startMode, 'scheduled');
  assert.equal(scheduled.room.slotStartAt, slotStartAt);
  assert.equal(scheduled.room.slotLabel, buildMatchRoomSlotLabel(slotStartAt));

  // 30분 마감이 지난 슬롯을 그대로 되돌려 보내는 저장(초대만 추가)은 통과해야 한다.
  const closedSlot = new Date(Date.now() - 2 * 60 * 60 * 1000);
  closedSlot.setMinutes(0, 0, 0);
  rawRoom(store, roomId).slotStartAt = closedSlot.toISOString();
  const resaved = updateRunningMatchRoom(store, users['host-user'], {
    roomId,
    distanceKm: 5,
    startMode: 'scheduled',
    slotStartAt: closedSlot.toISOString(),
    invitedFriendIds: ['guest-user'],
  });
  assert.equal(resaved.room.slotStartAt, closedSlot.toISOString());
  assert.deepEqual(resaved.room.invitedFriendIds, ['guest-user']);
  assert.equal(notificationsFor(store, 'guest-user', 'match_invite').length, 1);

  // 바뀐 슬롯은 검증된다 — 정시 정렬, 7일 창, 30분 마감.
  const unaligned = new Date(Date.parse(slotStartAt) + 30 * 60 * 1000).toISOString();
  assert.throws(
    () => updateRunningMatchRoom(store, users['host-user'], { roomId, distanceKm: 5, startMode: 'scheduled', slotStartAt: unaligned, invitedFriendIds: ['guest-user'] }),
    { statusCode: 400, message: '매칭 시간은 1시간 단위로만 선택할 수 있어요.' },
  );
  const tooFar = createSelectableSlot(9 * 24);
  assert.throws(
    () => updateRunningMatchRoom(store, users['host-user'], { roomId, distanceKm: 5, startMode: 'scheduled', slotStartAt: tooFar, invitedFriendIds: ['guest-user'] }),
    { statusCode: 400, message: '매칭은 오늘부터 1주일 안의 시간대까지만 예약할 수 있어요.' },
  );
  const anotherClosed = new Date(closedSlot.getTime() - 60 * 60 * 1000).toISOString();
  assert.throws(
    () => updateRunningMatchRoom(store, users['host-user'], { roomId, distanceKm: 5, startMode: 'scheduled', slotStartAt: anotherClosed, invitedFriendIds: ['guest-user'] }),
    { statusCode: 400, message: '이 시간대는 출발 30분 전이 지나서 더 이상 선택할 수 없어요.' },
  );
  assert.throws(
    () => updateRunningMatchRoom(store, users['host-user'], { roomId, distanceKm: 5, startMode: 'scheduled', invitedFriendIds: [] }),
    { statusCode: 400, message: '매칭 시간대를 선택해주세요.' },
  );
  assert.equal(rawRoom(store, roomId).slotStartAt, closedSlot.toISOString(), '실패한 저장은 방을 건드리지 않는다');

  // 방장이 아니면 설정을 바꿀 수 없다.
  assert.throws(
    () => updateRunningMatchRoom(store, users['guest-user'], { roomId, distanceKm: 5, startMode: 'host', invitedFriendIds: [] }),
    { statusCode: 403 },
  );
});

test('C1 update is refused once the reservation is linked, with the reservation copy (host rooms keep theirs)', () => {
  const { store, users } = createStore();
  const slotStartAt = createSelectableSlot();
  const created = createRunningMatchRoom(store, users['host-user'], {
    mode: 'duel',
    distanceKm: 5,
    startMode: 'scheduled',
    slotStartAt,
    invitedFriendIds: ['guest-user'],
  });
  joinRunningMatchRoom(store, users['guest-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });

  assert.throws(
    () => updateRunningMatchRoom(store, users['host-user'], {
      roomId: created.room.roomId,
      distanceKm: 5,
      startMode: 'scheduled',
      slotStartAt: createSelectableSlot(3),
      invitedFriendIds: ['guest-user'],
    }),
    { statusCode: 400, message: '예약이 확정된 방은 시간을 바꿀 수 없어요.' },
  );
  assert.throws(
    () => startRunningMatchRoom(store, users['host-user'], { roomId: created.room.roomId }),
    { statusCode: 400, message: '예약 시작 방은 시간에 맞춰 자동으로 시작돼요.' },
  );

  const hostRoom = createRunningMatchRoom(store, users['third-user'], { mode: 'duel', distanceKm: 5, startMode: 'host' });
  joinRunningMatchRoom(store, users['fourth-user'], { inviteToken: hostRoom.room.inviteToken, acceptSlot: true });
  updateRunningMatchRoomReady(store, users['fourth-user'], { roomId: hostRoom.room.roomId, ready: true, acceptSlot: true });
  startRunningMatchRoom(store, users['third-user'], { roomId: hostRoom.room.roomId });
  assert.throws(
    () => updateRunningMatchRoom(store, users['third-user'], { roomId: hostRoom.room.roomId, distanceKm: 5, startMode: 'host', invitedFriendIds: [] }),
    { statusCode: 400, message: '이미 시작 준비에 들어간 방은 설정을 바꿀 수 없어요.' },
  );
});

test('room state: a reserved room reads arming until the final 10s, then countdown', () => {
  const { store, users } = createStore();
  const slotStartAt = createSelectableSlot();
  const created = createRunningMatchRoom(store, users['host-user'], {
    mode: 'duel',
    distanceKm: 5,
    startMode: 'scheduled',
    slotStartAt,
    invitedFriendIds: ['guest-user'],
  });
  joinRunningMatchRoom(store, users['guest-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });
  const room = rawRoom(store, created.room.roomId);
  const slotMs = Date.parse(slotStartAt);

  assert.equal(getRunningMatchRoomState(room, store, new Date(slotMs - 60 * 60 * 1000)), 'arming');
  assert.equal(getRunningMatchRoomState(room, store, new Date(slotMs - (MATCH_ROOM_HOST_START_DELAY_SECONDS + 5) * 1000)), 'arming');
  assert.equal(getRunningMatchRoomState(room, store, new Date(slotMs - 5 * 1000)), 'countdown');
});

test('C4 guest leave on a reserved duel: session torn down + tombstoned, room back to unlinked scheduled waiting, host told, host can re-invite', () => {
  const { store, users } = createStore();
  const slotStartAt = createSelectableSlot();
  const created = createRunningMatchRoom(store, users['host-user'], {
    mode: 'duel',
    distanceKm: 5,
    startMode: 'scheduled',
    slotStartAt,
    invitedFriendIds: ['guest-user'],
  });
  const roomId = created.room.roomId;
  const joined = joinRunningMatchRoom(store, users['guest-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });
  const firstMatchId = joined.room.linkedMatchId;

  const left = leaveRunningMatchRoom(store, users['guest-user'], { roomId });

  assert.equal(left.room.roomId, roomId, '방은 살아남는다');
  assert.equal(left.room.joined, false);
  assert.equal(left.room.linkedMatchId, undefined);
  assert.equal(left.room.state, 'waiting');
  assert.equal(left.room.startMode, 'scheduled');
  assert.equal(left.room.slotStartAt, slotStartAt);
  assert.deepEqual(left.room.participants.map((participant) => participant.userId), ['host-user']);
  assert.equal(findMatchSessionById(store, firstMatchId), null);
  assert.equal(isMatchTombstoned(firstMatchId), true);
  assert.equal(buildRunningMatchRequestBlocker(store, users['guest-user']), null, '나간 게스트는 자유롭다');

  const hostNotices = notificationsFor(store, 'host-user', 'match_room_closed');
  assert.equal(hostNotices.length, 1);
  assert.equal(hostNotices[0].title, '파티런 예약이 취소됐어요');
  assert.match(hostNotices[0].body, /^참가 러너님이 .+ 파티런 예약을 취소했어요$/);
  assert.equal(hostNotices[0].data.roomId, roomId, '방이 남아 있으니 방으로 이어지는 링크를 싣는다');

  // 방장은 같은 시간으로 다른 친구를 초대할 수 있고, 그 친구의 수락으로 새 예약이 선다.
  updateRunningMatchRoom(store, users['host-user'], {
    roomId,
    distanceKm: 5,
    startMode: 'scheduled',
    slotStartAt,
    invitedFriendIds: ['third-user'],
  });
  const rejoined = joinRunningMatchRoom(store, users['third-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });
  assert.equal(typeof rejoined.room.linkedMatchId, 'string');
  assert.notEqual(rejoined.room.linkedMatchId, firstMatchId);
  assert.equal(findMatchSessionById(store, rejoined.room.linkedMatchId).isPartyRun, true);
});

test('C4 host delete on a reserved room cancels it like the card: session + room gone, guest told without a roomId', () => {
  const { store, users } = createStore();
  const slotStartAt = createSelectableSlot();
  const created = createRunningMatchRoom(store, users['host-user'], {
    mode: 'duel',
    distanceKm: 5,
    startMode: 'scheduled',
    slotStartAt,
    invitedFriendIds: ['guest-user', 'third-user'],
  });
  const joined = joinRunningMatchRoom(store, users['guest-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });

  // 의사표시 없는 방장 이탈(자동 복구 경로)은 예약을 걷지 못한다.
  assert.throws(
    () => leaveRunningMatchRoom(store, users['host-user'], { roomId: created.room.roomId }),
    { statusCode: 400, message: '이미 대결 세션이 만들어진 방은 대결 화면에서 정리해주세요.' },
  );
  assert.equal(findMatchSessionById(store, joined.room.linkedMatchId)?.id, joined.room.linkedMatchId);

  const deleted = leaveRunningMatchRoom(store, users['host-user'], { roomId: created.room.roomId, deleteRoom: true });

  assert.deepEqual(deleted, { success: true, room: null });
  assert.equal(store.matchRooms.some((room) => room.id === created.room.roomId), false);
  assert.equal(findMatchSessionById(store, joined.room.linkedMatchId), null);
  assert.equal(isMatchTombstoned(joined.room.linkedMatchId), true);
  assert.equal(store.matchQueues.duel.length, 0, '파티런은 재큐잉하지 않는다');

  for (const userId of ['guest-user', 'third-user']) {
    const notices = notificationsFor(store, userId, 'match_room_closed');
    assert.equal(notices.length, 1, `${userId}: 참가자와 아직 답 안 한 초대자 모두`);
    assert.match(notices[0].body, /^방장 러너님이 .+ 파티런 예약을 취소했어요$/);
    assert.equal(notices[0].data.roomId, undefined);
  }
  assert.equal(notificationsFor(store, 'host-user', 'match_room_closed').length, 0);
});

test('C4 group above the minimum: a leaving guest is dropped from the session, the reservation stands', () => {
  const { store, users } = createStore();
  const slotStartAt = createSelectableSlot();
  const created = createRunningMatchRoom(store, users['host-user'], {
    mode: 'group',
    distanceKm: 5,
    startMode: 'scheduled',
    slotStartAt,
    maxParticipants: 10,
    invitedFriendIds: ['guest-user', 'third-user', 'fourth-user'],
  });
  joinRunningMatchRoom(store, users['guest-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });
  joinRunningMatchRoom(store, users['third-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });
  const roomAfterLink = rawRoom(store, created.room.roomId);
  const matchId = roomAfterLink.linkedMatchId;
  assert.equal(typeof matchId, 'string');

  // 링크된 뒤에도 출발 전이면 초대 친구는 합류한다 (2026-09-10) — 방과 세션 양쪽에.
  joinRunningMatchRoom(store, users['fourth-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });
  assert.equal(findMatchSessionById(store, matchId).participants.length, 4);

  const left = leaveRunningMatchRoom(store, users['fourth-user'], { roomId: created.room.roomId });

  assert.equal(left.room.linkedMatchId, matchId, '예약은 그대로');
  assert.deepEqual(findMatchSessionById(store, matchId).participants.map((participant) => participant.userId), ['host-user', 'guest-user', 'third-user']);
  assert.equal(isMatchTombstoned(matchId), false);
  assert.equal(store.notifications.filter((item) => item.type === 'match_room_closed').length, 0);
  // 남은 사람들은 인원 변화를 안다.
  for (const userId of ['host-user', 'guest-user', 'third-user']) {
    assert.match(notificationsFor(store, userId, 'match_reserved').at(-1).body, /^네번째 러너님이 예약에서 빠졌어요 · .+ · 3명$/);
  }
});

test('a scheduled room whose slot already passed refuses new joins instead of minting an already-started match', () => {
  const { store, users } = createStore();
  const created = createRunningMatchRoom(store, users['host-user'], {
    mode: 'duel',
    distanceKm: 5,
    startMode: 'scheduled',
    slotStartAt: createSelectableSlot(),
    invitedFriendIds: ['guest-user'],
  });
  rawRoom(store, created.room.roomId).slotStartAt = iso(-5 * 60 * 1000);

  assert.throws(
    () => joinRunningMatchRoom(store, users['guest-user'], { inviteToken: created.room.inviteToken, acceptSlot: true }),
    { statusCode: 400, message: '예약 시간이 이미 지난 방이라 참여할 수 없어요.' },
  );
  assert.equal(store.matchSessions.length, 0);
});

test('an invited-only friend declining a reserved room only drops the invite', () => {
  const { store, users } = createStore();
  const created = createRunningMatchRoom(store, users['host-user'], {
    mode: 'duel',
    distanceKm: 5,
    startMode: 'scheduled',
    slotStartAt: createSelectableSlot(),
    invitedFriendIds: ['guest-user', 'third-user'],
  });
  const joined = joinRunningMatchRoom(store, users['guest-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });

  const declined = leaveRunningMatchRoom(store, users['third-user'], { roomId: created.room.roomId });

  assert.equal(declined.room.linkedMatchId, joined.room.linkedMatchId);
  assert.deepEqual(declined.room.invitedFriendIds, ['guest-user']);
  assert.equal(findMatchSessionById(store, joined.room.linkedMatchId)?.id, joined.room.linkedMatchId);
});

// 옛 앱 게이트 (2026-09-10): 예약 화면이 없는 옛 앱은 acceptSlot을 모른다 — 그 참가/준비가 예약을
// 성립시키면 그 사람은 옛 화면(로딩 오버레이)에 갇힌다. 방장 시작 방은 플래그와 무관하다.
test('old clients (no acceptSlot) cannot accept a scheduled room; host rooms ignore the flag', () => {
  const { store, users } = createStore();
  const created = createRunningMatchRoom(store, users['host-user'], {
    mode: 'duel', distanceKm: 5, startMode: 'scheduled', slotStartAt: createSelectableSlot(), invitedFriendIds: ['guest-user'],
  });
  assert.throws(
    () => joinRunningMatchRoom(store, users['guest-user'], { inviteToken: created.room.inviteToken }),
    { statusCode: 400, message: '예약 파티런에 참여하려면 앱을 최신 버전으로 업데이트해 주세요.' },
  );
  assert.equal(store.matchSessions.length, 0);

  const hostRoom = createRunningMatchRoom(store, users['third-user'], { mode: 'duel', distanceKm: 5, startMode: 'host' });
  const joined = joinRunningMatchRoom(store, users['fourth-user'], { inviteToken: hostRoom.room.inviteToken });
  assert.equal(joined.room.participants.length, 2);
  updateRunningMatchRoomReady(store, users['fourth-user'], { roomId: hostRoom.room.roomId, ready: true });
  assert.equal(rawRoom(store, hostRoom.room.roomId).participants[1].isReady, true);

  // 시간이 정해지기 전에 들어와 있던 게스트의 옛 앱 '준비'도 예약을 성립시키지 못한다.
  const fresh = createStore();
  const { store: store2, users: users2 } = fresh;
  const joinFirst = createRunningMatchRoom(store2, users2['host-user'], { mode: 'group', distanceKm: 5, startMode: 'host', maxParticipants: 10 });
  joinRunningMatchRoom(store2, users2['guest-user'], { inviteToken: joinFirst.room.inviteToken });
  updateRunningMatchRoom(store2, users2['host-user'], {
    roomId: joinFirst.room.roomId, distanceKm: 5, startMode: 'scheduled', slotStartAt: createSelectableSlot(3), maxParticipants: 10, invitedFriendIds: [],
  });
  assert.throws(
    () => updateRunningMatchRoomReady(store2, users2['guest-user'], { roomId: joinFirst.room.roomId, ready: true }),
    { statusCode: 400, message: '예약 파티런을 수락하려면 앱을 최신 버전으로 업데이트해 주세요.' },
  );
});

// 그룹 예약은 최소 인원(3)이 수락하는 순간 확정되지만 아직 답하지 않은 초대 친구가 남는다 —
// 출발 1분 전까지는 방과 세션 양쪽에 합류한다(적대 검증 2026-09-10).
test('late joiners after a group reservation is linked join both room and session; the host is told', () => {
  const { store, users } = createStore();
  const created = createRunningMatchRoom(store, users['host-user'], {
    mode: 'group', distanceKm: 5, startMode: 'scheduled', slotStartAt: createSelectableSlot(), maxParticipants: 10,
    invitedFriendIds: ['guest-user', 'third-user', 'fourth-user'],
  });
  joinRunningMatchRoom(store, users['guest-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });
  const third = joinRunningMatchRoom(store, users['third-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });
  assert.equal(typeof third.room.linkedMatchId, 'string');

  const fourth = joinRunningMatchRoom(store, users['fourth-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });
  assert.equal(fourth.room.linkedMatchId, third.room.linkedMatchId, '세션은 그대로');
  assert.equal(fourth.room.participants.length, 4);
  const session = findMatchSessionById(store, third.room.linkedMatchId);
  assert.deepEqual(session.participants.map((p) => p.userId), ['host-user', 'guest-user', 'third-user', 'fourth-user']);
  assert.equal(session.participants[3].seedRank, 4);
  const joinedNotice = notificationsFor(store, 'host-user', 'match_reserved').at(-1);
  assert.match(joinedNotice.body, /^네번째 러너님이 합류했어요/);

  // 늦은 합류자의 '나가기'는 세션 인원이 최소 인원 위면 예약을 유지하고 남은 사람에게 알린다.
  leaveRunningMatchRoom(store, users['fourth-user'], { roomId: created.room.roomId });
  assert.equal(findMatchSessionById(store, third.room.linkedMatchId).participants.length, 3);
  assert.match(notificationsFor(store, 'host-user', 'match_reserved').at(-1).body, /^네번째 러너님이 예약에서 빠졌어요/);
});

// 예정 매치 카드의 취소와 대결 화면 '나가기'(leaveRunningMatch)는 대기실 '나가기'와 같은 규칙:
// 게스트는 자기만 빠지고(방은 남는다), 방장은 예약 전체를 걷는다. 기권으로 박지 않는다.
test('guest cancel/leave on a pending party reservation releases the guest instead of forfeiting or tearing the room down', () => {
  const { store, users } = createStore();
  const created = createRunningMatchRoom(store, users['host-user'], {
    mode: 'duel', distanceKm: 5, startMode: 'scheduled', slotStartAt: createSelectableSlot(), invitedFriendIds: ['guest-user'],
  });
  const joined = joinRunningMatchRoom(store, users['guest-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });
  const matchId = joined.room.linkedMatchId;

  const result = leaveRunningMatch(store, users['guest-user'], { matchId });
  assert.equal(result.success, true);
  assert.equal(findMatchSessionById(store, matchId), null, '기권이 아니라 세션 회수');
  assert.equal(isMatchTombstoned(matchId), true);
  const room = rawRoom(store, created.room.roomId);
  assert.equal(room.linkedMatchId, null, '방은 남고 예약 전으로');
  assert.deepEqual(room.participants.map((p) => p.userId), ['host-user']);
  assert.match(notificationsFor(store, 'host-user', 'match_room_closed').at(-1).body, /참가 러너님이 .+ 파티런 예약을 취소했어요/);

  // 방장의 withdraw는 예약 전체 취소 + 방 삭제.
  const rejoined = joinRunningMatchRoom(store, users['guest-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });
  withdrawFromReservedPartySession(store, findMatchSessionById(store, rejoined.room.linkedMatchId), users['host-user']);
  assert.equal(rawRoom(store, created.room.roomId), undefined);
  assert.equal(store.matchSessions.length, 0);
});

// createMatchSession은 참가자의 같은 모드 세션을 지운다 — 다른 매치를 안은 사람이 있으면 예약을
// 성립시키지 않는다(레이스 편성 세션이 통째로 사라지던 blocker, 적대 검증 2026-09-10).
test('a participant holding another live match blocks acceptance and linking', () => {
  const { store, users } = createStore();
  const created = createRunningMatchRoom(store, users['host-user'], {
    mode: 'group', distanceKm: 5, startMode: 'host', maxParticipants: 10, invitedFriendIds: ['guest-user', 'third-user'],
  });
  joinRunningMatchRoom(store, users['guest-user'], { inviteToken: created.room.inviteToken });
  joinRunningMatchRoom(store, users['third-user'], { inviteToken: created.room.inviteToken });
  updateRunningMatchRoom(store, users['host-user'], {
    roomId: created.room.roomId, distanceKm: 5, startMode: 'scheduled', slotStartAt: createSelectableSlot(4), maxParticipants: 10, invitedFriendIds: ['guest-user', 'third-user'],
  });
  updateRunningMatchRoomReady(store, users['guest-user'], { roomId: created.room.roomId, ready: true, acceptSlot: true });

  // 그 사이 세번째가 다른 그룹 세션(레이스 편성 등)에 들어갔다.
  const otherSlot = createSelectableSlot(6);
  store.matchSessions.push({
    id: 'race-formed', mode: 'group', isTestMatch: false, isPartyRun: false, distanceKm: 5, slotStartAt: otherSlot,
    createdAt: iso(), matchedAt: iso(),
    participants: ['third-user', 'fourth-user'].map((userId, index) => ({
      userId, seedRank: index + 1, acceptedAt: null, liveStatus: 'ready', liveDistanceKm: 0, liveElapsedSeconds: 0, livePace: '--:--/km', liveUpdatedAt: null, finishedAt: null,
    })),
  });

  assert.throws(
    () => updateRunningMatchRoomReady(store, users['third-user'], { roomId: created.room.roomId, ready: true, acceptSlot: true }),
    { statusCode: 400, message: /이미 예약된 매치가 있어/ },
  );
  // 억지로 수락 상태를 만들어도 sync는 링크하지 않는다 — 남의 세션을 지우지 않는다.
  rawRoom(store, created.room.roomId).participants.find((p) => p.userId === 'third-user').isReady = true;
  const synced = updateRunningMatchRoomReady(store, users['guest-user'], { roomId: created.room.roomId, ready: true, acceptSlot: true });
  assert.equal(synced.room.linkedMatchId, undefined);
  assert.equal(store.matchSessions.some((session) => session.id === 'race-formed'), true);
});

// '매칭 상태 강제 초기화'가 출발 전 파티런 예약을 만나면 기권이 아니라 예약 되돌리기다 — 예전 경로는
// 방장을 게스트에게 넘기고 나를 forfeited로 찍어 친구에게 이틀 이른 '진행 중' 유령 매치를 남겼다.
test('force reset withdraws a pending party reservation by role instead of forfeiting into a zombie match', () => {
  const { store, users } = createStore();
  const created = createRunningMatchRoom(store, users['host-user'], {
    mode: 'duel', distanceKm: 5, startMode: 'scheduled', slotStartAt: createSelectableSlot(), invitedFriendIds: ['guest-user'],
  });
  const joined = joinRunningMatchRoom(store, users['guest-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });
  const matchId = joined.room.linkedMatchId;

  // 게스트의 초기화: 나만 빠지고 방은 방장 몫으로 남는다 (1대1이라 예약 자체는 풀린다).
  const guestReset = forceResetRunningMatchStateForUser(store, users['guest-user']);
  assert.ok(guestReset.cleanedItems.includes(`matchSessions.reservationCancelled:${matchId}`));
  assert.equal(findMatchSessionById(store, matchId), null);
  const room = rawRoom(store, created.room.roomId);
  assert.equal(room.hostUserId, 'host-user');
  assert.equal(room.linkedMatchId, null);
  assert.deepEqual(room.participants.map((p) => p.userId), ['host-user']);
  assert.equal(store.matchSessions.some((session) => session.participants.some((p) => p.liveStatus === 'forfeited')), false);

  // 방장의 초기화: 예약 전체 취소 + 방 삭제 + 게스트 알림.
  const rejoined = joinRunningMatchRoom(store, users['guest-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });
  const hostReset = forceResetRunningMatchStateForUser(store, users['host-user']);
  assert.ok(hostReset.cleanedItems.includes(`matchSessions.reservationCancelled:${rejoined.room.linkedMatchId}`));
  assert.equal(rawRoom(store, created.room.roomId), undefined);
  assert.equal(store.matchSessions.length, 0);
  assert.match(notificationsFor(store, 'guest-user', 'match_room_closed').at(-1).body, /방장 러너님이 .+ 파티런 예약을 취소했어요/);
});

// 시간이 바뀌어 수락이 풀린 게스트는 알림으로 안다 — 수락한 적 없는 게스트에겐 보내지 않는다.
test('a host slot change tells the guests whose acceptance it voided, and only them', () => {
  const { store, users } = createStore();
  // 시간이 정해지기 전에 들어와 있던 게스트 둘 — 한 명만 대기실에서 수락한 상태.
  const created = createRunningMatchRoom(store, users['host-user'], {
    mode: 'group', distanceKm: 5, startMode: 'host', maxParticipants: 10,
    invitedFriendIds: ['guest-user', 'third-user'],
  });
  const roomId = created.room.roomId;
  joinRunningMatchRoom(store, users['guest-user'], { inviteToken: created.room.inviteToken });
  joinRunningMatchRoom(store, users['third-user'], { inviteToken: created.room.inviteToken });
  updateRunningMatchRoom(store, users['host-user'], {
    roomId, distanceKm: 5, startMode: 'scheduled', slotStartAt: createSelectableSlot(2), maxParticipants: 10, invitedFriendIds: ['guest-user', 'third-user'],
  });
  updateRunningMatchRoomReady(store, users['guest-user'], { roomId, ready: true, acceptSlot: true });
  assert.equal(rawRoom(store, roomId).linkedMatchId ?? null, null, '세번째가 아직 수락 전이라 링크 없음');
  const before = notificationsFor(store, 'guest-user', 'match_reserved').length;

  updateRunningMatchRoom(store, users['host-user'], {
    roomId, distanceKm: 5, startMode: 'scheduled', slotStartAt: createSelectableSlot(5), maxParticipants: 10, invitedFriendIds: ['guest-user', 'third-user'],
  });

  const guestNotices = notificationsFor(store, 'guest-user', 'match_reserved');
  assert.equal(guestNotices.length, before + 1);
  assert.equal(guestNotices.at(-1).title, '파티런 시작 시간이 바뀌었어요');
  assert.match(guestNotices.at(-1).body, /^방장 러너님이 예약 시간을 바꿨어요 · .+ 시작 · 대기방에서 다시 수락해 주세요$/);
  assert.equal(guestNotices.at(-1).data.roomId, roomId);
  assert.equal(notificationsFor(store, 'third-user', 'match_reserved').length, 0, '수락 전이던 게스트에겐 안 간다');

  // 거리만 바꾸는 저장은 알림이 없다.
  updateRunningMatchRoom(store, users['host-user'], {
    roomId, distanceKm: 3, startMode: 'scheduled', slotStartAt: rawRoom(store, roomId).slotStartAt, maxParticipants: 10, invitedFriendIds: ['guest-user', 'third-user'],
  });
  assert.equal(notificationsFor(store, 'guest-user', 'match_reserved').length, before + 1);
});

// 예약 준비 중인(아직 링크 안 된) 방도 클라의 자동 회수가 조용히 나가면 안 된다 — 방장이 혼자
// 있는 방이면 그 이탈이 곧 방 삭제라 예약 준비가 통째로 사라진다 (적대 검증 2026-09-10).
test('an unlinked scheduled room is flagged in the blocker so the client never auto-leaves it', () => {
  const { store, users } = createStore();
  createRunningMatchRoom(store, users['host-user'], {
    mode: 'duel', distanceKm: 5, startMode: 'scheduled', slotStartAt: createSelectableSlot(), invitedFriendIds: ['guest-user'],
  });

  const blocker = buildRunningMatchRequestBlocker(store, users['host-user']);
  assert.equal(blocker?.legacyBlocker, 'activeRoom');
  assert.equal(blocker?.details.isPartyRun, true);
  assert.equal(blocker?.details.startMode, 'scheduled');

  // 방장 시작 방은 예전 그대로 — 자동 회수가 계속 동작해야 한다.
  const { store: hostStore, users: hostUsers } = createStore();
  createRunningMatchRoom(hostStore, hostUsers['host-user'], { mode: 'duel', distanceKm: 5, startMode: 'host' });
  const hostBlocker = buildRunningMatchRequestBlocker(hostStore, hostUsers['host-user']);
  assert.equal(hostBlocker?.legacyBlocker, 'activeRoom');
  assert.equal(hostBlocker?.details.isPartyRun, undefined);
});

// 예약이 살아남는 이탈(그룹, 최소 인원 유지)에서도 내구 로스터는 함께 줄어야 한다 — 안 줄이면
// 세션이 사라진 뒤 그룹 판정이 '아직 안 낸 사람'을 영원히 기다린다 (적대 검증 2026-09-10).
// 그리고 그 뒤 늦게 합류한 사람은 이미 쓰인 자리(seedRank)를 다시 받으면 안 된다.
test('a surviving group reservation shrinks its durable roster, and a later joiner gets a fresh seedRank', () => {
  const { store, users } = createStore();
  const created = createRunningMatchRoom(store, users['host-user'], {
    mode: 'group', distanceKm: 5, startMode: 'scheduled', slotStartAt: createSelectableSlot(), maxParticipants: 10,
    invitedFriendIds: ['guest-user', 'third-user', 'fourth-user'],
  });
  joinRunningMatchRoom(store, users['guest-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });
  const linked = joinRunningMatchRoom(store, users['third-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });
  const matchId = linked.room.linkedMatchId;
  joinRunningMatchRoom(store, users['fourth-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });
  assert.deepEqual(findMatchRoster(store, matchId).participantIds, ['host-user', 'guest-user', 'third-user', 'fourth-user']);

  // 가운데 사람이 빠진다 — 예전 코드는 인원수로 자리를 발급해 다음 합류자가 4번을 다시 받았다.
  leaveRunningMatchRoom(store, users['guest-user'], { roomId: created.room.roomId });
  assert.equal(findMatchSessionById(store, matchId).participants.length, 3, '예약은 유지');
  assert.deepEqual(findMatchRoster(store, matchId).participantIds, ['host-user', 'third-user', 'fourth-user'], '로스터도 줄어든다');

  const rejoined = joinRunningMatchRoom(store, users['guest-user'], { inviteToken: created.room.inviteToken, acceptSlot: true });
  assert.equal(rejoined.room.linkedMatchId, matchId);
  const seedRanks = findMatchSessionById(store, matchId).participants.map((participant) => participant.seedRank);
  assert.equal(new Set(seedRanks).size, seedRanks.length, '중복 자리 없음');
  assert.equal(Math.max(...seedRanks), 5);
  assert.deepEqual(findMatchRoster(store, matchId).participantIds, ['host-user', 'third-user', 'fourth-user', 'guest-user']);
});
