import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCurrentUserForfeitMatchResult,
  buildRunSaveResultSnapshot,
} from './runSaveResultMapper';
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

test('run save result mapper can allow short forfeit distance with a real route', () => {
  const result = buildRunSaveResultSnapshot({
    allowShortDistanceSave: true,
    displayedSnapshot: snapshot({ distanceKm: 0.05, elapsedSeconds: 90 }),
    totalSteps: 10,
  });

  assert.equal(result.createRunInput.distanceKm, 0.05);
  assert.equal(result.createRunInput.durationSeconds, 90);
  assert.equal(result.createRunInput.pace, '30:00/km');
});

test('current user forfeit match result always stores duel loss even when distance is ahead', () => {
  const result = buildCurrentUserForfeitMatchResult({
    currentDistanceKm: 0.08,
    mode: 'duel',
    trackedMatchResult: {
      mode: 'duel',
      title: '상대를 이겼어요',
      summary: '0.03km 차이로 앞서 마무리했어요.',
      badgeLabel: '승리',
      opponentName: '상대',
      resultTone: 'win',
      gapKm: 0.03,
      comparedDistanceKm: 0.05,
    },
  });

  assert.equal(result.mode, 'duel');
  assert.equal(result.resultTone, 'lose');
  assert.equal(result.badgeLabel, '기권 패');
  assert.match(result.title, /기권/);
  assert.match(result.summary, /기권 패/);
  assert.equal(result.opponentName, '상대');
});

test('forfeit override can be persisted through the save payload', () => {
  const forfeitResult = buildCurrentUserForfeitMatchResult({
    currentDistanceKm: 0.05,
    mode: 'duel',
    trackedMatchResult: {
      mode: 'duel',
      title: '상대를 이겼어요',
      summary: '앞서 있었어요.',
      badgeLabel: '승리',
      resultTone: 'win',
    },
  });
  const result = buildRunSaveResultSnapshot({
    allowShortDistanceSave: true,
    displayedSnapshot: snapshot({ distanceKm: 0.05, elapsedSeconds: 90 }),
    totalSteps: 10,
    trackedMatchResult: forfeitResult,
  });

  assert.equal(result.createRunInput.matchResult?.resultTone, 'lose');
  assert.equal(result.createRunInput.matchResult?.badgeLabel, '기권 패');
});

test('stationary forfeit save allows zero distance when a real GPS route exists', () => {
  const result = buildRunSaveResultSnapshot({
    allowStationaryForfeitSave: true,
    displayedSnapshot: snapshot({ distanceKm: 0, elapsedSeconds: 90 }),
    totalSteps: 0,
    trackedMatchResult: buildCurrentUserForfeitMatchResult({
      currentDistanceKm: 0,
      mode: 'duel',
    }),
  });

  assert.equal(result.createRunInput.distanceKm, 0.001);
  assert.equal(result.createRunInput.pace, '00:00/km');
  assert.equal(result.createRunInput.matchResult?.resultTone, 'lose');
});

test('run save result mapper rejects missing pace calculation', () => {
  assert.throws(() => buildRunSaveResultSnapshot({
    displayedSnapshot: snapshot({ elapsedSeconds: 0 }),
    totalSteps: 10,
  }), /페이스 계산/);
});
