import assert from 'node:assert/strict';

import {
  buildCorrectedDuelMatchResult,
  isDuelCorrectionAlreadyApplied,
} from './correctDuelBlobTransform.mjs';

// The iPhone's stuck PENDING blob (the shape toPendingDuelMatchResult leaves behind:
// no resultTone / opponent duration / gapKm, 집계 중 copy) heals to the WIN shape.
const pendingIphoneBlob = {
  mode: 'duel',
  title: '대결 결과를 집계하고 있어요',
  summary: '상대가 완주하면 결과가 자동으로 업데이트돼요.',
  badgeLabel: '결과 집계 중',
  matchId: 'match-1',
  source: 'official',
  opponentName: '갤럭시러너',
  opponentId: 'user-galaxy',
  comparedDistanceKm: 5,
  myPaceLabel: '5:21/km',
  myDurationSeconds: 1606,
};

const correctedWin = buildCorrectedDuelMatchResult({
  matchResult: pendingIphoneBlob,
  outcome: 'win',
  myDurationSeconds: 1606,
  opponentDurationSeconds: 1622,
  opponentId: 'user-galaxy',
  opponentName: '갤럭시러너',
  opponentPaceLabel: '5:24/km',
});

assert.equal(correctedWin.resultTone, 'win');
assert.equal(correctedWin.title, '갤럭시러너님을 이겼어요');
assert.equal(correctedWin.badgeLabel, '승리');
assert.equal(correctedWin.summary, '상대보다 16초 앞서 마무리했어요.');
assert.equal(correctedWin.myDurationSeconds, 1606);
assert.equal(correctedWin.opponentDurationSeconds, 1622);
assert.equal(correctedWin.opponentId, 'user-galaxy');
assert.equal(correctedWin.opponentPaceLabel, '5:24/km');
// Untouched carrier fields survive.
assert.equal(correctedWin.matchId, 'match-1');
assert.equal(correctedWin.source, 'official');
assert.equal(correctedWin.myPaceLabel, '5:21/km');
// Input blob is not mutated.
assert.equal(pendingIphoneBlob.resultTone, undefined);

// The Galaxy's win-shaped blob (sealed verdict the phone displayed) flips to LOSE, and the
// stale live gapKm is dropped.
const galaxyWinBlob = {
  mode: 'duel',
  title: '아이폰러너님보다 먼저 완주했어요',
  summary: '0.42km 차이로 앞서 마무리했어요.',
  badgeLabel: '승리',
  matchId: 'match-1',
  source: 'official',
  resultTone: 'win',
  opponentName: '아이폰러너',
  opponentId: 'user-iphone',
  gapKm: 0.42,
  myDurationSeconds: 1622,
};

const correctedLose = buildCorrectedDuelMatchResult({
  matchResult: galaxyWinBlob,
  outcome: 'lose',
  myDurationSeconds: 1622,
  opponentDurationSeconds: 1606,
  opponentId: 'user-iphone',
  opponentName: '아이폰러너',
});

assert.equal(correctedLose.resultTone, 'lose');
assert.equal(correctedLose.title, '아이폰러너님에게 졌어요');
assert.equal(correctedLose.badgeLabel, '패배');
assert.equal(correctedLose.summary, '상대보다 16초 뒤에서 마무리했어요.');
assert.equal(correctedLose.opponentDurationSeconds, 1606);
assert.equal('gapKm' in correctedLose, false);
assert.equal('opponentPaceLabel' in correctedLose, false);

// Outcome must agree with the measured durations — a contradictory request throws.
assert.throws(() => buildCorrectedDuelMatchResult({
  matchResult: pendingIphoneBlob,
  outcome: 'lose',
  myDurationSeconds: 1606,
  opponentDurationSeconds: 1622,
  opponentId: 'user-galaxy',
  opponentName: '갤럭시러너',
}));

// Equal durations (draw) are out of scope and throw.
assert.throws(() => buildCorrectedDuelMatchResult({
  matchResult: pendingIphoneBlob,
  outcome: 'win',
  myDurationSeconds: 1606,
  opponentDurationSeconds: 1606,
  opponentId: 'user-galaxy',
  opponentName: '갤럭시러너',
}));

// Idempotency: the corrected blob reports already-applied; the originals do not.
const winTarget = {
  outcome: 'win',
  myDurationSeconds: 1606,
  opponentDurationSeconds: 1622,
  opponentId: 'user-galaxy',
};
assert.equal(isDuelCorrectionAlreadyApplied(correctedWin, winTarget), true);
assert.equal(isDuelCorrectionAlreadyApplied(pendingIphoneBlob, winTarget), false);
assert.equal(isDuelCorrectionAlreadyApplied(galaxyWinBlob, {
  outcome: 'lose',
  myDurationSeconds: 1622,
  opponentDurationSeconds: 1606,
  opponentId: 'user-iphone',
}), false);
assert.equal(isDuelCorrectionAlreadyApplied(correctedLose, {
  outcome: 'lose',
  myDurationSeconds: 1622,
  opponentDurationSeconds: 1606,
  opponentId: 'user-iphone',
}), true);

console.log('correct-duel-2026-07-04 blob transform tests passed');
