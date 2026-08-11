import assert from 'node:assert/strict';
import test from 'node:test';

import {
  backFillSavedRunsWithVerifiedRoster,
  buildMatchResultByMatchId,
  resolveSavedDuelMatchResult,
  resolveSavedGroupMatchResult,
} from './matchResultBuilders.mjs';
import {
  addParticipantToMatchSession,
  createMatchSession,
} from './runningMatchSession/matchSessionLifecycle.mjs';
import {
  amendMatchRoster,
  ensureMatchRosters,
  findMatchRoster,
  isMatchRosterEpochMature,
  pruneMatchRosters,
  resetMatchRosterCapLogThrottle,
} from './matchRosters.mjs';
import {
  MATCH_BOOKING_WINDOW_DAYS,
  MATCH_ROSTER_LEGACY_GRACE_MS,
  MATCH_ROSTER_MAX_ENTRIES,
  MATCH_ROSTER_RETENTION_MS,
} from './matchConstants.mjs';

// 시계는 전부 주입/고정 — 이 구역의 판정은 시간에 의존하므로(로스터 만료, epoch 성숙) 실시간
// 시계를 쓰면 테스트가 결정적이지 않다.
const NOW = new Date('2026-08-11T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function at(offsetMs) {
  return new Date(NOW.getTime() + offsetMs);
}

function createStore() {
  return {
    users: [
      { id: 'victim', name: '피해자' },
      { id: 'rival', name: '진짜상대' },
      { id: 'attacker', name: '침입자' },
      { id: 'mate', name: '그룹동료' },
    ],
    runs: [],
    matchSessions: [],
    matchRosters: [],
  };
}

// 실제 생성 경로(createMatchSession)를 그대로 태워 로스터가 생기게 한 뒤, 세션만 지워
// "완주 10분 뒤 세션이 pruned된 정상 종료 상태"를 만든다. 로스터는 그 뒤에도 남아 있어야 한다.
function createPrunedMatch(store, { mode = 'duel', participantIds, distanceKm = 5, now = NOW } = {}) {
  const session = createMatchSession(
    store,
    mode,
    distanceKm,
    now.toISOString(),
    participantIds.map((id, index) => ({ id, seedRank: index + 1 })),
    { now },
  );
  store.matchSessions = [];
  return session.id;
}

function savedRun(userId, { matchId, mode = 'duel', durationSeconds, distanceKm, goalKm = 5, extra = {} }) {
  return {
    id: `run-${userId}-${matchId}`,
    userId,
    distanceKm,
    durationSeconds,
    createdAt: at(-60 * 1000).toISOString(),
    matchResult: {
      mode,
      matchId,
      comparedDistanceKm: goalKm,
      myDurationSeconds: durationSeconds,
      myPaceLabel: '05:00/km',
      ...extra,
    },
  };
}

