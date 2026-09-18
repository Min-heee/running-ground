import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCrew,
  findActiveCrewMembership,
  getCrewJoinsLeftThisMonth,
  joinCrewByCode,
  listActiveCrewMembers,
  pruneCrewStore,
} from './crewMembership.mjs';
import {
  cancelCrewJoinRequest,
  decideCrewJoinRequest,
  listPendingCrewJoinRequests,
  requestToJoinCrew,
} from './crewRequests.mjs';
import { buildCrewDetailPayload, buildCrewHomePayload, buildCrewRequestsPayload } from './crewPayloads.mjs';
import { CREW_MAX_MEMBERS } from './crewConstants.mjs';

// 공개 크루 가입 신청 흐름 (오너 2026-09-18): 신청 → 캡틴 승인/거절, 한 사람 한 건,
// 7일 만료, 승인은 코드 가입과 같은 관문, 그사이 다른 크루에 들어갔으면 void.

const kst = (text) => new Date(`${text}+09:00`);
const iso = (text) => kst(text).toISOString();
const NOW = kst('2026-10-05T12:00:00');

function buildStore(userCount = 8) {
  return {
    users: Array.from({ length: userCount }, (_, index) => ({ id: `u${index + 1}`, name: `러너${index + 1}` })),
    runs: [],
    notifications: [],
  };
}

const userOf = (store, id) => store.users.find((user) => user.id === id);

function rejectsWithCode(fn, code) {
  assert.throws(fn, (error) => error?.details?.code === code);
}

function setup() {
  const store = buildStore();
  const crewA = createCrew(store, userOf(store, 'u1'), { name: '새벽' }, NOW);
  const crewB = createCrew(store, userOf(store, 'u2'), { name: '노을' }, NOW);
  return { store, crewA, crewB };
}

test('신청: 캡틴에게 crew_join_request 알림 · 한 사람 한 건(다른 크루도 request_pending) · 상세의 canRequest', () => {
  const { store, crewA, crewB } = setup();
  const runner = userOf(store, 'u3');

  const before = buildCrewDetailPayload(store, runner, crewA.id, NOW);
  assert.equal(before.canRequest, true);
  assert.equal(before.myRequestPending, false);

  const request = requestToJoinCrew(store, runner, crewA.id, NOW);
  assert.equal(request.status, 'pending');
  const notice = store.notifications.find((item) => item.type === 'crew_join_request');
  assert.equal(notice.userId, 'u1');
  assert.deepEqual(notice.data, { crewId: crewA.id, requestId: request.id });

  rejectsWithCode(() => requestToJoinCrew(store, runner, crewA.id, NOW), 'request_pending');
  rejectsWithCode(() => requestToJoinCrew(store, runner, crewB.id, NOW), 'request_pending');
  rejectsWithCode(() => requestToJoinCrew(store, userOf(store, 'u2'), crewA.id, NOW), 'already_in_crew');
  rejectsWithCode(() => requestToJoinCrew(store, runner, 'crew-missing', NOW), 'not_found');

  const after = buildCrewDetailPayload(store, runner, crewA.id, NOW);
  assert.equal(after.canRequest, false);
  assert.equal(after.myRequestPending, true);
  assert.equal(buildCrewDetailPayload(store, runner, crewB.id, NOW).myRequestPending, false);

  const home = buildCrewHomePayload(store, runner, NOW);
  assert.deepEqual(home.myPendingRequest, {
    requestId: request.id,
    crewId: crewA.id,
    crewName: '새벽',
    createdAt: NOW.toISOString(),
  });
  assert.equal(buildCrewHomePayload(store, userOf(store, 'u1'), NOW).myCrew.pendingRequestCount, 1);
});

test('신청 취소: 본인 대기 신청만 · 취소 뒤 다시 신청 가능', () => {
  const { store, crewA, crewB } = setup();
  const runner = userOf(store, 'u3');
  const request = requestToJoinCrew(store, runner, crewA.id, NOW);

  rejectsWithCode(() => cancelCrewJoinRequest(store, userOf(store, 'u4'), request.id, NOW), 'not_found');
  cancelCrewJoinRequest(store, runner, request.id, NOW);
  assert.equal(request.status, 'cancelled');
  assert.equal(request.decidedAt, NOW.toISOString());
  rejectsWithCode(() => cancelCrewJoinRequest(store, runner, request.id, NOW), 'not_found');

  requestToJoinCrew(store, runner, crewB.id, NOW);
});

