import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWeeklyHourlySlots,
  clampDuelMatchDistanceKm,
  findNearestRecommendedDistance,
  formatMatchExpiryCountdown,
  getEstimatedMatchBonusPoints,
  isMatchSlotClosed,
  parseDuelMatchDistanceKm,
  resolveMatchTimeSection,
} from './matchScheduling';

test('parseDuelMatchDistanceKm clamps unsafe custom distances', () => {
  assert.equal(parseDuelMatchDistanceKm('7,5'), 7.5);
  assert.equal(parseDuelMatchDistanceKm('abc'), 5);
  assert.equal(clampDuelMatchDistanceKm(1), 2);
  assert.equal(clampDuelMatchDistanceKm(99), 42.195);
});

test('match slots close 30 minutes before start and expose am/pm sections', () => {
  const now = new Date('2026-05-12T09:29:59.000Z');
  const closedSlot = '2026-05-12T09:59:59.000Z';
  const openSlot = '2026-05-12T10:00:00.000Z';

  assert.equal(isMatchSlotClosed(closedSlot, now), true);
  assert.equal(isMatchSlotClosed(openSlot, now), false);
  assert.equal(resolveMatchTimeSection('2026-05-12T01:00:00.000Z'), 'am');
  assert.equal(resolveMatchTimeSection('2026-05-12T13:00:00.000Z'), 'pm');
});

test('buildWeeklyHourlySlots creates a deterministic selectable window', () => {
  const slots = buildWeeklyHourlySlots(new Date('2026-05-12T09:15:00.000Z'));

  assert.equal(slots[0].label, '00:00');
  assert.equal(slots.at(-1)?.label, '18:00');
  assert.equal(slots.length, 187);
  assert.equal(slots.some((slot) => slot.startsAt === '2026-05-12T09:00:00.000Z' && slot.isClosed), true);
  assert.equal(slots.some((slot) => slot.startsAt === '2026-05-12T10:00:00.000Z' && !slot.isClosed), true);
});

test('match display helpers keep user-facing labels stable', () => {
  assert.equal(findNearestRecommendedDistance(6.6), 7);
  assert.equal(formatMatchExpiryCountdown(59), '59초');
  assert.equal(formatMatchExpiryCountdown(61), '2분');
  assert.equal(formatMatchExpiryCountdown(3661), '1시간 2분');
  assert.equal(getEstimatedMatchBonusPoints({ mode: 'duel', resultTone: 'win', title: '', summary: '', badgeLabel: '' }), 20);
  assert.equal(getEstimatedMatchBonusPoints({ mode: 'group', rank: 3, title: '', summary: '', badgeLabel: '' }), 15);
});
