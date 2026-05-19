import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STALE_RENDER_ACTIVE_MATCH_MS,
  STALE_RENDER_MATCHED_MATCH_MS,
} from './trackRunExperienceConstants';
import { shouldHidePastUpcomingMatch } from './matchVisibility';

const nowMs = Date.parse('2026-05-19T12:00:00.000Z');

function slotStartAt(elapsedMs: number) {
  return new Date(nowMs - elapsedMs).toISOString();
}

test('shouldHidePastUpcomingMatch keeps invalid dates visible', () => {
  assert.equal(shouldHidePastUpcomingMatch({
    slotStartAt: 'not-a-date',
    status: 'matched',
  }, nowMs), false);
});

test('shouldHidePastUpcomingMatch hides stale matched matches after matched TTL only', () => {
  assert.equal(shouldHidePastUpcomingMatch({
    slotStartAt: slotStartAt(STALE_RENDER_MATCHED_MATCH_MS),
    status: 'matched',
  }, nowMs), false);

  assert.equal(shouldHidePastUpcomingMatch({
    slotStartAt: slotStartAt(STALE_RENDER_MATCHED_MATCH_MS + 1),
    status: 'matched',
  }, nowMs), true);
});

test('shouldHidePastUpcomingMatch uses longer TTL for active matches', () => {
  assert.equal(shouldHidePastUpcomingMatch({
    slotStartAt: slotStartAt(STALE_RENDER_MATCHED_MATCH_MS + 1),
    status: 'active',
  }, nowMs), false);

  assert.equal(shouldHidePastUpcomingMatch({
    slotStartAt: slotStartAt(STALE_RENDER_ACTIVE_MATCH_MS + 1),
    status: 'active',
  }, nowMs), true);
});
