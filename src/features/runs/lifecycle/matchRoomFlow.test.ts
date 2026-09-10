import assert from 'node:assert/strict';
import test from 'node:test';
import type { FriendRank } from '@/domain';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  areAllMatchRoomGuestsReady,
  buildMatchRoomInviteAcceptanceState,
  buildMatchRoomInviteUxState,
  buildMatchRoomParticipantUxRows,
  buildMatchRoomReadyActionState,
  buildMatchRoomReservationState,
  buildMatchRoomStayNotice,
  buildMatchRoomHostStartActionState,
  buildMatchRoomUxModel,
  buildPendingMatchRoomInvitees,
  canHostStartMatchRoom,
  isMatchRoomReservedForFuture,
  isMatchRoomScheduledSlotPassed,
  resolveReservedMatchRoomLeavePrompt,
} from './matchRoomFlow';

function room(overrides: Partial<RunningMatchRoom> = {}): RunningMatchRoom {
  return {
    roomId: 'room-1',
    inviteToken: 'ROOM1',
    inviteLink: 'runningground://room',
    mode: 'duel',
    state: 'waiting',
    startMode: 'host',
    distanceKm: 5,
    slotStartAt: '2026-05-12T00:00:00.000Z',
    slotLabel: '방장 시작',
    maxParticipants: 2,
    minParticipants: 2,
    canStart: false,
    isHost: true,
    hostUserId: 'host',
    hostName: '방장',
    participants: [
      {
        userId: 'host',
        name: '방장',
        tag: 'host',
        districtName: '고양시',
        averagePace: '06:20/km',
        levelLabel: 'Lv.1',
        isHost: true,
        isReady: false,
        isCountdownReady: false,
        invited: false,
        joinedAt: '2026-05-12T00:00:00.000Z',
      },
      {
        userId: 'guest',
        name: '참가자',
        tag: 'guest',
        districtName: '고양시',
        averagePace: '06:20/km',
        levelLabel: 'Lv.1',
        isHost: false,
        isReady: false,
        isCountdownReady: false,
        invited: true,
        joinedAt: '2026-05-12T00:00:00.000Z',
      },
    ],
    invitedFriendIds: [],
    ...overrides,
  };
}

test('host can start only after every guest is ready', () => {
  const waitingRoom = room();
  assert.equal(areAllMatchRoomGuestsReady(waitingRoom), false);
  assert.equal(canHostStartMatchRoom(waitingRoom), false);

  const readyRoom = room({
    canStart: true,
    participants: room().participants.map((participant) => (
      participant.isHost ? participant : { ...participant, isReady: true }
    )),
  });

  assert.equal(areAllMatchRoomGuestsReady(readyRoom), true);
  assert.equal(canHostStartMatchRoom(readyRoom), true);
  assert.equal(canHostStartMatchRoom({ ...readyRoom, canStart: false }), false);
});

test('invite acceptance state only shows accept and decline before the invited runner joins', () => {
  const invitedRoom = room({
    joined: false,
    participants: room().participants.filter((participant) => participant.userId !== 'guest'),
  });

  assert.deepEqual(buildMatchRoomInviteAcceptanceState(invitedRoom, 'guest'), {
    isInvitedOnly: true,
    isAlreadyJoined: false,
    canAccept: true,
    canDecline: true,
  });

  assert.deepEqual(buildMatchRoomInviteAcceptanceState(room({ joined: true }), 'guest'), {
    isInvitedOnly: false,
    isAlreadyJoined: true,
    canAccept: false,
    canDecline: false,
  });

  assert.equal(buildMatchRoomInviteUxState(invitedRoom, 'guest').state, 'pending');
  assert.equal(buildMatchRoomInviteUxState(room({ joined: true }), 'guest').state, 'joined');
});

