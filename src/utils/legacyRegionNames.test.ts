import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeRegionName } from './legacyRegionNames';

test('legacy merged-province names map to 전남광주통합특별시', () => {
  assert.equal(normalizeRegionName('광주광역시'), '전남광주통합특별시');
  assert.equal(normalizeRegionName('전라남도'), '전남광주통합특별시');
});

test('current names and 시·군·구 names pass through untouched', () => {
  assert.equal(normalizeRegionName('전남광주통합특별시'), '전남광주통합특별시');
  assert.equal(normalizeRegionName('서울특별시'), '서울특별시');
  assert.equal(normalizeRegionName('동구'), '동구');
  // 경기도 광주시는 통합과 무관 — 시 이름이라 매핑 대상이 아니다.
  assert.equal(normalizeRegionName('광주시'), '광주시');
});

test('empty and nullish inputs degrade to an empty string', () => {
  assert.equal(normalizeRegionName(''), '');
  assert.equal(normalizeRegionName(null), '');
  assert.equal(normalizeRegionName(undefined), '');
});
