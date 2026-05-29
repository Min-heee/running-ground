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
    selfForfeited: false,
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
    selfForfeited: false,
    selfFinished: false,
  });

  assert.equal(counterpartForfeited.kind, 'counterpart-forfeited');
  assert.equal(counterpartForfeited.buttonLabel, '대결종료');
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
    selfForfeited: false,
    selfFinished: false,
  });

  assert.equal(saving.kind, 'counterpart-forfeited');
  assert.equal(saving.buttonLabel, '결과 저장 중...');
  assert.equal(saving.disabled, true);
});

test('exit action keeps counterpart-forfeited end button enabled after tracking pauses', () => {
  const counterpartForfeited = buildMatchExitActionState({
    source: 'duel',
    isTestMatch: false,
    isLeaving: false,
    isSaving: false,
    isRunning: false,
    counterpartForfeited: true,
    selfForfeited: false,
    selfFinished: false,
  });

  assert.equal(counterpartForfeited.kind, 'counterpart-forfeited');
  assert.equal(counterpartForfeited.buttonLabel, '대결종료');
  assert.equal(counterpartForfeited.disabled, false);
});

test('exit action keeps test match cleanup separate from real forfeits', () => {
  const testExit = buildMatchExitActionState({
    source: 'duel',
    isTestMatch: true,
    isLeaving: false,
    isSaving: false,
    isRunning: true,
    counterpartForfeited: false,
    selfForfeited: false,
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
    selfForfeited: false,
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
    selfForfeited: false,
    selfFinished: true,
  });

  assert.equal(testExit.kind, 'test-exit');
  assert.equal(testExit.buttonLabel, '테스트 대결 그만');
});

test('exit action switches from forfeit to result button when current user forfeited', () => {
  const selfForfeited = buildMatchExitActionState({
    source: 'duel',
    isTestMatch: false,
    isLeaving: false,
    isSaving: false,
    isRunning: true,
    counterpartForfeited: false,
    selfForfeited: true,
    selfFinished: false,
  });

  assert.equal(selfForfeited.kind, 'self-forfeited');
  assert.equal(selfForfeited.buttonLabel, '결과보기');
  assert.equal(selfForfeited.disabled, false);
});

test('exit action keeps self-forfeited result button enabled after tracking stops', () => {
  const selfForfeited = buildMatchExitActionState({
    source: 'duel',
    isTestMatch: false,
    isLeaving: false,
    isSaving: false,
    isRunning: false,
    counterpartForfeited: false,
    selfForfeited: true,
    selfFinished: false,
  });

  assert.equal(selfForfeited.kind, 'self-forfeited');
  assert.equal(selfForfeited.buttonLabel, '결과보기');
  assert.equal(selfForfeited.disabled, false);
});

test('exit action keeps test match cleanup ahead of self-forfeited result action', () => {
  const testExit = buildMatchExitActionState({
    source: 'duel',
    isTestMatch: true,
    isLeaving: false,
    isSaving: false,
    isRunning: true,
    counterpartForfeited: false,
    selfForfeited: true,
    selfFinished: false,
  });

  assert.equal(testExit.kind, 'test-exit');
  assert.equal(testExit.buttonLabel, '테스트 대결 그만');
});