test('pending invitees exclude joined runners and preserve server invite status', () => {
  const friends: FriendRank[] = [
    { id: 'pending-friend', rank: 1, name: '초대친구', tag: 'F1', distanceKm: 0, points: 0, liveLocationLabel: '일산서구' },
    { id: 'guest', rank: 2, name: '이미참가', tag: 'G1', distanceKm: 0, points: 0 },
  ];
  const invitees = buildPendingMatchRoomInvitees(
    room({
      invitedFriendIds: ['pending-friend', 'guest'],
      invitedFriends: [{
        userId: 'server-pending',
        name: '서버친구',
        districtName: '고양시',
        averagePace: '06:20/km',
        levelLabel: 'Lv.1',
        status: 'pending',
      }],
    }),
    friends,
  );

  assert.deepEqual(invitees.map((invitee) => invitee.userId), ['server-pending', 'pending-friend']);
  assert.equal(invitees[1].name, '초대친구');
  assert.equal(invitees[1].status, 'pending');
});

test('participant UX rows separate host, ready guests, and pending invitees', () => {
  const readyRoom = room({
    participants: room().participants.map((participant) => (
      participant.isHost ? participant : { ...participant, isReady: true }
    )),
  });
  const rows = buildMatchRoomParticipantUxRows(readyRoom, [{
    userId: 'pending-friend',
    name: '초대친구',
    districtName: '고양시',
    averagePace: '06:20/km',
    levelLabel: 'Lv.1',
    status: 'pending',
  }]);

  assert.deepEqual(rows.map((row) => row.status), ['host', 'ready', 'invite-pending']);
  assert.deepEqual(rows.map((row) => row.statusLabel), ['시작 권한', '준비 완료', '수락 대기중']);
  assert.equal(rows[2].badgeLabel, '초대됨');
});

test('participant UX rows show countdown loading readiness after linked match opens', () => {
  const rows = buildMatchRoomParticipantUxRows(room({
    linkedMatchId: 'match-1',
    state: 'arming',
    participants: room().participants.map((participant) => (
      participant.isHost
        ? { ...participant, isCountdownReady: true }
        : { ...participant, isCountdownReady: false }
    )),
  }));

  assert.deepEqual(rows.map((row) => row.status), ['countdown-ready', 'countdown-loading']);
  assert.deepEqual(rows.map((row) => row.statusLabel), ['로딩 완료', '로딩 중']);
});

test('ready action is explicit for guest ready, not-ready, and locked states', () => {
  const guestRoom = room({ isHost: false });
  const guest = guestRoom.participants.find((participant) => participant.userId === 'guest');

  assert.deepEqual(buildMatchRoomReadyActionState(guestRoom, guest), {
    state: 'not-ready',
    visible: true,
    label: '준비',
    canToggle: true,
    helperText: '',
  });

  assert.equal(
    buildMatchRoomReadyActionState(guestRoom, guest ? { ...guest, isReady: true } : null).state,
    'ready',
  );
  assert.equal(buildMatchRoomReadyActionState({ ...guestRoom, linkedMatchId: 'match-1' }, guest).state, 'locked');
  assert.equal(buildMatchRoomReadyActionState(room(), room().participants[0]).state, 'hidden');
});

test('host start action explains each room start blocker', () => {
  const readyParticipants = room().participants.map((participant) => (
    participant.isHost ? participant : { ...participant, isReady: true }
  ));

  assert.equal(buildMatchRoomHostStartActionState(room({
    participants: [room().participants[0]],
  })).state, 'needs-participants');
  assert.equal(buildMatchRoomHostStartActionState(room()).state, 'needs-ready');
  assert.equal(buildMatchRoomHostStartActionState(room({
    canStart: true,
    participants: readyParticipants,
  })).state, 'can-start');
  assert.equal(buildMatchRoomHostStartActionState(room({
    startMode: 'scheduled',
    participants: readyParticipants,
  })).state, 'scheduled');
  assert.equal(buildMatchRoomHostStartActionState(room({
    state: 'arming',
    linkedMatchId: 'match-1',
    participants: readyParticipants,
  })).state, 'arming');
});

