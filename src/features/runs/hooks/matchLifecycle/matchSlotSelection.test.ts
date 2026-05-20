import { strict as assert } from 'node:assert';
import test from 'node:test';
import type { MatchSlotOption } from '@/features/runs/utils/matchScheduling';
import { findMatchSlotByStartAt } from './matchSlotSelection';

function slot(startsAt: string): MatchSlotOption {
  return {
    startsAt,
    label: '19:00',
    dateKey: '2026-05-20',
    dateLabel: '5.20.',
    weekdayLabel: '수',
    isClosed: false,
  };
}

test('findMatchSlotByStartAt matches exact slot timestamps', () => {
  const matchSlot = slot('2026-05-20T10:00:00.000Z');

  assert.equal(findMatchSlotByStartAt([
    slot('2026-05-20T09:00:00.000Z'),
    matchSlot,
  ], '2026-05-20T10:00:00.000Z'), matchSlot);
});

test('findMatchSlotByStartAt matches equivalent ISO formatting without falling back', () => {
  const matchSlot = slot('2026-05-20T10:00:00.000Z');

  assert.equal(findMatchSlotByStartAt([
    slot('2026-05-19T15:00:00.000Z'),
    matchSlot,
  ], '2026-05-20T10:00:00Z'), matchSlot);
});

test('findMatchSlotByStartAt matches equivalent timezone offsets', () => {
  const matchSlot = slot('2026-05-20T10:00:00.000Z');

  assert.equal(findMatchSlotByStartAt([
    slot('2026-05-19T15:00:00.000Z'),
    matchSlot,
  ], '2026-05-20T19:00:00+09:00'), matchSlot);
});

test('findMatchSlotByStartAt returns null for invalid or different slot times', () => {
  const options = [
    slot('2026-05-19T15:00:00.000Z'),
    slot('2026-05-20T10:00:00.000Z'),
  ];

  assert.equal(findMatchSlotByStartAt(options, 'not-a-date'), null);
  assert.equal(findMatchSlotByStartAt(options, '2026-05-20T11:00:00.000Z'), null);
});
