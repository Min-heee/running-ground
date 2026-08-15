import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTIVE_BRIGHTNESS_FLOOR,
  IDLE_BRIGHTNESS,
  MAX_GALAXY_SCALE,
  MIN_GALAXY_SCALE,
  MIN_PLANET_SCALE,
  galaxyScale,
  logBrightness,
  nationwideAverageDistanceKm,
  planetScale,
  shrunkAverageDistanceKm,
} from './universeBodies.mjs';

// 우주 천체 매핑: 1인 지역이 전국 최대 은하가 되는 걸 수축 보정이 막는지, 로그 밝기가
// 최대 지역 하나만 남기고 전국을 까맣게 만들지 않는지.

test('전국 평균은 회원수로 나눈다 — 회원이 없으면 기준점 없음(0)', () => {
  assert.equal(nationwideAverageDistanceKm({ totalDistanceKm: 270, memberCount: 21 }), 12.857);
  assert.equal(nationwideAverageDistanceKm({ totalDistanceKm: 0, memberCount: 0 }), 0);
});

test('수축 보정: 회원 0명 지역은 정확히 전국 평균으로 수렴한다', () => {
  assert.equal(
    shrunkAverageDistanceKm({ totalDistanceKm: 0, memberCount: 0, nationwideAverageKm: 12 }),
    12,
  );
});

test('수축 보정: 회원이 많을수록 실제 인당 평균에 붙는다', () => {
  // 회원 100명 · 인당 20km — 전국 평균(10)이 섞여도 5% 이내로만 끌려간다.
  const adjusted = shrunkAverageDistanceKm({
    totalDistanceKm: 2000,
    memberCount: 100,
    nationwideAverageKm: 10,
  });

  assert.ok(adjusted > 19 && adjusted < 20, `기대: 19~20, 실제: ${adjusted}`);
});

test('1인 지역이 전국 최대 은하가 되지 않는다 (7월 동구 사건)', () => {
  // 전국: 21명 270km → 인당 12.857km.
  const nationwideAverageKm = nationwideAverageDistanceKm({ totalDistanceKm: 270, memberCount: 21 });

  // 회원 1명이 30km를 뛴 지역 — 날것의 인당 평균은 전국 평균의 2.33배(상한에 박힌다).
  assert.equal(clampedRawRatio(30, 1, nationwideAverageKm), MAX_GALAXY_SCALE);

  const soloScale = galaxyScale({ totalDistanceKm: 30, memberCount: 1, nationwideAverageKm });
  const cityScale = galaxyScale({ totalDistanceKm: 240, memberCount: 20, nationwideAverageKm });

  // 보정 후에도 1인 지역이 크긴 하다(30km는 실제로 잘 뛴 것) — 다만 상한을 치지는 않는다.
  assert.ok(soloScale < 1.4, `1인 지역 크기가 너무 큼: ${soloScale}`);
  assert.ok(soloScale > cityScale, '30km 1인 지역은 12km 평균 지역보다는 커야 한다');
  assert.ok(soloScale / cityScale < 1.5, `격차가 여전히 과함: ${soloScale / cityScale}`);
});

function clampedRawRatio(totalDistanceKm, memberCount, nationwideAverageKm) {
  const raw = totalDistanceKm / memberCount / nationwideAverageKm;
  return Number(Math.min(MAX_GALAXY_SCALE, Math.max(MIN_GALAXY_SCALE, raw)).toFixed(3));
}

test('은하 크기는 상하한에 갇힌다', () => {
  assert.equal(
    galaxyScale({ totalDistanceKm: 100000, memberCount: 1, nationwideAverageKm: 1 }),
    MAX_GALAXY_SCALE,
  );
  assert.equal(
    galaxyScale({ totalDistanceKm: 0, memberCount: 10000, nationwideAverageKm: 50 }),
    MIN_GALAXY_SCALE,
  );
});

test('전국 평균이 없으면(데이터 0) 모든 은하가 중립 크기 1.0', () => {
  assert.equal(galaxyScale({ totalDistanceKm: 500, memberCount: 3, nationwideAverageKm: 0 }), 1);
});

test('로그 밝기: 화면 최댓값이 1.0, 안 뛰었으면 꺼진다', () => {
  assert.equal(logBrightness({ valueKm: 500, maxValueKm: 500 }), 1);
  assert.equal(logBrightness({ valueKm: 0, maxValueKm: 500 }), IDLE_BRIGHTNESS);
  assert.equal(logBrightness({ valueKm: 10, maxValueKm: 0 }), IDLE_BRIGHTNESS);
});

test('로그 밝기: 수천 배 차이가 나도 작은 쪽이 까맣게 죽지 않는다', () => {
  // 송파구 30,000km vs 어느 군 200km — 선형이면 0.7%라 사실상 검정.
  const dim = logBrightness({ valueKm: 200, maxValueKm: 30000 });

  assert.ok(dim > 0.5, `로그 압축이 부족함: ${dim}`);
  assert.ok(dim > ACTIVE_BRIGHTNESS_FLOOR);
  assert.ok(dim < 1);
});

test('행성 크기: 평생 거리를 로그로 눌러 신입도 점으로 보인다', () => {
  const veteran = planetScale({ lifetimeDistanceKm: 3000, maxLifetimeDistanceKm: 3000 });
  const rookie = planetScale({ lifetimeDistanceKm: 10, maxLifetimeDistanceKm: 3000 });

  assert.equal(veteran, 1);
  assert.ok(rookie > MIN_PLANET_SCALE, '10km 러너도 최소 크기보다는 커야 한다');
  assert.ok(veteran / rookie < 3, `크기 격차가 과함: ${veteran / rookie}`);
});

test('행성 크기: 아직 안 뛴 사람은 최소 크기(탭할 수 있는 점)', () => {
  assert.equal(planetScale({ lifetimeDistanceKm: 0, maxLifetimeDistanceKm: 3000 }), MIN_PLANET_SCALE);
  assert.equal(planetScale({ lifetimeDistanceKm: 0, maxLifetimeDistanceKm: 0 }), MIN_PLANET_SCALE);
});

test('음수·NaN 입력은 0으로 취급한다', () => {
  assert.equal(planetScale({ lifetimeDistanceKm: -5, maxLifetimeDistanceKm: 100 }), MIN_PLANET_SCALE);
  assert.equal(logBrightness({ valueKm: Number.NaN, maxValueKm: 100 }), IDLE_BRIGHTNESS);
  assert.equal(nationwideAverageDistanceKm({ totalDistanceKm: -10, memberCount: 5 }), 0);
});
