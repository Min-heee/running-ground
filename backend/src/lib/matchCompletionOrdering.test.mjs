import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isTrustworthyMatchEvidence,
  resolveSavedDuelMatchResult,
  resolveSavedGroupMatchResult,
} from './matchResultBuilders.mjs';
import { createMatchSession } from './runningMatchSession/matchSessionLifecycle.mjs';

// 완주 우선 정렬 — 중도포기(DNF)가 완주자를 이기지 못하게 한다.
//
// 세션 없는 분기는 두 기록의 RAW 경과시간만 비교했다. 1.2km에서 400초에 그만둔 기록은 5km를
// 1500초에 완주한 기록보다 "빠르다" — 그래서 진짜 완주자가 패배로 뒤집혔다. 악의 없이도 벌어지고,
// 일부러 일찍 그만두면 그대로 치팅이 된다.
const NOW = new Date('2026-08-11T12:00:00.000Z');

function createStore() {
  return {
    users: [
      { id: 'finisher', name: '완주자' },
      { id: 'quitter', name: '중도포기' },
      { id: 'mate', name: '동료' },
    ],
    runs: [],
    matchSessions: [],
    matchRosters: [],
  };
}

function createPrunedMatch(store, { mode = 'duel', participantIds, distanceKm = 5 } = {}) {
  const session = createMatchSession(
    store,
    mode,
    distanceKm,
    NOW.toISOString(),
    participantIds.map((id, index) => ({ id, seedRank: index + 1 })),
    { now: NOW },
  );
  store.matchSessions = [];
  return session.id;
}

function savedRun(userId, { matchId, mode = 'duel', durationSeconds, distanceKm, comparedDistanceKm }) {
  return {
    id: `run-${userId}`,
    userId,
    distanceKm,
    durationSeconds,
    createdAt: new Date(NOW.getTime() - 60 * 1000).toISOString(),
    matchResult: {
      mode,
      matchId,
      comparedDistanceKm,
      myDurationSeconds: durationSeconds,
      myPaceLabel: '05:00/km',
    },
  };
}

test('DUEL: a mid-run quit no longer outranks a real finisher on raw elapsed alone', () => {
  const store = createStore();
  const matchId = createPrunedMatch(store, { participantIds: ['finisher', 'quitter'] });

  // 상대는 1.2km에서 400초에 그만뒀다 — 경과시간만 보면 "더 빠르다".
  store.runs.push(savedRun('quitter', {
    matchId,
    durationSeconds: 400,
    distanceKm: 1.2,
    comparedDistanceKm: 5,
  }));

  const resolved = resolveSavedDuelMatchResult(
    store,
    { id: 'finisher' },
    { mode: 'duel', matchId, comparedDistanceKm: 5, myDurationSeconds: 1500, myPaceLabel: '05:00/km' },
    NOW,
    { savingRun: { distanceKm: 5.02, durationSeconds: 1500 } },
  );

  assert.equal(resolved.resultTone, 'win');
  assert.equal(resolved.badgeLabel, '승리');
});

test('DUEL: the quitter\'s OWN save resolves to lose — the mirror side agrees', () => {
  const store = createStore();
  const matchId = createPrunedMatch(store, { participantIds: ['finisher', 'quitter'] });

  store.runs.push(savedRun('finisher', {
    matchId,
    durationSeconds: 1500,
    distanceKm: 5.02,
    comparedDistanceKm: 5,
  }));

  const resolved = resolveSavedDuelMatchResult(
    store,
    { id: 'quitter' },
    { mode: 'duel', matchId, comparedDistanceKm: 5, myDurationSeconds: 400, myPaceLabel: '05:33/km' },
    NOW,
    { savingRun: { distanceKm: 1.2, durationSeconds: 400 } },
  );

  assert.equal(resolved.resultTone, 'lose');
});

test('DUEL: a FROZEN comparedDistanceKm cannot disguise a quitter as a finisher', () => {
  // 오너 지적 (2026-08-11) + 실사고(2026-08-09 프로덕션 duel-match-e545bceb, 6km 러닝에
  // comparedDistanceKm 3.06 박제). 중도포기자의 compared가 자기가 그만둔 지점에서 얼면
  // goalKm == distanceKm이 되어 "목표 충족"으로 통과한다 — 로스터의 목표 거리를 쓰지 않으면
  // 완주 우선 정렬이 통째로 무력화된다.
  const store = createStore();
  const matchId = createPrunedMatch(store, { participantIds: ['finisher', 'quitter'], distanceKm: 5 });

  store.runs.push(savedRun('quitter', {
    matchId,
    durationSeconds: 400,
    distanceKm: 1.2,
    comparedDistanceKm: 1.2, // 그만둔 지점에서 얼어붙은 값
  }));

  const resolved = resolveSavedDuelMatchResult(
    store,
    { id: 'finisher' },
    { mode: 'duel', matchId, comparedDistanceKm: 5, myDurationSeconds: 1500 },
    NOW,
    { savingRun: { distanceKm: 5.02, durationSeconds: 1500 } },
  );

  assert.equal(resolved.resultTone, 'win', '목표 거리는 로스터(서버가 생성 시점에 정한 값)에서 와야 한다');
});

