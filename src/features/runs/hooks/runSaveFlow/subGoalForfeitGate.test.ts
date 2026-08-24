import assert from 'node:assert/strict';
import test from 'node:test';
import { isDecidedMatchResult, shouldConvertSaveToSubGoalForfeit } from './subGoalForfeitGate';

// 2026-08-23 실전 사고의 결정표: 목표 미달 '대결종료'만 기권으로 바뀌고,
// 그 외 어떤 조합도 절대 기권으로 바뀌면 안 된다(승자를 기권시키는 사고가 더 나쁘다).
const base = {
  activeMatchId: 'group-match-47664a10',
  declaredFinishDistanceKm: 4.93,
  matchGoalDistanceKm: 7,
  resolvedMatchMode: 'group' as const,
  hasDecidedMatchResult: false,
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

test('never converts when a match result is already DECIDED (opponent-forfeit win, forfeit override, retry-context forfeit blob)', () => {
  assert.equal(shouldConvertSaveToSubGoalForfeit({ ...base, hasDecidedMatchResult: true }), false);
});

test('a PENDING blob is not decided — the live "결과 집계 중" placeholder must not block the conversion', () => {
  // 적대 검증 2026-08-24: 라이브 매치는 스탠딩만 동기화돼도 항상 PENDING 블롭을 들고
  // 있다. 이게 확정으로 읽히면 변환이 정확히 사고 경로에서 영영 안 걸린다.
  assert.equal(isDecidedMatchResult(null), false);
  assert.equal(isDecidedMatchResult(undefined), false);
  assert.equal(isDecidedMatchResult({}), false);
  // 그룹 PENDING의 실제 모양(참가자 수만 있고 rank 없음) — 8/23 사고 재현값.
  assert.equal(isDecidedMatchResult({ participantCount: 3 } as { rank?: number }), false);
  // 확정: 듀얼은 resultTone, 그룹·기권은 rank.
  assert.equal(isDecidedMatchResult({ resultTone: 'win' }), true);
  assert.equal(isDecidedMatchResult({ resultTone: 'lose' }), true);
  assert.equal(isDecidedMatchResult({ rank: 3 }), true);
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
