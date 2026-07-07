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

test('C-4: self-finished after a failed save (paused, not saving) offers an enabled retry', () => {
  // A failed save leaves the tracker 'paused' (isRunning=false, isSaving=false). The old
  // `disabled = ... || !isRunning` made the card a dead end ('결과 화면 준비 중...', disabled).
  const failedSave = buildMatchExitActionState({
    source: 'duel',
    isTestMatch: false,
    isLeaving: false,
    isSaving: false,
    isRunning: false,
    counterpartForfeited: false,
    selfForfeited: false,
    selfFinished: true,
  });

  assert.equal(failedSave.kind, 'self-finished');
  assert.equal(failedSave.buttonLabel, '결과 다시 저장하기');
  assert.equal(failedSave.disabled, false);
});

test('C-4: self-finished stays disabled while a save is in flight', () => {
  const saving = buildMatchExitActionState({
    source: 'duel',
    isTestMatch: false,
    isLeaving: false,
    isSaving: true,
    isRunning: false,
    counterpartForfeited: false,
    selfForfeited: false,
    selfFinished: true,
  });

  assert.equal(saving.kind, 'self-finished');
  assert.equal(saving.buttonLabel, '결과 저장 중...');
  assert.equal(saving.disabled, true);

  const leaving = buildMatchExitActionState({
    source: 'group',
    isTestMatch: false,
    isLeaving: true,
    isSaving: false,
    isRunning: false,
    counterpartForfeited: false,
    selfForfeited: false,
    selfFinished: true,
  });

  assert.equal(leaving.kind, 'self-finished');
  assert.equal(leaving.disabled, true);
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

test('group sole-survivor gets a finish action, not a forfeit action', () => {
  const soleSurvivor = buildMatchExitActionState({
    source: 'group',
    isTestMatch: false,
    isLeaving: false,
    isSaving: false,
    isRunning: true,
    counterpartForfeited: false,
    selfForfeited: false,
    selfFinished: false,
    allOthersForfeited: true,
  });

  assert.equal(soleSurvivor.kind, 'sole-survivor');
  assert.notEqual(soleSurvivor.kind, 'forfeit');
  assert.equal(soleSurvivor.title, '혼자 남았어요');
  assert.equal(soleSurvivor.buttonLabel, '대결 종료');
  assert.equal(soleSurvivor.disabled, false);
});

test('group sole-survivor button shows saving label and disables while saving', () => {
  const saving = buildMatchExitActionState({
    source: 'group',
    isTestMatch: false,
    isLeaving: false,
    isSaving: true,
    isRunning: true,
    counterpartForfeited: false,
    selfForfeited: false,
    selfFinished: false,
    allOthersForfeited: true,
  });

  assert.equal(saving.kind, 'sole-survivor');
  assert.equal(saving.buttonLabel, '결과 저장 중...');
  assert.equal(saving.disabled, true);
});

test('sole-survivor never overrides a finished or forfeited current user', () => {
  const finished = buildMatchExitActionState({
    source: 'group',
    isTestMatch: false,
    isLeaving: false,
    isSaving: false,
    isRunning: true,
    counterpartForfeited: false,
    selfForfeited: false,
    selfFinished: true,
    allOthersForfeited: true,
  });
  assert.equal(finished.kind, 'self-finished');

  const forfeited = buildMatchExitActionState({
    source: 'group',
    isTestMatch: false,
    isLeaving: false,
    isSaving: false,
    isRunning: true,
    counterpartForfeited: false,
    selfForfeited: true,
    selfFinished: false,
    allOthersForfeited: true,
  });
  assert.equal(forfeited.kind, 'self-forfeited');
});

test('allOthersForfeited does NOT change duel behavior', () => {
  const duel = buildMatchExitActionState({
    source: 'duel',
    isTestMatch: false,
    isLeaving: false,
    isSaving: false,
    isRunning: true,
    counterpartForfeited: false,
    selfForfeited: false,
    selfFinished: false,
    allOthersForfeited: true,
  });

  assert.equal(duel.kind, 'forfeit');
  assert.equal(duel.buttonLabel, '기권하기');
});
