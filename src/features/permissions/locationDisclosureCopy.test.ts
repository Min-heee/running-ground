import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  LOCATION_DISCLOSURE_AGREE_LABEL,
  LOCATION_DISCLOSURE_MESSAGE,
  LOCATION_DISCLOSURE_TITLE,
} from './locationDisclosureCopy';

// Google Play 명시적 공개 요건 계약 (2026-08-05 정책 거절 대응): 문구를 다듬다가
// 요건 요소를 떨어뜨리면 다음 심사에서 다시 거절된다. 필수 요소를 고정한다.
test('location disclosure copy keeps every Play-required element', () => {
  assert.ok(LOCATION_DISCLOSURE_MESSAGE.includes('러닝그라운드'), '앱 이름 명시');
  assert.ok(LOCATION_DISCLOSURE_MESSAGE.includes('위치 데이터'), '수집 데이터 종류');
  assert.ok(LOCATION_DISCLOSURE_MESSAGE.includes('수집'), '수집 사실');
  assert.ok(LOCATION_DISCLOSURE_MESSAGE.includes('백그라운드'), '백그라운드 수집 명시');
  assert.ok(
    LOCATION_DISCLOSURE_MESSAGE.includes('측정')
    && LOCATION_DISCLOSURE_MESSAGE.includes('대결')
    && LOCATION_DISCLOSURE_MESSAGE.includes('응원'),
    '사용 목적(기능) 열거',
  );
  assert.ok(LOCATION_DISCLOSURE_TITLE.length > 0);
  assert.equal(LOCATION_DISCLOSURE_AGREE_LABEL, '동의');
});