test('재신청 대기: 같은 크루엔 취소 뒤 하루·거절 뒤 7일 — 신청·취소 반복이 캡틴 알림 폭탄이 되지 않는다', () => {
  const { store, crewA, crewB } = setup();
  const runner = userOf(store, 'u3');
  const captainNotices = () => store.notifications
    .filter((item) => item.type === 'crew_join_request' && item.userId === 'u1').length;

  const first = requestToJoinCrew(store, runner, crewA.id, NOW);
  cancelCrewJoinRequest(store, runner, first.id, NOW);

  // 같은 크루에 곧바로 다시: 막힌다(상세의 신청 버튼도 없다). 캡틴 알림은 처음 1통뿐.
  const soon = kst('2026-10-05T12:30:00');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    rejectsWithCode(() => requestToJoinCrew(store, runner, crewA.id, soon), 'request_cooldown');
  }
  assert.equal(buildCrewDetailPayload(store, runner, crewA.id, soon).canRequest, false);
  assert.equal(captainNotices(), 1);

  // 다른 크루엔 바로 신청할 수 있다.
  const other = requestToJoinCrew(store, runner, crewB.id, soon);
  cancelCrewJoinRequest(store, runner, other.id, soon);

  // 하루가 지나면 다시 신청 → 거절되면 7일 동안 그 크루엔 다시 못 보낸다.
  const nextDay = kst('2026-10-06T12:00:00');
  const second = requestToJoinCrew(store, runner, crewA.id, nextDay);
  assert.equal(captainNotices(), 2);
  decideCrewJoinRequest(store, userOf(store, 'u1'), second.id, false, nextDay);

  // 취소 행은 하루 뒤 정리된다(블롭이 불지 않게) — 거절 행은 대기(7일) 판정 때문에 남는다.
  pruneCrewStore(store, kst('2026-10-07T12:00:00'));
  assert.deepEqual(store.crewJoinRequests.map((request) => [request.id, request.status]), [[second.id, 'rejected']]);

  rejectsWithCode(() => requestToJoinCrew(store, runner, crewA.id, kst('2026-10-13T11:59:00')), 'request_cooldown');
  requestToJoinCrew(store, runner, crewA.id, kst('2026-10-13T12:00:00'));
  assert.equal(captainNotices(), 3);
});

test('승인: 코드 가입과 같은 관문 → 인정 시작도 코드 가입과 같다(10월 프리시즌 = 승인 순간) · 월 이동 1회 사용 · 결정 알림', () => {
  const { store, crewA } = setup();
  const runner = userOf(store, 'u3');
  const request = requestToJoinCrew(store, runner, crewA.id, NOW);

  rejectsWithCode(() => decideCrewJoinRequest(store, userOf(store, 'u2'), request.id, true, NOW), 'not_captain');

  const { errorCode } = decideCrewJoinRequest(store, userOf(store, 'u1'), request.id, true, NOW);
  assert.equal(errorCode, null);
  assert.equal(request.status, 'approved');
  const row = findActiveCrewMembership(store, 'u3');
  assert.equal(row.crewId, crewA.id);
  // 프리시즌(10월)이라 승인된 순간부터 — 정규 시즌의 다음 날 0시는 멤버십 테스트가 본다.
  assert.equal(row.countsFrom, NOW.toISOString());
  assert.equal(getCrewJoinsLeftThisMonth(store, 'u3', NOW), 2);
  const decided = store.notifications.find((item) => item.type === 'crew_join_decided' && item.userId === 'u3');
  assert.equal(decided.data.approved, true);
  // 알림 문구도 저장된 행을 따른다 (적대 리뷰 2026-09-18: 프리시즌에 '내일 0시부터'라고 했다).
  assert.equal(decided.body, '새벽에 들어갔어요. 들어온 순간부터 기록이 크루 점수에 들어가요.');

  // 한 번 결정된 신청은 다시 결정할 수 없다.
  rejectsWithCode(() => decideCrewJoinRequest(store, userOf(store, 'u1'), request.id, true, NOW), 'not_found');
});

test('거절: rejected + 결정 알림(approved=false) · 캡틴 신청 목록에서 사라진다', () => {
  const { store, crewA } = setup();
  const request = requestToJoinCrew(store, userOf(store, 'u3'), crewA.id, NOW);
  requestToJoinCrew(store, userOf(store, 'u4'), crewA.id, kst('2026-10-05T12:05:00'));

  const listed = buildCrewRequestsPayload(store, userOf(store, 'u1'), crewA.id, NOW);
  assert.deepEqual(listed.requests.map((entry) => [entry.userId, entry.name]), [['u3', '러너3'], ['u4', '러너4']]);
  rejectsWithCode(() => buildCrewRequestsPayload(store, userOf(store, 'u2'), crewA.id, NOW), 'not_captain');

  decideCrewJoinRequest(store, userOf(store, 'u1'), request.id, false, NOW);
  assert.equal(request.status, 'rejected');
  assert.equal(findActiveCrewMembership(store, 'u3'), null);
  const decided = store.notifications.find((item) => item.type === 'crew_join_decided' && item.userId === 'u3');
  assert.equal(decided.data.approved, false);
  assert.deepEqual(listPendingCrewJoinRequests(store, crewA.id, NOW.getTime()).map((entry) => entry.userId), ['u4']);
});

