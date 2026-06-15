import assert from 'node:assert/strict';
import test from 'node:test';
import type { RaceBoardSourceRow } from './liveMatchRaceBoardProgressive';
import { sortRaceRows } from './liveMatchRaceBoardProgressive';

function row(overrides: Partial<RaceBoardSourceRow>): RaceBoardSourceRow {
  return {
    id: overrides.id ?? 'row',
    name: overrides.name ?? '러너',
    distanceKm: overrides.distanceKm ?? 0,
    remainingKm: overrides.remainingKm ?? 0,
    progress: overrides.progress ?? 0,
    ...overrides,
  };
}

test('sortRaceRows orders active runners above forfeiters', () => {
  const sorted = sortRaceRows([
    row({ id: 'quitter', distanceKm: 3, liveStatus: 'forfeited', forfeitedAt: '2026-05-12T00:02:00.000Z' }),
    row({ id: 'active', distanceKm: 2.5, liveStatus: 'running', isCurrentUser: true }),
  ]);

  assert.deepEqual(sorted.map((entry) => [entry.id, entry.rank]), [
    ['active', 1],
    ['quitter', 2],
  ]);
});

test('sortRaceRows orders two forfeiters by distance then forfeitedAt desc (later = better)', () => {
  // Equal distance => the runner who forfeited LATER must rank above the earlier one,
  // instead of tying and falling back to isCurrentUser ("공동 N등").
  const sorted = sortRaceRows([
    row({ id: 'early-quit', distanceKm: 2, liveStatus: 'forfeited', forfeitedAt: '2026-05-12T00:01:00.000Z' }),
    row({ id: 'late-quit', distanceKm: 2, liveStatus: 'forfeited', forfeitedAt: '2026-05-12T00:03:00.000Z' }),
  ]);

  assert.deepEqual(sorted.map((entry) => [entry.id, entry.rank]), [
    ['late-quit', 1],
    ['early-quit', 2],
  ]);
});

test('sortRaceRows ranks a forfeiter with more distance above one who quit later but ran less', () => {
  const sorted = sortRaceRows([
    row({ id: 'less-distance-late', distanceKm: 1.5, liveStatus: 'forfeited', forfeitedAt: '2026-05-12T00:05:00.000Z' }),
    row({ id: 'more-distance-early', distanceKm: 3, liveStatus: 'forfeited', forfeitedAt: '2026-05-12T00:01:00.000Z' }),
  ]);

  assert.deepEqual(sorted.map((entry) => entry.id), ['more-distance-early', 'less-distance-late']);
});
