import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCrewSeasonStandings,
  buildCrewStarCounts,
  hasUnsealedCrewSeason,
  resolveCrewSeasonPriorKm,
  sweepCrewSeasons,
} from './crewSeason.mjs';
import { buildCrewHomePayload, buildCrewLeaguePayload, buildCrewSeasonInfo } from './crewPayloads.mjs';
import { nextKstMidnightMs } from '../competitionWindow.mjs';

// 크루대전 시즌 점수·봉인: 시계는 전부 주입한다(KST 경계 포함). 스펙 v1 (오너 2026-09-18).
// 10월 시즌 = [2026-10-01 0시 KST, 2026-11-01 0시 KST), 봉인 = 11/3 0시 KST.

const kst = (text) => new Date(`${text}+09:00`);
const iso = (text) => kst(text).toISOString();
const ms = (text) => kst(text).getTime();

function buildUsers(count = 12) {
  return Array.from({ length: count }, (_, index) => ({ id: `u${index + 1}`, name: `러너${index + 1}` }));
}

function crew(id, name, overrides = {}) {
  return {
    id,
    name,
    nameKey: name.toLowerCase().replace(/\s+/g, ''),
    inviteCode: `INV${id.toUpperCase()}`,
    captainUserId: 'u1',
    createdByUserId: 'u1',
    createdAt: iso('2026-09-01T09:00:00'),
    closedAt: null,
    bans: [],
    ...overrides,
  };
}

let rowSeq = 0;
// 기본값은 9/10 가입 → 9/11 0시부터 인정 = 10월 시즌의 '기존 멤버'.
function member(crewId, userId, { joined = '2026-09-10T12:00:00', leftAt = null, role = 'member' } = {}) {
  rowSeq += 1;
  const joinedAt = iso(joined);
  return {
    id: `row-${rowSeq}`,
    crewId,
    userId,
    role,
    joinedAt,
    countsFrom: new Date(nextKstMidnightMs(Date.parse(joinedAt))).toISOString(),
    leftAt: leftAt ? iso(leftAt) : null,
    leftReason: leftAt ? 'left' : null,
  };
}

let runSeq = 0;
function run(userId, km, ended, { started = null, minutes = 30, created = null, sourceType = 'runningground', verdict, matchResult } = {}) {
  runSeq += 1;
  const endedAt = iso(ended);
  return {
    id: `run-${runSeq}`,
    userId,
    // run.date는 기기의 시작일 — 크루는 이 값을 보지 않는다(endedAt의 KST 날짜로 센다).
    date: (started ?? ended).slice(0, 10),
    distanceKm: km,
    durationSeconds: minutes * 60,
    startedAt: started ? iso(started) : new Date(Date.parse(endedAt) - minutes * 60_000).toISOString(),
    endedAt,
    createdAt: created ? iso(created) : new Date(Date.parse(endedAt) + 60_000).toISOString(),
    ...(sourceType ? { sourceType } : {}),
    ...(verdict ? { integrity: { verdict } } : {}),
    ...(matchResult ? { matchResult } : {}),
  };
}

function buildStore({ crews = [], members = [], runs = [], awards = [], users = buildUsers() } = {}) {
  return {
    users,
    crews,
    crewMembers: members,
    crewJoinRequests: [],
    crewSeasonAwards: awards,
    runs,
    notifications: [],
  };
}

function threeVeterans(crewId, userIds) {
  return userIds.map((userId, index) => member(crewId, userId, { role: index === 0 ? 'captain' : 'member' }));
}

test('KST 월말 경계: 9/30 23:50 시작 → 10/1 00:20 종료 러닝은 endedAt 기준 10월로 센다', () => {
  const store = buildStore({
    crews: [crew('c1', '새벽')],
    members: threeVeterans('c1', ['u1', 'u2', 'u3']),
    runs: [
      // UTC로는 9/30 15:20 — 드롭릿 로컬 날짜로 세면 9월로 밀린다.
      run('u1', 5, '2026-10-01T00:20:00', { started: '2026-09-30T23:50:00' }),
    ],
  });
  const now = ms('2026-10-10T12:00:00');

  const october = buildCrewSeasonStandings(store, '2026-10', now);
  assert.equal(october.memberStats.get('c1|u1').contributionKm, 5);
  assert.equal(october.rowByCrewId.get('c1').totalKm, 5);

  const september = buildCrewSeasonStandings(store, '2026-09', now);
  assert.equal(september.memberStats.get('c1|u1').contributionKm, 0);
});

