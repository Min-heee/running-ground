import assert from 'node:assert/strict';

import {
  applyLpDelta,
  DUEL_LP,
  GROUP_LP,
  INITIAL_RANK,
  resolveDuelMatchLpDeltas,
  resolveGroupMatchLpDelta,
} from './rankSystem.mjs';

assert.deepEqual(applyLpDelta({ tier: '입문', lp: 40 }, 20), {
  tier: '입문',
  lp: 60,
  promoted: false,
  demoted: false,
});

assert.deepEqual(applyLpDelta({ tier: '입문', lp: 40 }, -10), {
  tier: '입문',
  lp: 30,
  promoted: false,
  demoted: false,
});

assert.deepEqual(applyLpDelta({ tier: '입문', lp: 50 }, 50), {
  tier: '러너',
  lp: 0,
  promoted: true,
  demoted: false,
});

assert.deepEqual(applyLpDelta(INITIAL_RANK, 250), {
  tier: '페이서',
  lp: 50,
  promoted: true,
  demoted: false,
});

assert.deepEqual(applyLpDelta(INITIAL_RANK, 50), {
  tier: '입문',
  lp: 50,
  promoted: false,
  demoted: false,
});

assert.deepEqual(applyLpDelta({ tier: '입문', lp: 50 }, -150), {
  tier: '입문',
  lp: 0,
  promoted: false,
  demoted: false,
});

assert.deepEqual(applyLpDelta({ tier: '조거', lp: 50 }, -100), {
  tier: '입문',
  lp: 50,
  promoted: false,
  demoted: true,
});

assert.deepEqual(applyLpDelta({ tier: '조거', lp: 50 }, 0), {
  tier: '러너',
  lp: 50,
  promoted: false,
  demoted: false,
});

assert.deepEqual(applyLpDelta({ tier: '엘리트', lp: 1000 }, 200), {
  tier: '엘리트',
  lp: 1200,
  promoted: false,
  demoted: false,
});

const immutableRank = { tier: '러너', lp: 50 };
assert.deepEqual(applyLpDelta(immutableRank, 180), {
  tier: '레이서',
  lp: 30,
  promoted: true,
  demoted: false,
});
assert.deepEqual(immutableRank, { tier: '러너', lp: 50 });

assert.deepEqual(resolveDuelMatchLpDeltas({
  winnerPaceSecPerKm: 330,
  loserPaceSecPerKm: 300,
}), {
  winnerLpDelta: DUEL_LP.winVsFaster,
  loserLpDelta: DUEL_LP.loss,
});

assert.deepEqual(resolveDuelMatchLpDeltas({
  winnerPaceSecPerKm: 330,
  loserPaceSecPerKm: 337,
}), {
  winnerLpDelta: DUEL_LP.winVsSimilar,
  loserLpDelta: DUEL_LP.loss,
});

assert.deepEqual(resolveDuelMatchLpDeltas({
  winnerPaceSecPerKm: 300,
  loserPaceSecPerKm: 330,
}), {
  winnerLpDelta: DUEL_LP.winVsSlower,
  loserLpDelta: DUEL_LP.loss,
});

assert.deepEqual(resolveDuelMatchLpDeltas({
  winnerPaceSecPerKm: null,
  loserPaceSecPerKm: Number.NaN,
}), {
  winnerLpDelta: DUEL_LP.winVsSimilar,
  loserLpDelta: DUEL_LP.loss,
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
