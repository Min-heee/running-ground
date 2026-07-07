import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MATCH_END_OVERLAY_EXIT_OFFER_MS,
  MATCH_END_OVERLAY_EXPIRED_MS,
  MATCH_END_OVERLAY_SLOW_MS,
  resolveOverlayWatchdogPhase,
} from './matchEndOverlayWatchdog';

test('watchdog phase thresholds: saving < 12s ≤ slow < 20s ≤ exit-offer < 40s ≤ expired', () => {
  assert.equal(resolveOverlayWatchdogPhase(0), 'saving');
  assert.equal(resolveOverlayWatchdogPhase(MATCH_END_OVERLAY_SLOW_MS - 1), 'saving');

  assert.equal(resolveOverlayWatchdogPhase(MATCH_END_OVERLAY_SLOW_MS), 'slow');
  assert.equal(resolveOverlayWatchdogPhase(MATCH_END_OVERLAY_EXIT_OFFER_MS - 1), 'slow');

  assert.equal(resolveOverlayWatchdogPhase(MATCH_END_OVERLAY_EXIT_OFFER_MS), 'exit-offer');
  assert.equal(resolveOverlayWatchdogPhase(MATCH_END_OVERLAY_EXPIRED_MS - 1), 'exit-offer');

  assert.equal(resolveOverlayWatchdogPhase(MATCH_END_OVERLAY_EXPIRED_MS), 'expired');
});

test('watchdog thresholds match the plan constants (12s/20s/40s)', () => {
  assert.equal(MATCH_END_OVERLAY_SLOW_MS, 12_000);
  assert.equal(MATCH_END_OVERLAY_EXIT_OFFER_MS, 20_000);
  assert.equal(MATCH_END_OVERLAY_EXPIRED_MS, 40_000);
});

test('H1: a 10-minute suspended-timer clock jump lands directly on expired', () => {
  // The overlay flips visible, the phone screen goes off, every JS timer suspends, and the
  // user returns 10 minutes later. The watchdog is wall-clock: the resume re-evaluation
  // computes Date.now() - startMs and must jump straight to 'expired' (no intermediate ticks
  // ever fired).
  const startMs = 1_700_000_000_000;
  const resumeNowMs = startMs + 10 * 60 * 1000;
  assert.equal(resolveOverlayWatchdogPhase(resumeNowMs - startMs), 'expired');
});

test('negative/garbage elapsed stays in the base saving phase', () => {
  assert.equal(resolveOverlayWatchdogPhase(-5_000), 'saving');
});
