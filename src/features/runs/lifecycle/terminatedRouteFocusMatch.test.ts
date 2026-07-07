import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearRouteFocusMatchTerminated,
  hydrateTerminatedRouteFocusMatches,
  isRouteFocusMatchTerminated,
  markRouteFocusMatchTerminated,
  resetTerminatedRouteFocusMatchesForTest,
  __setTerminatedRouteFocusStorageForTest,
} from '@/features/runs/lifecycle/terminatedRouteFocusMatch';

function createFakeStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      store.set(key, value);
    },
    snapshot: () => store,
  };
}

test('marks and reads a terminated route-focus match id', () => {
  resetTerminatedRouteFocusMatchesForTest();
  assert.equal(isRouteFocusMatchTerminated('match-1'), false);

  markRouteFocusMatchTerminated('match-1');
  assert.equal(isRouteFocusMatchTerminated('match-1'), true);
  assert.equal(isRouteFocusMatchTerminated('match-2'), false);

  resetTerminatedRouteFocusMatchesForTest();
});

test('null/undefined match ids are no-ops', () => {
  resetTerminatedRouteFocusMatchesForTest();
  markRouteFocusMatchTerminated(null);
  markRouteFocusMatchTerminated(undefined);
  assert.equal(isRouteFocusMatchTerminated(null), false);
  assert.equal(isRouteFocusMatchTerminated(undefined), false);
  resetTerminatedRouteFocusMatchesForTest();
});

test('the tombstone expires after its 24h TTL (C-7: >10min re-entry stays suppressed)', () => {
  resetTerminatedRouteFocusMatchesForTest();
  const base = 1_000_000;
  markRouteFocusMatchTerminated('match-ttl', base);

  // Still within TTL.
  assert.equal(isRouteFocusMatchTerminated('match-ttl', base + 60_000), true);
  // The old 10-minute TTL made a >10min running-tab re-entry re-force the dead arena — a
  // 15-minute-later consult must still be suppressed now.
  assert.equal(isRouteFocusMatchTerminated('match-ttl', base + 15 * 60 * 1000), true);
  // Just inside 24h.
  assert.equal(isRouteFocusMatchTerminated('match-ttl', base + 24 * 60 * 60 * 1000 - 1), true);
  // Past 24h.
  assert.equal(isRouteFocusMatchTerminated('match-ttl', base + 24 * 60 * 60 * 1000 + 1), false);

  resetTerminatedRouteFocusMatchesForTest();
});

test('C-7: tombstones round-trip through storage (app-kill relaunch keeps the suppression)', async () => {
  resetTerminatedRouteFocusMatchesForTest();
  const storage = createFakeStorage();
  __setTerminatedRouteFocusStorageForTest(storage);

  const base = 5_000_000;
  markRouteFocusMatchTerminated('match-persisted', base);
  assert.equal(isRouteFocusMatchTerminated('match-persisted', base + 1_000), true);
  // The write-through is fire-and-forget; let the microtask settle before reading it back.
  await Promise.resolve();
  assert.ok(storage.snapshot().size > 0, 'mark must write the tombstone through to storage');

  // Simulate an app kill: the in-memory Map is wiped, the persisted blob survives.
  resetTerminatedRouteFocusMatchesForTest();
  __setTerminatedRouteFocusStorageForTest(storage);
  assert.equal(isRouteFocusMatchTerminated('match-persisted', base + 2_000), false);

  // Relaunch hydration restores it → the stale forceMatchArena route params stay suppressed.
  await hydrateTerminatedRouteFocusMatches(base + 2_000);
  assert.equal(isRouteFocusMatchTerminated('match-persisted', base + 2_000), true);

  __setTerminatedRouteFocusStorageForTest(null);
  resetTerminatedRouteFocusMatchesForTest();
});

test('C-7: hydration drops expired entries and never overrides an in-session mark', async () => {
  resetTerminatedRouteFocusMatchesForTest();
  const base = 9_000_000;
  // Constant blob (writes ignored): isolates the hydration MERGE semantics from the
  // whole-map write-through, so the pre-hydration mark below cannot clobber the seed.
  const seededBlob = JSON.stringify([
    ['match-expired', base - 1],
    ['match-live', base + 60_000],
    ['match-in-session', base + 1_000],
  ]);
  __setTerminatedRouteFocusStorageForTest({
    getItem: async () => seededBlob,
    setItem: async () => {},
  });

  // Marked THIS session before hydration finished — must keep its fresh 24h expiry.
  markRouteFocusMatchTerminated('match-in-session', base);

  await hydrateTerminatedRouteFocusMatches(base);

  assert.equal(isRouteFocusMatchTerminated('match-expired', base), false);
  assert.equal(isRouteFocusMatchTerminated('match-live', base), true);
  // The persisted near-expiry entry (base+1s) must NOT clobber the in-session 24h mark.
  assert.equal(isRouteFocusMatchTerminated('match-in-session', base + 2_000), true);

  __setTerminatedRouteFocusStorageForTest(null);
  resetTerminatedRouteFocusMatchesForTest();
});

test('clearRouteFocusMatchTerminated removes one id, or all when omitted', () => {
  resetTerminatedRouteFocusMatchesForTest();
  markRouteFocusMatchTerminated('a');
  markRouteFocusMatchTerminated('b');

  clearRouteFocusMatchTerminated('a');
  assert.equal(isRouteFocusMatchTerminated('a'), false);
  assert.equal(isRouteFocusMatchTerminated('b'), true);

  clearRouteFocusMatchTerminated();
  assert.equal(isRouteFocusMatchTerminated('b'), false);

  resetTerminatedRouteFocusMatchesForTest();
});
