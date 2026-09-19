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
import {
  CREW_FIRST_SEASON_KEY,
  CREW_FIRST_STAR_SEASON_KEY,
  CREW_PRESEASON_LAST_KEY,
} from './crewConstants.mjs';
import { nextKstMidnightMs } from '../competitionWindow.mjs';
import { nextMonthKey } from '../monthlyRankingStars.mjs';

// 크루대전 시즌 점수·봉인: 시계는 전부 주입한다(KST 경계 포함). 스펙 v1 (오너 2026-09-18).
// 9·10월은 프리시즌(별·7일 규칙 없음) — 정규 규칙은 첫 별 시즌인 11월로 시험한다.
// 11월 시즌 = [2026-11-01 0시 KST, 2026-12-01 0시 KST), 봉인 = 12/1 1시 KST, 결과 알림 = 12/1 9시 KST.

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
// 기본값은 9/10 가입 → 9/11 0시부터 인정 = 10·11월 시즌의 '기존 멤버'.
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

test('하루 상한 없음 + 가져온 기록도 인정 + 겹친 기록은 가장 긴 것 하나(동률은 먼저 저장된 것) (오너 2026-09-18)', () => {
  const store = buildStore({
    crews: [crew('c1', '새벽')],
    members: threeVeterans('c1', ['u1', 'u2', 'u3']),
    runs: [
      // 10/2: 30 + 25 = 55 — 하루 상한이 없어 그대로 55
      run('u1', 30, '2026-10-02T09:30:00', { minutes: 150 }),
      run('u1', 25, '2026-10-02T18:00:00', { minutes: 120 }),
      // 10/3: 10:00~11:00 10km와 10:30~11:30 12km가 겹친다 → 12km만
      run('u1', 10, '2026-10-03T11:00:00', { started: '2026-10-03T10:00:00' }),
      run('u1', 12, '2026-10-03T11:30:00', { started: '2026-10-03T10:30:00' }),
      // 10/4: 같은 8km가 겹친다 → 먼저 저장된 쪽(14:51) 하나
      run('u1', 8, '2026-10-04T15:00:00', { started: '2026-10-04T14:00:00', created: '2026-10-04T15:01:00' }),
      run('u1', 8, '2026-10-04T14:50:00', { started: '2026-10-04T14:10:00', created: '2026-10-04T14:51:00' }),
      // 인정: 헬스 앱·연동 앱에서 가져온 기록
      run('u1', 20, '2026-10-05T09:00:00', { sourceType: 'apple_health' }),
      run('u1', 6, '2026-10-05T19:00:00', { sourceType: 'strava' }),
      // 같은 러닝이 앱 기록 + 헬스 앱 사본으로 두 번 → 먼저 저장된 앱 기록 하나
      run('u1', 10, '2026-10-09T08:00:00', { started: '2026-10-09T07:00:00', created: '2026-10-09T08:01:00' }),
      run('u1', 10, '2026-10-09T08:00:00', {
        started: '2026-10-09T07:00:00', created: '2026-10-09T08:30:00', sourceType: 'health_connect',
      }),
      // 제외: 손으로 적은 기록, 출처 없는 기록, 차량 판정, 창+1h 밖에 저장된 기록
      run('u1', 15, '2026-10-06T07:00:00', { sourceType: 'manual' }),
      run('u1', 4, '2026-10-06T08:00:00', { sourceType: null }),
      run('u1', 30, '2026-10-06T09:00:00', { verdict: 'vehicle' }),
      run('u1', 9, '2026-10-07T09:00:00', { created: '2026-11-01T01:00:00' }),
      // 인정: 창+1h 안(11/1 0시 59분)에 늦게 저장된 10월 기록, 매치 기록(matchResult)
      run('u1', 7, '2026-10-31T23:30:00', { created: '2026-11-01T00:59:00' }),
      run('u1', 3, '2026-10-08T09:00:00', { sourceType: null, matchResult: { mode: 'duel' } }),
    ],
  });

  const standings = buildCrewSeasonStandings(store, '2026-10', ms('2026-11-01T00:59:30'));
  assert.equal(standings.memberStats.get('c1|u1').contributionKm, 55 + 12 + 8 + 20 + 6 + 10 + 7 + 3);
});

