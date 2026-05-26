import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '../response/httpResponse.mjs';
import {
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
  assert.equal(validateRunningMatchProgressDistanceKm(0.4649, '러닝 거리를 입력해줘.'), 0.465);
  assert.equal(validateRunningMatchProgressDistanceKm('0.469', '러닝 거리를 입력해줘.'), 0.469);
  assert.throws(
    () => validateRunningMatchProgressDistanceKm(0, '러닝 거리를 입력해줘.'),
    (error) => error instanceof ApiError,
  );
});