function duelBlob(matchId, durationSeconds, extra = {}) {
  return {
    mode: 'duel',
    matchId,
    comparedDistanceKm: 5,
    myDurationSeconds: durationSeconds,
    myPaceLabel: '05:00/km',
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// 로스터 게이트 — 듀얼
// ---------------------------------------------------------------------------

test('DUEL: a forged run carrying the victim\'s matchId can no longer decide the victim\'s verdict', () => {
  // 재현 케이스 1 (2026-08-09 적대 검증). 세션이 pruned된 뒤(정상 종료 10분 후) 제3자가 피해자의
  // matchId로 기록 하나를 올리면, 피해자 본인의 늦은 저장(저장 대기열 드레인/네이티브 배달)이
  // 그 침입자를 상대로 해소돼 'lose'가 영구히 박제됐다 — 확정 판정이라 never-downgrade 가드가
  // 복구까지 막았다.
  const store = createStore();
  const matchId = createPrunedMatch(store, { participantIds: ['victim', 'rival'] });

  store.runs.push(savedRun('attacker', { matchId, durationSeconds: 400, distanceKm: 1.2 }));

  const resolved = resolveSavedDuelMatchResult(store, { id: 'victim' }, duelBlob(matchId, 1500), NOW);

  // 침입자는 명단 밖이라 아예 보이지 않는다 → 상대 기록이 없는 상태 = PENDING(기존 동작).
  assert.equal(resolved.resultTone, undefined);
  assert.equal(resolved.opponentId, undefined);
  assert.equal(resolved.badgeLabel, '결과 집계 중');
});

test('DUEL: the REAL opponent still resolves the verdict from saved runs after the session is pruned', () => {
  // 게이트가 정당한 늦은 저장을 막으면 안 된다 — 이게 이 수술의 가장 중요한 보존 계약이다.
  const store = createStore();
  const matchId = createPrunedMatch(store, { participantIds: ['victim', 'rival'] });

  store.runs.push(savedRun('rival', { matchId, durationSeconds: 1620, distanceKm: 5 }));
  store.runs.push(savedRun('attacker', { matchId, durationSeconds: 300, distanceKm: 5 }));

  const resolved = resolveSavedDuelMatchResult(store, { id: 'victim' }, duelBlob(matchId, 1500), NOW);

  // 더 빠른 완주자(1500s)가 이긴다. 침입자의 300s 기록은 명단 밖이라 계산에 끼지 못한다.
  assert.equal(resolved.resultTone, 'win');
  assert.equal(resolved.opponentId, 'rival');
  assert.equal(resolved.opponentName, '진짜상대');
  assert.equal(resolved.opponentDurationSeconds, 1620);
});

test('DUEL: a non-participant\'s own save is PENDING — it can never self-award the +20P win', () => {
  // 재현 케이스 2. 위조 기록이 진짜 완주자를 상대로 자기 승리를 확정하던 경로.
  const store = createStore();
  const matchId = createPrunedMatch(store, { participantIds: ['victim', 'rival'] });

  store.runs.push(savedRun('victim', { matchId, durationSeconds: 1500, distanceKm: 5 }));

  const resolved = resolveSavedDuelMatchResult(
    store,
    { id: 'attacker' },
    duelBlob(matchId, 400, { resultTone: 'win', badgeLabel: '승리' }),
    NOW,
  );

  assert.equal(resolved.resultTone, undefined);
  assert.equal(resolved.badgeLabel, '결과 집계 중');
});

test('DUEL: a late joiner added to a live session is on the durable roster and still resolves', () => {
  // 지각 합류자가 로스터에 안 들어가면, 세션이 사라진 뒤 그 사람은 "명단 밖"이 되어 자기 기록이
  // 영영 PENDING으로 남는다 — 게이트가 정당한 참가자를 배제하는 최악의 실패 모드.
  const store = createStore();
  const session = createMatchSession(
    store,
    'group',
    5,
    NOW.toISOString(),
    [{ id: 'victim', seedRank: 1 }, { id: 'rival', seedRank: 2 }],
    { now: NOW },
  );

  addParticipantToMatchSession(store, session, { id: 'mate', seedRank: 3 });

  const roster = findMatchRoster(store, session.id);
  assert.deepEqual(roster.participantIds, ['victim', 'rival', 'mate']);

  // 같은 사람을 두 번 넣어도 명단은 중복되지 않는다.
  assert.equal(amendMatchRoster(store, session.id, 'mate'), false);
  assert.equal(findMatchRoster(store, session.id).participantIds.length, 3);
});

// ---------------------------------------------------------------------------
// 로스터 게이트 — 그룹
// ---------------------------------------------------------------------------

test('GROUP: a forged run can no longer pad the participant count and push the victim down a rank', () => {
  // 재현 케이스 3. 클라가 보고한 participantCount(3)를 위조 기록 하나로 채워 봉인시키고,
  // 그 위조 기록의 불가능한 기록(300s)이 피해자를 3위로 밀어냈다.
  const store = createStore();
  const matchId = createPrunedMatch(store, { mode: 'group', participantIds: ['victim', 'mate'] });

  store.runs.push(savedRun('mate', { matchId, mode: 'group', durationSeconds: 1400, distanceKm: 5 }));
  store.runs.push(savedRun('attacker', { matchId, mode: 'group', durationSeconds: 300, distanceKm: 0.9 }));

  const resolved = resolveSavedGroupMatchResult(store, { id: 'victim' }, {
    mode: 'group',
    matchId,
    comparedDistanceKm: 5,
    participantCount: 3, // 클라가 주장하는 인원 — 더 이상 신뢰하지 않는다
    myDurationSeconds: 1500,
    myPaceLabel: '05:00/km',
  }, NOW);

  // 참가자 수의 진실은 로스터(2명). 침입자를 뺀 실제 순위는 2명 중 2위다.
  assert.equal(resolved.participantCount, 2);
  assert.equal(resolved.rank, 2);
  assert.equal(resolved.badgeLabel, '2위');
});

test('GROUP: a non-participant\'s group save is PENDING (no self-claimed rank, no rank LP)', () => {
  const store = createStore();
  const matchId = createPrunedMatch(store, { mode: 'group', participantIds: ['victim', 'mate'] });

  store.runs.push(savedRun('victim', { matchId, mode: 'group', durationSeconds: 1500, distanceKm: 5 }));

  const resolved = resolveSavedGroupMatchResult(store, { id: 'attacker' }, {
    mode: 'group',
    matchId,
    comparedDistanceKm: 5,
    participantCount: 2,
    rank: 1,
    myDurationSeconds: 300,
  }, NOW);

  assert.equal(resolved.rank, undefined);
  assert.equal(resolved.badgeLabel, '결과 집계 중');
});

test('GROUP: the roster count keeps a partly-saved group PENDING even when the client under-reports', () => {
  // 계약 변화(커밋 메시지에 명시): 클라가 participantCount를 실제보다 작게 보고하면 예전에는
  // 그 수만 채워도 봉인됐다. 이제는 로스터 전원이 저장해야 봉인된다 — 더 엄격한 쪽이다.
  const store = createStore();
  const matchId = createPrunedMatch(store, { mode: 'group', participantIds: ['victim', 'rival', 'mate'] });

  store.runs.push(savedRun('mate', { matchId, mode: 'group', durationSeconds: 1400, distanceKm: 5 }));

  const resolved = resolveSavedGroupMatchResult(store, { id: 'victim' }, {
    mode: 'group',
    matchId,
    comparedDistanceKm: 5,
    participantCount: 2, // 실제 3명인데 2명이라고 보고
    myDurationSeconds: 1500,
  }, NOW);

  assert.equal(resolved.rank, undefined);
  assert.equal(resolved.badgeLabel, '결과 집계 중');
});

// ---------------------------------------------------------------------------
// epoch — "로스터가 없다"의 의미가 시간에 따라 달라진다
// ---------------------------------------------------------------------------

test('EPOCH immature: a matchId with no roster keeps TODAY\'s behavior (배포 전 매치의 늦은 저장 보존)', () => {
  const store = createStore();
  store.matchRosterEpochAt = NOW.toISOString();
  store.runs.push(savedRun('rival', { matchId: 'legacy-duel', durationSeconds: 1620, distanceKm: 5 }));

  const resolved = resolveSavedDuelMatchResult(
    store,
    { id: 'victim' },
    duelBlob('legacy-duel', 1500),
    at(MATCH_ROSTER_LEGACY_GRACE_MS - DAY_MS),
  );

  assert.equal(resolved.resultTone, 'win');
  assert.equal(resolved.opponentId, 'rival');
});

test('EPOCH mature: a matchId with no roster refuses to resolve (PENDING, never a guess)', () => {
  const store = createStore();
  store.matchRosterEpochAt = NOW.toISOString();
  store.runs.push(savedRun('rival', { matchId: 'legacy-duel', durationSeconds: 1620, distanceKm: 5 }));

  const resolved = resolveSavedDuelMatchResult(
    store,
    { id: 'victim' },
    duelBlob('legacy-duel', 1500),
    at(MATCH_ROSTER_LEGACY_GRACE_MS + DAY_MS),
  );

  assert.equal(resolved.resultTone, undefined);
  assert.equal(resolved.badgeLabel, '결과 집계 중');
});

test('EPOCH: an unstamped epoch reads as immature (never strict before the marker exists)', () => {
  const store = createStore();
  delete store.matchRosterEpochAt;
  assert.equal(isMatchRosterEpochMature(store, NOW), false);
  assert.equal(isMatchRosterEpochMature(store, at(10 * 365 * DAY_MS)), false);
});

test('EPOCH is stamped by the session prune sweep, so it matures even if no match is ever created', () => {
  const store = createStore();
  delete store.matchRosterEpochAt;

  pruneMatchRosters(store, NOW);
  assert.equal(store.matchRosterEpochAt, NOW.toISOString());

  // 재각인하지 않는다 — 최초 시점이 유일한 기준이어야 유예가 실제로 만료된다.
  pruneMatchRosters(store, at(DAY_MS));
  assert.equal(store.matchRosterEpochAt, NOW.toISOString());
  assert.equal(isMatchRosterEpochMature(store, at(MATCH_ROSTER_LEGACY_GRACE_MS)), true);
});

// ---------------------------------------------------------------------------
// 보존 계약 — 깨면 안 되는 것들
// ---------------------------------------------------------------------------

test('CONTRACT: a forfeit record still self-resolves with no roster and a MATURE epoch', () => {
  const store = createStore();
  store.matchRosterEpochAt = NOW.toISOString();

  const forfeit = {
    mode: 'duel',
    matchId: 'ancient-duel',
    badgeLabel: '기권패',
    resultTone: 'lose',
    myDurationSeconds: 300,
  };
  const late = at(MATCH_ROSTER_LEGACY_GRACE_MS + DAY_MS);

  assert.equal(resolveSavedDuelMatchResult(store, { id: 'victim' }, forfeit, late), forfeit);

  const groupForfeit = { mode: 'group', matchId: 'ancient-group', badgeLabel: '기권', rank: 3 };
  assert.equal(resolveSavedGroupMatchResult(store, { id: 'victim' }, groupForfeit, late), groupForfeit);
});

test('CONTRACT: a record with NO matchId is returned untouched even with a MATURE epoch', () => {
  const store = createStore();
  store.matchRosterEpochAt = NOW.toISOString();
  const late = at(MATCH_ROSTER_LEGACY_GRACE_MS + DAY_MS);

  const duel = { mode: 'duel', resultTone: 'win', badgeLabel: '승리', myDurationSeconds: 1500 };
  assert.equal(resolveSavedDuelMatchResult(store, { id: 'victim' }, duel, late), duel);

  const group = { mode: 'group', rank: 1, badgeLabel: '1위' };
  assert.equal(resolveSavedGroupMatchResult(store, { id: 'victim' }, group, late), group);
});

// ---------------------------------------------------------------------------
// 문 A — 라이브 세션이 있는데 저장하는 사람이 참가자가 아닌 경우
// ---------------------------------------------------------------------------

test('LIVE SESSION + non-participant: the claimed win is stripped to PENDING (no self-awarded +20P)', () => {
  // 적대 검증 2026-08-11에서 새로 드러난 문. 예전에는 블롭을 그대로 돌려줘 클라가 주장한
  // resultTone:'win'이 저장되고 getMatchBonusPoints가 +20P를 그대로 지급했다.
  const store = createStore();
  createMatchSession(
    store,
    'duel',
    5,
    NOW.toISOString(),
    [{ id: 'victim', seedRank: 1 }, { id: 'rival', seedRank: 2 }],
    { now: NOW },
  );
  const liveMatchId = store.matchSessions[0].id;

  const resolved = resolveSavedDuelMatchResult(
    store,
    { id: 'attacker' },
    duelBlob(liveMatchId, 1500, { resultTone: 'win', badgeLabel: '승리' }),
    NOW,
  );

  assert.equal(resolved.resultTone, undefined);
  assert.equal(resolved.badgeLabel, '결과 집계 중');
});

test('LIVE SESSION + non-participant (group): the claimed rank is stripped to PENDING', () => {
  const store = createStore();
  createMatchSession(
    store,
    'group',
    5,
    NOW.toISOString(),
    [{ id: 'victim', seedRank: 1 }, { id: 'rival', seedRank: 2 }],
    { now: NOW },
  );
  const liveMatchId = store.matchSessions[0].id;

  const resolved = resolveSavedGroupMatchResult(store, { id: 'attacker' }, {
    mode: 'group',
    matchId: liveMatchId,
    rank: 1,
    badgeLabel: '1위',
    comparedDistanceKm: 5,
    myDurationSeconds: 1500,
  }, NOW);

  assert.equal(resolved.rank, undefined);
  assert.equal(resolved.badgeLabel, '결과 집계 중');
});

// ---------------------------------------------------------------------------
// GET /result — 판정만 막고 화면은 못 막으면 반쪽이다
// ---------------------------------------------------------------------------

test('GET /result hides a forged participant row from the victim\'s result screen', () => {
  const store = createStore();
  const matchId = createPrunedMatch(store, { participantIds: ['victim', 'rival'] });

  store.runs.push(savedRun('victim', { matchId, durationSeconds: 1500, distanceKm: 5, extra: { resultTone: 'win' } }));
  store.runs.push(savedRun('rival', { matchId, durationSeconds: 1620, distanceKm: 5, extra: { resultTone: 'lose' } }));
  store.runs.push(savedRun('attacker', { matchId, durationSeconds: 300, distanceKm: 5, extra: { resultTone: 'win' } }));

  const result = buildMatchResultByMatchId(store, { id: 'victim' }, matchId, NOW);
  const userIds = result.participants.map((participant) => participant.userId);

  assert.deepEqual(userIds.sort(), ['rival', 'victim']);
});

// ---------------------------------------------------------------------------
// 운영자 복구 경로 — 이 설계의 탈출구가 막히면 안 된다
// ---------------------------------------------------------------------------

test('OPERATOR REPAIR still heals an old roster-less match AFTER the epoch matures', () => {
  // 적대 검증 2026-08-11에서 자체 발견한 결함. epoch 게이트는 "로스터 없음 = 거절"인데, 운영자
  // 복구 스크립트(scripts/backfill-pending-match-results.mjs)가 다루는 대상이 바로 그 매치들이다
  // — 세션도 로스터도 없는 옛 매치. 스크립트가 대역 밖에서 확인한 명단을 resolver까지 내려보내지
  // 않으면, 설계가 "잔여는 스크립트가 처리한다"고 말해온 탈출구 자체가 조용히 막힌다.
  const store = createStore();
  const matchId = 'ancient-duel-needing-repair';
  const pending = (userId, durationSeconds, distanceKm) => ({
    id: `run-${userId}`,
    userId,
    distanceKm,
    durationSeconds,
    createdAt: at(-8 * DAY_MS).toISOString(),
    matchResult: {
      mode: 'duel',
      matchId,
      comparedDistanceKm: 5,
      myDurationSeconds: durationSeconds,
      badgeLabel: '결과 집계 중',
    },
  });

  store.matchRosterEpochAt = at(-MATCH_ROSTER_LEGACY_GRACE_MS - DAY_MS).toISOString();
  store.runs.push(pending('victim', 1500, 5.02), pending('rival', 1620, 5.1));

  const healed = backFillSavedRunsWithVerifiedRoster(
    store,
    matchId,
    'duel',
    new Set(['victim', 'rival']), // 운영자가 --participants 로 확인해 넘긴 명단
    NOW,
  );

  assert.deepEqual(healed.sort(), ['rival', 'victim']);
  assert.equal(store.runs.find((run) => run.userId === 'victim').matchResult.resultTone, 'win');
  assert.equal(store.runs.find((run) => run.userId === 'rival').matchResult.resultTone, 'lose');
});

test('OPERATOR REPAIR refuses a match that carries a run from OUTSIDE the supplied roster', () => {
  // 명단 밖 기록이 섞여 있으면 매치 전체를 거절하는 기존 방어가 살아 있어야 한다.
  const store = createStore();
  const matchId = 'ancient-duel-with-intruder';
  store.matchRosterEpochAt = at(-MATCH_ROSTER_LEGACY_GRACE_MS - DAY_MS).toISOString();
  store.runs.push(
    savedRun('victim', { matchId, durationSeconds: 1500, distanceKm: 5.02 }),
    savedRun('rival', { matchId, durationSeconds: 1620, distanceKm: 5.1 }),
    savedRun('attacker', { matchId, durationSeconds: 300, distanceKm: 5 }),
  );

  const healed = backFillSavedRunsWithVerifiedRoster(
    store,
    matchId,
    'duel',
    new Set(['victim', 'rival']),
    NOW,
  );

  assert.deepEqual(healed, []);
});

// ---------------------------------------------------------------------------
// 보존기간 / GC / 상한
// ---------------------------------------------------------------------------

test('GC drops rosters past the retention window and keeps everything inside it', () => {
  const store = createStore();
  store.matchRosters = [
    { id: 'expired', mode: 'duel', participantIds: ['a'], createdAt: at(-MATCH_ROSTER_RETENTION_MS - DAY_MS).toISOString() },
    { id: 'fresh', mode: 'duel', participantIds: ['b'], createdAt: at(-DAY_MS).toISOString() },
  ];

  pruneMatchRosters(store, NOW);

  assert.deepEqual(store.matchRosters.map((roster) => roster.id), ['fresh']);
});

test('GC drops a roster whose createdAt cannot be parsed (an un-ageable entry would leak forever)', () => {
  const store = createStore();
  store.matchRosters = [
    { id: 'broken', mode: 'duel', participantIds: ['a'], createdAt: 'not-a-date' },
    { id: 'fresh', mode: 'duel', participantIds: ['b'], createdAt: at(-DAY_MS).toISOString() },
  ];

  pruneMatchRosters(store, NOW);

  assert.deepEqual(store.matchRosters.map((roster) => roster.id), ['fresh']);
});

test('GC survives the 7-day client save queue: a roster written today is still there for a 7-day-late save', () => {
  // 이 테스트가 보존기간의 근거를 못 박는다 — 클라 저장 대기열의 상한이 7일이므로
  // (src/features/runs/save/pendingRunSaveQueue.ts PENDING_SAVE_MAX_AGE_MS) 그때까지 살아야 한다.
  const store = createStore();
  const matchId = createPrunedMatch(store, { participantIds: ['victim', 'rival'] });

  pruneMatchRosters(store, at(7 * DAY_MS));

  assert.ok(findMatchRoster(store, matchId), '7일 뒤에도 로스터가 남아 있어야 정당한 늦은 저장이 해소된다');
});

test('RETENTION must outlive the LEGACY grace — otherwise a roster can expire while still trusted', () => {
  // 불변식: 유예 안에서 로스터가 만료되면, 정당한 늦은 저장이 "로스터 없음 + epoch 미성숙"으로
  // legacy 경로에 떨어져 구멍이 다시 열린다.
  assert.ok(MATCH_ROSTER_RETENTION_MS > MATCH_ROSTER_LEGACY_GRACE_MS);
});

test('RETENTION covers BOOKING-AHEAD + the client save queue — the roster clock starts at MATCHING', () => {
  // 적대 검증 2026-08-11. 로스터의 createdAt은 '매칭 성사 시각'이다 — 매칭은 두 러너가 짝지어진
  // 즉시 세션을 만들고, 슬롯은 최대 MATCH_BOOKING_WINDOW_DAYS(7일) 뒤일 수 있다. 여기에 클라
  // 저장 대기열 7일이 더 붙으므로 보존기간이 14일이면 마지막 합법 드레인이 만료 뒤에 도착한다.
  const worstLegitimateSaveAgeMs = (MATCH_BOOKING_WINDOW_DAYS + 7) * DAY_MS;
  assert.ok(
    MATCH_ROSTER_RETENTION_MS > worstLegitimateSaveAgeMs,
    '예약 선행 + 저장 대기열의 최악 조합보다 로스터가 오래 살아야 한다',
  );
});

test('a duel booked a week ahead still resolves when its save drains on the LAST legal day', () => {
  // 위 불변식의 실행 버전 — 상수만 맞추고 실제 경로를 안 태우면 회귀를 못 잡는다.
  const store = createStore();
  const matchedAt = at(-(MATCH_BOOKING_WINDOW_DAYS + 7) * DAY_MS + 60 * 1000);
  const matchId = createPrunedMatch(store, {
    participantIds: ['victim', 'rival'],
    now: matchedAt, // 7일 앞서 예약된 슬롯 → 매칭 시점에 로스터가 찍힌다
  });

  // 매 쓰기 요청에서 도는 GC를 '지금'(마지막 합법 드레인 시점) 기준으로 돌린다.
  pruneMatchRosters(store, NOW);
  assert.ok(findMatchRoster(store, matchId), '마지막 합법 드레인 시점에 로스터가 살아 있어야 한다');

  store.runs.push(savedRun('rival', { matchId, durationSeconds: 1620, distanceKm: 5 }));
  const resolved = resolveSavedDuelMatchResult(store, { id: 'victim' }, duelBlob(matchId, 1500), NOW);

  assert.equal(resolved.resultTone, 'win');
  assert.equal(resolved.opponentId, 'rival');
});

test('the entry cap evicts the OLDEST rosters and degrades to PENDING, never to the unsafe path', () => {
  resetMatchRosterCapLogThrottle();
  const store = createStore();
  store.matchRosterEpochAt = at(-MATCH_ROSTER_LEGACY_GRACE_MS - DAY_MS).toISOString();
  ensureMatchRosters(store);

  for (let index = 0; index < MATCH_ROSTER_MAX_ENTRIES + 5; index += 1) {
    store.matchRosters.push({
      id: `match-${index}`,
      mode: 'duel',
      participantIds: ['victim', 'rival'],
      createdAt: at(-DAY_MS + index).toISOString(),
    });
  }

  pruneMatchRosters(store, NOW);

  assert.equal(store.matchRosters.length, MATCH_ROSTER_MAX_ENTRIES);
  assert.equal(store.matchRosters[0].id, 'match-5', '가장 오래된 것부터 축출된다');
  assert.equal(findMatchRoster(store, 'match-0'), null);

  // 축출된 매치는 무방비 legacy가 아니라 PENDING(안전)으로 떨어져야 한다.
  store.runs.push(savedRun('rival', { matchId: 'match-0', durationSeconds: 1620, distanceKm: 5 }));
  const resolved = resolveSavedDuelMatchResult(store, { id: 'victim' }, duelBlob('match-0', 1500), NOW);
  assert.equal(resolved.resultTone, undefined);
});
