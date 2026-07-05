import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAveragePaceForFinishedRun } from '@/features/runs/tracking';
import type { LocalGoalFreeze } from '@/features/runs/sync/localGoalFreezeStore';
import { applyGoalFreezeToDisplayedSnapshot } from './goalFreezeClamp';
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
    matchSource: 'official',
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
  assert.equal(result.createRunInput.matchResult?.source, 'official');
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
    source: 'party',
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
  assert.equal(result.source, 'party');
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

test('stationary forfeit save synthesizes a tiny stationary route when GPS has not produced points', () => {
  const result = buildRunSaveResultSnapshot({
    allowStationaryForfeitSave: true,
    displayedSnapshot: snapshot({ distanceKm: 0, elapsedSeconds: 0, route: [] }),
    totalSteps: 0,
    trackedMatchResult: buildCurrentUserForfeitMatchResult({
      currentDistanceKm: 0,
      mode: 'duel',
    }),
  });

  assert.equal(result.createRunInput.distanceKm, 0.001);
  assert.equal(result.createRunInput.durationSeconds, 1);
  assert.equal(result.createRunInput.route.length, 2);
  assert.deepEqual(result.createRunInput.route.map((point) => [point.latitude, point.longitude]), [[0, 0], [0, 0]]);
  assert.equal(result.createRunInput.matchResult?.resultTone, 'lose');
});

test('stationary forfeit save duplicates a single GPS point into a savable route', () => {
  const [point] = snapshot().route;
  const result = buildRunSaveResultSnapshot({
    allowStationaryForfeitSave: true,
    displayedSnapshot: snapshot({ distanceKm: 0, elapsedSeconds: 7, route: [point] }),
    totalSteps: 0,
    trackedMatchResult: buildCurrentUserForfeitMatchResult({
      currentDistanceKm: 0,
      mode: 'duel',
    }),
  });

  assert.equal(result.createRunInput.route.length, 2);
  assert.equal(result.createRunInput.route[0].latitude, point.latitude);
  assert.equal(result.createRunInput.route[1].latitude, point.latitude);
  assert.equal(result.createRunInput.route[0].timestamp, '2026-05-15T00:00:00.000Z');
  assert.equal(result.createRunInput.route[1].timestamp, '2026-05-15T00:00:07.000Z');
});

test('run save result mapper rejects missing pace calculation', () => {
  assert.throws(() => buildRunSaveResultSnapshot({
    displayedSnapshot: snapshot({ elapsedSeconds: 0 }),
    totalSteps: 10,
  }), /페이스 계산/);
});

test('C1 no-0 guard: a 0 tracked myDurationSeconds is not persisted over the real elapsed', () => {
  const result = buildRunSaveResultSnapshot({
    displayedSnapshot: snapshot({ elapsedSeconds: 1_800 }),
    totalSteps: 3_000,
    trackedMatchResult: {
      mode: 'duel',
      title: '1대1 승리',
      summary: '',
      badgeLabel: '승리',
      resultTone: 'win',
      // A snapshot with no startedAt / warmup branch collapsed this to 0.
      myDurationSeconds: 0,
    },
  });

  // Falls back to the run's real finalElapsedSeconds instead of persisting 00:00.
  assert.equal(result.createRunInput.matchResult?.myDurationSeconds, 1_800);
});

test('C4 single pace source: the run bottom pace reuses the duel matchResult myPaceLabel', () => {
  const result = buildRunSaveResultSnapshot({
    displayedSnapshot: snapshot({ distanceKm: 5, elapsedSeconds: 1_800 }),
    totalSteps: 3_000,
    trackedMatchResult: {
      mode: 'duel',
      title: '1대1 승리',
      summary: '',
      badgeLabel: '승리',
      resultTone: 'win',
      // The server-frozen 나 pace (6:17). The local buildAveragePace would be 6:00.
      myPaceLabel: '6:17/km',
      myDurationSeconds: 1_800,
    },
  });

  // Bottom metric pace == the matchResult 나 pace (single source, no 6:17-vs-6:00 divergence).
  assert.equal(result.createRunInput.pace, '6:17/km');
  assert.equal(result.createRunInput.matchResult?.myPaceLabel, '6:17/km');
});

test('C4: forfeit 00:00/km pace path is unchanged by the single-pace-source rule', () => {
  const result = buildRunSaveResultSnapshot({
    allowStationaryForfeitSave: true,
    displayedSnapshot: snapshot({ distanceKm: 0, elapsedSeconds: 90 }),
    totalSteps: 0,
    trackedMatchResult: buildCurrentUserForfeitMatchResult({
      currentDistanceKm: 0,
      mode: 'duel',
    }),
  });

  // The forfeit pace stays 00:00/km even though the matchResult has no measured myPaceLabel.
  assert.equal(result.createRunInput.pace, '00:00/km');
});

