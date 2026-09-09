import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  MatchResultParticipant,
  MatchResultResponse,
} from '@/lib/api/types';
import {
  buildMatchResultScreenModel,
  type MatchResultScreenModel,
} from './matchResultScreenModel';

function participant(overrides: Partial<MatchResultParticipant> = {}): MatchResultParticipant {
  return {
    userId: 'user-1',
    name: '러너',
    districtName: '강남구',
    provinceName: '서울특별시',
    cityName: null,
    paceSecondsPerKm: 372,
    finishElapsedSeconds: 1530,
    distanceKm: 5,
    rank: 1,
    resultTone: null,
    forfeited: false,
    isMe: false,
    ...overrides,
  };
}

function assertDuel(
  model: MatchResultScreenModel,
): asserts model is Extract<MatchResultScreenModel, { mode: 'duel' }> {
  assert.equal(model.mode, 'duel');
}

function assertGroup(
  model: MatchResultScreenModel,
): asserts model is Extract<MatchResultScreenModel, { mode: 'group' }> {
  assert.equal(model.mode, 'group');
}

test('duel response → winner/loser rows with correct labels + WIN/LOSE tone', () => {
  const response: MatchResultResponse = {
    matchId: 'match-duel-1',
    mode: 'duel',
    source: 'official',
    comparedDistanceKm: 5,
    participants: [
      participant({
        userId: 'me',
        name: '나',
        districtName: '강남구',
        paceSecondsPerKm: 372, // 06:12/km
        finishElapsedSeconds: 1530, // 25:30
        rank: 1,
        resultTone: 'win',
        isMe: true,
      }),
      participant({
        userId: 'opp',
        name: '상대',
        districtName: '일산동구',
        paceSecondsPerKm: 390, // 06:30/km
        finishElapsedSeconds: 1620, // 27:00
        rank: 2,
        resultTone: 'lose',
        isMe: false,
      }),
    ],
  };

  const model = buildMatchResultScreenModel(response);
  assertDuel(model);

  assert.equal(model.draw, undefined);

  assert.equal(model.winner.name, '나');
  assert.equal(model.winner.resultTone, 'win');
  assert.equal(model.winner.regionLabel, '강남구');
  assert.equal(model.winner.paceLabel, '06:12/km');
  assert.equal(model.winner.timeLabel, '25:30');
  assert.equal(model.winner.isMe, true);
  assert.equal(model.winner.genderLabel, undefined);

  assert.equal(model.loser.name, '상대');
  assert.equal(model.loser.resultTone, 'lose');
  assert.equal(model.loser.regionLabel, '일산동구');
  assert.equal(model.loser.paceLabel, '06:30/km');
  assert.equal(model.loser.timeLabel, '27:00');
  assert.equal(model.loser.isMe, false);
});

test('duel winner is resolved by rank 1 when resultTone is absent', () => {
  const response: MatchResultResponse = {
    matchId: 'match-duel-rank',
    mode: 'duel',
    source: 'party',
    comparedDistanceKm: 3,
    participants: [
      participant({ userId: 'a', name: 'A', rank: 2, resultTone: null }),
      participant({ userId: 'b', name: 'B', rank: 1, resultTone: null }),
    ],
  };

  const model = buildMatchResultScreenModel(response);
  assertDuel(model);

  assert.equal(model.winner.name, 'B');
  assert.equal(model.loser.name, 'A');
});

test('duel draw flags draw and keeps both rows', () => {
  const response: MatchResultResponse = {
    matchId: 'match-duel-draw',
    mode: 'duel',
    source: 'official',
    comparedDistanceKm: 5,
    participants: [
      participant({ userId: 'me', name: '나', rank: 1, resultTone: 'draw', isMe: true }),
      participant({ userId: 'opp', name: '상대', rank: 1, resultTone: 'draw' }),
    ],
  };

  const model = buildMatchResultScreenModel(response);
  assertDuel(model);

  assert.equal(model.draw, true);
  assert.equal(model.winner.resultTone, 'draw');
  assert.equal(model.loser.resultTone, 'draw');
});

