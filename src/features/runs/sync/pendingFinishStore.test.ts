import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import {
  __resetPendingFinishesForTest,
  __setPendingFinishStorageForTest,
  clearPendingFinish,
  getPendingFinish,
  hasPendingFinish,
  hydratePendingFinishes,
  listPendingFinishes,
  rememberPendingFinish,
} from './pendingFinishStore';

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

beforeEach(() => {
  __resetPendingFinishesForTest();
  __setPendingFinishStorageForTest(makeFakeStorage());
});

test('C1: remembers a valid pending-finish intent', () => {
  rememberPendingFinish({ matchId: 'm1', finishElapsedSeconds: 1500, distanceKm: 5, pace: '5:00/km' });
  assert.equal(hasPendingFinish('m1'), true);
  assert.deepEqual(getPendingFinish('m1'), {
    matchId: 'm1',
    finishElapsedSeconds: 1500,
    distanceKm: 5,
    pace: '5:00/km',
  });
});

test('C1 no-0 guard: a 0 finishElapsedSeconds intent is rejected', () => {
  rememberPendingFinish({ matchId: 'm0', finishElapsedSeconds: 0, distanceKm: 5, pace: '5:00/km' });
  assert.equal(hasPendingFinish('m0'), false);
  assert.equal(getPendingFinish('m0'), null);
});

test('C1: re-remembering the same matchId overwrites (idempotent first-write-wins on server)', () => {
  rememberPendingFinish({ matchId: 'm1', finishElapsedSeconds: 1500, distanceKm: 5, pace: '5:00/km' });
  rememberPendingFinish({ matchId: 'm1', finishElapsedSeconds: 1500, distanceKm: 5.01, pace: '5:00/km' });
  assert.equal(listPendingFinishes().length, 1);
  assert.equal(getPendingFinish('m1')?.distanceKm, 5.01);
});

test('C1: clearing on server ACK removes the intent', () => {
  rememberPendingFinish({ matchId: 'm1', finishElapsedSeconds: 1500, distanceKm: 5, pace: '5:00/km' });
  clearPendingFinish('m1');
  assert.equal(hasPendingFinish('m1'), false);
  assert.equal(listPendingFinishes().length, 0);
});

test('C1: cold-start hydration restores a persisted intent for re-delivery', async () => {
  const storage = makeFakeStorage();
  storage.store.set(
    'runningground.pendingFinish.v1',
    JSON.stringify([{ matchId: 'mPersisted', finishElapsedSeconds: 1800, distanceKm: 6, pace: '5:30/km' }]),
  );
  __resetPendingFinishesForTest();
  __setPendingFinishStorageForTest(storage);

  const hydrated = await hydratePendingFinishes();
  assert.equal(hydrated.length, 1);
  assert.equal(getPendingFinish('mPersisted')?.finishElapsedSeconds, 1800);
});

test('C1: hydration drops a corrupt 0-elapsed persisted intent', async () => {
  const storage = makeFakeStorage();
  storage.store.set(
    'runningground.pendingFinish.v1',
    JSON.stringify([{ matchId: 'mBad', finishElapsedSeconds: 0, distanceKm: 6, pace: '5:30/km' }]),
  );
  __resetPendingFinishesForTest();
  __setPendingFinishStorageForTest(storage);

  const hydrated = await hydratePendingFinishes();
  assert.equal(hydrated.length, 0);
});
