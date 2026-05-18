import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getLatestLiveMatchMountedRecord,
  markLiveMatchMounted,
  resetLiveMatchMountedRegistryForTest,
  subscribeLiveMatchMounted,
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

test('live match mounted registry exposes the latest mounted match for shell gate fallback', () => {
  resetLiveMatchMountedRegistryForTest();

  assert.equal(getLatestLiveMatchMountedRecord(), null);

  markLiveMatchMounted({
    matchId: 'duel-match-mounted',
    mode: 'duel',
    source: 'first mount',
  });
  const first = getLatestLiveMatchMountedRecord();
  assert.equal(first?.matchId, 'duel-match-mounted');
  assert.equal(first?.mode, 'duel');

  markLiveMatchMounted({
    matchId: 'group-match-mounted',
    mode: 'group',
    source: 'second mount',
  });
  const latest = getLatestLiveMatchMountedRecord();
  assert.equal(latest?.matchId, 'group-match-mounted');
  assert.equal(latest?.mode, 'group');

  resetLiveMatchMountedRegistryForTest();
});
