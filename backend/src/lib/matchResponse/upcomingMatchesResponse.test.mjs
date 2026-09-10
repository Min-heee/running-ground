// 예정 매치 카드(GET /api/running/matches/upcoming)의 파티런 예약 항목 (C3, 2026-09-09):
// roomId·isPartyRun이 실리고, 상대 라벨은 상대 이름(1대1)/"N명 그룹"(그룹), 요약에 파티런이
// 드러나며, 취소는 출발 직전(cancelableUntilAt = slotStartAt)까지 가능하다. 공식 예약은 그대로
// 1시간 컷오프다.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSeedStore } from '../../seed.mjs';
import { MATCH_CANCELLATION_CUTOFF_MS } from '../matchConstants.mjs';
import { buildUpcomingRunningMatchesResponse } from './upcomingMatchesResponse.mjs';

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

function createParticipant(userId, seedRank) {
  return {
    userId,
    seedRank,
    acceptedAt: null,
    liveStatus: 'ready',
    liveDistanceKm: 0,
    liveElapsedSeconds: 0,
    livePace: '--:--/km',
    liveUpdatedAt: null,
    finishedAt: null,
  };
}

function createSession({ id, mode = 'duel', isPartyRun, isScheduledPartyRun = isPartyRun, slotStartAt, participantIds }) {
  return {
    id,
    mode,
    isTestMatch: false,
    isPartyRun,
    // 카드 라벨·취소 규칙은 '예약' 파티런에만 적용된다 (방장 시작 파티런은 isPartyRun만 참).
    ...(isScheduledPartyRun ? { isScheduledPartyRun: true } : {}),
    distanceKm: 5,
    slotStartAt,
    createdAt: iso(-60_000),
    matchedAt: iso(-60_000),
    participants: participantIds.map((userId, index) => createParticipant(userId, index + 1)),
  };
}

function createLinkedRoom({ id, mode = 'duel', matchId, slotStartAt, participantIds }) {
  return {
    id,
    inviteToken: id.toUpperCase().slice(0, 6),
    hostUserId: participantIds[0],
    mode,
    startMode: 'scheduled',
    distanceKm: 5,
    slotStartAt,
    maxParticipants: mode === 'duel' ? 2 : 10,
    minParticipants: mode === 'duel' ? 2 : 3,
    invitedFriendIds: [],
    participants: participantIds.map((userId, index) => ({
      userId,
      isHost: index === 0,
      isReady: false,
      isCountdownReady: false,
      invited: index > 0,
      joinedAt: iso(-60_000),
    })),
    createdAt: iso(-120_000),
    linkedMatchId: matchId,
  };
}

function createStore() {
  const store = createSeedStore();
  store.users.push(
    createRunner('host-user', '방장 러너'),
    createRunner('guest-user', '참가 러너'),
    createRunner('third-user', '세번째 러너'),
  );
  return store;
}

test('party duel item: roomId + isPartyRun, the opponent\'s name, a 파티런 summary, cancellable right up to the slot', () => {
  const store = createStore();
  // 공식 예약이라면 이미 취소 마감(1시간 전)이 지난 시각 — 파티런은 여전히 취소 가능해야 한다.
  const slotStartAt = iso(30 * 60 * 1000);
  store.matchSessions.push(createSession({ id: 'party-duel', isPartyRun: true, slotStartAt, participantIds: ['host-user', 'guest-user'] }));
  store.matchRooms.push(createLinkedRoom({ id: 'party-room', matchId: 'party-duel', slotStartAt, participantIds: ['host-user', 'guest-user'] }));

  const host = store.users.find((user) => user.id === 'host-user');
  const { items } = buildUpcomingRunningMatchesResponse(store, host);

  assert.equal(items.length, 1);
  const [item] = items;
  assert.equal(item.matchId, 'party-duel');
  assert.equal(item.roomId, 'party-room');
  assert.equal(item.isPartyRun, true);
  assert.equal(item.mode, 'duel');
  assert.equal(item.status, 'matched');
  assert.equal(item.participantCount, 2);
  assert.equal(item.counterpartLabel, '참가 러너');
  assert.match(item.summary, /^파티런 · .+ · 5\.0km$/);
  assert.equal(item.cancelableUntilAt, slotStartAt);
  assert.equal(item.canCancel, true);

  // 상대 쪽에서 보면 상대 라벨은 방장 이름이다.
  const guest = store.users.find((user) => user.id === 'guest-user');
  assert.equal(buildUpcomingRunningMatchesResponse(store, guest).items[0].counterpartLabel, '방장 러너');
});

