import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchStatusResponse } from '@/lib/api/types';
import {
  buildSyncedMatchProgressSnapshot,
  isTerminalMatchLiveStatus,
  resolveActiveMatchProgressTarget,
  resolveBackgroundMatchStatusApplyTarget,
  resolveMatchProgressHeartbeatStatus,
  shouldSendMatchProgressHeartbeat,
} from './matchProgressSync';
import { resetSharedServerClockForTest, shouldAcceptServerSnapshot } from './serverClockSync';

function status(overrides: Partial<RunningMatchStatusResponse>): RunningMatchStatusResponse {
  return {
    success: true,
    mode: 'duel',
    state: 'idle',
    distanceKm: 5,
    slotStartAt: '2026-05-12T00:00:00.000Z',
    slotLabel: '00:00',
    paceBandLabel: '6분대',
    levelBandLabel: 'Lv.1',
    criteriaSummary: '테스트',
    estimatedWaitMinutes: 0,
    participantCount: 1,
    acceptedCount: 1,
    capacity: 2,
    userAccepted: true,
    readyToStart: false,
    ...overrides,
  };
}

test('synced match progress snapshot normalizes invalid current pace to average pace', () => {
  const snapshot = buildSyncedMatchProgressSnapshot({
    matchId: 'match-1',
    distanceKm: 1,
    elapsedSeconds: 300,
    currentPace: '--:--/km',
    status: 'running',
  }, 1000);

  assert.deepEqual(snapshot, {
    matchId: 'match-1',
    distanceKm: 1,
    elapsedSeconds: 300,
    currentPace: '05:00/km',
    updatedAt: 1000,
  });
});

test('active progress target prefers active status for the selected mode', () => {
  assert.deepEqual(resolveActiveMatchProgressTarget({
    matchMode: 'duel',
    duelMatchStatus: status({ state: 'active', matchId: 'duel-1' }),
    groupMatchStatus: status({ mode: 'group', state: 'active', matchId: 'group-1' }),
    roomLinkedMatchContext: null,
  }), { matchId: 'duel-1', distanceKm: 5 });

  assert.deepEqual(resolveActiveMatchProgressTarget({
    matchMode: 'group',
    duelMatchStatus: status({ state: 'active', matchId: 'duel-1' }),
    groupMatchStatus: status({ mode: 'group', state: 'active', matchId: 'group-1' }),
    roomLinkedMatchContext: null,
  }), { matchId: 'group-1', distanceKm: 5 });
});

test('active progress target falls back to active linked party room match', () => {
  assert.deepEqual(resolveActiveMatchProgressTarget({
    matchMode: 'duel',
    duelMatchStatus: null,
    groupMatchStatus: null,
    roomLinkedMatchContext: {
      mode: 'duel',
      matchId: 'room-linked-1',
      distanceKm: 3,
      state: 'active',
    },
  }), { matchId: 'room-linked-1', distanceKm: 3 });
});

test('active progress target ignores waiting and countdown linked matches', () => {
  assert.equal(resolveActiveMatchProgressTarget({
    matchMode: 'duel',
    duelMatchStatus: status({ state: 'matched', matchId: 'duel-countdown' }),
    groupMatchStatus: null,
    roomLinkedMatchContext: {
      mode: 'duel',
      matchId: 'room-linked-countdown',
      distanceKm: 3,
      state: 'matched',
    },
  }), null);
});

test('progress heartbeat status finishes when local progress reaches the target distance', () => {
  assert.equal(resolveMatchProgressHeartbeatStatus({
    progressDistanceKm: 4.97,
    targetDistanceKm: 5,
  }), 'running');
  // Just under the 5m (0.005km) tolerance → still running (no more 20m early finish at 4.98).
  assert.equal(resolveMatchProgressHeartbeatStatus({
    progressDistanceKm: 4.99,
    targetDistanceKm: 5,
  }), 'running');
  // At/above target - 5m → finished (displays 5.00km).
  assert.equal(resolveMatchProgressHeartbeatStatus({
    progressDistanceKm: 4.997,
    targetDistanceKm: 5,
  }), 'finished');
  assert.equal(resolveMatchProgressHeartbeatStatus({
    progressDistanceKm: 6.97,
    targetDistanceKm: 7,
  }), 'running');
  assert.equal(resolveMatchProgressHeartbeatStatus({
    progressDistanceKm: 7,
    targetDistanceKm: 7,
  }), 'finished');
  assert.equal(resolveMatchProgressHeartbeatStatus({
    progressDistanceKm: 7.06,
    targetDistanceKm: 7,
  }), 'finished');
});

test('progress heartbeat only sends while running and after the interval', () => {
  assert.equal(shouldSendMatchProgressHeartbeat({
    trackingStatus: 'paused',
    lastHeartbeatAt: 0,
    nowMs: 3000,
  }), false);
  assert.equal(shouldSendMatchProgressHeartbeat({
    trackingStatus: 'running',
    lastHeartbeatAt: 1000,
    nowMs: 2500,
  }), false);
  assert.equal(shouldSendMatchProgressHeartbeat({
    trackingStatus: 'running',
    lastHeartbeatAt: 1000,
    nowMs: 3000,
  }), false);
  assert.equal(shouldSendMatchProgressHeartbeat({
    trackingStatus: 'running',
    lastHeartbeatAt: 1000,
    nowMs: 3500,
  }), true);
});

