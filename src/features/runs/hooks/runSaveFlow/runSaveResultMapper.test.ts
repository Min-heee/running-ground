import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRunSaveResultSnapshot } from './runSaveResultMapper';
import type { DisplayedTrackingSnapshot } from './types';

function snapshot(overrides?: Partial<DisplayedTrackingSnapshot>): DisplayedTrackingSnapshot {
  return {
    route: [
      { latitude: 37.1, longitude: 127.1, timestamp: '2026-05-15T00:00:00.000Z' },
      { latitude: 37.2, longitude: 127.2, timestamp: '2026-05-15T00:30:00.000Z' },
    ],
    distanceKm: 5,
    elevationGainM: 12,
    currentPace: '6:00/km',
    elapsedSeconds: 1_800,
    startedAt: '2026-05-15T00:00:00.000Z',
    ...overrides,
  };
}

test('run save result mapper preserves tracked run payload shape', () => {
  const result = buildRunSaveResultSnapshot({
    displayedSnapshot: snapshot(),
    totalSteps: 3_000,
    trackedMatchResult: {
      mode: 'duel',
      title: '1대1 승리',
      summary: '상대보다 0.2km 앞섰어요.',
      badgeLabel: '승리',
      resultTone: 'win',
    },
  });

  assert.equal(result.createRunInput.date, '2026-05-15');
  assert.equal(result.createRunInput.distanceKm, 5);
  assert.equal(result.createRunInput.durationSeconds, 1_800);
  assert.equal(result.createRunInput.elevationGainM, 12);
  assert.equal(result.createRunInput.startedAt, '2026-05-15T00:00:00.000Z');
  assert.equal(result.createRunInput.endedAt, '2026-05-15T00:30:00.000Z');
  assert.equal(result.createRunInput.matchResult?.mode, 'duel');
  assert.equal(result.averagePaceLabel, result.createRunInput.pace);
});

test('run save result mapper rejects unsavable short route', () => {
  assert.throws(() => buildRunSaveResultSnapshot({
    displayedSnapshot: snapshot({ distanceKm: 0.05 }),
    totalSteps: 10,
  }), /실제로 이동한 러닝 경로/);

  assert.throws(() => buildRunSaveResultSnapshot({
    displayedSnapshot: snapshot({ route: [snapshot().route[0]] }),
    totalSteps: 10,
  }), /실제로 이동한 러닝 경로/);
});

test('run save result mapper rejects missing pace calculation', () => {
  assert.throws(() => buildRunSaveResultSnapshot({
    displayedSnapshot: snapshot({ elapsedSeconds: 0 }),
    totalSteps: 10,
  }), /페이스 계산/);
});
