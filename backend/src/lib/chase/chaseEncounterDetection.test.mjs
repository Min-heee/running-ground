import assert from 'node:assert/strict';
import test from 'node:test';

import { detectChaseEncounters } from './chaseEncounterDetection.mjs';

// 테스트 경기장: 일산 호수공원 스케일의 원형 지오펜스.
const ARENA = { latitude: 37.6585, longitude: 126.7676, radiusM: 900 };
const BASE_MS = Date.parse('2026-07-27T21:00:00.000Z');
const METERS_PER_LAT = 111_320;
const METERS_PER_LNG = 111_320 * Math.cos((ARENA.latitude * Math.PI) / 180);

// 경기장 중심 기준 동쪽 xM, 북쪽 yM 지점의 좌표.
function pointAt(xM, yM) {
  return {
    latitude: ARENA.latitude + yM / METERS_PER_LAT,
    longitude: ARENA.longitude + xM / METERS_PER_LNG,
  };
}

// 직선 트랙: startX에서 동쪽으로 speedMps로 durationS초 동안 1초 간격 이동.
// speedMps가 음수면 서쪽으로 이동. yM은 남북 오프셋(레인 분리용).
function straightTrack({ startXM, yM = 0, speedMps, durationS, startOffsetS = 0 }) {
  const points = [];

  for (let second = 0; second <= durationS; second += 1) {
    const { latitude, longitude } = pointAt(startXM + speedMps * second, yM);
    points.push({
      latitude,
      longitude,
      timestamp: new Date(BASE_MS + (startOffsetS + second) * 1_000).toISOString(),
    });
  }

  return points;
}

test('반대 방향으로 스치면 마주침(meet) 1건', () => {
  // A는 -300m에서 동쪽으로 3m/s, B는 +300m에서 서쪽으로 3m/s — 100초에 0m 지점에서 교차.
  const routeA = straightTrack({ startXM: -300, speedMps: 3, durationS: 200 });
  const routeB = straightTrack({ startXM: 300, yM: 5, speedMps: -3, durationS: 200 });
  const events = detectChaseEncounters({ routeA, routeB, arena: ARENA });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'meet');
  assert.equal(events[0].catcher, null);
});

test('뒤에서 추월하면 따라잡기(catch) — 빠른 쪽이 잡는다', () => {
  // A(4m/s)가 -100m에서 출발, B(2.5m/s)가 0m에서 출발, 같은 동쪽 방향.
  // 상대 접근 1.5m/s → 약 67초에 추월, 이후 계속 벌어짐.
  const routeA = straightTrack({ startXM: -100, speedMps: 4, durationS: 180 });
  const routeB = straightTrack({ startXM: 0, yM: 4, speedMps: 2.5, durationS: 180 });
  const events = detectChaseEncounters({ routeA, routeB, arena: ARENA });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'catch');
  assert.equal(events[0].catcher, 'A');
});

test('추월 방향이 반대면 B가 잡은 것으로 판정', () => {
  const routeA = straightTrack({ startXM: 0, speedMps: 2.5, durationS: 180 });
  const routeB = straightTrack({ startXM: -100, yM: 4, speedMps: 4, durationS: 180 });
  const events = detectChaseEncounters({ routeA, routeB, arena: ARENA });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'catch');
  assert.equal(events[0].catcher, 'B');
});

test('나란히 달리기(역전 없음)는 무득점', () => {
  // 같은 속도로 8m 떨어져 나란히 10분 — 마주침도 추월도 아니다.
  const routeA = straightTrack({ startXM: 0, speedMps: 3, durationS: 600 });
  const routeB = straightTrack({ startXM: -8, yM: 3, speedMps: 3, durationS: 600 });
  const events = detectChaseEncounters({ routeA, routeB, arena: ARENA });

  assert.equal(events.length, 0);
});

test('정지 파밍(둘 다 서 있음)은 무득점', () => {
  const routeA = straightTrack({ startXM: 0, speedMps: 0, durationS: 600 });
  const routeB = straightTrack({ startXM: 10, yM: 0, speedMps: 0, durationS: 600 });
  const events = detectChaseEncounters({ routeA, routeB, arena: ARENA });

  assert.equal(events.length, 0);
});

test('자전거 속도(6.5m/s 초과)가 낀 스침은 무득점', () => {
  // 교차가 정확히 t=100s, x=300m에서 일어나도록 배치 (샘플 격자에 걸리게).
  const routeA = straightTrack({ startXM: -500, speedMps: 8, durationS: 150 });
  const routeB = straightTrack({ startXM: 500, yM: 5, speedMps: -2, durationS: 150 });
  const events = detectChaseEncounters({ routeA, routeB, arena: ARENA });

  assert.equal(events.length, 0);
});

test('교차 지점에 GPS 공백(2분)이 있으면 유령 스침을 만들지 않는다', () => {
  const routeA = straightTrack({ startXM: -300, speedMps: 3, durationS: 200 });
  const fullB = straightTrack({ startXM: 300, yM: 5, speedMps: -3, durationS: 200 });
  // B의 40~160초 구간(교차 시점 100초 포함)을 통째로 비운다.
  const routeB = fullB.filter((point, index) => index < 40 || index > 160);
  const events = detectChaseEncounters({ routeA, routeB, arena: ARENA });

  assert.equal(events.length, 0);
});

test('경기장 밖에서 스친 것은 무득점', () => {
  // 반경 900m 경기장 — 동쪽 1200m 밖 지점에서 교차하도록 평행 이동.
  const routeA = straightTrack({ startXM: 900, speedMps: 3, durationS: 200 });
  const routeB = straightTrack({ startXM: 1500, yM: 5, speedMps: -3, durationS: 200 });
  const events = detectChaseEncounters({ routeA, routeB, arena: ARENA });

  assert.equal(events.length, 0);
});

test('쿨다운: 5분 간격 두 번 스침은 1건, 16분 간격이면 2건', () => {
  // 왕복 트랙을 손으로 이어붙인다: A는 고정 순환 대신 두 번의 교차 창을 만든다.
  const firstPassA = straightTrack({ startXM: -300, speedMps: 3, durationS: 200 });
  const firstPassB = straightTrack({ startXM: 300, yM: 5, speedMps: -3, durationS: 200 });

  const buildSecondPass = (gapS) => ({
    routeA: [
      ...firstPassA,
      ...straightTrack({ startXM: -300, speedMps: 3, durationS: 200, startOffsetS: 200 + gapS }),
    ],
    routeB: [
      ...firstPassB,
      ...straightTrack({ startXM: 300, yM: 5, speedMps: -3, durationS: 200, startOffsetS: 200 + gapS }),
    ],
  });

  const closePasses = buildSecondPass(5 * 60);
  const closeEvents = detectChaseEncounters({ ...closePasses, arena: ARENA });
  assert.equal(closeEvents.length, 1);

  const spacedPasses = buildSecondPass(16 * 60);
  const spacedEvents = detectChaseEncounters({ ...spacedPasses, arena: ARENA });
  assert.equal(spacedEvents.length, 2);
  assert.ok(spacedEvents.every((event) => event.type === 'meet'));
});

test('빈 경로/짧은 겹침은 조용히 빈 배열', () => {
  assert.deepEqual(detectChaseEncounters({ routeA: [], routeB: [], arena: ARENA }), []);
  assert.deepEqual(
    detectChaseEncounters({
      routeA: straightTrack({ startXM: 0, speedMps: 3, durationS: 100 }),
      routeB: straightTrack({ startXM: 0, speedMps: 3, durationS: 100, startOffsetS: 500 }),
      arena: ARENA,
    }),
    [],
  );
});