// B1 — a self-forfeited match must NOT be resurrected by a late background-apply response.
test('background apply target drops a response for a forfeited match (B1)', () => {
  const target = resolveBackgroundMatchStatusApplyTarget({
    status: status({ mode: 'duel', state: 'active', matchId: 'duel-1', currentUserLiveStatus: 'running' }),
    duelMatchId: 'duel-1',
    groupMatchId: null,
    roomLinkedMatchContext: null,
    forfeitedMatchIds: new Set(['duel-1']),
  });

  // The match is in the forfeit set, so the in-flight 'active'/'running' response is dropped
  // instead of flipping the runner back to live.
  assert.equal(target, null);
});

test('background apply target routes a live duel/group response to the matching status', () => {
  assert.equal(resolveBackgroundMatchStatusApplyTarget({
    status: status({ mode: 'duel', state: 'active', matchId: 'duel-1' }),
    duelMatchId: 'duel-1',
    groupMatchId: 'group-9',
    roomLinkedMatchContext: null,
    forfeitedMatchIds: new Set(),
  }), 'duel');

  assert.equal(resolveBackgroundMatchStatusApplyTarget({
    status: status({ mode: 'group', state: 'active', matchId: 'group-9' }),
    duelMatchId: 'duel-1',
    groupMatchId: 'group-9',
    roomLinkedMatchContext: null,
    forfeitedMatchIds: new Set(),
  }), 'group');
});

test('background apply target never cross-writes when the response mode mismatches', () => {
  // A duel-mode response whose id matches only the GROUP status must not write the group status.
  assert.equal(resolveBackgroundMatchStatusApplyTarget({
    status: status({ mode: 'duel', state: 'active', matchId: 'shared-id' }),
    duelMatchId: null,
    groupMatchId: 'shared-id',
    roomLinkedMatchContext: null,
    forfeitedMatchIds: new Set(),
  }), null);
});

test('background apply target drops a response for a match that is no longer live', () => {
  assert.equal(resolveBackgroundMatchStatusApplyTarget({
    status: status({ mode: 'duel', state: 'active', matchId: 'duel-old' }),
    duelMatchId: 'duel-new',
    groupMatchId: null,
    roomLinkedMatchContext: null,
    forfeitedMatchIds: new Set(),
  }), null);
});

test('background apply target falls back to a mode-matching linked party room match', () => {
  assert.equal(resolveBackgroundMatchStatusApplyTarget({
    status: status({ mode: 'group', state: 'active', matchId: 'room-linked-1' }),
    duelMatchId: null,
    groupMatchId: null,
    roomLinkedMatchContext: { mode: 'group', matchId: 'room-linked-1' },
    forfeitedMatchIds: new Set(),
  }), 'group');

  // Mode mismatch on the linked context must still be rejected.
  assert.equal(resolveBackgroundMatchStatusApplyTarget({
    status: status({ mode: 'duel', state: 'active', matchId: 'room-linked-1' }),
    duelMatchId: null,
    groupMatchId: null,
    roomLinkedMatchContext: { mode: 'group', matchId: 'room-linked-1' },
    forfeitedMatchIds: new Set(),
  }), null);
});

// B2 — an out-of-order (older serverNow) background response is rejected by the same monotonic
// guard the foreground/poll paths use, so a late 'active' can't overwrite a newer 'finished'.
test('background apply rejects an older-serverNow response (B2)', () => {
  resetSharedServerClockForTest();
  const latestServerNowMsRef = { current: 0 };

  const newer = status({
    mode: 'duel',
    state: 'active',
    matchId: 'duel-1',
    serverNow: '2026-05-12T00:00:05.000Z',
  });
  const older = status({
    mode: 'duel',
    state: 'active',
    matchId: 'duel-1',
    serverNow: '2026-05-12T00:00:03.000Z',
  });

  // Both responses route to the live duel target...
  assert.equal(resolveBackgroundMatchStatusApplyTarget({
    status: newer,
    duelMatchId: 'duel-1',
    groupMatchId: null,
    roomLinkedMatchContext: null,
    forfeitedMatchIds: new Set(),
  }), 'duel');

  // ...but only the first (newest) snapshot is accepted by the monotonic guard; the later-arriving
  // older snapshot is rejected and would never reach setDuelMatchStatus.
  assert.equal(shouldAcceptServerSnapshot(latestServerNowMsRef, newer.serverNow), true);
  assert.equal(shouldAcceptServerSnapshot(latestServerNowMsRef, older.serverNow), false);
});

// M1 — a terminal status (finished / forfeited) is recognized so the applier can tear down the
// background context + timer instead of keeping the dead match's flush firing.
test('terminal match live status detects finish and forfeit', () => {
  assert.equal(isTerminalMatchLiveStatus('finished'), true);
  assert.equal(isTerminalMatchLiveStatus('forfeited'), true);
  assert.equal(isTerminalMatchLiveStatus('running'), false);
  assert.equal(isTerminalMatchLiveStatus('background'), false);
  assert.equal(isTerminalMatchLiveStatus(undefined), false);
});
