import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMatchExitActionState } from './matchExitAction';

test('exit action switches from forfeit to result button when counterpart forfeits', () => {
  const normal = buildMatchExitActionState({
    source: 'duel',
    isTestMatch: false,
    isLeaving: false,
    isSaving: false,
    isRunning: true,
    counterpartForfeited: false,
    selfFinished: false,
  });

  assert.equal(normal.kind, 'forfeit');
  assert.equal(normal.buttonLabel, '기권하기');
  assert.equal(normal.disabled, false);

  const counterpartForfeited = buildMatchExitActionState({
    source: 'duel',
    isTestMatch: false,
    isLeaving: false,
    isSaving: false,
    isRunning: true,
    counterpartForfeited: true,
    selfFinished: false,
  });

  assert.equal(counterpartForfeited.kind, 'counterpart-forfeited');
  assert.equal(counterpartForfeited.buttonLabel, '러닝 종료하고 결과보기');
  assert.equal(counterpartForfeited.disabled, false);
});

test('exit action blocks duplicate saves while counterpart forfeit result is preparing', () => {
  const saving = buildMatchExitActionState({
    source: 'group',
    isTestMatch: false,
    isLeaving: false,
    isSaving: true,
    isRunning: true,
    counterpartForfeited: true,
    selfFinished: false,
  });

  assert.equal(saving.kind, 'counterpart-forfeited');
  assert.equal(saving.buttonLabel, '결과 저장 중...');
  assert.equal(saving.disabled, true);
});

test('exit action keeps test match cleanup separate from real forfeits', () => {
  const testExit = buildMatchExitActionState({
    source: 'duel',
    isTestMatch: true,
    isLeaving: false,
    isSaving: false,
    isRunning: true,
    counterpartForfeited: false,
    selfFinished: false,
  });

  assert.equal(testExit.kind, 'test-exit');
  assert.equal(testExit.buttonLabel, '테스트 대결 그만');
});

test('exit action switches from forfeit to result button when current user finished', () => {
  const selfFinished = buildMatchExitActionState({
    source: 'duel',
    isTestMatch: false,
    isLeaving: false,
    isSaving: false,
    isRunning: true,
    counterpartForfeited: false,
    selfFinished: true,
  });

  assert.equal(selfFinished.kind, 'self-finished');
  assert.equal(selfFinished.buttonLabel, '러닝 종료하고 결과보기');
  assert.equal(selfFinished.disabled, false);
});

test('exit action keeps test match cleanup ahead of self-finished result action', () => {
  const testExit = buildMatchExitActionState({
    source: 'duel',
    isTestMatch: true,
    isLeaving: false,
    isSaving: false,
    isRunning: true,
    counterpartForfeited: false,
    selfFinished: true,
  });

  assert.equal(testExit.kind, 'test-exit');
  assert.equal(testExit.buttonLabel, '테스트 대결 그만');
});