test('코드로 다른 크루에 들어가면 기다리던 신청은 자동 취소된다', () => {
  const { store, crewA, crewB } = setup();
  const runner = userOf(store, 'u3');
  const request = requestToJoinCrew(store, runner, crewA.id, NOW);

  joinCrewByCode(store, runner, crewB.inviteCode, NOW);
  assert.equal(request.status, 'cancelled');
  assert.equal(listPendingCrewJoinRequests(store, crewA.id, NOW.getTime()).length, 0);
  rejectsWithCode(() => decideCrewJoinRequest(store, userOf(store, 'u1'), request.id, true, NOW), 'not_found');
});

test('승인 시점에 이미 다른 크루 소속이면 already_in_crew — 신청은 void로 남는다(커밋될 결과)', () => {
  const { store, crewA, crewB } = setup();
  const request = requestToJoinCrew(store, userOf(store, 'u3'), crewA.id, NOW);

  // 경합: 신청이 살아 있는 채로 다른 크루 멤버십이 생긴 상태(자동 취소보다 먼저 커밋된 경로).
  store.crewMembers.push({
    id: 'race-row', crewId: crewB.id, userId: 'u3', role: 'member',
    joinedAt: NOW.toISOString(), countsFrom: iso('2026-10-06T00:00:00'), leftAt: null, leftReason: null,
  });

  const { errorCode } = decideCrewJoinRequest(store, userOf(store, 'u1'), request.id, true, NOW);
  assert.equal(errorCode, 'already_in_crew');
  assert.equal(request.status, 'void');
  assert.equal(listActiveCrewMembers(store, crewA.id).some((row) => row.userId === 'u3'), false);
});

test('승인 실패(정원)는 던지고 신청은 대기로 남는다 · 7일 지난 신청은 만료', () => {
  const store = buildStore(CREW_MAX_MEMBERS + 2);
  const crew = createCrew(store, userOf(store, 'u1'), { name: '가득' }, NOW);
  const request = requestToJoinCrew(store, userOf(store, `u${CREW_MAX_MEMBERS + 1}`), crew.id, NOW);

  for (let index = 2; index <= CREW_MAX_MEMBERS; index += 1) {
    joinCrewByCode(store, userOf(store, `u${index}`), crew.inviteCode, NOW);
  }

  rejectsWithCode(() => decideCrewJoinRequest(store, userOf(store, 'u1'), request.id, true, NOW), 'crew_full');
  assert.equal(request.status, 'pending');
  rejectsWithCode(() => requestToJoinCrew(store, userOf(store, `u${CREW_MAX_MEMBERS + 2}`), crew.id, NOW), 'crew_full');

  // 7일 뒤: 만료 — 결정할 수 없고, 신청자는 새로 신청할 수 있다(정원만 비면).
  const later = kst('2026-10-12T12:00:00');
  rejectsWithCode(() => decideCrewJoinRequest(store, userOf(store, 'u1'), request.id, true, later), 'not_found');
  assert.equal(buildCrewHomePayload(store, userOf(store, `u${CREW_MAX_MEMBERS + 1}`), later).myPendingRequest, null);
});

test('정규 시즌(11월) 승인은 다음 날 0시부터 — 알림 문구도 같다', () => {
  const store = buildStore();
  const november = kst('2026-11-05T12:00:00');
  const crew = createCrew(store, userOf(store, 'u1'), { name: '새벽' }, november);
  const request = requestToJoinCrew(store, userOf(store, 'u3'), crew.id, november);

  decideCrewJoinRequest(store, userOf(store, 'u1'), request.id, true, november);
  assert.equal(findActiveCrewMembership(store, 'u3').countsFrom, iso('2026-11-06T00:00:00'));
  const decided = store.notifications.find((item) => item.type === 'crew_join_decided' && item.userId === 'u3');
  assert.equal(decided.body, '새벽에 들어갔어요. 내일 0시부터 기록이 크루 점수에 들어가요.');
});
