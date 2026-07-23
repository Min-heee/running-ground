import assert from 'node:assert/strict';
import test from 'node:test';

import { formatRegionLabel } from './regionLabel';

test('metro user: province + district', () => {
  assert.equal(
    formatRegionLabel({ provinceName: '서울특별시', cityName: '', districtName: '강남구' }),
    '서울특별시 강남구',
  );
});

// 2026-07-01 행정통합: 캐시/미이관 응답에 남은 옛 시·도 이름도 현행 명칭으로 표시.
test('legacy merged-province names are normalized to 전남광주통합특별시', () => {
  assert.equal(
    formatRegionLabel({ provinceName: '광주광역시', cityName: '', districtName: '동구' }),
    '전남광주통합특별시 동구',
  );
  assert.equal(
    formatRegionLabel({ provinceName: '전라남도', cityName: '순천시', districtName: '순천시' }),
    '전남광주통합특별시 순천시',
  );
  assert.equal(
    formatRegionLabel({ provinceName: '전남광주통합특별시', cityName: '', districtName: '동구' }),
    '전남광주통합특별시 동구',
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
