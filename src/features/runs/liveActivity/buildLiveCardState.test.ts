import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLiveCardState,
  LIVE_CARD_STALE_AFTER_MS,
  type BuildLiveCardStateInput,
} from './buildLiveCardState';

const FIXED_NOW = 1_700_000_000_000;
const STARTED_AT = '2026-06-22T00:00:00.000Z';

function baseInput(overrides: Partial<BuildLiveCardStateInput> = {}): BuildLiveCardStateInput {
  return {
    mode: 'solo',
    startedAt: STARTED_AT,
    distanceKm: 2,
    elapsedSeconds: 760,
    nowMs: FIXED_NOW,
    ...overrides,
  };
}

test('solo with no goal: time/distance/pace only, no progress ring, no match fields', () => {
  const { attributes, contentState } = buildLiveCardState(baseInput());

  assert.equal(attributes.mode, 'solo');
  assert.equal(attributes.matchId, undefined);
  assert.equal(attributes.goalDistanceKm, undefined);
  assert.deepEqual(attributes.runnerNames, []);
  assert.equal(attributes.startedAt, STARTED_AT);

  // distance is whole meters, pace is the reused buildAveragePace (2km / 760s → 06:20/km).
  assert.equal(contentState.distanceM, 2000);
  assert.equal(contentState.paceText, '06:20/km');
  assert.equal(contentState.elapsedSeconds, 760);

  // No match-only fields for solo.
  assert.equal(contentState.myRank, undefined);
  assert.equal(contentState.totalRunners, undefined);
  assert.equal(contentState.adjacentGapText, undefined);
  assert.equal(contentState.runners, undefined);
});

test('solo with goal: attributes carry goalDistanceKm (native shows the ring)', () => {
  const { attributes } = buildLiveCardState(baseInput({ goalDistanceKm: 5 }));
  assert.equal(attributes.goalDistanceKm, 5);
});

test('staleDate is exactly now + ~10s so the card dims (not lies) on a location stall', () => {
  const { contentState } = buildLiveCardState(baseInput());
  assert.equal(contentState.staleDateMs, FIXED_NOW + LIVE_CARD_STALE_AFTER_MS);
  assert.equal(LIVE_CARD_STALE_AFTER_MS, 10_000);
});

test('elapsed is clamped to a whole, non-negative second count', () => {
  const { contentState } = buildLiveCardState(baseInput({ elapsedSeconds: -5 }));
  assert.equal(contentState.elapsedSeconds, 0);
  const rounded = buildLiveCardState(baseInput({ elapsedSeconds: 12.6 }));
  assert.equal(rounded.contentState.elapsedSeconds, 13);
});

test('duel where I trail: adjacent gap is to the runner just ahead, formatted -Xm', () => {
  const input = baseInput({
    mode: 'duel',
    matchId: 'duel-1',
    goalDistanceKm: 5,
    distanceKm: 2.0,
    board: [
      { name: '나', distanceKm: 2.0, isMe: true },
      { name: '상대', distanceKm: 2.012, isMe: false },
    ],
  });

  const { attributes, contentState } = buildLiveCardState(input);

  assert.equal(attributes.mode, 'duel');
  assert.equal(attributes.matchId, 'duel-1');
  assert.deepEqual(attributes.runnerNames, ['나', '상대']);

  assert.equal(contentState.totalRunners, 2);
  assert.equal(contentState.myRank, 2); // opponent leads
  // 2.012 - 2.0 = 0.012km = 12m behind → '-12m'
  assert.equal(contentState.adjacentGapText, '-12m');
  assert.equal(contentState.runners?.length, 2);
  assert.equal(contentState.runners?.[0].isMe, false); // leader first
  assert.equal(contentState.runners?.[1].isMe, true);
});

test('duel where I lead: adjacent gap is to the runner just behind, formatted +Xm', () => {
  const input = baseInput({
    mode: 'duel',
    matchId: 'duel-1',
    goalDistanceKm: 5,
    distanceKm: 2.5,
    board: [
      { name: '나', distanceKm: 2.5, isMe: true },
      { name: '상대', distanceKm: 2.495, isMe: false },
    ],
  });

  const { contentState } = buildLiveCardState(input);

  assert.equal(contentState.myRank, 1); // I lead
  // 2.5 - 2.495 = 0.005km = 5m ahead → '+5m'
  assert.equal(contentState.adjacentGapText, '+5m');
});

