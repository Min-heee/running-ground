import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TOUR_STEPS } from './tourSteps';

// 사용설명 투어 계약 (오너 2026-08-06): 오너가 지정한 핵심 개념(매칭·파티런·
// 페이스메이커)이 설명에서 빠지면 투어의 존재 이유가 사라진다 — 카피를 고정한다.
test('tour steps keep the owner-required concepts and valid wiring', () => {
  assert.ok(TOUR_STEPS.length >= 6);

  const ids = TOUR_STEPS.map((step) => step.id);
  assert.equal(new Set(ids).size, ids.length, 'step id는 유일해야 한다');

  const validRoutes = new Set(['/(tabs)/home', '/(tabs)/league', '/(tabs)/running', '/(tabs)/friends']);
  for (const step of TOUR_STEPS) {
    assert.ok(validRoutes.has(step.route), `unknown route: ${step.route}`);
    assert.ok(step.title.length > 0 && step.body.length > 0);
  }

  const allBody = TOUR_STEPS.map((step) => `${step.title} ${step.body}`).join(' ');
  assert.ok(allBody.includes('매칭'), '매칭 설명 필수');
  assert.ok(allBody.includes('파티런'), '파티런 설명 필수');
  assert.ok(allBody.includes('페이스메이커'), '페이스메이커 설명 필수');
  assert.ok(allBody.includes('랭크'), '랭크 설명 필수');

  // 첫 스텝은 오너 지정대로 랭킹 탭에서 시작한다.
  assert.equal(TOUR_STEPS[0].route, '/(tabs)/league');
});
