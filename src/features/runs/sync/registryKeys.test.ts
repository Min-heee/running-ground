import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildActiveRoomRegistryKey,
  buildBlockingMatchStatusRegistryKey,
  buildMatchProgressRegistryKey,
} from './registryKeys';

test('runtime registry keys follow documented policy', () => {
  assert.equal(buildActiveRoomRegistryKey('user-1', 'track-run'), 'active-room:user-1/track-run');
  assert.equal(buildActiveRoomRegistryKey('current-user', 'shared'), 'active-room:current-user/shared');
  assert.equal(buildBlockingMatchStatusRegistryKey('match-1'), 'blocking-match-status:match-1');
  assert.equal(buildMatchProgressRegistryKey('match-1'), 'match-progress:match-1');
});