test('room UX model collects invite, participant, ready, and start states together', () => {
  const model = buildMatchRoomUxModel({
    room: room({
      canStart: true,
      participants: room().participants.map((participant) => (
        participant.isHost ? participant : { ...participant, isReady: true }
      )),
    }),
    currentUserId: 'host',
    pendingInvitees: [],
  });

  assert.equal(model.invite.state, 'joined');
  assert.deepEqual(model.participants.map((participant) => participant.status), ['host', 'ready']);
  assert.equal(model.readyAction.state, 'hidden');
  assert.equal(model.startAction.state, 'can-start');
  assert.equal(model.startAction.canStart, true);
});

// 파티런 예약 (오너 2026-09-09): 예약 방은 친구가 수락하는 순간 세션이 묶인다. 슬롯이 아직
// 카운트다운 창(30초) 밖이면 '예약 완료' 화면, 창 안으로 들어오면 기존 페이즈 기계가 맡는다.
test('a scheduled room with a linked future session is reserved until the countdown window', () => {
  const slotStartAt = '2026-05-12T02:00:00.000Z';
  const reservedRoom = room({
    startMode: 'scheduled',
    slotStartAt,
    linkedMatchId: 'match-1',
    linkedMatchStatus: 'matched',
    linkedMatchSlotStartAt: slotStartAt,
  });
  const twoHoursBefore = Date.parse(slotStartAt) - 2 * 3600 * 1000;
  const twentySecondsBefore = Date.parse(slotStartAt) - 20 * 1000;

  assert.equal(isMatchRoomReservedForFuture(reservedRoom, twoHoursBefore), true);
  assert.equal(isMatchRoomReservedForFuture(reservedRoom, twentySecondsBefore), false);
  assert.equal(isMatchRoomReservedForFuture(reservedRoom, Date.parse(slotStartAt) + 1000), false);
  // 세션이 안 묶였거나 방장 시작 방이면 예약이 아니다.
  assert.equal(isMatchRoomReservedForFuture({ ...reservedRoom, linkedMatchId: undefined }, twoHoursBefore), false);
  assert.equal(isMatchRoomReservedForFuture({ ...reservedRoom, startMode: 'host' }, twoHoursBefore), false);
  assert.equal(isMatchRoomReservedForFuture(null, twoHoursBefore), false);
});

test('reserved copy reads 예약 완료 · <slot> 시작 and the countdown helper follows the 30s countdown window', () => {
  const slotStartAt = new Date(2026, 5, 24, 11, 0, 0).toISOString(); // 6.24 (수) 11:00 local
  const reservation = buildMatchRoomReservationState(room({
    slotStartAt,
    linkedMatchSlotStartAt: slotStartAt,
  }), true);

  assert.equal(reservation.isReserved, true);
  assert.equal(reservation.slotLabel, '6.24 (수) 11:00');
  assert.equal(reservation.title, '예약 완료 · 6.24 (수) 11:00 시작');
  assert.equal(reservation.helperText, '시작 30초 전에 자동으로 카운트다운이 시작돼요.');
  assert.equal(reservation.leaveLabel, '예약 취소', '방장의 나가기 버튼은 예약 취소');

  const notReserved = buildMatchRoomReservationState(room({ slotStartAt, linkedMatchSlotStartAt: slotStartAt }), false);
  assert.equal(notReserved.isReserved, false);
  assert.equal(notReserved.title, null);
  assert.equal(notReserved.leaveLabel, null);
});

