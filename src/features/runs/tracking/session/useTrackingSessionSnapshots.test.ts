import assert from 'node:assert/strict';
import test from 'node:test';

import type { MatchLifecycleController } from '@/features/runs/lifecycle/matchLifecycleController';
import type { PartyRunLinkedMatchContext } from '@/features/runs/lifecycle/matchStateMachine';
import type { RunningMatchStatusResponse } from '@/lib/api/types';
import { resolveActiveMatchSlotStartAt } from './trackingSessionMatchSlot';

function controller(overrides: Partial<MatchLifecycleController> = {}): MatchLifecycleController {
  return {
    stage: 'active',
    mode: 'duel',
    source: 'party-room',
    roomId: 'room-1',
    matchId: 'match-1',
    shouldPreferArena: true,
    effects: {
      shouldPollRoom: false,
      shouldPollDirectMatchStatus: false,
      shouldPollLinkedMatch: true,
      shouldRefreshUpcomingMatches: true,
      shouldAcknowledgeCountdownReady: false,
      shouldNavigateLinkedMatch: false,
      shouldStartGpsWarmup: false,
      shouldStartGpsActive: false,
      shouldRunHeartbeat: true,
    },
    gps: {
      warmupMatch: null,
      activeMatch: null,
    },
    ...overrides,
  };
}

function activeStatus(overrides: Partial<RunningMatchStatusResponse> = {}): RunningMatchStatusResponse {
  return {
    success: true,
    mode: 'duel',
    state: 'active',
    matchId: 'match-1',
    distanceKm: 5,
    slotStartAt: '2026-05-20T13:00:00.000Z',
    slotLabel: '테스트',
    paceBandLabel: '테스트',
    levelBandLabel: '테스트',
    criteriaSummary: '테스트',
    estimatedWaitMinutes: 0,
    participantCount: 2,
    acceptedCount: 2,
    capacity: 2,
    userAccepted: true,
    readyToStart: true,
    ...overrides,
  };
}

test('active party-room elapsed uses room slot fallback when linked context is missing', () => {
  const slotStartAt = '2026-05-20T13:49:58.259Z';

  const resolved = resolveActiveMatchSlotStartAt({
    duelMatchStatus: null,
    groupMatchStatus: null,
    matchLifecycleController: controller(),
    matchMode: 'duel',
    partyRoomMatchId: 'match-1',
    partyRoomMatchMode: 'duel',
    partyRoomMatchSlotStartAt: slotStartAt,
    roomLinkedMatchContext: null,
  });

  assert.equal(resolved, slotStartAt);
});

test('active party-room elapsed can recover fallback slot by matching room-linked match id', () => {
  const slotStartAt = '2026-05-20T13:49:58.259Z';

  const resolved = resolveActiveMatchSlotStartAt({
    duelMatchStatus: null,
    groupMatchStatus: null,
    matchLifecycleController: controller({ source: 'duel-match' }),
    matchMode: 'duel',
    partyRoomMatchId: 'match-1',
    partyRoomMatchMode: 'duel',
    partyRoomMatchSlotStartAt: slotStartAt,
    roomLinkedMatchContext: null,
  });

  assert.equal(resolved, slotStartAt);
});

test('active party-room elapsed prefers linked context slot when context is available', () => {
  const roomLinkedMatchContext: PartyRunLinkedMatchContext = {
    mode: 'duel',
    matchId: 'match-1',
    slotStartAt: '2026-05-20T13:49:58.259Z',
    distanceKm: 5,
    state: 'active',
  };

  const resolved = resolveActiveMatchSlotStartAt({
    duelMatchStatus: null,
    groupMatchStatus: null,
    matchLifecycleController: controller(),
    matchMode: 'duel',
    partyRoomMatchId: 'match-1',
    partyRoomMatchMode: 'duel',
    partyRoomMatchSlotStartAt: '2026-05-20T13:50:00.000Z',
    roomLinkedMatchContext,
  });

  assert.equal(resolved, roomLinkedMatchContext.slotStartAt);
});

test('direct duel elapsed still uses active duel status slot', () => {
  const duelStatus = activeStatus({
    slotStartAt: '2026-05-20T14:00:00.000Z',
  });

  const resolved = resolveActiveMatchSlotStartAt({
    duelMatchStatus: duelStatus,
    groupMatchStatus: null,
    matchLifecycleController: controller({
      source: 'duel-match',
      matchId: duelStatus.matchId ?? null,
    }),
    matchMode: 'duel',
    roomLinkedMatchContext: null,
  });

  assert.equal(resolved, duelStatus.slotStartAt);
});

test('non-active or solo tracking does not use a match slot', () => {
  const resolved = resolveActiveMatchSlotStartAt({
    duelMatchStatus: activeStatus(),
    groupMatchStatus: null,
    matchLifecycleController: controller({
      stage: 'waiting',
      source: 'none',
      mode: null,
      matchId: null,
    }),
    matchMode: 'solo',
    partyRoomMatchId: 'match-1',
    partyRoomMatchMode: 'duel',
    partyRoomMatchSlotStartAt: '2026-05-20T13:49:58.259Z',
    roomLinkedMatchContext: null,
  });

  assert.equal(resolved, null);
});
