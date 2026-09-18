import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adminCloseCrew,
  adminRenameCrew,
  collectUsedCrewInviteCodes,
  createCrew,
  endCrewMembershipsForDeletedUser,
  getCrewJoinsLeftThisMonth,
  joinCrewByCode,
  kickCrewMember,
  leaveCrew,
  listActiveCrewMembers,
  pruneCrewStore,
  rotateCrewInviteCode,
  transferCrewCaptain,
} from './crewMembership.mjs';
import { requestToJoinCrew } from './crewRequests.mjs';
import { CREW_INVITE_CODE_PATTERN, CREW_MAX_MEMBERS } from './crewConstants.mjs';

// 크루 멤버십: 만들기·코드 가입·나가기·내보내기·캡틴 이양·계정 삭제 훅·정리 (스펙 v1, 2026-09-18).

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

test('크루 만들기: 만든 사람이 캡틴 · 인정은 다음 날 0시(KST)부터 · 6자리 코드', () => {
  const store = buildStore();
  const crew = createCrew(store, userOf(store, 'u1'), { name: '  새벽 러너스  ' }, kst('2026-10-05T23:59:00'));

  assert.equal(crew.name, '새벽 러너스');
  assert.equal(crew.nameKey, '새벽러너스');
  assert.equal(crew.captainUserId, 'u1');
  assert.equal(crew.closedAt, null);
  assert.match(crew.inviteCode, CREW_INVITE_CODE_PATTERN);
  const [row] = store.crewMembers;
  assert.equal(row.role, 'captain');
  assert.equal(row.countsFrom, iso('2026-10-06T00:00:00'));

  // 정확히 0시에 들어와도 그날이 아니라 다음 날 0시부터다.
  const midnight = createCrew(store, userOf(store, 'u2'), { name: '노을' }, kst('2026-10-06T00:00:00'));
  assert.equal(store.crewMembers.find((entry) => entry.crewId === midnight.id).countsFrom, iso('2026-10-07T00:00:00'));
});

test('이름 규칙: 2~12자·한글/영문/숫자/단일 공백, 금칙어, 열린 크루끼리 중복 불가', () => {
  const store = buildStore();
  const make = (userId, name) => () => createCrew(store, userOf(store, userId), { name }, NOW);

  rejectsWithCode(make('u1', '가'), 'invalid_name');
  rejectsWithCode(make('u1', 'a'.repeat(13)), 'invalid_name');
  rejectsWithCode(make('u1', '새벽!러너'), 'invalid_name');
  rejectsWithCode(make('u1', '새벽  러너'), 'invalid_name');
  rejectsWithCode(make('u1', '공식러너'), 'blocked_name');
  rejectsWithCode(make('u1', 'ADMIN crew'), 'blocked_name');

  createCrew(store, userOf(store, 'u1'), { name: 'Dawn Runners' }, NOW);
  rejectsWithCode(make('u2', 'dawnrunners'), 'name_taken');
  rejectsWithCode(make('u2', 'DAWN  RUNNERS'.replace('  ', ' ')), 'name_taken');
});

test('코드 가입: 소문자 입력 허용, 같은 크루 재가입은 멱등, 다른 크루 소속이면 already_in_crew', () => {
  const store = buildStore();
  const crewA = createCrew(store, userOf(store, 'u1'), { name: '새벽' }, NOW);
  const crewB = createCrew(store, userOf(store, 'u2'), { name: '노을' }, NOW);

  rejectsWithCode(() => joinCrewByCode(store, userOf(store, 'u3'), 'ZZZZZZ', NOW), 'not_found');
  rejectsWithCode(() => joinCrewByCode(store, userOf(store, 'u3'), '!!', NOW), 'not_found');

  joinCrewByCode(store, userOf(store, 'u3'), crewA.inviteCode.toLowerCase(), NOW);
  joinCrewByCode(store, userOf(store, 'u3'), crewA.inviteCode, NOW);
  assert.equal(store.crewMembers.filter((row) => row.userId === 'u3').length, 1);
  assert.equal(store.crewMembers.find((row) => row.userId === 'u3').countsFrom, iso('2026-10-06T00:00:00'));

  rejectsWithCode(() => joinCrewByCode(store, userOf(store, 'u3'), crewB.inviteCode, NOW), 'already_in_crew');
  rejectsWithCode(() => createCrew(store, userOf(store, 'u3'), { name: '한강' }, NOW), 'already_in_crew');
});

