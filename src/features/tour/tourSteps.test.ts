import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TOUR_STEPS } from './tourSteps';

// 사용설명 투어 계약 (오너 2026-08-06, 2026-08-13 개편): 핵심 개념(매칭·파티런·
// 페이스메이커·마이 설정)이 설명에서 빠지면 투어의 존재 이유가 사라진다 — 카피를 고정한다.
// 오너 확정 2026-08-13: 혼자러닝 링 카피·내 랭크·홈·레이스 스텝은 없다.
test('tour steps keep the owner-required concepts and valid wiring', () => {
  assert.ok(TOUR_STEPS.length >= 6);

  const ids = TOUR_STEPS.map((step) => step.id);
  assert.equal(new Set(ids).size, ids.length, 'step id는 유일해야 한다');

  const validRoutes = new Set(['/(tabs)/league', '/(tabs)/running', '/(tabs)/friends', '/(tabs)/mypage']);
  for (const step of TOUR_STEPS) {
    assert.ok(validRoutes.has(step.route), `unknown route: ${step.route}`);
    assert.ok(step.title.length > 0 && step.body.length > 0);
  }

  const allBody = TOUR_STEPS.map((step) => `${step.title} ${step.body}`).join(' ');
  assert.ok(allBody.includes('매칭'), '매칭 설명 필수');
  assert.ok(allBody.includes('파티런'), '파티런 설명 필수');
  assert.ok(allBody.includes('페이스메이커'), '페이스메이커 설명 필수');
  assert.ok(allBody.includes('알림'), '마이 탭 알림 설정 설명 필수');
  assert.ok(allBody.includes('음성 안내'), '마이 탭 음성 안내 설명 필수');
  assert.ok(allBody.includes('기록 연동'), '마이 탭 기록 연동 설명 필수');

  // 오너 확정 2026-08-13: 홈·레이스 스텝 금지, 혼자러닝 링 카피 금지.
  assert.equal(TOUR_STEPS.some((step) => step.route === '/(tabs)/home'), false, '홈 스텝은 없어야 한다');
  assert.equal(TOUR_STEPS.some((step) => step.route === '/(tabs)/race'), false, '레이스 스텝은 없어야 한다');
  assert.equal(allBody.includes('링이 채워져요'), false, '혼자러닝 링 카피는 제거');

  // 첫 스텝은 랭킹 탭에서 시작, 마지막은 마이 탭에서 끝난다.
  assert.equal(TOUR_STEPS[0].route, '/(tabs)/league');
  assert.equal(TOUR_STEPS[TOUR_STEPS.length - 1].route, '/(tabs)/mypage');
});