test('하루 45km 상한 + 겹친 기록은 가장 긴 것 하나(동률은 먼저 저장된 것) + 경쟁 기록만', () => {
  const store = buildStore({
    crews: [crew('c1', '새벽')],
    members: threeVeterans('c1', ['u1', 'u2', 'u3']),
    runs: [
      // 10/2: 30 + 25 = 55 → 45 상한
      run('u1', 30, '2026-10-02T09:30:00', { minutes: 150 }),
      run('u1', 25, '2026-10-02T18:00:00', { minutes: 120 }),
      // 10/3: 10:00~11:00 10km와 10:30~11:30 12km가 겹친다 → 12km만
      run('u1', 10, '2026-10-03T11:00:00', { started: '2026-10-03T10:00:00' }),
      run('u1', 12, '2026-10-03T11:30:00', { started: '2026-10-03T10:30:00' }),
      // 10/4: 같은 8km가 겹친다 → 먼저 저장된 쪽(14:51) 하나
      run('u1', 8, '2026-10-04T15:00:00', { started: '2026-10-04T14:00:00', created: '2026-10-04T15:01:00' }),
      run('u1', 8, '2026-10-04T14:50:00', { started: '2026-10-04T14:10:00', created: '2026-10-04T14:51:00' }),
      // 제외: 헬스 임포트, 차량 판정, 창+48h 밖에 저장된 기록
      run('u1', 20, '2026-10-05T09:00:00', { sourceType: 'apple_health' }),
      run('u1', 30, '2026-10-06T09:00:00', { verdict: 'vehicle' }),
      run('u1', 9, '2026-10-07T09:00:00', { created: '2026-11-05T09:00:00' }),
      // 인정: 매치 기록(matchResult)
      run('u1', 3, '2026-10-08T09:00:00', { sourceType: null, matchResult: { mode: 'duel' } }),
    ],
  });

  const standings = buildCrewSeasonStandings(store, '2026-10', ms('2026-10-20T12:00:00'));
  assert.equal(standings.memberStats.get('c1|u1').contributionKm, 45 + 12 + 8 + 3);
});