test('달 끝 자정을 사이에 둔 같은 러닝의 앱 기록 + 가져온 사본은 앞 시즌 하나로만 센다 (양방향)', () => {
  // ① 앱 기록이 11/1 0시 넘어 끝나고, 워치 사본(쉬는 시간 뺀 끝 시각)이 10/31에 끝난 경우.
  const watchFirst = buildStore({
    crews: [crew('c1', '새벽')],
    members: threeVeterans('c1', ['u1', 'u2', 'u3']),
    runs: [
      run('u1', 20.5, '2026-11-01T00:00:10', { started: '2026-10-31T22:00:00' }),
      run('u1', 21.4, '2026-10-31T23:59:50', {
        started: '2026-10-31T22:00:00', created: '2026-11-01T00:30:00', sourceType: 'apple_health',
      }),
    ],
  });
  const octoberA = buildCrewSeasonStandings(watchFirst, '2026-10', ms('2026-11-01T00:40:00'));
  const novemberA = buildCrewSeasonStandings(watchFirst, '2026-11', ms('2026-11-01T00:40:00'));
  assert.equal(octoberA.memberStats.get('c1|u1').contributionKm, 21.4);
  assert.equal(novemberA.memberStats.get('c1|u1').contributionKm, 0);

  // ② 앱 기록이 10/31에 끝나고, 워치 사본이 11/1 0시 넘어 끝나 다음 날 아침에 가져온 경우.
  const appFirst = buildStore({
    crews: [crew('c1', '새벽')],
    members: threeVeterans('c1', ['u1', 'u2', 'u3']),
    runs: [
      run('u1', 20.5, '2026-10-31T23:59:50', { started: '2026-10-31T22:00:00' }),
      run('u1', 21.4, '2026-11-01T00:00:20', {
        started: '2026-10-31T22:00:00', created: '2026-11-01T08:00:00', sourceType: 'health_connect',
      }),
      // 11월에 따로 뛴 기록은 그대로 센다.
      run('u1', 5, '2026-11-01T08:30:00'),
    ],
  });
  const octoberB = buildCrewSeasonStandings(appFirst, '2026-10', ms('2026-11-01T09:00:00'));
  const novemberB = buildCrewSeasonStandings(appFirst, '2026-11', ms('2026-11-01T09:00:00'));
  assert.equal(octoberB.memberStats.get('c1|u1').contributionKm, 20.5);
  assert.equal(novemberB.memberStats.get('c1|u1').contributionKm, 5);

  // 사본 없이 자정을 넘긴 러닝 하나는 끝난 달(11월)에 그대로 들어간다.
  const single = buildStore({
    crews: [crew('c1', '새벽')],
    members: threeVeterans('c1', ['u1', 'u2', 'u3']),
    runs: [run('u1', 12, '2026-11-01T00:30:00', { started: '2026-10-31T23:20:00' })],
  });
  assert.equal(buildCrewSeasonStandings(single, '2026-11', ms('2026-11-02T00:00:00')).memberStats.get('c1|u1').contributionKm, 12);
});

test('끝난 시각이 없는 가져온 기록은 세지 않는다 — 동기화 시각으로 끌려와 진짜 기록을 지우지 않게', () => {
  const store = buildStore({
    crews: [crew('c1', '새벽')],
    members: [...threeVeterans('c1', ['u1', 'u2']), member('c1', 'u4', { joined: '2026-09-20T12:00:00' })],
    runs: [
      run('u4', 10, '2026-09-20T19:00:00', { started: '2026-09-20T18:00:00' }),
      // 9/10(가입 전) 워크아웃, endedAt 없이 9/21에 동기화.
      { ...run('u4', 12, '2026-09-10T08:00:00', {
        started: '2026-09-10T07:00:00', created: '2026-09-21T09:00:00', sourceType: 'apple_health',
      }), endedAt: undefined },
    ],
  });

  const standings = buildCrewSeasonStandings(store, '2026-09', ms('2026-09-22T12:00:00'));
  assert.equal(standings.memberStats.get('c1|u4').contributionKm, 10);
});

