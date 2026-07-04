import assert from 'node:assert/strict';
import test from 'node:test';
import { runLockFreePollRead } from './lockFreePollRead.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('pure read serves the probe result WITHOUT taking the store lock', async () => {
  const persisted = { rooms: [{ id: 'r1', state: 'waiting' }] };
  let mutateCalls = 0;

  const result = await runLockFreePollRead({
    loadStore: async () => clone(persisted),
    mutateStore: async (compute) => {
      mutateCalls += 1;
      return compute(clone(persisted));
    },
    compute: (store) => store.rooms[0].state,
  });

  assert.equal(result, 'waiting');
  assert.equal(mutateCalls, 0);
});

test('a mutating compute discards the probe and serves the LOCKED re-run result', async () => {
  // Simulates matchmaking-style id generation: the probe and the locked run generate
  // DIFFERENT ids — the response must carry the persisted one, never the phantom.
  const persisted = { sessions: [] };
  let nextId = 0;
  let mutateCalls = 0;

  const compute = (store) => {
    nextId += 1;
    const id = `session-${nextId}`;
    store.sessions.push({ id });
    return id;
  };

  const result = await runLockFreePollRead({
    loadStore: async () => clone(persisted),
    mutateStore: async (mutator) => {
      mutateCalls += 1;
      return mutator(persisted);
    },
    compute,
  });

  assert.equal(mutateCalls, 1);
  // Probe generated session-1 on a throwaway clone; the locked run generated session-2
  // and persisted it — the caller must receive the persisted id.
  assert.equal(result, 'session-2');
  assert.deepEqual(persisted.sessions, [{ id: 'session-2' }]);
});

test('a probe throw (auth failure) propagates without touching the lock', async () => {
  let mutateCalls = 0;

  await assert.rejects(
    runLockFreePollRead({
      loadStore: async () => ({ users: [] }),
      mutateStore: async () => {
        mutateCalls += 1;
      },
      compute: () => {
        throw new Error('세션이 만료됐어');
      },
    }),
    /세션이 만료됐어/,
  );
  assert.equal(mutateCalls, 0);
});