test('7일 규칙: 이번 달 신입은 7일 뒤 합류(기여는 추적), 첫 7일 안에 나간 기존 멤버는 빠진다', () => {
  const store = buildStore({
    crews: [crew('c1', '새벽'), crew('c2', '노을', { captainUserId: 'u5' })],
    members: [
      member('c1', 'u1', { role: 'captain' }),
      member('c1', 'u2'),
      // 10/9 가입 → 10/10 0시 인정 → 10/17 0시 합류
      member('c1', 'u3', { joined: '2026-10-09T12:00:00' }),
      // c2: u4는 10/5에 나감(첫 7일 안) → 제외, u8은 10/9에 나감(7일 뒤) → 포함
      member('c2', 'u4', { leftAt: '2026-10-05T12:00:00' }),
      member('c2', 'u5', { role: 'captain' }),
      member('c2', 'u6'),
      member('c2', 'u8', { leftAt: '2026-10-09T12:00:00' }),
    ],
    runs: [
      run('u1', 10, '2026-10-03T08:00:00'),
      run('u3', 7, '2026-10-11T08:00:00'),
      run('u4', 10, '2026-10-02T08:00:00'),
      run('u5', 5, '2026-10-02T08:00:00'),
      run('u6', 5, '2026-10-02T08:00:00'),
      run('u8', 6, '2026-10-03T08:00:00'),
      run('u8', 4, '2026-10-12T08:00:00'), // 나간 뒤 — 창 밖
    ],
  });

  const early = buildCrewSeasonStandings(store, '2026-10', ms('2026-10-15T12:00:00'));
  const earlyC1 = early.rowByCrewId.get('c1');
  assert.equal(earlyC1.seasonMemberCount, 2);
  assert.equal(earlyC1.totalKm, 10);
  assert.equal(earlyC1.rank, null);
  assert.equal(earlyC1.unrankedReason, 'newcomers_pending');
  assert.deepEqual(early.memberStats.get('c1|u3'), {
    contributionKm: 7,
    isSeasonMember: false,
    countedFromMs: ms('2026-10-17T00:00:00'),
  });

  const home = buildCrewHomePayload(store, store.users[0], kst('2026-10-15T12:00:00'));
  const newcomer = home.myCrew.members.find((row) => row.userId === 'u3');
  assert.equal(newcomer.countedFrom, iso('2026-10-17T00:00:00'));
  assert.equal(newcomer.countsFrom, iso('2026-10-10T00:00:00'));
  assert.equal(newcomer.contributionKm, 7);
  assert.equal(home.myCrew.members.find((row) => row.userId === 'u1').countedFrom, null);

  const c2 = early.rowByCrewId.get('c2');
  assert.equal(c2.seasonMemberCount, 3); // u5, u6, u8
  assert.equal(c2.totalKm, 16); // u4의 10km 제외, u8은 나가기 전 6km만
  assert.equal(early.memberStats.get('c2|u4').isSeasonMember, false);

  // 정확히 7일이 되는 순간(10/17 0시)부터 인원수와 총거리에 들어간다.
  const joined = buildCrewSeasonStandings(store, '2026-10', ms('2026-10-17T00:00:00'));
  assert.equal(joined.rowByCrewId.get('c1').seasonMemberCount, 3);
  assert.equal(joined.rowByCrewId.get('c1').totalKm, 17);
  assert.equal(joined.rowByCrewId.get('c1').rank, 1);
});

test('프리시즌은 7일 규칙을 끈다 — 인정이 시작된 신입은 바로 멤버', () => {
  const store = buildStore({
    crews: [crew('c1', '새벽')],
    members: [
      member('c1', 'u1', { joined: '2026-09-20T12:00:00', role: 'captain' }),
      member('c1', 'u2', { joined: '2026-09-20T13:00:00' }),
      member('c1', 'u3', { joined: '2026-09-20T14:00:00' }),
      // 오늘 가입 — 인정은 내일 0시부터라 아직 멤버가 아니다.
      member('c1', 'u4', { joined: '2026-09-22T10:00:00' }),
    ],
    runs: [run('u1', 5, '2026-09-21T08:00:00'), run('u2', 5, '2026-09-21T08:00:00')],
  });

  const standings = buildCrewSeasonStandings(store, '2026-09', ms('2026-09-22T12:00:00'));
  const row = standings.rowByCrewId.get('c1');
  assert.equal(standings.isPreseason, true);
  assert.equal(row.seasonMemberCount, 3);
  assert.equal(row.rank, 1);

  const home = buildCrewHomePayload(store, store.users[0], kst('2026-09-22T12:00:00'));
  assert.equal(home.myCrew.members.find((entry) => entry.userId === 'u4').countedFrom, iso('2026-09-23T00:00:00'));
  assert.equal(home.season.label, '9월 프리시즌');
  assert.equal(home.season.isPreseason, true);
  assert.equal(home.season.daysLeft, 9);
});

