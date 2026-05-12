import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLiveMatchPerfSummary,
  clearLiveMatchPerfSamples,
  getLiveMatchPerfSamples,
  recordLiveMatchPerfSample,
} from './liveMatchPerfQaLog';

test('live match perf QA log stores latest samples and summarizes by label', () => {
  clearLiveMatchPerfSamples();

  recordLiveMatchPerfSample({
    label: 'duel-arena',
    mode: 'duel',
    fps: 48,
    renders: 6,
    windowMs: 5000,
    participants: 2,
    targetDistanceKm: 5,
    capturedAt: 1000,
  });
  recordLiveMatchPerfSample({
    label: 'duel-arena',
    mode: 'duel',
    fps: 54,
    renders: 4,
    windowMs: 5000,
    participants: 2,
    targetDistanceKm: 5,
    capturedAt: 6000,
  });

  const summary = buildLiveMatchPerfSummary(getLiveMatchPerfSamples(), 'duel-arena');

  assert.deepEqual(summary, {
    label: 'duel-arena',
    mode: 'duel',
    latestFps: 54,
    averageFps: 51,
    latestRenders: 4,
    averageRenders: 5,
    sampleCount: 2,
    participants: 2,
    visibleParticipants: undefined,
    targetDistanceKm: 5,
    capturedAt: 6000,
  });
});

test('live match perf QA log can summarize the latest sample globally', () => {
  clearLiveMatchPerfSamples();

  recordLiveMatchPerfSample({
    label: 'duel-arena',
    mode: 'duel',
    fps: 50,
    renders: 3,
    windowMs: 5000,
    participants: 2,
    targetDistanceKm: 5,
    capturedAt: 1000,
  });
  recordLiveMatchPerfSample({
    label: 'group-arena',
    mode: 'group',
    fps: 44,
    renders: 9,
    windowMs: 5000,
    participants: 30,
    visibleParticipants: 10,
    targetDistanceKm: 10,
    capturedAt: 2000,
  });

  const summary = buildLiveMatchPerfSummary(getLiveMatchPerfSamples());

  assert.equal(summary?.label, 'group-arena');
  assert.equal(summary?.participants, 30);
  assert.equal(summary?.visibleParticipants, 10);
});