test('7일 규칙: 이번 달 신입은 7일 뒤 합류(기여는 추적), 첫 7일 안에 나간 기존 멤버는 빠진다', () => {
  const store = buildStore({
    crews: [crew('c1', '새벽'), crew('c2', '노을', { captainUserId: 'u5' })],
    members: [
      member('c1', 'u1', { role: 'captain' }),
      member('c1', 'u2'),
      // 11/9 가입 → 11/10 0시 인정 → 11/17 0시 합류
      member('c1', 'u3', { joined: '2026-11-09T12:00:00' }),
      // c2: u4는 11/5에 나감(첫 7일 안) → 제외, u8은 11/9에 나감(7일 뒤) → 포함
      member('c2', 'u4', { leftAt: '2026-11-05T12:00:00' }),
      member('c2', 'u5', { role: 'captain' }),
      member('c2', 'u6'),
      member('c2', 'u8', { leftAt: '2026-11-09T12:00:00' }),
    ],
    runs: [
      run('u1', 10, '2026-11-03T08:00:00'),
      run('u3', 7, '2026-11-11T08:00:00'),
      run('u4', 10, '2026-11-02T08:00:00'),
      run('u5', 5, '2026-11-02T08:00:00'),
      run('u6', 5, '2026-11-02T08:00:00'),
      run('u8', 6, '2026-11-03T08:00:00'),
      run('u8', 4, '2026-11-12T08:00:00'), // 나간 뒤 — 창 밖
    ],
  });

  const early = buildCrewSeasonStandings(store, '2026-11', ms('2026-11-15T12:00:00'));
  const earlyC1 = early.rowByCrewId.get('c1');
  assert.equal(earlyC1.seasonMemberCount, 2);
  assert.equal(earlyC1.totalKm, 10);
  assert.equal(earlyC1.rank, null);
  assert.equal(earlyC1.unrankedReason, 'newcomers_pending');
  assert.deepEqual(early.memberStats.get('c1|u3'), {
    contributionKm: 7,
    isSeasonMember: false,
    countedFromMs: ms('2026-11-17T00:00:00'),
  });

  const home = buildCrewHomePayload(store, store.users[0], kst('2026-11-15T12:00:00'));
  const newcomer = home.myCrew.members.find((row) => row.userId === 'u3');
  assert.equal(newcomer.countedFrom, iso('2026-11-17T00:00:00'));
  assert.equal(newcomer.countsFrom, iso('2026-11-10T00:00:00'));
  assert.equal(newcomer.contributionKm, 7);
  assert.equal(home.myCrew.members.find((row) => row.userId === 'u1').countedFrom, null);

  const c2 = early.rowByCrewId.get('c2');
  assert.equal(c2.seasonMemberCount, 3); // u5, u6, u8
  assert.equal(c2.totalKm, 16); // u4의 10km 제외, u8은 나가기 전 6km만
  assert.equal(early.memberStats.get('c2|u4').isSeasonMember, false);

  // 정확히 7일이 되는 순간(11/17 0시)부터 인원수와 총거리에 들어간다.
  const joined = buildCrewSeasonStandings(store, '2026-11', ms('2026-11-17T00:00:00'));
  assert.equal(joined.rowByCrewId.get('c1').seasonMemberCount, 3);
  assert.equal(joined.rowByCrewId.get('c1').totalKm, 17);
  assert.equal(joined.rowByCrewId.get('c1').rank, 1);
});

test('프리시즌은 7일 규칙을 끄고, 가입한 순간부터 멤버 — \'다음 날 0시\'로 저장된 옛 행도 같다', () => {
  const store = buildStore({
    crews: [crew('c1', '새벽')],
    members: [
      member('c1', 'u1', { joined: '2026-09-20T12:00:00', role: 'captain' }),
      member('c1', 'u2', { joined: '2026-09-20T13:00:00' }),
      member('c1', 'u3', { joined: '2026-09-20T14:00:00' }),
      // 오늘 10시 가입 — 이 헬퍼는 countsFrom을 옛 규칙(내일 0시)으로 저장하지만 프리시즌 판정은
      // 가입 순간부터 센다. 11시에 뛴 기록이 바로 들어간다.
      member('c1', 'u4', { joined: '2026-09-22T10:00:00' }),
    ],
    runs: [
      run('u1', 5, '2026-09-21T08:00:00'),
      run('u2', 5, '2026-09-21T08:00:00'),
      run('u4', 3, '2026-09-22T09:30:00'), // 가입 전 — 안 센다
      run('u4', 4, '2026-09-22T11:00:00'),
    ],
  });

  const standings = buildCrewSeasonStandings(store, '2026-09', ms('2026-09-22T12:00:00'));
  const row = standings.rowByCrewId.get('c1');
  assert.equal(standings.isPreseason, true);
  assert.equal(row.seasonMemberCount, 4);
  assert.equal(row.totalKm, 14);
  assert.equal(row.rank, 1);

  const home = buildCrewHomePayload(store, store.users[0], kst('2026-09-22T12:00:00'));
  const newcomer = home.myCrew.members.find((entry) => entry.userId === 'u4');
  assert.equal(newcomer.countedFrom, null);
  assert.equal(newcomer.countsFrom, iso('2026-09-22T10:00:00'));
  assert.equal(newcomer.contributionKm, 4);
  assert.equal(home.season.label, '9월 프리시즌');
  assert.equal(home.season.isPreseason, true);
  assert.equal(home.season.daysLeft, 9);
});