test('고정 P: 직전 시즌 봉인 avgKm, 없으면 30 — 점수 = (T + 5P) / (N + 5)', () => {
  const store = buildStore({
    crews: [crew('c1', '새벽')],
    members: threeVeterans('c1', ['u1', 'u2', 'u3']),
    awards: [{ seasonKey: '2026-10', avgKm: 40, champions: [], top: [] }],
    runs: ['u1', 'u2', 'u3'].flatMap((userId) => [
      run(userId, 40, '2026-11-02T08:00:00'),
      run(userId, 40, '2026-11-03T08:00:00'),
      run(userId, 30, '2026-11-04T08:00:00'),
    ]),
  });

  assert.equal(resolveCrewSeasonPriorKm(store, '2026-11', ms('2026-11-20T12:00:00')), 40);
  // 9월 원장 없음 + 9월 기록 없음 → 기본값 (집계 중 계산으로 가도 avgKm 0이라 기본값).
  assert.equal(resolveCrewSeasonPriorKm(store, '2026-10', ms('2026-10-01T12:00:00')), 30);
  assert.equal(resolveCrewSeasonPriorKm(store, '2026-09', ms('2026-09-20T12:00:00')), 30);

  const november = buildCrewSeasonStandings(store, '2026-11', ms('2026-11-20T12:00:00'));
  const row = november.rowByCrewId.get('c1');
  assert.equal(november.priorKm, 40);
  assert.equal(row.totalKm, 330);
  assert.equal(row.score, 66.25);

  // 시즌 정보의 priorKm도 같은 고정값이다.
  const info = buildCrewSeasonInfo(store, '2026-11', kst('2026-11-20T12:00:00'));
  assert.equal(info.priorKm, 40);
  assert.equal(info.status, 'live');
  assert.equal(info.daysLeft, 11);

  // 봉인 원장의 avgKm가 0(아무도 안 뛴 달)이면 기본값 — 0 쪽으로 누르는 보정 역전 방지.
  store.crewSeasonAwards.push({ seasonKey: '2026-11', avgKm: 0, champions: [], top: [] });
  assert.equal(resolveCrewSeasonPriorKm(store, '2026-12', ms('2026-12-20T12:00:00')), 30);
});

test('시즌 첫 48시간(직전 시즌 집계 중)에도 P는 봉인될 값 그대로 — 3일 0시 봉인 때 점수가 뛰지 않는다', () => {
  const store = buildStore({
    crews: [crew('c1', '새벽'), crew('c2', '노을', { captainUserId: 'u4' })],
    members: [...threeVeterans('c1', ['u1', 'u2', 'u3']), ...threeVeterans('c2', ['u4', 'u5', 'u6'])],
    runs: [
      // 9월 프리시즌: 120 + 30 = 150km / 6명 → avgKm 25 (기본값 30과 다르게 골랐다).
      ...['u1', 'u2', 'u3'].map((userId) => run(userId, 40, '2026-09-20T08:00:00')),
      ...['u4', 'u5', 'u6'].map((userId) => run(userId, 10, '2026-09-20T08:00:00')),
      run('u1', 10, '2026-10-01T08:00:00'),
      run('u4', 12, '2026-10-01T09:00:00'),
    ],
  });

  const tallying = kst('2026-10-02T12:00:00');
  assert.equal(hasUnsealedCrewSeason(store, tallying), false); // 9월 봉인은 10/3 0시
  const before = buildCrewSeasonStandings(store, '2026-10', tallying.getTime());
  assert.equal(before.priorKm, 25);
  assert.equal(buildCrewSeasonInfo(store, '2026-10', tallying).priorKm, 25);
  assert.equal(buildCrewHomePayload(store, store.users[0], tallying).season.priorKm, 25);

  const sealNow = kst('2026-10-03T00:00:01');
  sweepCrewSeasons(store, sealNow);
  assert.equal(store.crewSeasonAwards.find((award) => award.seasonKey === '2026-09').avgKm, 25);

  // 기록이 그대로면 봉인 전후로 P·점수·순위가 한 치도 안 바뀐다.
  const after = buildCrewSeasonStandings(store, '2026-10', sealNow.getTime());
  assert.equal(after.priorKm, 25);
  assert.deepEqual(
    after.rows.map((row) => [row.crewId, row.score, row.rank]),
    before.rows.map((row) => [row.crewId, row.score, row.rank]),
  );
  assert.equal(buildCrewSeasonInfo(store, '2026-10', sealNow).priorKm, 25);
});

