import assert from 'node:assert/strict';
import test from 'node:test';
import type { BackgroundRunTrackingSnapshot } from '@/features/runs/tracking/background';
import { buildDisplayedTrackingSnapshot } from './trackingDisplayModel';

const baseSnapshot: BackgroundRunTrackingSnapshot = {
  status: 'running',
  route: [
    { latitude: 37.1, longitude: 127.1, altitude: 10, timestamp: '2026-05-12T00:00:00.000Z' },
    { latitude: 37.1001, longitude: 127.1001, altitude: 12, timestamp: '2026-05-12T00:00:10.000Z' },
  ],
  distanceKm: 0.08,
  elevationGainM: 2,
  currentPace: '06:10/km',
  startedAt: '2026-05-12T00:00:00.000Z',
  pausedAt: null,
  accumulatedPausedMs: 0,
};

test('displayed tracking snapshot hides pre-start warmup distance', () => {
  const displayed = buildDisplayedTrackingSnapshot({
    snapshot: baseSnapshot,
    rawElapsedSeconds: 10,
    officialStartBaseline: null,
    hasPreStartWarmup: true,
    startNoiseGraceSeconds: 5,
    startNoiseGraceKm: 0.05,
  });

  assert.equal(displayed.distanceKm, 0);
  assert.equal(displayed.elapsedSeconds, 0);
  assert.deepEqual(displayed.route, []);
});

test('displayed tracking snapshot keeps slot elapsed when active match warmup snapshot arrives', () => {
  const matchSlotStartAt = '2026-05-12T00:00:00.000Z';
  const displayed = buildDisplayedTrackingSnapshot({
    snapshot: {
      ...baseSnapshot,
      route: [],
      distanceKm: 0,
      elevationGainM: 0,
      startedAt: null,
    },
    rawElapsedSeconds: 0,
    officialStartBaseline: null,
    hasPreStartWarmup: true,
    matchSlotStartAt,
    startNoiseGraceSeconds: 5,
    startNoiseGraceKm: 0.05,
    syncedNowMs: Date.parse('2026-05-12T00:00:12.000Z'),
  });

  assert.equal(displayed.elapsedSeconds, 12);
  assert.equal(displayed.startedAt, matchSlotStartAt);
});

test('displayed tracking snapshot clamps slot elapsed before the server slot starts', () => {
  const matchSlotStartAt = '2026-05-12T00:00:10.000Z';
  const displayed = buildDisplayedTrackingSnapshot({
    snapshot: baseSnapshot,
    rawElapsedSeconds: 7,
    officialStartBaseline: null,
    hasPreStartWarmup: false,
    matchSlotStartAt,
    startNoiseGraceSeconds: 5,
    startNoiseGraceKm: 0.05,
    syncedNowMs: Date.parse('2026-05-12T00:00:08.000Z'),
  });

  assert.equal(displayed.elapsedSeconds, 0);
  assert.equal(displayed.startedAt, matchSlotStartAt);
});

test('displayed tracking snapshot suppresses official-start GPS noise briefly', () => {
  const displayed = buildDisplayedTrackingSnapshot({
    snapshot: { ...baseSnapshot, distanceKm: 0.04 },
    rawElapsedSeconds: 12,
    officialStartBaseline: {
      matchId: 'match-1',
      distanceKm: 0,
      elapsedSeconds: 8,
      routeStartIndex: 0,
      routeStartPoint: baseSnapshot.route[0],
      startedAt: '2026-05-12T00:00:08.000Z',
    },
    hasPreStartWarmup: false,
    startNoiseGraceSeconds: 5,
    startNoiseGraceKm: 0.05,
  });

  assert.equal(displayed.distanceKm, 0);
  assert.equal(displayed.elevationGainM, 0);
  assert.equal(displayed.elapsedSeconds, 4);
});

test('displayed tracking snapshot shows adjusted match distance after noise window', () => {
  const displayed = buildDisplayedTrackingSnapshot({
    snapshot: { ...baseSnapshot, distanceKm: 0.25 },
    rawElapsedSeconds: 40,
    officialStartBaseline: {
      matchId: 'match-1',
      distanceKm: 0.04,
      elapsedSeconds: 8,
      routeStartIndex: 0,
      routeStartPoint: baseSnapshot.route[0],
      startedAt: '2026-05-12T00:00:08.000Z',
    },
    hasPreStartWarmup: false,
    startNoiseGraceSeconds: 5,
    startNoiseGraceKm: 0.05,
  });

  assert.equal(displayed.distanceKm, 0.21);
  assert.equal(displayed.elapsedSeconds, 32);
});

test('displayed tracking snapshot uses slot elapsed even when official baseline exists', () => {
  const matchSlotStartAt = '2026-05-12T00:00:00.000Z';
  const displayed = buildDisplayedTrackingSnapshot({
    snapshot: { ...baseSnapshot, distanceKm: 0.25 },
    rawElapsedSeconds: 120,
    officialStartBaseline: {
      matchId: 'match-1',
      distanceKm: 0.04,
      elapsedSeconds: 80,
      routeStartIndex: 0,
      routeStartPoint: baseSnapshot.route[0],
      startedAt: '2026-05-12T00:00:08.000Z',
    },
    hasPreStartWarmup: false,
    matchSlotStartAt,
    startNoiseGraceSeconds: 5,
    startNoiseGraceKm: 0.05,
    syncedNowMs: Date.parse('2026-05-12T00:00:45.000Z'),
  });

  assert.equal(displayed.elapsedSeconds, 45);
  assert.equal(displayed.distanceKm, 0.21);
  assert.equal(displayed.startedAt, matchSlotStartAt);
});