test('월 이동 3회: 만들기·코드 가입을 모두 세고, 다음 달에 풀린다 · 만들기는 30일에 1개', () => {
  const store = buildStore();
  const crewA = createCrew(store, userOf(store, 'u1'), { name: '새벽' }, NOW);
  const crewB = createCrew(store, userOf(store, 'u2'), { name: '노을' }, NOW);
  const runner = userOf(store, 'u3');

  assert.equal(getCrewJoinsLeftThisMonth(store, 'u1', NOW), 2); // 만들기도 1회
  joinCrewByCode(store, runner, crewA.inviteCode, NOW);
  leaveCrew(store, runner, crewA.id, NOW);
  joinCrewByCode(store, runner, crewB.inviteCode, NOW);
  leaveCrew(store, runner, crewB.id, NOW);
  joinCrewByCode(store, runner, crewA.inviteCode, NOW);
  leaveCrew(store, runner, crewA.id, NOW);
  assert.equal(getCrewJoinsLeftThisMonth(store, 'u3', NOW), 0);
  rejectsWithCode(() => joinCrewByCode(store, runner, crewB.inviteCode, NOW), 'join_limit');

  // KST 11/1 0시에 새 달.
  const nextMonth = kst('2026-11-01T00:00:00');
  assert.equal(getCrewJoinsLeftThisMonth(store, 'u3', nextMonth), 3);
  joinCrewByCode(store, runner, crewB.inviteCode, nextMonth);

  // u1은 크루를 만든 지 30일이 안 됐다 — 나가도 새로 못 만든다.
  leaveCrew(store, userOf(store, 'u1'), crewA.id, kst('2026-10-10T12:00:00'));
  rejectsWithCode(() => createCrew(store, userOf(store, 'u1'), { name: '새벽2' }, kst('2026-10-20T12:00:00')), 'create_limit');
  createCrew(store, userOf(store, 'u1'), { name: '새벽2' }, kst('2026-11-05T12:00:00'));
});

test('정원 30명: 꽉 차면 crew_full', () => {
  const store = buildStore(CREW_MAX_MEMBERS + 1);
  const crew = createCrew(store, userOf(store, 'u1'), { name: '가득' }, NOW);

  for (let index = 2; index <= CREW_MAX_MEMBERS; index += 1) {
    joinCrewByCode(store, userOf(store, `u${index}`), crew.inviteCode, NOW);
  }
  assert.equal(listActiveCrewMembers(store, crew.id).length, CREW_MAX_MEMBERS);
  rejectsWithCode(
    () => joinCrewByCode(store, userOf(store, `u${CREW_MAX_MEMBERS + 1}`), crew.inviteCode, NOW),
    'crew_full',
  );
});

