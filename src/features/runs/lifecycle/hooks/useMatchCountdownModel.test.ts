import assert from 'node:assert/strict';
import test from 'node:test';

import { MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS } from '@/lib/matchCountdown';
import {
  resolveShouldShowRoomArmingOverlay,
  shouldShowRoomCountdownNumbers,
} from './useMatchCountdownModel';

test('room arming overlay stays hidden after the linked match slot elapsed', () => {
  const shouldShow = resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    linkedMatchSlotStartAt: '2026-05-20T12:00:00.000Z',
    matchMode: 'duel',
    shouldShowLoading: true,
    syncedNowMs: Date.parse('2026-05-20T12:02:01.000Z'),
  });

  assert.equal(shouldShow, false);
});

test('room arming overlay keeps existing loading behavior before the linked match slot', () => {
  const shouldShow = resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    linkedMatchSlotStartAt: '2026-05-20T12:00:00.000Z',
    matchMode: 'duel',
    shouldShowLoading: true,
    syncedNowMs: Date.parse('2026-05-20T11:59:50.000Z'),
  });

  assert.equal(shouldShow, true);
});

test('room arming overlay keeps existing behavior when no linked slot is available', () => {
  const shouldShow = resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    linkedMatchSlotStartAt: null,
    matchMode: 'group',
    shouldShowLoading: true,
    syncedNowMs: Date.parse('2026-05-20T12:02:01.000Z'),
  });

  assert.equal(shouldShow, true);
});

test('room arming overlay remains limited to competitive match modes with loading state', () => {
  assert.equal(resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    linkedMatchSlotStartAt: '2026-05-20T12:05:00.000Z',
    matchMode: 'solo',
    shouldShowLoading: true,
    syncedNowMs: Date.parse('2026-05-20T12:00:00.000Z'),
  }), false);

  assert.equal(resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    linkedMatchSlotStartAt: '2026-05-20T12:05:00.000Z',
    matchMode: 'duel',
    shouldShowLoading: false,
    syncedNowMs: Date.parse('2026-05-20T12:00:00.000Z'),
  }), false);
});

test('host-start room countdown numbers stay hidden until the final shared 10 seconds', () => {
  assert.equal(shouldShowRoomCountdownNumbers({
    remainingSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS + 2,
    startMode: 'host',
  }), false);

  assert.equal(shouldShowRoomCountdownNumbers({
    remainingSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
    startMode: 'host',
  }), true);
});

test('scheduled room countdown numbers keep the existing wider countdown window', () => {
  assert.equal(shouldShowRoomCountdownNumbers({
    remainingSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS + 20,
    startMode: 'scheduled',
  }), true);
});

test('host-start room arming overlay covers the poll-in buffer before numeric countdown', () => {
  const shouldShow = resolveShouldShowRoomArmingOverlay({
    linkedMatchId: 'match-1',
    linkedMatchSlotStartAt: '2026-05-20T12:00:12.000Z',
    matchMode: 'duel',
    remainingSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS + 2,
    shouldShowLoading: false,
    startMode: 'host',
    syncedNowMs: Date.parse('2026-05-20T12:00:00.000Z'),
  });

  assert.equal(shouldShow, true);
});
