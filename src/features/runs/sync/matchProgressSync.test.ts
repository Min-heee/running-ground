import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchStatusResponse } from '@/lib/api/types';
import {
  buildSyncedMatchProgressSnapshot,
  resolveActiveMatchProgressTarget,
  resolveMatchProgressHeartbeatStatus,
  shouldSendMatchProgressHeartbeat,
} from './matchProgressSync';

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
  assert.equal(resolveMatchProgressHeartbeatStatus({
    progressDistanceKm: 4.99,
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