// 예약 방의 나가기는 예약 취소(또는 이탈)다 — 라벨과 확인 문구가 결과를 말한다 (2026-09-10).
test('reserved-room leave prompts and labels by role: host cancels, duel guest cancels, group guest above minimum just leaves', () => {
  const slotStartAt = new Date(2026, 5, 24, 11, 0, 0).toISOString();
  const base = { startMode: 'scheduled' as const, slotStartAt, linkedMatchId: 'match-1', linkedMatchSlotStartAt: slotStartAt };

  const host = resolveReservedMatchRoomLeavePrompt(room(base), true);
  assert.equal(host?.title, '파티런 예약을 취소할까요?');
  assert.match(host?.message ?? '', /^6\.24 \(수\) 11:00 예약이 취소되고 상대에게 취소 알림이 가요/);
  assert.equal(host?.confirmLabel, '예약 취소');

  const duelGuest = resolveReservedMatchRoomLeavePrompt(room({ ...base, isHost: false }), true);
  assert.equal(duelGuest?.title, '예약을 취소하고 나갈까요?');
  assert.match(duelGuest?.message ?? '', /방장에게 알림이 가요/);
  assert.equal(duelGuest?.confirmLabel, '예약 취소');

  const groupRoom = room({ ...base, mode: 'group', isHost: false, minParticipants: 3, maxParticipants: 10 });
  const fourPeople = { ...groupRoom, participants: [...groupRoom.participants, { ...groupRoom.participants[1], userId: 'g2', tag: 'g2' }, { ...groupRoom.participants[1], userId: 'g3', tag: 'g3' }] };
  const groupGuest = resolveReservedMatchRoomLeavePrompt(fourPeople, true);
  assert.equal(groupGuest?.title, '예약에서 빠질까요?');
  assert.equal(groupGuest?.confirmLabel, '예약에서 나가기');
  assert.equal(buildMatchRoomReservationState(fourPeople, true).leaveLabel, '예약에서 나가기');
  // 최소 인원(3)에서 한 명이 빠지면 예약 자체가 취소된다.
  const threePeople = { ...fourPeople, participants: fourPeople.participants.slice(0, 3) };
  assert.equal(resolveReservedMatchRoomLeavePrompt(threePeople, true)?.confirmLabel, '예약 취소');

  assert.equal(resolveReservedMatchRoomLeavePrompt(room(base), false), null, '예약이 아니면 기존 규칙');
});

test('a scheduled room whose saved slot passed hides 예약 수락 and tells the host to pick a new time', () => {
  const passedSlot = '2026-05-12T00:00:00.000Z';
  const scheduledRoom = room({ startMode: 'scheduled', slotStartAt: passedSlot });
  assert.equal(isMatchRoomScheduledSlotPassed(scheduledRoom, Date.parse(passedSlot) + 1000), true);
  assert.equal(isMatchRoomScheduledSlotPassed(scheduledRoom, Date.parse(passedSlot) - 1000), false);
  assert.equal(isMatchRoomScheduledSlotPassed({ ...scheduledRoom, linkedMatchId: 'm' }, Date.parse(passedSlot) + 1000), false, '링크된 방은 예약이지 지난 슬롯이 아니다');
  assert.equal(isMatchRoomScheduledSlotPassed(room(), Date.parse(passedSlot) + 1000), false, '방장 시작 방은 무관');

  const model = buildMatchRoomUxModel({ room: { ...scheduledRoom, isHost: false }, currentUserId: 'guest', scheduledSlotPassed: true });
  assert.equal(model.readyAction.visible, false);
  assert.equal(model.readyAction.helperText, '예약한 시간이 지났어요. 방장이 새 시간을 고르면 다시 수락할 수 있어요.');
  const hostModel = buildMatchRoomUxModel({ room: scheduledRoom, currentUserId: 'host', scheduledSlotPassed: true });
  assert.equal(hostModel.startAction.helperText, '예약한 시간이 지났어요. 시작 시간 카드에서 다른 시간을 골라 주세요.');
});

