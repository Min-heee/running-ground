import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldShowBackgroundRestrictionNotice } from '@/features/permissions/backgroundRestrictionNoticeModel';

// 삼성 "백그라운드 사용 제한" 1회 안내 (오너 2026-08-13): 안드로이드에서 아직 안 본 경우에만.
// 이 판정이 무너지면 iOS에 무의미한 안내가 뜨거나, 매 진입마다 잔소리가 된다.

test('안드로이드 + 미확인일 때만 안내를 띄운다', () => {
  assert.equal(shouldShowBackgroundRestrictionNotice({ isAndroid: true, seen: false }), true);
  assert.equal(shouldShowBackgroundRestrictionNotice({ isAndroid: true, seen: true }), false);
  assert.equal(shouldShowBackgroundRestrictionNotice({ isAndroid: false, seen: false }), false);
  assert.equal(shouldShowBackgroundRestrictionNotice({ isAndroid: false, seen: true }), false);
});
