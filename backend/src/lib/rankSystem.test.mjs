import assert from 'node:assert/strict';

import {
  applyLpDelta,
  DUEL_LP,
  GROUP_LP,
  INITIAL_RANK,
  resolveDuelMatchLpDeltas,
  resolveGroupMatchLpDelta,
} from './rankSystem.mjs';

assert.deepEqual(applyLpDelta({ tier: '아이언', division: 4, lp: 40 }, 20), {
  tier: '아이언',
  division: 4,
  lp: 60,
  promoted: false,
  demoted: false,
});

assert.deepEqual(applyLpDelta({ tier: '아이언', division: 4, lp: 40 }, -10), {
  tier: '아이언',
  division: 4,
  lp: 30,
  promoted: false,
  demoted: false,
});

assert.deepEqual(applyLpDelta({ tier: '아이언', division: 4, lp: 90 }, 20), {
  tier: '아이언',
  division: 3,
  lp: 10,
  promoted: true,
  demoted: false,
});

assert.deepEqual(applyLpDelta({ tier: '아이언', division: 1, lp: 90 }, 20), {
  tier: '브론즈',
  division: 4,
  lp: 10,
  promoted: true,
  demoted: false,
});

assert.deepEqual(applyLpDelta({ tier: '브론즈', division: 4, lp: 5 }, -20), {
  tier: '아이언',
  division: 1,
  lp: 85,
  promoted: false,
  demoted: true,
});

assert.deepEqual(applyLpDelta(INITIAL_RANK, 250), {
  tier: '아이언',
  division: 2,
  lp: 50,
  promoted: true,
  demoted: false,
});

assert.deepEqual(applyLpDelta({ tier: '아이언', division: 4, lp: 10 }, -50), {
  tier: '아이언',
  division: 4,
  lp: 0,
  promoted: false,
  demoted: false,
});

assert.deepEqual(applyLpDelta({ tier: '다이아', division: 1, lp: 95 }, 30), {
  tier: '다이아',
  division: 1,
  lp: 100,
  promoted: false,
  demoted: false,
});

const immutableRank = { tier: '실버', division: 2, lp: 50 };
assert.deepEqual(applyLpDelta(immutableRank, 80), {
  tier: '실버',
  division: 1,
  lp: 30,
  promoted: true,
  demoted: false,
});
assert.deepEqual(immutableRank, { tier: '실버', division: 2, lp: 50 });

assert.deepEqual(resolveDuelMatchLpDeltas({
  winnerPaceSecPerKm: 330,
  loserPaceSecPerKm: 300,
}), {
  winnerLpDelta: DUEL_LP.winVsFaster,
  loserLpDelta: DUEL_LP.lossVsSlower,
});

assert.deepEqual(resolveDuelMatchLpDeltas({
  winnerPaceSecPerKm: 330,
  loserPaceSecPerKm: 337,
}), {
  winnerLpDelta: DUEL_LP.winVsSimilar,
  loserLpDelta: DUEL_LP.lossVsSimilar,
});

assert.deepEqual(resolveDuelMatchLpDeltas({
  winnerPaceSecPerKm: 300,
  loserPaceSecPerKm: 330,
}), {
  winnerLpDelta: DUEL_LP.winVsSlower,
  loserLpDelta: DUEL_LP.lossVsFaster,
});

assert.deepEqual(resolveDuelMatchLpDeltas({
  winnerPaceSecPerKm: null,
  loserPaceSecPerKm: Number.NaN,
}), {
  winnerLpDelta: DUEL_LP.winVsSimilar,
  loserLpDelta: DUEL_LP.lossVsSimilar,
});

assert.equal(resolveGroupMatchLpDelta({ placement: 1, totalParticipants: 10 }), GROUP_LP.top);
assert.equal(resolveGroupMatchLpDelta({ placement: 3, totalParticipants: 10 }), GROUP_LP.top);
assert.equal(resolveGroupMatchLpDelta({ placement: 4, totalParticipants: 10 }), GROUP_LP.middle);
assert.equal(resolveGroupMatchLpDelta({ placement: 7, totalParticipants: 10 }), GROUP_LP.middle);
assert.equal(resolveGroupMatchLpDelta({ placement: 8, totalParticipants: 10 }), GROUP_LP.bottom);
assert.equal(resolveGroupMatchLpDelta({ placement: 10, totalParticipants: 10 }), GROUP_LP.bottom);
assert.equal(resolveGroupMatchLpDelta({ placement: 0, totalParticipants: 10 }), 0);
assert.equal(resolveGroupMatchLpDelta({ placement: 11, totalParticipants: 10 }), 0);
assert.equal(resolveGroupMatchLpDelta({ placement: 1, totalParticipants: 0 }), 0);
