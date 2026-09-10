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

test('track-run active room check keeps running for a reserved party room days before its slot', () => {
  assert.equal(getTrackRunActiveRoomCheckLiveSkipReason({
    linkedMatchId: 'party-match-1',
    linkedMatchReservedForFuture: true,
  }), null);
  // 라이브 매치가 실제로 떠 있으면 예약 여부와 무관하게 건너뛴다.
  assert.equal(getTrackRunActiveRoomCheckLiveSkipReason({
    linkedMatchId: 'party-match-1',
    linkedMatchReservedForFuture: true,
    liveMatchMounted: true,
  }), 'live-match-mounted');
});
