import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getRawFixSpeedSample, recordRawFixSpeed, resetRawFixSpeed } from './rawFixSpeedStore';

type Coords = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
};

function fix(coords: Coords, timestampMs: number) {
  return {
    coords: {
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      accuracy: 10,
      speed: null,
      ...coords,
    },
    timestamp: timestampMs,
  } as unknown as Parameters<typeof recordRawFixSpeed>[0];
}

test('기기 도플러 속도(coords.speed)를 우선 기록한다 — 차량 시속 60km도 그대로', () => {
  resetRawFixSpeed();
  recordRawFixSpeed(fix({ latitude: 37.5, longitude: 127.0, speed: 16.7 }, 1_000), 1_000);
  assert.deepEqual(getRawFixSpeedSample(), { atMs: 1_000, speedMps: 16.7 });
});

test('coords.speed가 없으면 직전 원시 픽스와의 변위/시간으로 계산한다', () => {
  resetRawFixSpeed();
  // 위도 0.0001도 ≈ 11.1m를 1초에 → 약 11 m/s.
  recordRawFixSpeed(fix({ latitude: 37.5000, longitude: 127.0 }, 1_000), 1_000);
  assert.equal(getRawFixSpeedSample(), null);
  recordRawFixSpeed(fix({ latitude: 37.5001, longitude: 127.0 }, 2_000), 2_000);
  const sample = getRawFixSpeedSample();
  assert.ok(sample && Math.abs(sample.speedMps - 11.1) < 0.3, `speed=${sample?.speedMps}`);
});

test('정확도 40m 초과 픽스와 비현실 속도(70 m/s↑)는 무시한다', () => {
  resetRawFixSpeed();
  recordRawFixSpeed(fix({ latitude: 37.5, longitude: 127.0, speed: 9, accuracy: 55 }, 1_000), 1_000);
  assert.equal(getRawFixSpeedSample(), null);
  recordRawFixSpeed(fix({ latitude: 37.5, longitude: 127.0, speed: 120 }, 2_000), 2_000);
  assert.equal(getRawFixSpeedSample(), null);
  recordRawFixSpeed(fix({ latitude: 37.5, longitude: 127.0, speed: 3.1 }, 3_000), 3_000);
  assert.equal(getRawFixSpeedSample()?.speedMps, 3.1);
});

test('reset은 샘플과 변위 기준점을 모두 지운다', () => {
  resetRawFixSpeed();
  recordRawFixSpeed(fix({ latitude: 37.5, longitude: 127.0, speed: 4 }, 1_000), 1_000);
  resetRawFixSpeed();
  assert.equal(getRawFixSpeedSample(), null);
  // 기준점이 지워졌으므로 speed 없는 첫 픽스는 다시 null.
  recordRawFixSpeed(fix({ latitude: 37.5001, longitude: 127.0 }, 2_000), 2_000);
  assert.equal(getRawFixSpeedSample(), null);
});