test('DUEL: two genuine finishers are still ranked by elapsed time (완주 판정이 시간 비교를 덮지 않는다)', () => {
  const store = createStore();
  const matchId = createPrunedMatch(store, { participantIds: ['finisher', 'quitter'] });

  store.runs.push(savedRun('quitter', {
    matchId,
    durationSeconds: 1400,
    distanceKm: 5.1,
    comparedDistanceKm: 5,
  }));

  const resolved = resolveSavedDuelMatchResult(
    store,
    { id: 'finisher' },
    { mode: 'duel', matchId, comparedDistanceKm: 5, myDurationSeconds: 1500 },
    NOW,
    { savingRun: { distanceKm: 5.02, durationSeconds: 1500 } },
  );

  // 둘 다 완주 → 더 빠른 쪽(1400s)이 이긴다. 나는 1500s라 패배.
  assert.equal(resolved.resultTone, 'lose');
});

test('DUEL: with no roster goal (legacy match) the ordering stays EXACTLY as before', () => {
  // legacy 보존 계약: 로스터가 없으면 목표 거리를 모르므로 완주 판정을 시도하지 않는다.
  // 얼어붙을 수 있는 comparedDistanceKm으로 판정하느니 기존 동작을 유지하는 쪽이 안전하다.
  const store = createStore();
  store.matchRosterEpochAt = NOW.toISOString();

  store.runs.push(savedRun('quitter', {
    matchId: 'legacy-duel',
    durationSeconds: 400,
    distanceKm: 1.2,
    comparedDistanceKm: 5,
  }));

  const resolved = resolveSavedDuelMatchResult(
    store,
    { id: 'finisher' },
    { mode: 'duel', matchId: 'legacy-duel', comparedDistanceKm: 5, myDurationSeconds: 1500 },
    NOW,
    { savingRun: { distanceKm: 5.02, durationSeconds: 1500 } },
  );

  assert.equal(resolved.resultTone, 'lose', 'legacy 경로는 기존 경과시간 비교 그대로여야 한다');
});

test('DUEL: without the saving run\'s measured distance the ordering falls back to elapsed', () => {
  const store = createStore();
  const matchId = createPrunedMatch(store, { participantIds: ['finisher', 'quitter'] });

  store.runs.push(savedRun('quitter', {
    matchId,
    durationSeconds: 400,
    distanceKm: 1.2,
    comparedDistanceKm: 5,
  }));

  // savingRun 미전달 → 내 완주 여부를 알 수 없다 → 기존 동작.
  const resolved = resolveSavedDuelMatchResult(
    store,
    { id: 'finisher' },
    { mode: 'duel', matchId, comparedDistanceKm: 5, myDurationSeconds: 1500 },
    NOW,
  );

  assert.equal(resolved.resultTone, 'lose');
});

test('GROUP: a quitter sinks below every finisher instead of stealing 1위', () => {
  const store = createStore();
  const matchId = createPrunedMatch(store, { mode: 'group', participantIds: ['finisher', 'quitter', 'mate'] });

  store.runs.push(savedRun('quitter', {
    matchId,
    mode: 'group',
    durationSeconds: 300, // 0.9km에서 그만뒀지만 경과시간은 제일 짧다
    distanceKm: 0.9,
    comparedDistanceKm: 5,
  }));
  store.runs.push(savedRun('mate', {
    matchId,
    mode: 'group',
    durationSeconds: 1600,
    distanceKm: 5.05,
    comparedDistanceKm: 5,
  }));

  const resolved = resolveSavedGroupMatchResult(
    store,
    { id: 'finisher' },
    { mode: 'group', matchId, comparedDistanceKm: 5, myDurationSeconds: 1500 },
    NOW,
    { savingRun: { distanceKm: 5.02, durationSeconds: 1500 } },
  );

  // 완주자 2명(1500s, 1600s)이 앞이고 중도포기가 꼴찌 → 나는 1위.
  assert.equal(resolved.rank, 1);
  assert.equal(resolved.participantCount, 3);
});

// ---------------------------------------------------------------------------
// 거울 일관성 — 한 대결의 답은 하나여야 한다
// ---------------------------------------------------------------------------