test('내보내기: 캡틴만 · 30일 재가입 차단(코드·신청) · crew_kicked 알림', () => {
  const store = buildStore();
  const crew = createCrew(store, userOf(store, 'u1'), { name: '새벽' }, NOW);
  joinCrewByCode(store, userOf(store, 'u2'), crew.inviteCode, NOW);
  joinCrewByCode(store, userOf(store, 'u3'), crew.inviteCode, NOW);

  rejectsWithCode(() => kickCrewMember(store, userOf(store, 'u2'), crew.id, 'u3', NOW), 'not_captain');
  rejectsWithCode(() => kickCrewMember(store, userOf(store, 'u1'), crew.id, 'u7', NOW), 'not_member');
  assert.throws(() => kickCrewMember(store, userOf(store, 'u1'), crew.id, 'u1', NOW), /자기 자신/);

  kickCrewMember(store, userOf(store, 'u1'), crew.id, 'u2', NOW);
  const kickedRow = store.crewMembers.find((row) => row.userId === 'u2');
  assert.equal(kickedRow.leftReason, 'kicked');
  assert.equal(kickedRow.leftAt, NOW.toISOString());
  assert.equal(store.notifications.filter((item) => item.userId === 'u2' && item.type === 'crew_kicked').length, 1);

  rejectsWithCode(() => joinCrewByCode(store, userOf(store, 'u2'), crew.inviteCode, kst('2026-10-20T12:00:00')), 'crew_banned');
  rejectsWithCode(() => requestToJoinCrew(store, userOf(store, 'u2'), crew.id, kst('2026-10-20T12:00:00')), 'crew_banned');

  // 30일이 지나면 다시 들어올 수 있다.
  joinCrewByCode(store, userOf(store, 'u2'), crew.inviteCode, kst('2026-11-05T12:00:00'));
  assert.equal(listActiveCrewMembers(store, crew.id).length, 3);
});

test('캡틴 이양: 캡틴이 나가면 인정 시작이 가장 이른 멤버(같으면 먼저 들어온 사람) + crew_captain 알림', () => {
  const store = buildStore();
  const crew = createCrew(store, userOf(store, 'u1'), { name: '새벽' }, kst('2026-10-01T09:00:00'));
  joinCrewByCode(store, userOf(store, 'u2'), crew.inviteCode, kst('2026-10-02T20:00:00')); // 10/3부터
  joinCrewByCode(store, userOf(store, 'u3'), crew.inviteCode, kst('2026-10-02T09:00:00')); // 10/3부터, 먼저 들어옴
  joinCrewByCode(store, userOf(store, 'u4'), crew.inviteCode, kst('2026-10-04T09:00:00')); // 10/5부터

  leaveCrew(store, userOf(store, 'u1'), crew.id, NOW);
  assert.equal(crew.captainUserId, 'u3');
  assert.equal(listActiveCrewMembers(store, crew.id).find((row) => row.userId === 'u3').role, 'captain');
  assert.equal(store.notifications.filter((item) => item.type === 'crew_captain' && item.userId === 'u3').length, 1);

  // 캡틴 넘기기(수동): 역할이 서로 바뀌고 새 캡틴에게 알림.
  transferCrewCaptain(store, userOf(store, 'u3'), crew.id, 'u4', NOW);
  assert.equal(crew.captainUserId, 'u4');
  const roles = Object.fromEntries(listActiveCrewMembers(store, crew.id).map((row) => [row.userId, row.role]));
  assert.deepEqual(roles, { u2: 'member', u3: 'member', u4: 'captain' });
  rejectsWithCode(() => transferCrewCaptain(store, userOf(store, 'u3'), crew.id, 'u2', NOW), 'not_captain');
});

test('마지막 멤버가 나가면 크루 종료 — 이름이 풀리고 대기 신청은 무효', () => {
  const store = buildStore();
  const crew = createCrew(store, userOf(store, 'u1'), { name: '새벽' }, NOW);
  const request = requestToJoinCrew(store, userOf(store, 'u5'), crew.id, NOW);

  leaveCrew(store, userOf(store, 'u1'), crew.id, NOW);
  assert.equal(crew.closedAt, NOW.toISOString());
  assert.equal(request.status, 'void');
  rejectsWithCode(() => joinCrewByCode(store, userOf(store, 'u2'), crew.inviteCode, NOW), 'not_found');
  rejectsWithCode(() => leaveCrew(store, userOf(store, 'u1'), crew.id, NOW), 'not_found');

  const reborn = createCrew(store, userOf(store, 'u2'), { name: '새벽' }, NOW);
  assert.notEqual(reborn.id, crew.id);
  assert.notEqual(reborn.inviteCode, crew.inviteCode);
});