test('점수 = 인당 km = T / N (오너 2026-09-19 단순화) · P는 점수에 안 들어가고 시즌 응답에만 남는다', () => {
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
  assert.equal(row.score, 110); // 330km ÷ 3명 — 예전 보정식이면 (330 + 200) ÷ 8 = 66.25

  // 시즌 정보의 priorKm도 같은 고정값이다.
  const info = buildCrewSeasonInfo(store, '2026-11', kst('2026-11-20T12:00:00'));
  assert.equal(info.priorKm, 40);
  assert.equal(info.status, 'live');
  assert.equal(info.daysLeft, 11);

  // 봉인 원장의 avgKm가 0(아무도 안 뛴 달)이면 기본값 — 0 쪽으로 누르는 보정 역전 방지.
  store.crewSeasonAwards.push({ seasonKey: '2026-11', avgKm: 0, champions: [], top: [] });
  assert.equal(resolveCrewSeasonPriorKm(store, '2026-12', ms('2026-12-20T12:00:00')), 30);
});

test('시즌 첫 1시간(직전 시즌 집계 중)에도 P는 봉인될 값 그대로 — 1일 1시 봉인 때 점수가 뛰지 않는다', () => {
  const store = buildStore({
    crews: [crew('c1', '새벽'), crew('c2', '노을', { captainUserId: 'u4' })],
    members: [...threeVeterans('c1', ['u1', 'u2', 'u3']), ...threeVeterans('c2', ['u4', 'u5', 'u6'])],
    runs: [
      // 9월 프리시즌: 120 + 30 = 150km / 6명 → avgKm 25 (기본값 30과 다르게 골랐다).
      ...['u1', 'u2', 'u3'].map((userId) => run(userId, 40, '2026-09-20T08:00:00')),
      ...['u4', 'u5', 'u6'].map((userId) => run(userId, 10, '2026-09-20T08:00:00')),
      run('u1', 10, '2026-10-01T00:20:00'),
      run('u4', 12, '2026-10-01T00:25:00'),
    ],
  });

  const tallying = kst('2026-10-01T00:30:00');
  assert.equal(hasUnsealedCrewSeason(store, tallying), false); // 9월 봉인은 10/1 1시
  const before = buildCrewSeasonStandings(store, '2026-10', tallying.getTime());
  assert.equal(before.priorKm, 25);
  assert.equal(buildCrewSeasonInfo(store, '2026-10', tallying).priorKm, 25);
  assert.equal(buildCrewHomePayload(store, store.users[0], tallying).season.priorKm, 25);

  const sealNow = kst('2026-10-01T01:00:01');
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
      // u3: 11/1 가입(11/2 0시 인정) → 11/5 12:00 나감(3.5일 쌓임) → 11/6 다시 가입(11/7 0시 인정)
      // → 남은 3.5일 → 11/10 12:00 합류. countsFrom + 7일로 풀면 11/14로 늦게 찍힌다.
      member('c1', 'u3', { joined: '2026-11-01T10:00:00', leftAt: '2026-11-05T12:00:00' }),
      member('c1', 'u3', { joined: '2026-11-06T10:00:00' }),
    ],
    runs: [run('u1', 5, '2026-11-02T08:00:00')],
  });

  const home = buildCrewHomePayload(store, store.users[0], kst('2026-11-08T12:00:00'));
  const rejoined = home.myCrew.members.find((row) => row.userId === 'u3');
  assert.equal(rejoined.countedFrom, iso('2026-11-10T12:00:00'));
  assert.equal(rejoined.countsFrom, iso('2026-11-07T00:00:00'));
  assert.equal(home.myCrew.standing.unrankedReason, 'newcomers_pending');

  const justBefore = buildCrewSeasonStandings(store, '2026-11', ms('2026-11-10T12:00:00') - 1);
  assert.equal(justBefore.memberStats.get('c1|u3').isSeasonMember, false);
  const atMoment = buildCrewSeasonStandings(store, '2026-11', ms('2026-11-10T12:00:00'));
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
      ...['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map((userId) => run(userId, 20, '2026-11-12T08:00:00')),
      ...['u7', 'u8', 'u9'].map((userId) => run(userId, 10, '2026-11-12T08:00:00')),
    ],
  });

  const live = buildCrewSeasonStandings(store, '2026-11', ms('2026-11-20T12:00:00'));
  assert.deepEqual(live.rows.map((row) => [row.crewId, row.rank]), [['c1', 1], ['c2', 1], ['c3', 3]]);

  // 10/1 0시 59분엔 아직 봉인할 시즌이 없다. 12/1 0시 59분엔 9·10월 프리시즌이 이미 대상이고,
  // 11월은 12/1 1시부터(달 끝 + 1시간).
  assert.equal(hasUnsealedCrewSeason(store, kst('2026-10-01T00:59:00')), false);
  assert.equal(hasUnsealedCrewSeason(store, kst('2026-12-01T00:59:00')), true);
  const sealNow = kst('2026-12-01T01:00:00');
  const created = sweepCrewSeasons(store, sealNow);
  assert.deepEqual(created.map((award) => award.seasonKey), ['2026-09', '2026-10', '2026-11']);

  const november = store.crewSeasonAwards.find((award) => award.seasonKey === '2026-11');
  assert.equal(november.isPreseason, false);
  assert.equal(november.ruleVersion, 3);
  assert.equal(november.priorKm, 30); // 10월 avgKm = 0 → 기본값
  assert.equal(november.rankedCount, 3);
  assert.deepEqual(november.champions.map((champion) => champion.crewId).sort(), ['c1', 'c2']);
  assert.deepEqual(november.champions.find((champion) => champion.crewId === 'c1').memberUserIds.sort(), ['u1', 'u2', 'u3']);
  assert.deepEqual(november.top.map((row) => [row.crewId, row.rank, row.totalKm, row.memberCount]), [
    ['c1', 1, 60, 3], ['c2', 1, 60, 3], ['c3', 3, 30, 3],
  ]);

  const stars = buildCrewStarCounts(store);
  assert.equal(stars.get('c1'), 1);
  assert.equal(stars.get('c2'), 1);
  assert.equal(stars.get('c3') ?? 0, 0);

  // 결과 알림은 새벽 1시 봉인이 아니라 아침 9시(KST)에 — 그때까진 받을 사람만 원장에 적어 둔다.
  const resultCount = () => store.notifications.filter((item) => item.type === 'crew_season_result').length;
  assert.equal(resultCount(), 0);
  assert.equal(november.pendingResultNotices.length, 3);
  assert.equal(store.crewSeasonAwards.find((award) => award.seasonKey === '2026-10').pendingResultNotices, undefined);
  sweepCrewSeasons(store, kst('2026-12-01T08:59:00'));
  assert.equal(resultCount(), 0);

  // 봉인 뒤 아침 전에 탈퇴한 u9는 건너뛴다. 순위권 크루의 시즌 멤버에게 1통씩(9·10월 프리시즌은 없음).
  store.users = store.users.filter((user) => user.id !== 'u9');
  const morning = kst('2026-12-01T09:00:00');
  assert.deepEqual(sweepCrewSeasons(store, morning), []);
  const results = store.notifications.filter((item) => item.type === 'crew_season_result');
  assert.equal(results.length, 8);
  assert.equal(results.find((item) => item.userId === 'u1').body, '11월 크루대전 우승: 새벽 ★');
  assert.equal(results.find((item) => item.userId === 'u7').body, '11월 크루대전 결과: 한강 3위 / 3크루');
  assert.equal(results[0].createdAt, morning.toISOString());
  assert.equal(november.pendingResultNotices, undefined);
  assert.equal(november.resultsNotifiedAt, morning.toISOString());

  // 멱등: 다시 쓸어도 원장·알림이 그대로.
  assert.equal(hasUnsealedCrewSeason(store, sealNow), false);
  assert.deepEqual(sweepCrewSeasons(store, kst('2026-12-01T09:05:00')), []);
  assert.equal(store.crewSeasonAwards.length, 3);
  assert.equal(resultCount(), 8);
});

