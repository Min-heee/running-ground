import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  markDuelStatusForfeited,
  markGroupStatusForfeited,
  resolveMatchExitId,
} from '@/features/runs/lifecycle/matchExitFlow';
import type { RunningMatchStatusResponse } from '@/lib/api/types';

function buildStatus(overrides: Partial<RunningMatchStatusResponse> = {}): RunningMatchStatusResponse {
  return {
    success: true,
    mode: 'duel',
    state: 'active',
    matchId: 'match-1',
    distanceKm: 5,
    slotStartAt: '2026-05-12T10:00:00.000Z',
    slotLabel: '10:00',
    paceBandLabel: '6분대',
    levelBandLabel: 'Lv.1',
    criteriaSummary: '테스트 조건',
    estimatedWaitMinutes: 0,
    participantCount: 2,
    acceptedCount: 2,
    capacity: 2,
    userAccepted: true,
    readyToStart: true,
    ...overrides,
  };
}

test('resolveMatchExitId prefers explicit match status and falls back to linked party room match', () => {
  assert.equal(resolveMatchExitId({
    source: 'duel',
    duelMatchId: 'duel-status',
    groupMatchId: null,
    roomLinkedMatchContext: { mode: 'duel', matchId: 'room-duel' },
  }), 'duel-status');

  assert.equal(resolveMatchExitId({
    source: 'duel',
    duelMatchId: null,
    groupMatchId: null,
    roomLinkedMatchContext: { mode: 'duel', matchId: 'room-duel' },
  }), 'room-duel');

  assert.equal(resolveMatchExitId({
    source: 'group',
    duelMatchId: 'duel-status',
    groupMatchId: null,
    roomLinkedMatchContext: { mode: 'duel', matchId: 'room-duel' },
  }), null);
});

test('forfeit helpers mark the current runner without mutating unrelated match statuses', () => {
  const duelStatus = buildStatus();
  assert.equal(markDuelStatusForfeited(duelStatus, 'other-match'), duelStatus);
  assert.equal(markDuelStatusForfeited(duelStatus, 'match-1')?.currentUserLiveStatus, 'forfeited');

  const groupStatus = buildStatus({
    mode: 'group',
    mySeedRank: 2,
    participants: [
      { id: 'one', name: '러너1', districtName: '서울', averagePace: '6:10/km', levelLabel: 'Lv.1', weeklyDistanceKm: 0, lifetimeDistanceKm: 0, seedRank: 1, seedSummary: '1번' },
      { id: 'me', name: '나', districtName: '서울', averagePace: '6:20/km', levelLabel: 'Lv.1', weeklyDistanceKm: 0, lifetimeDistanceKm: 0, seedRank: 2, seedSummary: '2번' },
    ],
  });
  const forfeitedGroupStatus = markGroupStatusForfeited(groupStatus, 'match-1');

  assert.equal(forfeitedGroupStatus?.currentUserLiveStatus, 'forfeited');
  assert.equal(forfeitedGroupStatus?.participants?.[0].liveStatus, undefined);
  assert.equal(forfeitedGroupStatus?.participants?.[1].liveStatus, 'forfeited');
});
