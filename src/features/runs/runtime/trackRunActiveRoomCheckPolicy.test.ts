import assert from 'node:assert/strict';
import test from 'node:test';
import { getTrackRunActiveRoomCheckLiveSkipReason } from './trackRunActiveRoomCheckPolicy';

test('track-run active room check is skipped after live match mount', () => {
  assert.equal(getTrackRunActiveRoomCheckLiveSkipReason({
    liveMatchMounted: true,
  }), 'live-match-mounted');
});

test('track-run active room check is skipped when a live match key is preserved', () => {
  assert.equal(getTrackRunActiveRoomCheckLiveSkipReason({
    liveMatchKey: 'duel-match-1',
  }), 'live-match-key');
});

test('track-run active room check is skipped after room links to a match', () => {
  assert.equal(getTrackRunActiveRoomCheckLiveSkipReason({
    linkedMatchId: 'duel-match-1',
  }), 'linked-match');
});

test('track-run active room check is allowed before live handoff exists', () => {
  assert.equal(getTrackRunActiveRoomCheckLiveSkipReason({}), null);
});