// ============================================================================================
// HANDS-FREE FINISH (Stage 3d) — the mapper fed with a goal-freeze-CLAMPED snapshot, exactly as
// useRunSaveCommand wires it. duration/endedAt/pace must all derive from the clamped values (one
// consistent at-crossing record), and the mapper's own guards (C1 no-0) must keep holding.
// ============================================================================================

// The save-time snapshot of a crossed 5km run that DRIFTED before the save ran: elapsed ticked on
// to 1930s (the 26:46→+minutes bug) and GPS appended a post-goal tail (5.4km, extra point).
function driftedCrossedSnapshot(): DisplayedTrackingSnapshot {
  return snapshot({
    distanceKm: 5.4,
    elapsedSeconds: 1_930,
    route: [
      { latitude: 37.1, longitude: 127.1, timestamp: '2026-05-15T00:00:00.000Z' },
      { latitude: 37.2, longitude: 127.2, timestamp: '2026-05-15T00:20:00.000Z' },
      { latitude: 37.3, longitude: 127.3, timestamp: '2026-05-15T00:26:40.000Z' },
      { latitude: 37.4, longitude: 127.4, timestamp: '2026-05-15T00:30:00.000Z' },
    ],
  });
}

const CROSSING_FREEZE: LocalGoalFreeze = {
  matchId: 'duel-clamped-save',
  elapsedSeconds: 1_606,
  distanceKm: 5,
  pace: '05:21/km',
  crossedAtIso: '2026-05-15T00:26:46.000Z',
};

test('clamped snapshot: durationSeconds/endedAt/distance/pace all derive from the at-crossing values', () => {
  const clamped = applyGoalFreezeToDisplayedSnapshot(driftedCrossedSnapshot(), CROSSING_FREEZE);
  const result = buildRunSaveResultSnapshot({
    displayedSnapshot: clamped,
    matchId: 'duel-clamped-save',
    matchSource: 'official',
    totalSteps: 3_000,
  });

  // Duration is the crossing elapsed, not the +5min drift.
  assert.equal(result.createRunInput.durationSeconds, 1_606);
  assert.equal(result.finalElapsedSeconds, 1_606);
  // endedAt is the LAST route timestamp after truncation — the crossing-area point, so the saved
  // record has no post-goal tail in time either.
  assert.equal(result.createRunInput.endedAt, '2026-05-15T00:26:40.000Z');
  assert.equal(result.createRunInput.route.length, 3);
  // Distance is the measured-at-crossing distance the server froze.
  assert.equal(result.createRunInput.distanceKm, 5);
  // Pace is recomputed from the CLAMPED pair — one consistent record (5.0km / 1606s).
  assert.equal(result.createRunInput.pace, buildAveragePaceForFinishedRun(5, 1_606));
  assert.equal(result.averagePaceLabel, buildAveragePaceForFinishedRun(5, 1_606));
});

test('clamped snapshot: buildEndedAt fallback (sub-2-point route) uses the clamped elapsed', () => {
  // Truncation would leave <2 points → the clamp keeps the WHOLE route; force the fallback branch
  // instead with an empty route + stationary-forfeit synthesis to check endedAt consistency.
  const clamped = applyGoalFreezeToDisplayedSnapshot(
    { ...driftedCrossedSnapshot(), route: [] },
    CROSSING_FREEZE,
  );
  const result = buildRunSaveResultSnapshot({
    allowStationaryForfeitSave: true,
    displayedSnapshot: clamped,
    totalSteps: 0,
  });

  // startedAt + clamped 1606s — consistent with durationSeconds, not the drifted 1930s.
  assert.equal(result.createRunInput.endedAt, '2026-05-15T00:26:46.000Z');
  assert.equal(result.createRunInput.durationSeconds, 1_606);
});

test('clamped snapshot: C1 no-0 guard still holds (0 myDurationSeconds falls back to the CLAMPED elapsed)', () => {
  const clamped = applyGoalFreezeToDisplayedSnapshot(driftedCrossedSnapshot(), CROSSING_FREEZE);
  const result = buildRunSaveResultSnapshot({
    displayedSnapshot: clamped,
    totalSteps: 3_000,
    trackedMatchResult: {
      mode: 'duel',
      title: '1대1 승리',
      summary: '',
      badgeLabel: '승리',
      resultTone: 'win',
      myDurationSeconds: 0,
    },
  });

  assert.equal(result.createRunInput.matchResult?.myDurationSeconds, 1_606);
});

test('no freeze: the mapper output is byte-identical to feeding the raw snapshot (passthrough)', () => {
  const raw = driftedCrossedSnapshot();
  const viaClamp = buildRunSaveResultSnapshot({
    displayedSnapshot: applyGoalFreezeToDisplayedSnapshot(raw, null),
    totalSteps: 3_000,
  });
  const direct = buildRunSaveResultSnapshot({
    displayedSnapshot: raw,
    totalSteps: 3_000,
  });

  assert.deepEqual(viaClamp.createRunInput, direct.createRunInput);
});
