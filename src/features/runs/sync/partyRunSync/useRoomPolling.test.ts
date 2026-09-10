import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  acquireRgPollingSlot,
  getActiveRgPollingSlotCount,
  resetRgPollingRegistryForTest,
  startRgPollingInterval,
} from '@/utils/rgPollingRegistry';
import { armPartyRoomPollRetry, resolvePartyRoomPollingPolicy } from './useRoomPolling';

type FakeTimer = { id: number; callback: () => void; intervalMs: number };

function createFakeTimerHarness() {
  const timers: FakeTimer[] = [];
  const cleared: FakeTimer[] = [];

  return {
    timers,
    cleared,
    setIntervalFn: ((callback: () => void, intervalMs: number) => {
      const timer = { id: timers.length + 1, callback, intervalMs };
      timers.push(timer);
      return timer;
    }) as unknown as typeof setInterval,
    clearIntervalFn: ((timer: FakeTimer) => {
      cleared.push(timer);
    }) as unknown as typeof clearInterval,
  };
}

function room(overrides: Partial<RunningMatchRoom> = {}): RunningMatchRoom {
  return {
    canStart: false,
    distanceKm: 5,
    hostName: '테스트',
    hostUserId: 'host',
    inviteLink: 'runningground://running?roomInviteToken=ABC123',
    inviteToken: 'ABC123',
    invitedFriendIds: [],
    isHost: true,
    maxParticipants: 2,
    minParticipants: 2,
    mode: 'duel',
    participants: [{
      averagePace: '06:00/km',
      districtName: '테스트구',
      invited: false,
      isCountdownReady: false,
      isHost: true,
      isReady: false,
      joinedAt: '2026-05-14T00:00:00.000Z',
      levelLabel: 'Lv.1',
      name: '방장',
      tag: 'host',
      userId: 'host',
    }],
    roomId: 'room-1',
    slotLabel: '지금',
    slotStartAt: '2026-05-14T00:00:00.000Z',
    startMode: 'host',
    state: 'waiting',
    ...overrides,
  };
}

test('party room polling defers waiting room sync to match-room snapshot owner', () => {
  const nextRoom = room();
  const policy = resolvePartyRoomPollingPolicy({
    fastRoomPollMs: 2500,
    idleRoomPollMs: 5000,
    linkedMatchId: nextRoom.linkedMatchId,
    roomId: nextRoom.roomId,
    state: nextRoom.state,
  });

  assert.equal(policy.enabled, false);
  assert.equal(policy.reason, 'match-room-snapshot-owner');
});

test('party room polling defers linked room sync to linked match status owner', () => {
  const nextRoom = room({
    linkedMatchId: 'match-1',
    linkedMatchStatus: 'matched',
    state: 'countdown',
  });
  const policy = resolvePartyRoomPollingPolicy({
    fastRoomPollMs: 2500,
    idleRoomPollMs: 5000,
    linkedMatchId: nextRoom.linkedMatchId,
    roomId: nextRoom.roomId,
    state: nextRoom.state,
  });

  assert.equal(policy.enabled, false);
  assert.equal(policy.reason, 'linked-match-status-owner');
});

test('party room polling never owns linked match transition states', () => {
  for (const state of ['arming', 'countdown', 'active'] as const) {
    const nextRoom = room({
      linkedMatchId: `match-${state}`,
      linkedMatchStatus: state === 'active' ? 'active' : 'matched',
      state,
    });
    const policy = resolvePartyRoomPollingPolicy({
      fastRoomPollMs: 2500,
      idleRoomPollMs: 5000,
      linkedMatchId: nextRoom.linkedMatchId,
      roomId: nextRoom.roomId,
      state: nextRoom.state,
    });

    assert.equal(policy.enabled, false);
    assert.equal(policy.intervalMs, 5000);
    assert.equal(policy.reason, 'linked-match-status-owner');
  }
});

test('party room polling keeps transitional room states owned by lifecycle handoff', () => {
  for (const state of ['arming', 'countdown', 'active'] as const) {
    const nextRoom = room({ state });
    const policy = resolvePartyRoomPollingPolicy({
      fastRoomPollMs: 2500,
      idleRoomPollMs: 5000,
      linkedMatchId: nextRoom.linkedMatchId,
      roomId: nextRoom.roomId,
      state: nextRoom.state,
    });

    assert.equal(policy.enabled, false);
    assert.equal(policy.intervalMs, 2500);
    assert.equal(policy.reason, `${state}-linked-transition-owner`);
  }
});

test('party room polling is disabled when room id is missing', () => {
  const policy = resolvePartyRoomPollingPolicy({
    fastRoomPollMs: 2500,
    idleRoomPollMs: 5000,
    linkedMatchId: null,
    roomId: null,
    state: null,
  });

  assert.equal(policy.enabled, false);
  assert.equal(policy.intervalMs, 5000);
  assert.equal(policy.reason, 'no-room');
});

