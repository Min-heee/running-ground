import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatDistanceKm,
  formatDistanceValue,
  formatPeopleCount,
  formatPoints,
} from './formatUnits';

test('format unit helpers keep normal display values stable', () => {
  assert.equal(formatDistanceValue(10), '10');
  assert.equal(formatDistanceValue(10.25), '10.3');
  assert.equal(formatDistanceKm(5), '5km');
  assert.equal(formatPoints(120), '120P');
  assert.equal(formatPeopleCount(3), '3명');
});

test('format unit helpers handle zero values without dropping units', () => {
  assert.equal(formatDistanceValue(0), '0');
  assert.equal(formatDistanceKm(0), '0km');
  assert.equal(formatPoints(0), '0P');
  assert.equal(formatPeopleCount(0), '0명');
});

test('format unit helpers stringify unusual numeric inputs without throwing', () => {
  assert.equal(formatDistanceValue(-3.24), '-3.2');
  assert.equal(formatDistanceValue(Number.NaN), 'NaN');
  assert.equal(formatDistanceValue(Number.POSITIVE_INFINITY), 'Infinity');
  assert.equal(formatDistanceKm(Number.NEGATIVE_INFINITY), '-Infinitykm');
});
