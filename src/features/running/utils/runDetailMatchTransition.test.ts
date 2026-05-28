import { strict as assert } from 'node:assert';
import test from 'node:test';
import type { RunningMatchStatusResponse } from '@/lib/api/types';
import { shouldTransitionRunDetailToMatchRecord } from './runDetailMatchTransition';

function status(overrides: Partial<RunningMatchStatusResponse>): RunningMatchStatusResponse {
  return {
    success: true,
    mode: 'duel',
    state: 'active',
    matchId: 'match-1',
    distanceKm: 5,
    slotStartAt: '2026-05-14T12:00:00.000Z',
    slotLabel: '테스트',
    paceBandLabel: '테스트',
    levelBandLabel: '테스트',
    criteriaSummary: '테스트',
    estimatedWaitMinutes: 0,
    participantCount: 2,
    acceptedCount: 0,
    capacity: 2,
    userAccepted: true,
    readyToStart: true,
    ...overrides,
  };
}

test('run detail transitions when duel opponent finishes', () => {
  assert.equal(shouldTransitionRunDetailToMatchRecord({
    matchId: 'match-1',
    mode: 'duel',
    vanishedConfirmed: false,
    status: status({
      opponent: {
        id: 'opponent',
        name: '상대',
        districtName: '테스트',
        averagePace: '6:00/km',
        levelLabel: '러너',
        weeklyDistanceKm: 10,
        lifetimeDistanceKm: 100,
        compatibilitySummary: '테스트',
        liveStatus: 'finished',
      },
    }),
  }), 'opponent-finished');
});

test('run detail ignores in-progress opponent status', () => {
  assert.equal(shouldTransitionRunDetailToMatchRecord({
    matchId: 'match-1',
    mode: 'duel',
    vanishedConfirmed: false,
    status: status({
      opponent: {
        id: 'opponent',
        name: '상대',
        districtName: '테스트',
        averagePace: '6:00/km',
        levelLabel: '러너',
        weeklyDistanceKm: 10,
        lifetimeDistanceKm: 100,
        compatibilitySummary: '테스트',
        liveStatus: 'running',
      },
    }),
  }), null);
});

test('run detail transitions when session vanish is confirmed', () => {
  assert.equal(shouldTransitionRunDetailToMatchRecord({
    matchId: 'match-1',
    mode: 'duel',
    vanishedConfirmed: true,
    status: null,
  }), 'session-vanished');
});

test('run detail ignores other match statuses', () => {
  assert.equal(shouldTransitionRunDetailToMatchRecord({
    matchId: 'match-1',
    mode: 'duel',
    vanishedConfirmed: false,
    status: status({
      matchId: 'match-2',
      opponent: {
        id: 'opponent',
        name: '상대',
        districtName: '테스트',
        averagePace: '6:00/km',
        levelLabel: '러너',
        weeklyDistanceKm: 10,
        lifetimeDistanceKm: 100,
        compatibilitySummary: '테스트',
        liveStatus: 'finished',
      },
    }),
  }), null);
});
