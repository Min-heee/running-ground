import assert from 'node:assert/strict';
import test from 'node:test';

import { formatRegionLabel } from './regionLabel';

test('metro user: province + district', () => {
  assert.equal(
    formatRegionLabel({ provinceName: '광주광역시', cityName: '', districtName: '동구' }),
    '광주광역시 동구',
  );
});

test('do-tree city without 구 collapses the duplicated name', () => {
  assert.equal(
    formatRegionLabel({ provinceName: '경기도', cityName: '수원시', districtName: '수원시' }),
    '경기도 수원시',
  );
});

test('full three-level region joins all parts', () => {
  assert.equal(
    formatRegionLabel({ provinceName: '경기도', cityName: '고양시', districtName: '덕양구' }),
    '경기도 고양시 덕양구',
  );
});

test('missing fields degrade gracefully', () => {
  assert.equal(formatRegionLabel({ districtName: '동구' }), '동구');
  assert.equal(formatRegionLabel(null), '');
});