// Lobby-room poll latch fix Piece 1b — the party-room poller's lost acquire is no longer
// permanently dead. The seam keeps re-attempting the party-room slot at the poll cadence; once
// the zombie owner releases, the next retry tick re-acquires, fires exactly ONE immediate
// catch-up loadMatchRoom, and stops retrying.
test('party room poll retry re-acquires after a zombie owner releases and fires one catch-up loadMatchRoom', async () => {
  resetRgPollingRegistryForTest();
  const pollingKey = 'room:room-retry-1:party-room';
  const zombie = acquireRgPollingSlot(pollingKey, 'party room polling', {
    source: 'zombie owner',
  });
  assert.equal(zombie.acquired, true);

  let loadMatchRoomCount = 0;
  const loadMatchRoom = () => {
    loadMatchRoomCount += 1;
    return Promise.resolve(null);
  };
  const harness = createFakeTimerHarness();

  // The effect's first startRgPollingInterval loses the acquire (the zombie owns the key)...
  const initial = startRgPollingInterval({
    // Real poll cadence far beyond the test lifetime — an acquired poll never ticks here, so any
    // loadMatchRoomCount increment can only be the retry's immediate catch-up tick.
    intervalMs: 600_000,
    key: pollingKey,
    label: 'party room polling',
    onTick: loadMatchRoom,
  });
  assert.equal(initial.acquired, false);

  // ...so the lose branch arms the retry seam at the same cadence.
  const retry = armPartyRoomPollRetry({
    intervalMs: 600_000,
    onTick: loadMatchRoom,
    pollingKey,
    reason: 'party-room-owner',
    roomId: 'room-retry-1',
    state: null,
    clearIntervalFn: harness.clearIntervalFn,
    setIntervalFn: harness.setIntervalFn,
  });
  assert.equal(harness.timers.length, 1);

  // While the zombie still owns the slot, retry ticks stay unacquired — no poll, no load.
  harness.timers[0].callback();
  await Promise.resolve();
  assert.equal(loadMatchRoomCount, 0);
  assert.equal(getActiveRgPollingSlotCount(), 1);

  // Zombie dies (releases) → the NEXT retry tick re-acquires and fires ONE catch-up load.
  zombie.release();
  harness.timers[0].callback();
  await Promise.resolve();
  assert.equal(loadMatchRoomCount, 1);
  assert.equal(getActiveRgPollingSlotCount(), 1);
  // The retry timer was stopped on re-acquire.
  assert.equal(harness.cleared.includes(harness.timers[0]), true);

  // A straggler retry callback after re-acquire is a no-op — no double-arm, no extra load.
  harness.timers[0].callback();
  await Promise.resolve();
  assert.equal(loadMatchRoomCount, 1);
  assert.equal(getActiveRgPollingSlotCount(), 1);

  // Effect cleanup stops the live poll handle → zero slots left behind.
  retry.stop();
  assert.equal(getActiveRgPollingSlotCount(), 0);
});

test('party room poll retry cleanup before re-acquire clears the timer and acquires nothing', async () => {
  resetRgPollingRegistryForTest();
  const pollingKey = 'room:room-retry-cleanup:party-room';
  const zombie = acquireRgPollingSlot(pollingKey, 'party room polling');
  assert.equal(zombie.acquired, true);

  let loadMatchRoomCount = 0;
  const harness = createFakeTimerHarness();
  const retry = armPartyRoomPollRetry({
    intervalMs: 600_000,
    onTick: () => {
      loadMatchRoomCount += 1;
      return Promise.resolve(null);
    },
    pollingKey,
    reason: 'party-room-owner',
    roomId: 'room-retry-cleanup',
    state: null,
    clearIntervalFn: harness.clearIntervalFn,
    setIntervalFn: harness.setIntervalFn,
  });
  assert.equal(harness.timers.length, 1);

  // Effect cleanup while still waiting for the slot: the retry timer is cleared...
  retry.stop();
  assert.equal(harness.cleared.includes(harness.timers[0]), true);

  // ...and even if a straggler retry callback fires after stop (and the slot is now free), it
  // must NOT acquire anything or load — the retry is dead.
  zombie.release();
  harness.timers[0].callback();
  await Promise.resolve();
  assert.equal(loadMatchRoomCount, 0);
  assert.equal(getActiveRgPollingSlotCount(), 0);
});

// 예약 파티런(2026-09-09): 링크됐지만 슬롯이 며칠 뒤 — 상대의 이탈·취소·늦은 합류를 보려면
// 느린 주기로 계속 조회한다. 카운트다운 창에 들어오면(플래그 false) 예전처럼 매치 상태 폴러 몫.
test('party room polling keeps a slow cadence for a reserved party room outside the countdown window', () => {
  const nextRoom = room({ linkedMatchId: 'party-match-1', linkedMatchStatus: 'matched', startMode: 'scheduled', state: 'arming' });
  const reserved = resolvePartyRoomPollingPolicy({
    fastRoomPollMs: 2500,
    idleRoomPollMs: 5000,
    linkedMatchId: nextRoom.linkedMatchId,
    linkedMatchReservedForFuture: true,
    roomId: nextRoom.roomId,
    state: nextRoom.state,
  });
  assert.equal(reserved.enabled, true);
  assert.equal(reserved.intervalMs, 5000);
  assert.equal(reserved.reason, 'reserved-party-room-sync');

  const insideWindow = resolvePartyRoomPollingPolicy({
    fastRoomPollMs: 2500,
    idleRoomPollMs: 5000,
    linkedMatchId: nextRoom.linkedMatchId,
    linkedMatchReservedForFuture: false,
    roomId: nextRoom.roomId,
    state: nextRoom.state,
  });
  assert.equal(insideWindow.enabled, false);
  assert.equal(insideWindow.reason, 'linked-match-status-owner');
});