test('나갔다 다시 들어온 멤버의 합류 시각 = 7일 규칙이 실제로 세는 순간(앞선 구간을 더한다)', () => {
  const store = buildStore({
    crews: [crew('c1', '새벽')],
    members: [
      member('c1', 'u1', { role: 'captain' }),
      member('c1', 'u2'),
      // u3: 10/1 가입(10/2 0시 인정) → 10/5 12:00 나감(3.5일 쌓임) → 10/6 다시 가입(10/7 0시 인정)
      // → 남은 3.5일 → 10/10 12:00 합류. countsFrom + 7일로 풀면 10/14로 늦게 찍힌다.
      member('c1', 'u3', { joined: '2026-10-01T10:00:00', leftAt: '2026-10-05T12:00:00' }),
      member('c1', 'u3', { joined: '2026-10-06T10:00:00' }),
    ],
    runs: [run('u1', 5, '2026-10-02T08:00:00')],
  });

  const home = buildCrewHomePayload(store, store.users[0], kst('2026-10-08T12:00:00'));
  const rejoined = home.myCrew.members.find((row) => row.userId === 'u3');
  assert.equal(rejoined.countedFrom, iso('2026-10-10T12:00:00'));
  assert.equal(rejoined.countsFrom, iso('2026-10-07T00:00:00'));
  assert.equal(home.myCrew.standing.unrankedReason, 'newcomers_pending');

  const justBefore = buildCrewSeasonStandings(store, '2026-10', ms('2026-10-10T12:00:00') - 1);
  assert.equal(justBefore.memberStats.get('c1|u3').isSeasonMember, false);
  const atMoment = buildCrewSeasonStandings(store, '2026-10', ms('2026-10-10T12:00:00'));
  assert.equal(atMoment.memberStats.get('c1|u3').isSeasonMember, true);
  assert.equal(atMoment.memberStats.get('c1|u3').countedFromMs, null);
  assert.equal(atMoment.rowByCrewId.get('c1').seasonMemberCount, 3);
  assert.equal(atMoment.rowByCrewId.get('c1').rank, 1);
});