test('서버가 아침까지 멈춰 있었으면 봉인과 결과 알림이 같은 스윕에서 나간다', () => {
  const store = buildStore({
    crews: [crew('c1', '새벽')],
    members: threeVeterans('c1', ['u1', 'u2', 'u3']),
    runs: ['u1', 'u2', 'u3'].map((userId) => run(userId, 10, '2026-11-12T08:00:00')),
  });

  sweepCrewSeasons(store, kst('2026-12-01T10:30:00'));
  const november = store.crewSeasonAwards.find((award) => award.seasonKey === '2026-11');
  assert.equal(november.pendingResultNotices, undefined);
  assert.equal(store.notifications.filter((item) => item.type === 'crew_season_result').length, 3);
});

test('프리시즌 달력 상수는 서로 맞물린다 — 첫 별 시즌 = 프리시즌 마지막 달의 다음 달', () => {
  // 기간을 또 옮길 때 LAST만 바꾸고 FIRST_STAR를 잊으면 '별은 N월부터' 문구와 실제 별이 어긋난다.
  assert.equal(nextMonthKey(CREW_PRESEASON_LAST_KEY), CREW_FIRST_STAR_SEASON_KEY);
  assert.ok(CREW_FIRST_SEASON_KEY <= CREW_PRESEASON_LAST_KEY);
});