test('3-person group → rows ranked 1/2/3 in order', () => {
  const response: MatchResultResponse = {
    matchId: 'match-group-1',
    mode: 'group',
    source: 'official',
    comparedDistanceKm: 5,
    // Intentionally out of order to prove the model sorts by rank ascending.
    participants: [
      participant({ userId: 'c', name: '셋째', rank: 3, paceSecondsPerKm: 420, finishElapsedSeconds: 1800 }),
      participant({ userId: 'a', name: '첫째', rank: 1, paceSecondsPerKm: 360, finishElapsedSeconds: 1500, isMe: true }),
      participant({ userId: 'b', name: '둘째', rank: 2, paceSecondsPerKm: 390, finishElapsedSeconds: 1650 }),
    ],
  };

  const model = buildMatchResultScreenModel(response);
  assertGroup(model);

  assert.deepEqual(
    model.rows.map((row) => row.rank),
    [1, 2, 3],
  );
  assert.deepEqual(
    model.rows.map((row) => row.name),
    ['첫째', '둘째', '셋째'],
  );

  // Group rows carry no win/lose tone.
  assert.deepEqual(
    model.rows.map((row) => row.resultTone),
    [null, null, null],
  );

  const first = model.rows[0];
  assert.equal(first.paceLabel, '06:00/km');
  assert.equal(first.timeLabel, '25:00');
  assert.equal(first.isMe, true);
});

test('forfeited participant → paceLabel 기권 / timeLabel - ; null pace → -', () => {
  const response: MatchResultResponse = {
    matchId: 'match-group-forfeit',
    mode: 'group',
    source: 'official',
    comparedDistanceKm: 5,
    participants: [
      participant({ userId: 'a', name: '완주', rank: 1, paceSecondsPerKm: 360, finishElapsedSeconds: 1500 }),
      participant({
        userId: 'b',
        name: '기권자',
        rank: 2,
        forfeited: true,
        paceSecondsPerKm: null,
        finishElapsedSeconds: null,
      }),
      participant({
        userId: 'c',
        name: '미측정',
        rank: 3,
        forfeited: false,
        paceSecondsPerKm: null,
        finishElapsedSeconds: null,
      }),
    ],
  };

  const model = buildMatchResultScreenModel(response);
  assertGroup(model);

  const forfeitRow = model.rows.find((row) => row.name === '기권자');
  assert.ok(forfeitRow);
  assert.equal(forfeitRow.paceLabel, '기권');
  assert.equal(forfeitRow.timeLabel, '-');

  const missingRow = model.rows.find((row) => row.name === '미측정');
  assert.ok(missingRow);
  assert.equal(missingRow.paceLabel, '-');
  assert.equal(missingRow.timeLabel, '-');
});

test('region label is empty string when districtName is null', () => {
  const response: MatchResultResponse = {
    matchId: 'match-group-no-region',
    mode: 'group',
    source: 'official',
    comparedDistanceKm: 5,
    participants: [
      participant({ userId: 'a', name: '지역없음', rank: 1, districtName: null }),
    ],
  };

  const model = buildMatchResultScreenModel(response);
  assertGroup(model);

  assert.equal(model.rows[0].regionLabel, '');
});

test('§3-⑨: provisional/revised additive fields pass through onto the screen model (duel + group)', () => {
  const provisionalDuel = buildMatchResultScreenModel({
    matchId: 'match-duel-prov',
    mode: 'duel',
    source: 'official',
    comparedDistanceKm: 5,
    provisional: true,
    participants: [
      participant({ userId: 'me', rank: 1, resultTone: 'win', isMe: true }),
      participant({ userId: 'opp', rank: 2, resultTone: 'lose' }),
    ],
  });
  assertDuel(provisionalDuel);
  assert.equal(provisionalDuel.provisional, true);
  assert.equal(provisionalDuel.revised, undefined);

  const revisedDuel = buildMatchResultScreenModel({
    matchId: 'match-duel-rev',
    mode: 'duel',
    source: 'official',
    comparedDistanceKm: 5,
    revised: true,
    participants: [
      participant({ userId: 'me', rank: 1, resultTone: 'win', isMe: true }),
      participant({ userId: 'opp', rank: 2, resultTone: 'lose' }),
    ],
  });
  assertDuel(revisedDuel);
  assert.equal(revisedDuel.revised, true);

  const provisionalGroup = buildMatchResultScreenModel({
    matchId: 'match-group-prov',
    mode: 'group',
    source: 'official',
    comparedDistanceKm: 5,
    provisional: true,
    participants: [
      participant({ userId: 'me', rank: 1, isMe: true }),
      participant({ userId: 'p2', rank: 2 }),
    ],
  });
  assertGroup(provisionalGroup);
  assert.equal(provisionalGroup.provisional, true);
});