test('invite card copy for a scheduled room says accepting confirms the reservation', () => {
  const slotStartAt = new Date(2026, 5, 24, 11, 0, 0).toISOString();
  const invited = { ...room({ startMode: 'scheduled', slotStartAt, joined: false }), participants: [] };
  const scheduled = buildMatchRoomInviteUxState(invited, 'guest');
  assert.equal(scheduled.canAccept, true);
  assert.equal(scheduled.helperText, '수락하면 6.24 (수) 11:00 파티런 예약이 확정돼요. 거절하면 초대 카드가 사라져요.');
  const hostStart = buildMatchRoomInviteUxState({ ...invited, startMode: 'host' }, 'guest');
  assert.equal(hostStart.helperText, '수락하면 바로 대기실 참가자 명단에 들어가고, 거절하면 초대 카드가 사라져요.');
});

test('reserved rooms hide start/ready for host and guest alike and mark every participant 예약 확정', () => {
  const slotStartAt = '2026-05-12T02:00:00.000Z';
  const reservedRoom = room({
    startMode: 'scheduled',
    slotStartAt,
    linkedMatchId: 'match-1',
    linkedMatchStatus: 'matched',
    linkedMatchSlotStartAt: slotStartAt,
  });

  const hostAction = buildMatchRoomHostStartActionState(reservedRoom, true);
  assert.equal(hostAction.state, 'reserved');
  assert.equal(hostAction.visible, false);
  assert.equal(hostAction.helperText, null, '카운트다운 안내는 예약 배너 한 곳에만');

  const guestAction = buildMatchRoomHostStartActionState({ ...reservedRoom, isHost: false }, true);
  assert.equal(guestAction.state, 'reserved');
  assert.equal(guestAction.visible, false);

  const acceptedRoom = { ...reservedRoom, participants: reservedRoom.participants.map((participant) => ({ ...participant, isReady: true })) };
  const rows = buildMatchRoomParticipantUxRows(acceptedRoom, [], true);
  assert.deepEqual(rows.map((row) => row.status), ['reserved', 'reserved']);
  assert.deepEqual(rows.map((row) => row.statusLabel), ['예약 확정', '예약 확정']);
  // 확정 뒤에도 수락 전인 참가자(시간이 정해지기 전에 들어온 그룹 게스트)는 '수락 대기'로 남고 수락 버튼을 본다.
  assert.deepEqual(buildMatchRoomParticipantUxRows(reservedRoom, [], true).map((row) => row.statusLabel), ['예약 확정', '수락 대기']);
  const lateAccept = buildMatchRoomUxModel({ room: { ...reservedRoom, isHost: false }, currentUserId: 'guest', reserved: true });
  assert.equal(lateAccept.readyAction.visible, true);
  assert.equal(lateAccept.readyAction.label, '예약 수락');
  assert.equal(buildMatchRoomUxModel({ room: { ...acceptedRoom, isHost: false }, currentUserId: 'guest', reserved: true }).readyAction.visible, false);

  // 예약 판정을 넘기지 않으면(카운트다운 창 진입 후) 기존 로딩 상태로 돌아간다.
  assert.deepEqual(
    buildMatchRoomParticipantUxRows(reservedRoom, [], false).map((row) => row.status),
    ['countdown-loading', 'countdown-loading'],
  );

  const model = buildMatchRoomUxModel({ room: acceptedRoom, currentUserId: 'host', reserved: true });
  assert.equal(model.reservation.isReserved, true);
  assert.equal(model.startAction.state, 'reserved');
  assert.equal(model.readyAction.visible, false);
});