test('프리시즌은 9·10월 (오너 2026-09-18 연장): 10월 1위는 별·알림 없이 봉인, 7일 규칙도 꺼짐, 11월이 첫 별 시즌', () => {
  const store = buildStore({
    crews: [crew('c1', '새벽'), crew('c2', '노을', { captainUserId: 'u4' })],
    members: [
      ...threeVeterans('c1', ['u1', 'u2', 'u3']),
      ...threeVeterans('c2', ['u4', 'u5', 'u6']),
      // 10/20 12시 가입 → 프리시즌이라 그 순간부터 인정·바로 멤버(정규 시즌이면 10/21 0시 인정, 10/28 합류).
      member('c1', 'u7', { joined: '2026-10-20T12:00:00' }),
    ],
    runs: [
      ...['u1', 'u2', 'u3'].map((userId) => run(userId, 20, '2026-10-12T08:00:00')),
      ...['u4', 'u5', 'u6'].map((userId) => run(userId, 10, '2026-10-12T08:00:00')),
      run('u7', 5, '2026-10-22T08:00:00'),
    ],
  });

  const october = buildCrewSeasonStandings(store, '2026-10', ms('2026-10-22T12:00:00'));
  assert.equal(october.isPreseason, true);
  assert.equal(october.memberStats.get('c1|u7').isSeasonMember, true);
  assert.equal(october.rowByCrewId.get('c1').seasonMemberCount, 4);
  assert.equal(october.rowByCrewId.get('c1').rank, 1);
  assert.equal(october.rowByCrewId.get('c1').runnerCount, 4); // 정규 시즌이면 별 자격(R ≥ 3)

  // 시즌 정보: 첫 시즌은 9월뿐, 별은 11월부터 — 앱은 이 두 값으로 문구를 쓴다.
  const septemberInfo = buildCrewSeasonInfo(store, '2026-09', kst('2026-09-22T12:00:00'));
  assert.equal(septemberInfo.label, '9월 프리시즌');
  assert.equal(septemberInfo.isFirstSeason, true);
  assert.equal(septemberInfo.firstStarSeasonKey, '2026-11');
  const octoberInfo = buildCrewSeasonInfo(store, '2026-10', kst('2026-10-22T12:00:00'));
  assert.equal(octoberInfo.label, '10월 프리시즌');
  assert.equal(octoberInfo.isPreseason, true);
  assert.equal(octoberInfo.isFirstSeason, false);
  assert.equal(octoberInfo.firstStarSeasonKey, '2026-11');
  const novemberInfo = buildCrewSeasonInfo(store, '2026-11', kst('2026-11-05T12:00:00'));
  assert.equal(novemberInfo.label, '11월 시즌');
  assert.equal(novemberInfo.isPreseason, false);
  assert.equal(novemberInfo.isFirstSeason, false);

  const created = sweepCrewSeasons(store, kst('2026-11-03T00:00:00'));
  assert.deepEqual(created.map((award) => award.seasonKey), ['2026-09', '2026-10']);
  const octoberAward = store.crewSeasonAwards.find((award) => award.seasonKey === '2026-10');
  assert.equal(octoberAward.isPreseason, true);
  assert.deepEqual(octoberAward.champions, []);
  assert.deepEqual(octoberAward.top.map((row) => [row.crewId, row.rank]), [['c1', 1], ['c2', 2]]);
  assert.equal(buildCrewStarCounts(store).size, 0);
  assert.equal(store.notifications.filter((item) => item.type === 'crew_season_result').length, 0);

  // 11월(첫 별 시즌)의 고정 P는 10월 프리시즌 봉인 avgKm: (65 + 30) / 7명.
  assert.equal(octoberAward.avgKm, Math.round((95 / 7) * 100) / 100);
  assert.equal(resolveCrewSeasonPriorKm(store, '2026-11'), octoberAward.avgKm);
});