test('코드 새로 만들기: 캡틴만, 옛 코드는 즉시 무효', () => {
  const store = buildStore();
  const crew = createCrew(store, userOf(store, 'u1'), { name: '새벽' }, NOW);
  joinCrewByCode(store, userOf(store, 'u2'), crew.inviteCode, NOW);
  const oldCode = crew.inviteCode;

  rejectsWithCode(() => rotateCrewInviteCode(store, userOf(store, 'u2'), crew.id), 'not_captain');
  rotateCrewInviteCode(store, userOf(store, 'u1'), crew.id);
  assert.notEqual(crew.inviteCode, oldCode);
  assert.match(crew.inviteCode, CREW_INVITE_CODE_PATTERN);
  rejectsWithCode(() => joinCrewByCode(store, userOf(store, 'u3'), oldCode, NOW), 'not_found');
  joinCrewByCode(store, userOf(store, 'u3'), crew.inviteCode, NOW);
});

test('버린 초대 코드는 다시 나가지 않는다 — 재발급한 옛 코드 · 70일 정리로 지운 크루의 코드', () => {
  const store = buildStore();
  const crew = createCrew(store, userOf(store, 'u1'), { name: '새벽' }, NOW);
  const firstCode = crew.inviteCode;

  rotateCrewInviteCode(store, userOf(store, 'u1'), crew.id);
  assert.deepEqual(store.crewRetiredInviteCodes, [firstCode]);
  assert.ok(collectUsedCrewInviteCodes(store).has(firstCode));
  assert.ok(collectUsedCrewInviteCodes(store).has(crew.inviteCode));

  const old = createCrew(store, userOf(store, 'u2'), { name: '옛크루' }, NOW);
  leaveCrew(store, userOf(store, 'u2'), old.id, NOW);
  pruneCrewStore(store, kst('2026-12-20T12:00:00'));
  assert.equal(store.crews.some((entry) => entry.id === old.id), false);
  // 크루 기록은 지워져도 코드는 영구히 '쓴 코드'로 남는다.
  assert.deepEqual(store.crewRetiredInviteCodes, [firstCode, old.inviteCode]);
  assert.ok(collectUsedCrewInviteCodes(store).has(old.inviteCode));

  // 한 번 더 정리해도 목록은 그대로(중복 없음, 지우지 않음).
  pruneCrewStore(store, kst('2027-06-01T12:00:00'));
  assert.deepEqual(store.crewRetiredInviteCodes, [firstCode, old.inviteCode]);
});

test('계정 삭제 훅: 캡틴이면 이양, 마지막이면 종료, 대기 신청 취소 — 크루를 안 쓴 저장소는 그대로', () => {
  const store = buildStore();
  const crewA = createCrew(store, userOf(store, 'u1'), { name: '새벽' }, NOW);
  joinCrewByCode(store, userOf(store, 'u2'), crewA.inviteCode, NOW);
  const crewB = createCrew(store, userOf(store, 'u3'), { name: '노을' }, NOW);
  const pending = requestToJoinCrew(store, userOf(store, 'u4'), crewA.id, NOW);

  endCrewMembershipsForDeletedUser(store, 'u1', NOW);
  assert.equal(store.crewMembers.find((row) => row.userId === 'u1').leftReason, 'deleted');
  assert.equal(crewA.captainUserId, 'u2');
  assert.equal(crewA.closedAt, null);
  assert.equal(store.notifications.filter((item) => item.type === 'crew_captain' && item.userId === 'u2').length, 1);

  endCrewMembershipsForDeletedUser(store, 'u3', NOW);
  assert.equal(crewB.closedAt, NOW.toISOString());

  endCrewMembershipsForDeletedUser(store, 'u4', NOW);
  assert.equal(pending.status, 'cancelled');

  const untouched = buildStore();
  endCrewMembershipsForDeletedUser(untouched, 'u1', NOW);
  assert.equal('crews' in untouched, false);
});

