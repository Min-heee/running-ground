import assert from 'node:assert/strict';
import test from 'node:test';

import { needsProfileCompletion } from './profileCompletion';

test('social accounts without a region need completion', () => {
  assert.equal(needsProfileCompletion({ provinceName: '' }), true);
  assert.equal(needsProfileCompletion({ provinceName: '  ' }), true);
  assert.equal(needsProfileCompletion({}), true);
});

test('accounts with a region (and missing profiles) pass through', () => {
  assert.equal(needsProfileCompletion({ provinceName: '전남광주통합특별시' }), false);
  assert.equal(needsProfileCompletion({ provinceName: '서울특별시' }), false);
  // 프로필 미로딩(하이드레이션 전)은 게이트를 걸지 않는다.
  assert.equal(needsProfileCompletion(null), false);
  assert.equal(needsProfileCompletion(undefined), false);
});