test('봉인된 시즌은 스냅샷만 — 봉인 뒤 기록이 바뀌어도 다시 계산하지 않는다', () => {
  const store = buildStore({
    crews: [crew('c1', '새벽'), crew('c3', '한강', { captainUserId: 'u7' })],
    members: [...threeVeterans('c1', ['u1', 'u2', 'u3']), ...threeVeterans('c3', ['u7', 'u8', 'u9'])],
    runs: [
      ...['u1', 'u2', 'u3'].map((userId) => run(userId, 20, '2026-11-12T08:00:00')),
      ...['u7', 'u8', 'u9'].map((userId) => run(userId, 10, '2026-11-12T08:00:00')),
    ],
  });
  sweepCrewSeasons(store, kst('2026-12-03T00:00:00'));

  // 봉인 뒤에 11월 기록이 생겼다(창 안 저장으로 위장된 늦은 기록) — 라이브 계산이라면 한강이 1위.
  store.runs.push(run('u7', 100, '2026-11-20T08:00:00', { minutes: 600, created: '2026-11-20T08:01:00' }));
  const recomputed = buildCrewSeasonStandings(store, '2026-11', ms('2026-12-04T00:00:00'));
  assert.equal(recomputed.rows[0].crewId, 'c3');

  const league = buildCrewLeaguePayload(store, store.users[0], '2026-11', kst('2026-12-04T00:00:00'));
  assert.equal(league.sealed, true);
  assert.equal(league.season.status, 'sealed');
  assert.equal(league.season.daysLeft, 0);
  assert.equal(league.season.label, '11월 시즌');
  assert.deepEqual(league.ranked.map((row) => [row.crewId, row.rank, row.totalKm]), [['c1', 1, 60], ['c3', 2, 30]]);
  assert.equal(league.ranked[0].stars, 1);
  assert.equal(league.ranked[0].isMine, true);
  assert.equal(league.ranked[0].runnerCount, 3);
  assert.deepEqual(league.unranked, []);

  // 홈의 지난 시즌 줄도 원장에서.
  const home = buildCrewHomePayload(store, store.users[0], kst('2026-12-04T00:00:00'));
  assert.deepEqual(home.lastSeason, { seasonKey: '2026-11', label: '11월 시즌', champions: [{ crewId: 'c1', name: '새벽' }] });
});

test('우승 없음: 0km 크루(순위 밖) · 뛴 멤버 3명 미만인 1위', () => {
  const zeroStore = buildStore({
    crews: [crew('c1', '새벽')],
    members: threeVeterans('c1', ['u1', 'u2', 'u3']),
  });
  const zeroStandings = buildCrewSeasonStandings(zeroStore, '2026-11', ms('2026-11-20T12:00:00'));
  assert.equal(zeroStandings.rowByCrewId.get('c1').unrankedReason, 'no_distance');
  sweepCrewSeasons(zeroStore, kst('2026-12-03T00:00:00'));
  const zeroAward = zeroStore.crewSeasonAwards.find((award) => award.seasonKey === '2026-11');
  assert.deepEqual(zeroAward.champions, []);
  assert.equal(zeroAward.rankedCount, 0);

  const fewRunnersStore = buildStore({
    crews: [crew('c1', '새벽'), crew('c2', '노을', { captainUserId: 'u4' })],
    members: [...threeVeterans('c1', ['u1', 'u2', 'u3']), ...threeVeterans('c2', ['u4', 'u5', 'u6'])],
    runs: [
      run('u1', 20, '2026-11-12T08:00:00'),
      run('u2', 20, '2026-11-12T08:00:00'), // u3은 0km → R = 2
      ...['u4', 'u5', 'u6'].map((userId) => run(userId, 5, '2026-11-12T08:00:00')),
    ],
  });
  const standings = buildCrewSeasonStandings(fewRunnersStore, '2026-11', ms('2026-11-20T12:00:00'));
  assert.equal(standings.rowByCrewId.get('c1').rank, 1);
  assert.equal(standings.rowByCrewId.get('c1').runnerCount, 2);
  sweepCrewSeasons(fewRunnersStore, kst('2026-12-03T00:00:00'));
  const award = fewRunnersStore.crewSeasonAwards.find((entry) => entry.seasonKey === '2026-11');
  assert.deepEqual(award.champions, []); // 2위 노을은 1위가 아니라 우승이 아니다.
  assert.equal(buildCrewStarCounts(fewRunnersStore).size, 0);
});

