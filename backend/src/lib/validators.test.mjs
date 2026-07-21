import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '../response/httpResponse.mjs';
import {
  resolveRegionSelection,
  validateDateOnly,
  validateDuelMatchDistanceKm,
  validateRunningMatchProgressDistanceKm,
} from './validators.mjs';

function assertDistanceValidationError(value) {
  assert.throws(
    () => validateDuelMatchDistanceKm(value),
    (error) => error instanceof ApiError,
  );
}

test('validateDuelMatchDistanceKm accepts short custom match distances down to 0.5km', () => {
  assert.equal(validateDuelMatchDistanceKm(0.5), 0.5);
  assert.equal(validateDuelMatchDistanceKm(1), 1);
  assert.equal(validateDuelMatchDistanceKm('1.2'), 1.2);
});

test('validateDuelMatchDistanceKm rejects distances below 0.5km', () => {
  assertDistanceValidationError(0.4);
  assertDistanceValidationError(0);
  assertDistanceValidationError(-1);
});

test('validateDuelMatchDistanceKm keeps the standard marathon upper bound', () => {
  assert.equal(validateDuelMatchDistanceKm(42.195), 42.195);
  assertDistanceValidationError(42.196);
});

test('validateRunningMatchProgressDistanceKm preserves live progress precision', () => {
  assert.equal(validateRunningMatchProgressDistanceKm(0.4649, '러닝 거리를 입력해주세요.'), 0.465);
  assert.equal(validateRunningMatchProgressDistanceKm('0.469', '러닝 거리를 입력해주세요.'), 0.469);
  assert.throws(
    () => validateRunningMatchProgressDistanceKm(0, '러닝 거리를 입력해주세요.'),
    (error) => error instanceof ApiError,
  );
});

test('resolveRegionSelection accepts a leaf 시 with cityName===districtName (경기도/고양시/고양시)', () => {
  const region = resolveRegionSelection('경기도', '고양시', '고양시');
  assert.deepEqual(region, {
    provinceName: '경기도',
    cityName: '고양시',
    districtName: '고양시',
  });
});

test('resolveRegionSelection accepts a metro 구 terminal (서울특별시 / "" / 강남구)', () => {
  const region = resolveRegionSelection('서울특별시', '', '강남구');
  assert.deepEqual(region, {
    provinceName: '서울특별시',
    cityName: '',
    districtName: '강남구',
  });
});

test('resolveRegionSelection rejects a now-removed 3rd-level pick (경기도/고양시/일산서구)', () => {
  assert.throws(
    () => resolveRegionSelection('경기도', '고양시', '일산서구'),
    (error) => error instanceof ApiError,
  );
});

test('resolveRegionSelection rejects a leaf 시 whose districtName does not equal the city', () => {
  // The childless-city branch requires districtName === city.name; anything else is 400.
  assert.throws(
    () => resolveRegionSelection('경기도', '고양시', ''),
    (error) => error instanceof ApiError,
  );
});

// ── validateDateOnly: "오늘"은 KST 달력 기준 ─────────────────────────────────────
// 2026-07-12T18:30:00Z = KST 2026-07-13 03:30 — UTC 날짜와 KST 날짜가 갈라지는 창.

test('validateDateOnly accepts the KST-today date during the after-midnight window', () => {
  const kstEarlyMorning = new Date('2026-07-12T18:30:00Z');
  assert.equal(validateDateOnly('2026-07-13', '날짜를 입력해주세요.', kstEarlyMorning), '2026-07-13');
});

test('validateDateOnly still rejects a genuinely future KST date', () => {
  const kstEarlyMorning = new Date('2026-07-12T18:30:00Z');
  assert.throws(
    () => validateDateOnly('2026-07-14', '날짜를 입력해주세요.', kstEarlyMorning),
    (error) => error instanceof ApiError && error.statusCode === 400,
  );
});

test('validateDateOnly keeps rejecting tomorrow when UTC and KST agree', () => {
  const kstAfternoon = new Date('2026-07-13T06:00:00Z'); // KST 15:00 — same date both clocks
  assert.throws(
    () => validateDateOnly('2026-07-14', '날짜를 입력해주세요.', kstAfternoon),
    (error) => error instanceof ApiError && error.statusCode === 400,
  );
  assert.equal(validateDateOnly('2026-07-13', '날짜를 입력해주세요.', kstAfternoon), '2026-07-13');
});
