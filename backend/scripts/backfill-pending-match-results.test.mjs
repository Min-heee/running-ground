import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyHeal,
  collectStuckMatches,
  findUntrustworthyRuns,
  isStuckMatchBlob,
  planHeal,
} from './backfill-pending-match-results.mjs';

// The damaged shape the winner-first save leaves behind: toPendingDuelMatchResult stripped
// resultTone (and the opponent's numbers) but KEPT the runner's own measured finish, which is
// what lets the resolver rank the duel later.
function pendingDuelBlob(matchId, myDurationSeconds, comparedDistanceKm = 6) {
  return {
    mode: 'duel',
    matchId,
    source: 'party',
    title: '대결 결과를 집계하고 있어요',
    summary: '상대가 완주하면 결과가 자동으로 업데이트돼요.',
    badgeLabel: '결과 집계 중',
    comparedDistanceKm,
    myDurationSeconds,
    myPaceLabel: '05:00/km',
  };
}

function resolvedDuelBlob(matchId, myDurationSeconds, resultTone) {
  return {
    ...pendingDuelBlob(matchId, myDurationSeconds),
    title: '대결 결과',
    badgeLabel: resultTone === 'win' ? '승리' : '패배',
    resultTone,
  };
}

const MATCH_ID = 'duel-screen-off';
const ROSTER = ['winner-user', 'loser-user'];

// A pruned both-finished duel — the normal end state, and the one the sweep never revisits.
function buildFixtureStore() {
  return {
    users: [
      { id: 'winner-user', name: '민병희', publicTag: 'BH7K2' },
      { id: 'loser-user', name: '회원A', publicTag: 'MBR41' },
      { id: 'outsider-user', name: '침입자', publicTag: 'EVIL1' },
    ],
    runs: [
      {
        id: 'run-winner',
        userId: 'winner-user',
        date: '2026-08-09',
        distanceKm: 6,
        durationSeconds: 2227,
        pace: '06:11/km',
        matchResult: pendingDuelBlob(MATCH_ID, 2227),
      },
      {
        id: 'run-loser',
        userId: 'loser-user',
        date: '2026-08-09',
        distanceKm: 6,
        durationSeconds: 2263,
        pace: '06:17/km',
        matchResult: resolvedDuelBlob(MATCH_ID, 2263, 'lose'),
      },
    ],
    matchSessions: [],
    notifications: [],
  };
}

function options(overrides = {}) {
  return {
    matchId: MATCH_ID,
    participantIds: ROSTER,
    yes: false,
    ...overrides,
  };
}

test('isStuckMatchBlob only flags an unresolved, non-forfeit match blob', () => {
  assert.equal(isStuckMatchBlob(pendingDuelBlob('m1', 1500)), true);
  assert.equal(isStuckMatchBlob(resolvedDuelBlob('m1', 1500, 'win')), false);
  assert.equal(isStuckMatchBlob(resolvedDuelBlob('m1', 1500, 'lose')), false);

  // A forfeit record is terminal on its own verdict path — never a heal candidate.
  assert.equal(isStuckMatchBlob({ ...pendingDuelBlob('m1', 1500), badgeLabel: '기권승' }), false);

  // A group blob is stuck until it carries an integer rank.
  assert.equal(isStuckMatchBlob({ mode: 'group', matchId: 'g1', badgeLabel: '결과 집계 중' }), true);
  assert.equal(isStuckMatchBlob({ mode: 'group', matchId: 'g1', rank: 2 }), false);

  // Non-match / malformed input is ignored rather than treated as damage.
  assert.equal(isStuckMatchBlob(null), false);
  assert.equal(isStuckMatchBlob({ mode: 'duel' }), false);
  assert.equal(isStuckMatchBlob({ mode: 'solo', matchId: 'm1' }), false);
});

test('collectStuckMatches groups the damaged runs by matchId and honors the filter', () => {
  const store = buildFixtureStore();
  store.runs.push({
    id: 'run-other',
    userId: 'winner-user',
    distanceKm: 3,
    durationSeconds: 900,
    matchResult: pendingDuelBlob('another-duel', 900, 3),
  });

  const all = collectStuckMatches(store);
  assert.deepEqual(all.map((entry) => entry.matchId).sort(), ['another-duel', MATCH_ID]);

  // Only the winner's blob is stuck in the fixture match — the loser's already carries a verdict.
  const target = all.find((entry) => entry.matchId === MATCH_ID);
  assert.equal(target.runs.length, 1);
  assert.equal(target.runs[0].id, 'run-winner');

  const filtered = collectStuckMatches(store, 'another-duel');
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].matchId, 'another-duel');
});

test('a verified roster promotes the stranded winner to 승리 from the two saved finishes', () => {
  const store = buildFixtureStore();
  const plan = planHeal(store, options());
  assert.deepEqual(plan.blockers, []);

  const healed = applyHeal(store, plan, options());
  assert.equal(healed.length, 1);
  assert.equal(healed[0].userId, 'winner-user');
  assert.equal(healed[0].before.resultTone, undefined);
  assert.equal(healed[0].after.resultTone, 'win');

  const winnerRun = store.runs.find((run) => run.id === 'run-winner');
  assert.equal(winnerRun.matchResult.resultTone, 'win');
  assert.equal(winnerRun.matchResult.opponentId, 'loser-user');

  // The loser is never touched — the heal only ever upgrades an unresolved blob.
  assert.equal(store.runs.find((run) => run.id === 'run-loser').matchResult.resultTone, 'lose');
});