test('동률은 공동 순위, 우승도 공동 — 봉인 원장 + 결과 알림 + 별(원장에서 파생)', () => {
  const store = buildStore({
    crews: [
      crew('c1', '새벽'),
      crew('c2', '노을', { captainUserId: 'u4' }),
      crew('c3', '한강', { captainUserId: 'u7' }),
    ],
    members: [
      ...threeVeterans('c1', ['u1', 'u2', 'u3']),
      ...threeVeterans('c2', ['u4', 'u5', 'u6']),
      ...threeVeterans('c3', ['u7', 'u8', 'u9']),
    ],
    runs: [
      ...['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map((userId) => run(userId, 20, '2026-10-12T08:00:00')),
      ...['u7', 'u8', 'u9'].map((userId) => run(userId, 10, '2026-10-12T08:00:00')),
    ],
  });

  const live = buildCrewSeasonStandings(store, '2026-10', ms('2026-10-20T12:00:00'));
  assert.deepEqual(live.rows.map((row) => [row.crewId, row.rank]), [['c1', 1], ['c2', 1], ['c3', 3]]);

  // 11/2 23:59는 아직 유예 중, 11/3 0시부터 봉인 대상(9월 프리시즌도 함께).
  assert.equal(hasUnsealedCrewSeason(store, kst('2026-10-02T23:59:00')), false);
  assert.equal(hasUnsealedCrewSeason(store, kst('2026-11-02T23:59:00')), true); // 9월은 이미 대상
  const sealNow = kst('2026-11-03T00:00:00');
  const created = sweepCrewSeasons(store, sealNow);
  assert.deepEqual(created.map((award) => award.seasonKey), ['2026-09', '2026-10']);

  const october = store.crewSeasonAwards.find((award) => award.seasonKey === '2026-10');
  assert.equal(october.isPreseason, false);
  assert.equal(october.ruleVersion, 1);
  assert.equal(october.priorKm, 30); // 9월 avgKm = 0 → 기본값
  assert.equal(october.rankedCount, 3);
  assert.deepEqual(october.champions.map((champion) => champion.crewId).sort(), ['c1', 'c2']);
  assert.deepEqual(october.champions.find((champion) => champion.crewId === 'c1').memberUserIds.sort(), ['u1', 'u2', 'u3']);
  assert.deepEqual(october.top.map((row) => [row.crewId, row.rank, row.totalKm, row.memberCount]), [
    ['c1', 1, 60, 3], ['c2', 1, 60, 3], ['c3', 3, 30, 3],
  ]);

  const stars = buildCrewStarCounts(store);
  assert.equal(stars.get('c1'), 1);
  assert.equal(stars.get('c2'), 1);
  assert.equal(stars.get('c3') ?? 0, 0);

  // 결과 알림: 순위권 크루의 시즌 멤버에게 1통씩(9월 프리시즌은 없음).
  const results = store.notifications.filter((item) => item.type === 'crew_season_result');
  assert.equal(results.length, 9);
  assert.equal(results.find((item) => item.userId === 'u1').body, '10월 크루대전 우승: 새벽 ★');
  assert.equal(results.find((item) => item.userId === 'u7').body, '10월 크루대전 결과: 한강 3위 / 3크루');

  // 멱등: 다시 쓸어도 원장·알림이 그대로.
  assert.equal(hasUnsealedCrewSeason(store, sealNow), false);
  assert.deepEqual(sweepCrewSeasons(store, kst('2026-11-03T00:05:00')), []);
  assert.equal(store.crewSeasonAwards.length, 2);
  assert.equal(store.notifications.filter((item) => item.type === 'crew_season_result').length, 9);
});

test('봉인된 시즌은 스냅샷만 — 봉인 뒤 기록이 바뀌어도 다시 계산하지 않는다', () => {
  const store = buildStore({
    crews: [crew('c1', '새벽'), crew('c3', '한강', { captainUserId: 'u7' })],
    members: [...threeVeterans('c1', ['u1', 'u2', 'u3']), ...threeVeterans('c3', ['u7', 'u8', 'u9'])],
    runs: [
      ...['u1', 'u2', 'u3'].map((userId) => run(userId, 20, '2026-10-12T08:00:00')),
      ...['u7', 'u8', 'u9'].map((userId) => run(userId, 10, '2026-10-12T08:00:00')),
    ],
  });
  sweepCrewSeasons(store, kst('2026-11-03T00:00:00'));

  // 봉인 뒤에 10월 기록이 생겼다(창 안 저장으로 위장된 늦은 기록) — 라이브 계산이라면 한강이 1위.
  store.runs.push(run('u7', 100, '2026-10-20T08:00:00', { minutes: 600, created: '2026-10-20T08:01:00' }));
  const recomputed = buildCrewSeasonStandings(store, '2026-10', ms('2026-11-04T00:00:00'));
  assert.equal(recomputed.rows[0].crewId, 'c3');

  const league = buildCrewLeaguePayload(store, store.users[0], '2026-10', kst('2026-11-04T00:00:00'));
  assert.equal(league.sealed, true);
  assert.equal(league.season.status, 'sealed');
  assert.equal(league.season.daysLeft, 0);
  assert.equal(league.season.label, '10월 시즌');
  assert.deepEqual(league.ranked.map((row) => [row.crewId, row.rank, row.totalKm]), [['c1', 1, 60], ['c3', 2, 30]]);
  assert.equal(league.ranked[0].stars, 1);
  assert.equal(league.ranked[0].isMine, true);
  assert.equal(league.ranked[0].runnerCount, 3);
  assert.deepEqual(league.unranked, []);

  // 홈의 지난 시즌 줄도 원장에서.
  const home = buildCrewHomePayload(store, store.users[0], kst('2026-11-04T00:00:00'));
  assert.deepEqual(home.lastSeason, { seasonKey: '2026-10', label: '10월 시즌', champions: [{ crewId: 'c1', name: '새벽' }] });
});

test('우승 없음: 0km 크루(순위 밖) · 뛴 멤버 3명 미만인 1위', () => {
  const zeroStore = buildStore({
    crews: [crew('c1', '새벽')],
    members: threeVeterans('c1', ['u1', 'u2', 'u3']),
  });
  const zeroStandings = buildCrewSeasonStandings(zeroStore, '2026-10', ms('2026-10-20T12:00:00'));
  assert.equal(zeroStandings.rowByCrewId.get('c1').unrankedReason, 'no_distance');
  sweepCrewSeasons(zeroStore, kst('2026-11-03T00:00:00'));
  const zeroAward = zeroStore.crewSeasonAwards.find((award) => award.seasonKey === '2026-10');
  assert.deepEqual(zeroAward.champions, []);
  assert.equal(zeroAward.rankedCount, 0);

  const fewRunnersStore = buildStore({
    crews: [crew('c1', '새벽'), crew('c2', '노을', { captainUserId: 'u4' })],
    members: [...threeVeterans('c1', ['u1', 'u2', 'u3']), ...threeVeterans('c2', ['u4', 'u5', 'u6'])],
    runs: [
      run('u1', 20, '2026-10-12T08:00:00'),
      run('u2', 20, '2026-10-12T08:00:00'), // u3은 0km → R = 2
      ...['u4', 'u5', 'u6'].map((userId) => run(userId, 5, '2026-10-12T08:00:00')),
    ],
  });
  const standings = buildCrewSeasonStandings(fewRunnersStore, '2026-10', ms('2026-10-20T12:00:00'));
  assert.equal(standings.rowByCrewId.get('c1').rank, 1);
  assert.equal(standings.rowByCrewId.get('c1').runnerCount, 2);
  sweepCrewSeasons(fewRunnersStore, kst('2026-11-03T00:00:00'));
  const award = fewRunnersStore.crewSeasonAwards.find((entry) => entry.seasonKey === '2026-10');
  assert.deepEqual(award.champions, []); // 2위 노을은 1위가 아니라 우승이 아니다.
  assert.equal(buildCrewStarCounts(fewRunnersStore).size, 0);
});

test('프리시즌 봉인: 원장은 남지만 별·결과 알림이 없다', () => {
  const store = buildStore({
    crews: [crew('c1', '새벽')],
    members: threeVeterans('c1', ['u1', 'u2', 'u3']),
    runs: ['u1', 'u2', 'u3'].map((userId) => run(userId, 10, '2026-09-20T08:00:00')),
  });

  assert.equal(hasUnsealedCrewSeason(store, kst('2026-10-02T23:59:00')), false);
  assert.equal(hasUnsealedCrewSeason(store, kst('2026-10-03T00:00:00')), true);
  sweepCrewSeasons(store, kst('2026-10-03T00:00:00'));

  const [award] = store.crewSeasonAwards;
  assert.equal(award.seasonKey, '2026-09');
  assert.equal(award.isPreseason, true);
  assert.deepEqual(award.champions, []);
  assert.deepEqual(award.top.map((row) => [row.crewId, row.rank]), [['c1', 1]]);
  assert.equal(award.avgKm, 10);
  assert.equal(buildCrewStarCounts(store).size, 0);
  assert.equal(store.notifications.length, 0);

  // 10월 P는 프리시즌 봉인값(10)으로 고정된다.
  assert.equal(resolveCrewSeasonPriorKm(store, '2026-10'), 10);
});

test('순위 밖 사유와 시즌 중에 닫힌 크루', () => {
  const store = buildStore({
    crews: [
      crew('c1', '둘뿐'),
      crew('c2', '닫힘', { closedAt: iso('2026-10-10T12:00:00') }),
    ],
    members: [
      member('c1', 'u1', { role: 'captain' }),
      member('c1', 'u2'),
      member('c2', 'u3', { leftAt: '2026-10-10T12:00:00' }),
    ],
    runs: [run('u1', 5, '2026-10-02T08:00:00'), run('u3', 50, '2026-10-02T08:00:00')],
  });

  const standings = buildCrewSeasonStandings(store, '2026-10', ms('2026-10-20T12:00:00'));
  assert.equal(standings.rowByCrewId.get('c1').unrankedReason, 'too_few_members');
  assert.equal(standings.rowByCrewId.has('c2'), false);
  assert.equal(standings.rankedCount, 0);
});