test('group: rank + total over the full board, gap to the immediately adjacent runner', () => {
  const input = baseInput({
    mode: 'group',
    matchId: 'group-1',
    goalDistanceKm: 5,
    distanceKm: 3.0,
    board: [
      { name: 'A', distanceKm: 3.30, isMe: false },
      { name: 'B', distanceKm: 3.10, isMe: false },
      { name: '나', distanceKm: 3.00, isMe: true },
      { name: 'C', distanceKm: 2.80, isMe: false },
      { name: 'D', distanceKm: 2.50, isMe: false },
    ],
  });

  const { contentState } = buildLiveCardState(input);

  assert.equal(contentState.totalRunners, 5);
  assert.equal(contentState.myRank, 3); // A, B, me
  // immediately ahead is B at 3.10 → 0.10km = 100m → '-100m' (NOT gap to leader A at 300m)
  assert.equal(contentState.adjacentGapText, '-100m');
});

test('group rank bar caps to top-3 + me; me appended when outside the top-3', () => {
  const input = baseInput({
    mode: 'group',
    matchId: 'group-1',
    goalDistanceKm: 5,
    distanceKm: 2.0,
    board: [
      { name: 'A', distanceKm: 4.0, isMe: false },
      { name: 'B', distanceKm: 3.5, isMe: false },
      { name: 'C', distanceKm: 3.0, isMe: false },
      { name: 'D', distanceKm: 2.5, isMe: false },
      { name: '나', distanceKm: 2.0, isMe: true },
    ],
  });

  const { contentState } = buildLiveCardState(input);

  // top-3 (A,B,C) + me = 4 rows; D (4th, not me) is excluded.
  assert.equal(contentState.runners?.length, 4);
  assert.deepEqual(contentState.runners?.map((row) => row.name), ['A', 'B', 'C', '나']);
  assert.equal(contentState.runners?.at(-1)?.isMe, true);
  assert.equal(contentState.runners?.some((row) => row.name === 'D'), false);
  // progress is fraction toward the 5km goal: A 4/5 = 0.8, me 2/5 = 0.4.
  assert.equal(contentState.runners?.[0].progress0to1, 0.8);
  assert.equal(contentState.runners?.at(-1)?.progress0to1, 0.4);
});

test('group rank bar keeps only top-3 when me is already inside it', () => {
  const input = baseInput({
    mode: 'group',
    matchId: 'group-1',
    goalDistanceKm: 5,
    distanceKm: 3.5,
    board: [
      { name: 'A', distanceKm: 4.0, isMe: false },
      { name: '나', distanceKm: 3.5, isMe: true },
      { name: 'C', distanceKm: 3.0, isMe: false },
      { name: 'D', distanceKm: 2.5, isMe: false },
    ],
  });

  const { contentState } = buildLiveCardState(input);

  assert.equal(contentState.runners?.length, 3);
  assert.deepEqual(contentState.runners?.map((row) => row.name), ['A', '나', 'C']);
});

test('match with a single (only-me) board yields no adjacent gap', () => {
  const input = baseInput({
    mode: 'duel',
    matchId: 'duel-1',
    goalDistanceKm: 5,
    distanceKm: 1.0,
    board: [{ name: '나', distanceKm: 1.0, isMe: true }],
  });

  const { contentState } = buildLiveCardState(input);
  assert.equal(contentState.totalRunners, 1);
  assert.equal(contentState.myRank, 1);
  assert.equal(contentState.adjacentGapText, undefined);
});

test('match mode with an empty board degrades to solo-shaped content (no match fields)', () => {
  const input = baseInput({
    mode: 'group',
    matchId: 'group-1',
    goalDistanceKm: 5,
    board: [],
  });

  const { contentState } = buildLiveCardState(input);
  assert.equal(contentState.totalRunners, undefined);
  assert.equal(contentState.runners, undefined);
  assert.equal(contentState.adjacentGapText, undefined);
});
