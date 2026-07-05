import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import {
  __resetLocalGoalFreezesForTest,
  __setLocalGoalFreezeStorageForTest,
  buildPendingFinishIntentFromFreeze,
  clearLocalGoalFreeze,
  getLocalGoalFreeze,
  hydrateLocalGoalFreezes,
  listLocalGoalFreezes,
  recordLocalGoalFreezeOnce,
  type LocalGoalFreeze,
} from './localGoalFreezeStore';

const STORAGE_KEY = 'runningground.localGoalFreeze.v1';

function makeFakeStorage() {
  const store = new Map<string, string>();
  return {
    store,
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

function freeze(overrides?: Partial<LocalGoalFreeze>): LocalGoalFreeze {
  return {
    matchId: 'm1',
    elapsedSeconds: 1_606,
    distanceKm: 5,
    pace: '05:21/km',
    crossedAtIso: '2026-05-15T00:26:46.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  __resetLocalGoalFreezesForTest();
  __setLocalGoalFreezeStorageForTest(makeFakeStorage());
});

test('records a valid at-crossing freeze', () => {
  recordLocalGoalFreezeOnce(freeze());
  assert.deepEqual(getLocalGoalFreeze('m1'), freeze());
});

test('LOCAL first-write-wins: a second record for the same matchId is ignored', () => {
  recordLocalGoalFreezeOnce(freeze());
  // A retry tick / last-resort site re-records with DRIFTED values — must be a no-op.
  recordLocalGoalFreezeOnce(freeze({ elapsedSeconds: 1_930, distanceKm: 5.4 }));

  assert.equal(listLocalGoalFreezes().length, 1);
  assert.equal(getLocalGoalFreeze('m1')?.elapsedSeconds, 1_606, 'the FIRST (crossing-time) elapsed survives');
  assert.equal(getLocalGoalFreeze('m1')?.distanceKm, 5);
});

test('validation rejects 0/NaN elapsed and non-positive/non-finite distance', () => {
  recordLocalGoalFreezeOnce(freeze({ elapsedSeconds: 0 }));
  recordLocalGoalFreezeOnce(freeze({ elapsedSeconds: Number.NaN }));
  recordLocalGoalFreezeOnce(freeze({ distanceKm: 0 }));
  recordLocalGoalFreezeOnce(freeze({ distanceKm: Number.POSITIVE_INFINITY }));
  recordLocalGoalFreezeOnce(freeze({ matchId: '' }));

  assert.equal(listLocalGoalFreezes().length, 0, 'no invalid freeze may ever reach the save clamp');
});

test('hydration round-trip: a persisted freeze survives a cold restart', async () => {
  const storage = makeFakeStorage();
  storage.store.set(STORAGE_KEY, JSON.stringify([freeze({ matchId: 'mPersisted' })]));
  __resetLocalGoalFreezesForTest();
  __setLocalGoalFreezeStorageForTest(storage);

  const hydrated = await hydrateLocalGoalFreezes();
  assert.equal(hydrated.length, 1);
  assert.deepEqual(getLocalGoalFreeze('mPersisted'), freeze({ matchId: 'mPersisted' }));
});

test('hydration drops corrupt persisted entries (0 elapsed / missing fields)', async () => {
  const storage = makeFakeStorage();
  storage.store.set(STORAGE_KEY, JSON.stringify([
    freeze({ matchId: 'mBad', elapsedSeconds: 0 }),
    { matchId: 'mShapeless' },
    'garbage',
  ]));
  __resetLocalGoalFreezesForTest();
  __setLocalGoalFreezeStorageForTest(storage);

  const hydrated = await hydrateLocalGoalFreezes();
  assert.equal(hydrated.length, 0);
});

test('hydration keeps first-write-wins: a freeze recorded THIS session beats the persisted one', async () => {
  const storage = makeFakeStorage();
  storage.store.set(STORAGE_KEY, JSON.stringify([freeze({ matchId: 'm1', elapsedSeconds: 999 })]));
  __resetLocalGoalFreezesForTest();
  __setLocalGoalFreezeStorageForTest(storage);

  recordLocalGoalFreezeOnce(freeze({ elapsedSeconds: 1_606 }));
  await hydrateLocalGoalFreezes();

  assert.equal(getLocalGoalFreeze('m1')?.elapsedSeconds, 1_606, 'the in-session record is not overwritten');
});

test('clear-on-save removes the freeze from memory AND from the persisted blob', async () => {
  const storage = makeFakeStorage();
  __setLocalGoalFreezeStorageForTest(storage);
  recordLocalGoalFreezeOnce(freeze());

  clearLocalGoalFreeze('m1');
  assert.equal(getLocalGoalFreeze('m1'), null);
  assert.equal(listLocalGoalFreezes().length, 0);

  // persist() is fire-and-forget — settle the microtask, then the blob must be empty.
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  assert.equal(storage.store.get(STORAGE_KEY), JSON.stringify([]));
});

test('clearing an unknown matchId is a no-op', () => {
  recordLocalGoalFreezeOnce(freeze());
  clearLocalGoalFreeze('mOther');
  assert.equal(listLocalGoalFreezes().length, 1);
});

// --- buildPendingFinishIntentFromFreeze (Stage 3c pure helper) ---

const LIVE_PROGRESS = {
  matchId: 'm1',
  elapsedSeconds: 1_930,
  distanceKm: 5.4,
  pace: '06:02/km',
};

test('intent builder prefers the at-crossing freeze over drifted live progress', () => {
  assert.deepEqual(buildPendingFinishIntentFromFreeze(freeze(), LIVE_PROGRESS), {
    matchId: 'm1',
    finishElapsedSeconds: 1_606,
    distanceKm: 5,
    pace: '05:21/km',
  });
});

test('intent builder falls back to live progress when no freeze exists (legacy behavior)', () => {
  assert.deepEqual(buildPendingFinishIntentFromFreeze(null, LIVE_PROGRESS), {
    matchId: 'm1',
    finishElapsedSeconds: 1_930,
    distanceKm: 5.4,
    pace: '06:02/km',
  });
});

test('intent builder ignores a freeze for a DIFFERENT match (exact-matchId scoping)', () => {
  const intent = buildPendingFinishIntentFromFreeze(freeze({ matchId: 'mOther' }), LIVE_PROGRESS);
  assert.equal(intent.finishElapsedSeconds, 1_930, 'cross-match freeze must never leak into the intent');
  assert.equal(intent.matchId, 'm1');
});

test('intent builder ignores an invalid freeze (defensive: falls back to live values)', () => {
  const intent = buildPendingFinishIntentFromFreeze(freeze({ elapsedSeconds: 0 }), LIVE_PROGRESS);
  assert.equal(intent.finishElapsedSeconds, 1_930);
});