test('프리시즌 봉인: 원장은 남지만 별·결과 알림이 없다', () => {
  const store = buildStore({
    crews: [crew('c1', '새벽')],
    members: threeVeterans('c1', ['u1', 'u2', 'u3']),
    runs: ['u1', 'u2', 'u3'].map((userId) => run(userId, 10, '2026-09-20T08:00:00')),
  });

  assert.equal(hasUnsealedCrewSeason(store, kst('2026-10-01T00:59:59')), false);
  assert.equal(hasUnsealedCrewSeason(store, kst('2026-10-01T01:00:00')), true);
  sweepCrewSeasons(store, kst('2026-10-01T01:00:00'));

  const [award] = store.crewSeasonAwards;
  assert.equal(award.seasonKey, '2026-09');
  assert.equal(award.isPreseason, true);
  assert.deepEqual(award.champions, []);
  assert.equal(award.pendingResultNotices, undefined);
  sweepCrewSeasons(store, kst('2026-10-01T09:00:00'));
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
      crew('c2', '닫힘', { closedAt: iso('2026-11-10T12:00:00') }),
    ],
    members: [
      member('c1', 'u1', { role: 'captain' }),
      member('c1', 'u2'),
      member('c2', 'u3', { leftAt: '2026-11-10T12:00:00' }),
    ],
    runs: [run('u1', 5, '2026-11-02T08:00:00'), run('u3', 50, '2026-11-02T08:00:00')],
  });

  const standings = buildCrewSeasonStandings(store, '2026-11', ms('2026-11-20T12:00:00'));
  assert.equal(standings.rowByCrewId.get('c1').unrankedReason, 'too_few_members');
  assert.equal(standings.rowByCrewId.has('c2'), false);
  assert.equal(standings.rankedCount, 0);
});

test('어제보다 순위 ▲▼: previousRank = 오늘 0시(KST) 순위 — 그때 저장된 기록만 (오너 2026-09-19)', () => {
  const store = buildStore({
    crews: [crew('c1', '새벽'), crew('c2', '노을', { captainUserId: 'u4' }), crew('c3', '한강', { captainUserId: 'u7' })],
    members: [
      ...threeVeterans('c1', ['u1', 'u2', 'u3']),
      ...threeVeterans('c2', ['u4', 'u5', 'u6']),
      ...threeVeterans('c3', ['u7', 'u8', 'u9']),
    ],
    runs: [
      // 11/14까지: 새벽 > 노을 > 한강
      ...['u1', 'u2', 'u3'].map((userId) => run(userId, 30, '2026-11-10T08:00:00')),
      ...['u4', 'u5', 'u6'].map((userId) => run(userId, 20, '2026-11-10T08:00:00')),
      ...['u7', 'u8', 'u9'].map((userId) => run(userId, 10, '2026-11-10T08:00:00')),
      // 어젯밤에 뛰었지만 오늘 0시 넘어 저장 — 어제 순위엔 없던 기록
      run('u4', 40, '2026-11-14T23:40:00', { created: '2026-11-15T00:20:00' }),
      // 오늘 한강이 크게 뛴다
      ...['u7', 'u8', 'u9'].map((userId) => run(userId, 30, '2026-11-15T07:00:00')),
    ],
  });

  const now = kst('2026-11-15T12:00:00');
  const home = buildCrewHomePayload(store, store.users[0], now);
  const byId = Object.fromEntries(home.top.map((row) => [row.crewId, [row.rank, row.previousRank]]));
  // 지금: 한강 40 > 노을 33.33 > 새벽 30 / 어제 0시: 새벽 30 > 노을 20 > 한강 10
  assert.deepEqual(byId, { c3: [1, 3], c2: [2, 2], c1: [3, 1] });
  assert.equal(home.myCrew.standing.previousRank, 1);

  const league = buildCrewLeaguePayload(store, store.users[0], undefined, now);
  assert.deepEqual(league.ranked.map((row) => [row.crewId, row.previousRank]), [['c3', 3], ['c2', 2], ['c1', 1]]);

  // 시즌 첫날(1일)엔 비교할 어제가 없다 — 순위에 올라도 전부 null.
  store.runs.push(...['u1', 'u2', 'u3'].map((userId) => run(userId, 5, '2026-12-01T08:00:00')));
  const firstDay = buildCrewHomePayload(store, store.users[0], kst('2026-12-01T12:00:00'));
  assert.equal(firstDay.top.length, 1);
  assert.deepEqual(firstDay.top.map((row) => [row.crewId, row.rank, row.previousRank]), [['c1', 1, null]]);
});