test('MIRROR: a duel straddling the session prune produces ONE winner, not two', () => {
  // 적대 검증 2026-08-11이 실증한 결함. 완주 우선 규칙은 세션 없는 경로에만 있고 라이브 경로에는
  // 없다(라이브는 경과시간만 보고, 목표 미달인 status:'finished'도 받는다). 두 저장이 prune을
  // 사이에 두고 갈리면 각자 다른 답이 '확정'으로 박제되고 40P가 지급됐다.
  const store = createStore();
  const matchId = createPrunedMatch(store, { participantIds: ['finisher', 'quitter'] });

  // 중도포기자는 세션이 살아있을 때 저장돼 라이브 경로가 경과시간만 보고 'win'을 확정했다.
  store.runs.push({
    id: 'run-quitter',
    userId: 'quitter',
    distanceKm: 4.0,
    durationSeconds: 1200,
    createdAt: NOW.toISOString(),
    matchResult: {
      mode: 'duel',
      matchId,
      comparedDistanceKm: 5,
      myDurationSeconds: 1200,
      resultTone: 'win',
      badgeLabel: '승리',
    },
  });

  const finisherSaved = resolveSavedDuelMatchResult(
    store,
    { id: 'finisher' },
    { mode: 'duel', matchId, comparedDistanceKm: 5, myDurationSeconds: 1500 },
    NOW,
    { savingRun: { distanceKm: 5.05, durationSeconds: 1500 } },
  );

  // 완주 우선만 보면 'win'이 되어 승자가 둘이 된다. 서버가 이미 확정한 상대 판정의 거울이 우선.
  assert.equal(finisherSaved.resultTone, 'lose');
});

test('MIRROR: a 기권 blob is NEVER mirrored — a client-claimed 기권승 cannot flip the opponent', () => {
  // 세션 없는 경로에서 기권 기록은 서버 검증 없이 그대로 통과한다. 그걸 거울로 삼으면 한쪽이
  // '기권승'을 주장하는 것만으로 상대 기록이 패배로 뒤집힌다 — 적대 검증이 제안한 원안의 구멍.
  const store = createStore();
  const matchId = createPrunedMatch(store, { participantIds: ['finisher', 'quitter'] });

  store.runs.push({
    id: 'run-quitter',
    userId: 'quitter',
    distanceKm: 1.2,
    durationSeconds: 400,
    createdAt: NOW.toISOString(),
    matchResult: {
      mode: 'duel',
      matchId,
      comparedDistanceKm: 5,
      myDurationSeconds: 400,
      resultTone: 'win',
      badgeLabel: '기권승', // 클라가 정한 값 — 서버가 덮어쓰지 않는다
    },
  });

  const finisherSaved = resolveSavedDuelMatchResult(
    store,
    { id: 'finisher' },
    { mode: 'duel', matchId, comparedDistanceKm: 5, myDurationSeconds: 1500 },
    NOW,
    { savingRun: { distanceKm: 5.05, durationSeconds: 1500 } },
  );

  // 기권 주장은 거울이 되지 못하고, 완주 우선 규칙이 정상적으로 완주자의 승리를 준다.
  assert.equal(finisherSaved.resultTone, 'win');
});

test('MIRROR: a PENDING opponent is not a mirror, so completion-first still applies', () => {
  const store = createStore();
  const matchId = createPrunedMatch(store, { participantIds: ['finisher', 'quitter'] });

  store.runs.push({
    id: 'run-quitter',
    userId: 'quitter',
    distanceKm: 1.2,
    durationSeconds: 400,
    createdAt: NOW.toISOString(),
    matchResult: {
      mode: 'duel',
      matchId,
      comparedDistanceKm: 5,
      myDurationSeconds: 400,
      badgeLabel: '결과 집계 중', // resultTone 없음
    },
  });

  const finisherSaved = resolveSavedDuelMatchResult(
    store,
    { id: 'finisher' },
    { mode: 'duel', matchId, comparedDistanceKm: 5, myDurationSeconds: 1500 },
    NOW,
    { savingRun: { distanceKm: 5.05, durationSeconds: 1500 } },
  );

  assert.equal(finisherSaved.resultTone, 'win');
});

test('isTrustworthyMatchEvidence: the goal override wins over the blob, and .every() misuse is guarded', () => {
  const quitRun = {
    distanceKm: 1.2,
    durationSeconds: 400,
    matchResult: { comparedDistanceKm: 1.2 }, // 얼어붙은 값 — 자기 자신을 목표로 삼는다
  };

  // 블롭만 보면 "목표 충족"으로 통과한다.
  assert.equal(isTrustworthyMatchEvidence(quitRun), true);
  // 로스터의 진짜 목표(5km)를 주면 통과하지 못한다.
  assert.equal(isTrustworthyMatchEvidence(quitRun, 5), false);
  // 0 / null / 음수 목표는 무시하고 블롭으로 되돌아간다(잘못된 override가 판정을 못 뒤집는다).
  assert.equal(isTrustworthyMatchEvidence(quitRun, 0), true);
  assert.equal(isTrustworthyMatchEvidence(quitRun, null), true);
  assert.equal(isTrustworthyMatchEvidence(quitRun, -5), true);

  // Array.prototype.every는 (element, index, array)를 넘긴다 — index가 목표 거리 자리에 들어가면
  // 목표가 1km, 2km…로 바뀌어 판정이 조용히 무너진다. 호출부는 반드시 화살표로 감싸야 한다.
  const realFinish = { distanceKm: 5.02, durationSeconds: 1500, matchResult: { comparedDistanceKm: 5 } };
  assert.equal([realFinish, quitRun].every((run) => isTrustworthyMatchEvidence(run, 5)), false);
});