test('an unlinked scheduled room tells the host what is still missing: headcount first, then acceptance', () => {
  const hostOnly = room({ startMode: 'scheduled' });
  // 아직 방장 혼자 — 수락 얘기보다 인원이 먼저다 (적대 검증 2026-09-10).
  const alone = buildMatchRoomHostStartActionState({ ...hostOnly, participants: hostOnly.participants.slice(0, 1) });
  assert.equal(alone.state, 'scheduled');
  assert.equal(alone.visible, false);
  assert.equal(alone.helperText, '최소 2명이 모여야 예약이 확정돼요. 친구를 더 초대해 주세요.');
  const group = buildMatchRoomHostStartActionState(room({ startMode: 'scheduled', mode: 'group', minParticipants: 3 }));
  assert.equal(group.helperText, '최소 3명이 모여야 예약이 확정돼요. 친구를 더 초대해 주세요.');

  // 인원이 찼으면 수락 이야기로 넘어간다.
  const waitingForAccept = buildMatchRoomHostStartActionState(hostOnly);
  assert.equal(waitingForAccept.helperText, '참가자가 예약 시간을 모두 수락하면 예약이 확정돼요. 시작 30초 전에 자동으로 카운트다운이 시작돼요.');
  const allAccepted = buildMatchRoomHostStartActionState({
    ...hostOnly,
    participants: hostOnly.participants.map((participant) => ({ ...participant, isReady: true })),
  });
  assert.equal(allAccepted.helperText, '친구가 수락하면 예약이 확정돼요. 시작 30초 전에 자동으로 카운트다운이 시작돼요.');
});

// 시간이 정해지기 전에 들어와 있던 게스트: 예약 방의 '준비'는 시간 수락이다.
test('an unlinked scheduled room shows the guest 예약 수락 and reads accepted/pending on the rows', () => {
  const scheduledRoom = room({ startMode: 'scheduled', isHost: false });
  const notAccepted = buildMatchRoomReadyActionState(scheduledRoom, { isReady: false });
  assert.equal(notAccepted.visible, true);
  assert.equal(notAccepted.label, '예약 수락');
  assert.equal(notAccepted.helperText, '방장이 고른 시간에 달릴 수 있으면 예약 수락을 눌러 주세요. 모두 수락하면 예약이 확정돼요.');
  const accepted = buildMatchRoomReadyActionState(scheduledRoom, { isReady: true });
  assert.equal(accepted.label, '수락 취소');
  assert.equal(accepted.helperText, '예약 시간을 수락했어요. 모두 수락하면 예약이 확정돼요.');

  const rows = buildMatchRoomParticipantUxRows(scheduledRoom, [], false);
  assert.deepEqual(rows.map((row) => row.statusLabel), ['방장', '수락 대기']);
  const acceptedRows = buildMatchRoomParticipantUxRows({
    ...scheduledRoom,
    participants: scheduledRoom.participants.map((participant) => ({ ...participant, isReady: true })),
  }, [], false);
  assert.deepEqual(acceptedRows.map((row) => row.statusLabel), ['방장', '수락 완료']);

  // 방장 시작 방의 라벨은 그대로다.
  assert.deepEqual(buildMatchRoomParticipantUxRows(room(), [], false).map((row) => row.statusLabel), ['시작 권한', '대기 중']);
  assert.equal(buildMatchRoomReadyActionState(room({ isHost: false }), { isReady: false }).label, '준비');

  // 인원은 찼는데 수락이 빠진 예약 방: 방장에게 '수락'이 남았다고 말한다.
  const hostAction = buildMatchRoomHostStartActionState(room({ startMode: 'scheduled' }));
  assert.equal(hostAction.helperText, '참가자가 예약 시간을 모두 수락하면 예약이 확정돼요. 시작 30초 전에 자동으로 카운트다운이 시작돼요.');
});

test('stay notice differs between host-start and scheduled rooms', () => {
  assert.equal(
    buildMatchRoomStayNotice(room()),
    '방장이 시작하면 바로 카운트다운이 진행돼요 — 러닝스페이스 앱을 나가지 말고 기다려 주세요.',
  );
  assert.equal(
    buildMatchRoomStayNotice(room({ startMode: 'scheduled' })),
    '예약 시간이 되면 자동으로 카운트다운이 진행돼요 — 시작 전에 러닝스페이스 앱을 켜 두세요.',
  );
  assert.equal(buildMatchRoomUxModel({ room: null, currentUserId: 'host' }).stayNotice, buildMatchRoomStayNotice(null));
});