test('official duel item is unchanged: no isPartyRun, plain summary, the 1h cancel cutoff', () => {
  const store = createStore();
  const slotStartAt = iso(30 * 60 * 1000);
  store.matchSessions.push(createSession({ id: 'official-duel', isPartyRun: false, slotStartAt, participantIds: ['host-user', 'guest-user'] }));

  const host = store.users.find((user) => user.id === 'host-user');
  const [item] = buildUpcomingRunningMatchesResponse(store, host).items;

  assert.equal(item.roomId, undefined);
  assert.equal(item.isPartyRun, undefined);
  assert.equal(item.counterpartLabel, '참가 러너');
  assert.doesNotMatch(item.summary, /파티런/);
  assert.equal(item.cancelableUntilAt, new Date(Date.parse(slotStartAt) - MATCH_CANCELLATION_CUTOFF_MS).toISOString());
  assert.equal(item.canCancel, false, '출발 30분 전 — 공식 예약은 이미 취소 마감');
});

test('party group item: "N명 그룹" (파티런 is said once, by the summary), roomId, cancellable until the slot', () => {
  const store = createStore();
  const slotStartAt = iso(2 * 60 * 60 * 1000);
  const participantIds = ['host-user', 'guest-user', 'third-user'];
  store.matchSessions.push(createSession({ id: 'party-group', mode: 'group', isPartyRun: true, slotStartAt, participantIds }));
  store.matchRooms.push(createLinkedRoom({ id: 'party-group-room', mode: 'group', matchId: 'party-group', slotStartAt, participantIds }));

  const host = store.users.find((user) => user.id === 'host-user');
  const [item] = buildUpcomingRunningMatchesResponse(store, host).items;

  assert.equal(item.mode, 'group');
  assert.equal(item.roomId, 'party-group-room');
  assert.equal(item.isPartyRun, true);
  assert.equal(item.isRoomHost, true, '방장 시점 — 취소 확인 문구가 역할을 구분한다');
  assert.equal(item.participantCount, 3);
  assert.equal(item.counterpartLabel, '3명 그룹');
  assert.match(item.summary, /^파티런 · /);
  assert.equal(item.cancelableUntilAt, slotStartAt);
  assert.equal(item.canCancel, true);
});

// 방장 시작 파티런은 예약이 아니다 — 카드도 공식 매치와 같은 모양이어야 한다.
test('a host-start party run keeps the official card shape (no 파티런 prefix, 1-hour cutoff)', () => {
  const store = createStore();
  const slotStartAt = iso(2 * 60 * 60 * 1000);
  const participantIds = ['host-user', 'guest-user'];
  store.matchSessions.push(createSession({ id: 'host-start-party', isPartyRun: true, isScheduledPartyRun: false, slotStartAt, participantIds }));
  store.matchRooms.push(createLinkedRoom({ id: 'host-start-room', matchId: 'host-start-party', slotStartAt, participantIds }));

  const host = store.users.find((user) => user.id === 'host-user');
  const [item] = buildUpcomingRunningMatchesResponse(store, host).items;

  assert.equal(item.isPartyRun, undefined);
  assert.equal(item.isRoomHost, undefined);
  assert.doesNotMatch(item.summary, /파티런/);
  assert.equal(item.cancelableUntilAt, new Date(Date.parse(slotStartAt) - MATCH_CANCELLATION_CUTOFF_MS).toISOString());
});

test('official group item keeps "N명 그룹"', () => {
  const store = createStore();
  const slotStartAt = iso(2 * 60 * 60 * 1000);
  store.matchSessions.push(createSession({ id: 'official-group', mode: 'group', isPartyRun: false, slotStartAt, participantIds: ['host-user', 'guest-user', 'third-user'] }));

  const host = store.users.find((user) => user.id === 'host-user');
  const [item] = buildUpcomingRunningMatchesResponse(store, host).items;

  assert.equal(item.counterpartLabel, '3명 그룹');
  assert.equal(item.isPartyRun, undefined);
  assert.equal(item.canCancel, true);
  assert.equal(item.cancelableUntilAt, new Date(Date.parse(slotStartAt) - MATCH_CANCELLATION_CUTOFF_MS).toISOString());
});