test('displayed tracking snapshot anchors active match elapsed to the server slot start', () => {
  const matchSlotStartAt = '2026-05-12T00:00:00.000Z';
  const syncedNowMs = Date.parse('2026-05-12T00:00:30.000Z');
  const firstPhone = buildDisplayedTrackingSnapshot({
    snapshot: {
      ...baseSnapshot,
      startedAt: '2026-05-12T00:00:05.000Z',
    },
    rawElapsedSeconds: 25,
    officialStartBaseline: null,
    hasPreStartWarmup: false,
    matchSlotStartAt,
    startNoiseGraceSeconds: 5,
    startNoiseGraceKm: 0.05,
    syncedNowMs,
  });
  const secondPhone = buildDisplayedTrackingSnapshot({
    snapshot: {
      ...baseSnapshot,
      startedAt: '2026-05-12T00:00:29.000Z',
    },
    rawElapsedSeconds: 1,
    officialStartBaseline: null,
    hasPreStartWarmup: false,
    matchSlotStartAt,
    startNoiseGraceSeconds: 5,
    startNoiseGraceKm: 0.05,
    syncedNowMs,
  });

  assert.equal(firstPhone.elapsedSeconds, 30);
  assert.equal(secondPhone.elapsedSeconds, 30);
  assert.equal(firstPhone.startedAt, matchSlotStartAt);
  assert.equal(secondPhone.startedAt, matchSlotStartAt);
});

test('displayed tracking snapshot subtracts paused time from slot anchored elapsed', () => {
  const matchSlotStartAt = '2026-05-12T00:00:00.000Z';
  const displayed = buildDisplayedTrackingSnapshot({
    snapshot: {
      ...baseSnapshot,
      accumulatedPausedMs: 10_000,
    },
    rawElapsedSeconds: 45,
    officialStartBaseline: null,
    hasPreStartWarmup: false,
    matchSlotStartAt,
    startNoiseGraceSeconds: 5,
    startNoiseGraceKm: 0.05,
    syncedNowMs: Date.parse('2026-05-12T00:00:45.000Z'),
  });

  assert.equal(displayed.elapsedSeconds, 35);
  assert.equal(displayed.startedAt, matchSlotStartAt);
});

test('displayed tracking snapshot keeps raw elapsed when no match slot is available', () => {
  const displayed = buildDisplayedTrackingSnapshot({
    snapshot: baseSnapshot,
    rawElapsedSeconds: 17,
    officialStartBaseline: null,
    hasPreStartWarmup: false,
    matchSlotStartAt: null,
    startNoiseGraceSeconds: 5,
    startNoiseGraceKm: 0.05,
    syncedNowMs: Date.parse('2026-05-12T00:00:45.000Z'),
  });

  assert.equal(displayed.elapsedSeconds, 17);
  assert.equal(displayed.startedAt, baseSnapshot.startedAt);
});

test('공식 출발 기준의 경과는 기기 시계 오차에 흔들리지 않는다', () => {
  // 8/21 갤럭시 회귀 못. 기기 시계가 서버보다 18초 느리거나 빨라도 화면(그리고 매치 진행
  // POST와 승부 판정의 순위 키)에 나가는 경과는 같아야 한다. 예전엔 원시 경과와 기준선이
  // 똑같이 오염돼 상쇄될 때만 맞았고, 원시 쪽을 바로잡자 이 가지가 오차만큼 어긋났다.
  const officialStartAt = '2026-05-12T00:10:00.000Z';
  const trueNowMs = Date.parse('2026-05-12T00:20:00.000Z');
  const trueElapsedSeconds = 600;

  for (const clockErrorMs of [-18_000, 0, 18_000]) {
    // 기기 시계가 서버보다 clockErrorMs만큼 앞서(뒤처져) 있다 — 러닝 시작 스탬프도 그 시계로 찍힌다.
    const deviceStartedAtMs = Date.parse('2026-05-12T00:05:00.000Z') + clockErrorMs;
    const deviceNowMs = trueNowMs + clockErrorMs;
    const snapshot: BackgroundRunTrackingSnapshot = {
      ...baseSnapshot,
      startedAt: new Date(deviceStartedAtMs).toISOString(),
    };

    const displayed = buildDisplayedTrackingSnapshot({
      snapshot,
      // 원시 경과는 기기 시계 한 벌로 잰다(수술 이후의 규칙).
      rawElapsedSeconds: Math.floor((deviceNowMs - deviceStartedAtMs) / 1000),
      officialStartBaseline: {
        matchId: 'm-1',
        distanceKm: 0,
        // 혼합 기준으로 만들어진 옛 값 — 이제 쓰이지 않아야 한다.
        elapsedSeconds: Math.floor((Date.parse(officialStartAt) - deviceStartedAtMs) / 1000),
        routeStartIndex: 0,
        routeStartPoint: null,
        startedAt: officialStartAt,
      },
      hasPreStartWarmup: false,
      startNoiseGraceSeconds: 5,
      startNoiseGraceKm: 0.05,
      // 서버 보정 now는 어느 기기에서든 진짜 시각이다.
      syncedNowMs: trueNowMs,
    });

    assert.equal(
      displayed.elapsedSeconds,
      trueElapsedSeconds,
      `기기 시계 오차 ${clockErrorMs}ms에서 경과가 어긋났다`,
    );
  }
});
