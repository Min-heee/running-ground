import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasAnyLiveMatchMarkedMounted,
  isLiveMatchMarkedMounted,
  markLiveMatchMounted,
  resetLiveMatchMountedRegistryForTest,
  subscribeLiveMatchMounted,
  unmarkLiveMatchMounted,
} from '@/features/runs/lifecycle/liveMatchMountedRegistry';

test('live match mounted registry notifies cleanup subscribers once per match mount', () => {
  resetLiveMatchMountedRegistryForTest();
  const mountedKeys: string[] = [];
  const unsubscribe = subscribeLiveMatchMounted((record) => {
    mountedKeys.push(record.key);
  });

  markLiveMatchMounted({
    matchId: 'duel-match-mounted',
    mode: 'duel',
    source: 'test mount',
  });
  markLiveMatchMounted({
    matchId: 'duel-match-mounted',
    mode: 'duel',
    source: 'duplicate mount',
  });

  assert.deepEqual(mountedKeys, ['duel:duel-match-mounted']);

  unsubscribe();
  markLiveMatchMounted({
    matchId: 'group-match-mounted',
    mode: 'group',
    source: 'test mount after unsubscribe',
  });

  assert.deepEqual(mountedKeys, ['duel:duel-match-mounted']);
  resetLiveMatchMountedRegistryForTest();
});

test('unmarkLiveMatchMounted evicts only the scoped match so isLiveMatchMarkedMounted returns false', () => {
  resetLiveMatchMountedRegistryForTest();

  markLiveMatchMounted({ matchId: 'duel-1', mode: 'duel', source: 'test' });
  markLiveMatchMounted({ matchId: 'group-1', mode: 'group', source: 'test' });
  assert.equal(isLiveMatchMarkedMounted({ matchId: 'duel-1', mode: 'duel' }), true);
  assert.equal(isLiveMatchMarkedMounted({ matchId: 'group-1', mode: 'group' }), true);

  // Eviction is scoped to the exact { matchId, mode } key — the duel latch is removed
  // (so match #2's blocking polling is no longer skipped) while the group latch stays.
  unmarkLiveMatchMounted({ matchId: 'duel-1', mode: 'duel' });
  assert.equal(isLiveMatchMarkedMounted({ matchId: 'duel-1', mode: 'duel' }), false);
  assert.equal(isLiveMatchMarkedMounted({ matchId: 'group-1', mode: 'group' }), true);

  // Evicting an absent / blank key is a no-op and does not throw.
  unmarkLiveMatchMounted({ matchId: 'duel-1', mode: 'duel' });
  unmarkLiveMatchMounted({ matchId: null, mode: 'duel' });
  assert.equal(isLiveMatchMarkedMounted({ matchId: 'group-1', mode: 'group' }), true);

  resetLiveMatchMountedRegistryForTest();
});

test('hasAnyLiveMatchMarkedMounted reflects whether any match is mounted at all', () => {
  resetLiveMatchMountedRegistryForTest();
  assert.equal(hasAnyLiveMatchMarkedMounted(), false);

  markLiveMatchMounted({ matchId: 'duel-any', mode: 'duel', source: 'test' });
  assert.equal(hasAnyLiveMatchMarkedMounted(), true);

  unmarkLiveMatchMounted({ matchId: 'duel-any', mode: 'duel' });
  assert.equal(hasAnyLiveMatchMarkedMounted(), false);

  resetLiveMatchMountedRegistryForTest();
});