test('§3-⑨: fields absent on an old backend → model carries neither flag (renders nothing)', () => {
  const model = buildMatchResultScreenModel({
    matchId: 'match-duel-old',
    mode: 'duel',
    source: 'official',
    comparedDistanceKm: 5,
    participants: [
      participant({ userId: 'me', rank: 1, resultTone: 'win', isMe: true }),
      participant({ userId: 'opp', rank: 2, resultTone: 'lose' }),
    ],
  });
  assertDuel(model);
  assert.equal(model.provisional, undefined);
  assert.equal(model.revised, undefined);
});

// 오너 실기기 대결 2026-08-09 (duel-match-e545bceb). One runner's saved blob was still PENDING, so
// no row carried 'win'. The server orders the explicit 'lose' row FIRST, and the old fallback took
// "the first row" as the winner — crowning the runner who had just declared themselves the loser,
// while the genuine winner (the faster finish) was shown as LOSE.
test('duel with one PENDING side → the explicit loser is never crowned; the other row wins', () => {
  const model = buildMatchResultScreenModel({
    matchId: 'duel-match-e545bceb',
    mode: 'duel',
    source: 'party',
    comparedDistanceKm: 6,
    participants: [
      // Sorted first by the server precisely BECAUSE it carries a definite 'lose'.
      participant({
        userId: 'user-membera',
        name: '회원A',
        finishElapsedSeconds: 2261,
        rank: null,
        resultTone: 'lose',
        isMe: false,
      }),
      participant({
        userId: 'user-memberi',
        name: '회원I',
        finishElapsedSeconds: 2227,
        rank: null,
        resultTone: null, // PENDING — "결과 집계 중"
        isMe: true,
      }),
    ],
  });
  assertDuel(model);

  assert.equal(model.winner.name, '회원I');
  assert.equal(model.loser.name, '회원A');
  // The faster finish is the winner, matching the 기록 상세 card for the same run.
  assert.ok(model.winner.timeLabel);
  assert.equal(model.unresolved, undefined);
});

test('duel with nothing identifying a winner → unresolved, no fabricated WIN', () => {
  const model = buildMatchResultScreenModel({
    matchId: 'duel-unknown',
    mode: 'duel',
    source: 'party',
    comparedDistanceKm: 6,
    participants: [
      participant({ userId: 'a', name: '가', rank: null, resultTone: null, isMe: true }),
      participant({ userId: 'b', name: '나', rank: null, resultTone: null, isMe: false }),
    ],
  });
  assertDuel(model);

  assert.equal(model.unresolved, true);
  // Both rows are still returned (render order only) — neither is labelled a winner.
  assert.equal(model.winner.resultTone, null);
  assert.equal(model.loser.resultTone, null);
});

test('duel where both sides say lose (impossible pair) stays unresolved rather than guessing', () => {
  const model = buildMatchResultScreenModel({
    matchId: 'duel-both-lose',
    mode: 'duel',
    source: 'party',
    comparedDistanceKm: 6,
    participants: [
      participant({ userId: 'a', name: '가', rank: null, resultTone: 'lose', isMe: true }),
      participant({ userId: 'b', name: '나', rank: null, resultTone: 'lose', isMe: false }),
    ],
  });
  assertDuel(model);

  assert.equal(model.unresolved, true);
});

test('실격된 참가자의 페이스 칸은 실격, 일반 기권자는 기권', () => {
  const model = buildMatchResultScreenModel({
    matchId: 'match-dq',
    mode: 'group',
    source: 'official',
    comparedDistanceKm: 5,
    participants: [
      participant({ userId: 'winner', name: '승자', rank: 1, isMe: true }),
      participant({ userId: 'dq', name: '회원E', rank: 2, forfeited: true, disqualified: true, paceSecondsPerKm: null, finishElapsedSeconds: null }),
      participant({ userId: 'ff', name: '기권자', rank: 3, forfeited: true, paceSecondsPerKm: null, finishElapsedSeconds: null }),
    ],
  });
  assertGroup(model);

  assert.equal(model.rows[1].paceLabel, '실격');
  assert.equal(model.rows[2].paceLabel, '기권');
});