test('운영자 도구: 이름 강제 변경(형식·중복 검사) · 크루 종료', () => {
  const store = buildStore();
  const crewA = createCrew(store, userOf(store, 'u1'), { name: '새벽' }, NOW);
  joinCrewByCode(store, userOf(store, 'u2'), crewA.inviteCode, NOW);
  createCrew(store, userOf(store, 'u3'), { name: '노을' }, NOW);

  rejectsWithCode(() => adminRenameCrew(store, crewA.id, '노 을'), 'name_taken');
  rejectsWithCode(() => adminRenameCrew(store, crewA.id, '!'), 'invalid_name');
  adminRenameCrew(store, crewA.id, '새벽 크루');
  assert.equal(crewA.name, '새벽 크루');

  adminCloseCrew(store, crewA.id, NOW);
  assert.equal(crewA.closedAt, NOW.toISOString());
  assert.equal(listActiveCrewMembers(store, crewA.id).length, 0);
  assert.deepEqual(
    store.crewMembers.filter((row) => row.crewId === crewA.id).map((row) => row.leftReason),
    ['closed', 'closed'],
  );
  rejectsWithCode(() => adminCloseCrew(store, crewA.id, NOW), 'not_found');
});

test('정리: 70일 지난 종료 크루·나간 행, 사라진 유저의 행, 만료·오래된 신청 — 봉인 원장은 그대로', () => {
  const store = buildStore();
  const old = createCrew(store, userOf(store, 'u1'), { name: '옛크루' }, kst('2026-07-01T09:00:00'));
  leaveCrew(store, userOf(store, 'u1'), old.id, kst('2026-07-02T09:00:00'));
  const live = createCrew(store, userOf(store, 'u2'), { name: '새벽' }, NOW);
  joinCrewByCode(store, userOf(store, 'u3'), live.inviteCode, NOW);
  joinCrewByCode(store, userOf(store, 'u4'), live.inviteCode, NOW);
  kickCrewMember(store, userOf(store, 'u2'), live.id, 'u4', NOW);
  store.crewJoinRequests.push(
    { id: 'expired', crewId: live.id, userId: 'u5', status: 'pending', createdAt: iso('2026-09-20T09:00:00'), decidedAt: null },
    { id: 'fresh', crewId: live.id, userId: 'u6', status: 'pending', createdAt: iso('2026-10-04T09:00:00'), decidedAt: null },
    { id: 'old-decided', crewId: live.id, userId: 'u7', status: 'rejected', createdAt: iso('2026-08-20T09:00:00'), decidedAt: iso('2026-08-21T09:00:00') },
  );
  store.crewSeasonAwards.push({ seasonKey: '2026-09', champions: [], top: [] });

  // u3 탈퇴(삭제 훅을 못 거친 경로) — prune이 스스로 행을 정리한다.
  store.users = store.users.filter((user) => user.id !== 'u3');

  const removed = pruneCrewStore(store, NOW);
  assert.equal(removed, 5); // 옛 크루 1 + 옛 크루 행 1 + u3 행 1 + 신청 2
  assert.deepEqual(store.crews.map((crew) => crew.id), [live.id]);
  assert.deepEqual(store.crewMembers.map((row) => row.userId).sort(), ['u2', 'u4']); // 내보낸 u4 행은 70일 전까지 남는다
  assert.deepEqual(store.crewJoinRequests.map((request) => request.id), ['fresh']);
  assert.equal(store.crewSeasonAwards.length, 1);
  assert.equal(live.bans.length, 1);

  // 두 번째 정리는 할 일이 없다(직렬화가 그대로라 저장이 생략된다).
  const serialized = JSON.stringify(store);
  assert.equal(pruneCrewStore(store, NOW), 0);
  assert.equal(JSON.stringify(store), serialized);

  // 차단 만료(30일) 뒤에는 차단 행도 정리된다.
  pruneCrewStore(store, kst('2026-11-10T12:00:00'));
  assert.equal(live.bans.length, 0);
});