test('the heal is idempotent and refuses a match it cannot verify', () => {
  const store = buildFixtureStore();
  applyHeal(store, planHeal(store, options()), options());

  // Second pass finds nothing left to do — a definite verdict is never rewritten.
  assert.deepEqual(collectStuckMatches(store, MATCH_ID), []);
  assert.deepEqual(applyHeal(store, planHeal(store, options()), options()), []);

  // No roster → refuse outright rather than guess from whoever saved a run.
  const bare = buildFixtureStore();
  assert.ok(planHeal(bare, options({ participantIds: [] })).blockers.length > 0);
  assert.ok(planHeal(bare, options({ matchId: '' })).blockers.length > 0);

  // Only one roster run saved → cannot rank a duel; leave it PENDING.
  const lonely = buildFixtureStore();
  lonely.runs = lonely.runs.filter((run) => run.userId === 'winner-user');
  assert.ok(planHeal(lonely, options()).blockers.length > 0);
});

// 적대 검증 2026-08-09 ①: matchId는 검증되지 않는 클라 입력이라, 참가자가 아닌 사람이 같은
// matchId로 기록을 올리면 진짜 참가자의 승리가 패배로 영구히 덮였다 (확정 판정이 되어 진짜
// 치유가 영영 막힘). 로스터 밖 기록은 상대로도, 치유 대상으로도 쓰이면 안 된다.
test('a run posted by a NON-PARTICIPANT can never become the opponent or be healed', () => {
  const store = buildFixtureStore();
  // The intruder forges the victim's matchId with an unbeatable time, and the genuine opponent's
  // save has not landed yet.
  store.runs = store.runs.filter((run) => run.userId === 'winner-user');
  store.runs.push({
    id: 'run-outsider',
    userId: 'outsider-user',
    date: '2026-08-09',
    distanceKm: 6,
    durationSeconds: 60,
    matchResult: pendingDuelBlob(MATCH_ID, 60),
  });

  const plan = planHeal(store, options());
  assert.equal(plan.outsiderRuns.length, 1);
  assert.equal(plan.outsiderRuns[0].id, 'run-outsider');

  // Two independent blockers fire: only one roster run saved, AND a foreign run wears this
  // matchId. The second is the one that matters — the roster gate decides who may be REWRITTEN,
  // but this no-session resolver picks the opponent as "first saved run that isn't me", so a
  // foreign run left in the store would still be used as evidence and could invert the verdict.
  assert.ok(plan.blockers.some((blocker) => blocker.includes('로스터 밖')));

  // Blocked means main() never applies, so the victim keeps their unresolved (not inverted) card.
  assert.equal(store.runs.find((run) => run.id === 'run-winner').matchResult.resultTone, undefined);

  // The intruder is outside the roster, so even a forced apply never rewrites THEIR record.
  applyHeal(store, plan, options());
  assert.equal(store.runs.find((run) => run.id === 'run-outsider').matchResult.resultTone, undefined);
});

// 적대 검증 2026-08-09 ②: 세션이 없으면 판정이 순수 경과시간으로만 매겨져, 1.2km에서 그만둔
// 기록(400s)이 5km 완주(1500s)를 이겨 실제 완주자를 패배로 뒤집었다. 악의가 없어도 발생한다.
test('a mid-run quit cannot outrank a genuine finisher — the plan blocks and applyHeal refuses', () => {
  const store = buildFixtureStore();
  const loserRun = store.runs.find((run) => run.id === 'run-loser');
  loserRun.distanceKm = 1.2;
  loserRun.durationSeconds = 400;
  loserRun.matchResult = pendingDuelBlob(MATCH_ID, 400);

  assert.equal(findUntrustworthyRuns(store.runs).length, 1);

  const plan = planHeal(store, options());
  assert.ok(plan.blockers.some((blocker) => blocker.includes('증거로 쓸 수 없어')));

  // Defense in depth: even called directly, the heal refuses rather than inverting the finisher.
  assert.deepEqual(applyHeal(store, plan, options()), []);
  assert.equal(store.runs.find((run) => run.id === 'run-winner').matchResult.resultTone, undefined);
});

// 적대 재검증 2026-08-09: 첫 하드닝의 남은 구멍 — 목표 거리가 블롭에 없으면 완주 여부를 검증할
// 수 없는데도 그대로 통과해, 중도 포기 기록이 기본 경로에서 실제 완주자를 뒤집었다.
test('a run with no recorded goal distance is untrustworthy evidence, not a free pass', () => {
  const store = buildFixtureStore();
  const loserRun = store.runs.find((run) => run.id === 'run-loser');
  loserRun.distanceKm = 1.2;
  loserRun.durationSeconds = 400;
  loserRun.matchResult = { ...pendingDuelBlob(MATCH_ID, 400) };
  delete loserRun.matchResult.comparedDistanceKm;

  const plan = planHeal(store, options());
  assert.ok(plan.blockers.some((blocker) => blocker.includes('목표 거리가 기록에 없어')));
  assert.deepEqual(applyHeal(store, plan, options()), []);
  assert.equal(store.runs.find((run) => run.id === 'run-winner').matchResult.resultTone, undefined);
});

// 같은 재검증: 0:53/km 같은 비현실적 속도가 완주 판정을 이기지 못하게 앱 자체의 안티치트
// 분류기(classifyRunIntegrity)를 증거 검사에 재사용한다.
test('an impossible pace cannot be used as evidence', () => {
  const store = buildFixtureStore();
  const loserRun = store.runs.find((run) => run.id === 'run-loser');
  loserRun.distanceKm = 6;
  loserRun.durationSeconds = 318; // 0:53/km — 차량 판정
  loserRun.matchResult = pendingDuelBlob(MATCH_ID, 318);

  const plan = planHeal(store, options());
  assert.ok(plan.blockers.some((blocker) => blocker.includes('비현실적')));
  assert.deepEqual(applyHeal(store, plan, options()), []);
  assert.equal(store.runs.find((run) => run.id === 'run-winner').matchResult.resultTone, undefined);
});
