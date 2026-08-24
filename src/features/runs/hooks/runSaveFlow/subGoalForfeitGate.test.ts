import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldConvertSaveToSubGoalForfeit } from './subGoalForfeitGate';

// 2026-08-23 실전 사고의 결정표: 목표 미달 '대결종료'만 기권으로 바뀌고,
// 그 외 어떤 조합도 절대 기권으로 바뀌면 안 된다(승자를 기권시키는 사고가 더 나쁘다).
const base = {
  activeMatchId: 'group-match-47664a10',
  declaredFinishDistanceKm: 4.93,
  matchGoalDistanceKm: 7,
  resolvedMatchMode: 'group' as const,
  hasResolvedMatchResult: false,
};

test('converts the incident shape: 4.93km 대결종료 against a 7km goal', () => {
  assert.equal(shouldConvertSaveToSubGoalForfeit(base), true);
});

test('never converts a goal-reaching declaration (freeze-preferred distance at/over goal)', () => {
  assert.equal(shouldConvertSaveToSubGoalForfeit({ ...base, declaredFinishDistanceKm: 7 }), false);
  assert.equal(shouldConvertSaveToSubGoalForfeit({ ...base, declaredFinishDistanceKm: 7.12 }), false);
});

test('honors the shared server tolerance: 5m short still finishes', () => {
  assert.equal(shouldConvertSaveToSubGoalForfeit({ ...base, declaredFinishDistanceKm: 6.996 }), false);
  assert.equal(shouldConvertSaveToSubGoalForfeit({ ...base, declaredFinishDistanceKm: 6.994 }), true);
});

test('never converts when a match result is already resolved (opponent-forfeit win, forfeit override, retry context)', () => {
  assert.equal(shouldConvertSaveToSubGoalForfeit({ ...base, hasResolvedMatchResult: true }), false);
});

test('defers to the server when the goal distance is unknown (runtime-wiped save)', () => {
  assert.equal(shouldConvertSaveToSubGoalForfeit({ ...base, matchGoalDistanceKm: null }), false);
  assert.equal(shouldConvertSaveToSubGoalForfeit({ ...base, matchGoalDistanceKm: 0 }), false);
  assert.equal(shouldConvertSaveToSubGoalForfeit({ ...base, matchGoalDistanceKm: Number.NaN }), false);
});

test('requires a match, a mode, and a declared distance', () => {
  assert.equal(shouldConvertSaveToSubGoalForfeit({ ...base, activeMatchId: null }), false);
  assert.equal(shouldConvertSaveToSubGoalForfeit({ ...base, resolvedMatchMode: null }), false);
  assert.equal(shouldConvertSaveToSubGoalForfeit({ ...base, declaredFinishDistanceKm: null }), false);
});
