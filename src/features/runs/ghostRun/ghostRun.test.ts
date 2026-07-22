import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGhostFinishAnnouncement,
  buildGhostRaceAnnouncement,
  buildGhostStartAnnouncement,
  type GhostRaceConfig,
} from './ghostRaceModel';
import {
  deserializeGhostRecord,
  interpolateGhostDistanceM,
  resampleGhostTrack,
  serializeGhostRecord,
  type GhostRecord,
  type GhostSample,
} from './ghostTrackCodec';

// A perfectly steady 6'00"/km run: 1800s → 5000m.
function steadySamples(durationSec: number, totalDistanceM: number): GhostSample[] {
  const samples: GhostSample[] = [];
  for (let t = 0; t <= durationSec; t += 5) {
    samples.push({ elapsedSec: t, distanceM: (totalDistanceM * t) / durationSec });
  }
  return samples;
}

function buildRecord(durationSec: number, distanceM: number): GhostRecord {
  return {
    v: 1,
    id: 'ghost-test',
    savedAt: '2026-07-22T00:00:00.000Z',
    startedAt: '2026-07-22T00:00:00.000Z',
    durationSec,
    distanceM,
    track: resampleGhostTrack(steadySamples(durationSec, distanceM), durationSec),
  };
}

test('resampled track stays tiny and reconstructs the curve within a few meters', () => {
  const record = buildRecord(1800, 5000);

  assert.ok(record.track.deltasM.length <= 360);
  assert.equal(record.track.stepSec, 10);

  // Serialized size must stay well inside the SecureStore budget.
  const serialized = serializeGhostRecord(record);
  assert.ok(serialized.length < 1900, `serialized ${serialized.length} bytes`);

  // Interpolation matches the steady curve closely at arbitrary times.
  const at900 = interpolateGhostDistanceM(record, 900);
  assert.ok(Math.abs(at900 - 2500) < 15, `t=900 → ${at900}`);
  const at123 = interpolateGhostDistanceM(record, 123);
  assert.ok(Math.abs(at123 - (5000 * 123) / 1800) < 15, `t=123 → ${at123}`);
});

test('a very long run widens the step instead of overflowing the point cap', () => {
  const threeHoursSec = 3 * 60 * 60;
  const record = buildRecord(threeHoursSec, 25_000);

  assert.ok(record.track.deltasM.length <= 360);
  assert.ok(record.track.stepSec >= 30);
  assert.ok(serializeGhostRecord(record).length < 1900);
});

test('interpolation clamps to the final distance past the ghost duration', () => {
  const record = buildRecord(1800, 5000);

  assert.equal(interpolateGhostDistanceM(record, 99_999), 5000);
  assert.equal(interpolateGhostDistanceM(record, 0), 0);
});

test('serialize/deserialize roundtrip and corrupt payload rejection', () => {
  const record = buildRecord(600, 1500);
  const restored = deserializeGhostRecord(serializeGhostRecord(record));

  assert.deepEqual(restored, record);
  assert.equal(deserializeGhostRecord('{"v":2}'), null);
  assert.equal(deserializeGhostRecord('not json'), null);
  assert.equal(deserializeGhostRecord(null), null);
});

function raceConfig(overrides: Partial<GhostRaceConfig> = {}): GhostRaceConfig {
  return {
    ghost: buildRecord(1800, 5000),
    intervalMinutes: 2,
    announceGap: true,
    announceElapsed: false,
    announceDistance: false,
    ...overrides,
  };
}

test('gap announcements: ahead, behind, and neck-and-neck', () => {
  // Ghost at t=600 is at ~1667m.
  assert.ok(
    buildGhostRaceAnnouncement(raceConfig(), { elapsedSeconds: 600, distanceKm: 1.8 })
      .includes('앞서고 있어요'),
  );
  assert.ok(
    buildGhostRaceAnnouncement(raceConfig(), { elapsedSeconds: 600, distanceKm: 1.5 })
      .includes('뒤처져 있어요'),
  );
  assert.ok(
    buildGhostRaceAnnouncement(raceConfig(), { elapsedSeconds: 600, distanceKm: 1.667 })
      .includes('나란히'),
  );
});

test('finish verdict compares my elapsed to the ghost duration', () => {
  assert.ok(buildGhostFinishAnnouncement(raceConfig(), 1700).includes('1분 40초 차이로 이겼어요'));
  assert.ok(buildGhostFinishAnnouncement(raceConfig(), 1860).includes('1분 늦었어요'));
});

test('start announcement introduces the ghost record', () => {
  const text = buildGhostStartAnnouncement(raceConfig());

  assert.ok(text.includes('나와의 대결을 시작해요.'));
  assert.ok(text.includes('5킬로미터'));
  assert.ok(text.includes('30분'));
  assert.ok(text.includes('2분마다'));
});
