import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMatchParticipantStatusLabel,
  buildMatchTransitionNotice,
  canAutoStartMatchTracking,
  canShowMatchCountdown,
  isBlockingMatchState,
  isLiveMatchState,
  isTerminalMatchLifecycleState,
  resolveRunTrackingState,
} from './matchStateMachine';

test('match state guards centralize blocking and live states', () => {
  assert.equal(isBlockingMatchState('idle'), false);
  assert.equal(isBlockingMatchState('waiting'), true);
  assert.equal(isBlockingMatchState('matched'), true);
  assert.equal(isBlockingMatchState('active'), true);

  assert.equal(isLiveMatchState('waiting'), false);
  assert.equal(isLiveMatchState('matched'), true);
  assert.equal(isLiveMatchState('active'), true);
  assert.equal(canShowMatchCountdown('matched'), true);
  assert.equal(canAutoStartMatchTracking('active'), true);
});

test('run tracking state transitions ignore invalid jumps', () => {
  assert.equal(resolveRunTrackingState('idle', 'requestStart'), 'starting');
  assert.equal(resolveRunTrackingState('starting', 'start'), 'running');
  assert.equal(resolveRunTrackingState('running', 'pause'), 'paused');
  assert.equal(resolveRunTrackingState('paused', 'resume'), 'running');
  assert.equal(resolveRunTrackingState('running', 'requestSave'), 'saving');
  assert.equal(resolveRunTrackingState('saving', 'saved'), 'idle');
  assert.equal(resolveRunTrackingState('idle', 'pause'), 'idle');
});

test('terminal lifecycle states are explicit', () => {
  assert.equal(isTerminalMatchLifecycleState('idle'), true);
  assert.equal(isTerminalMatchLifecycleState('forfeited'), true);
  assert.equal(isTerminalMatchLifecycleState('active'), false);
  assert.equal(isTerminalMatchLifecycleState('saving'), false);
});

test('participant live status labels are stable Korean copy', () => {
  assert.equal(buildMatchParticipantStatusLabel('running'), '러닝 중');
  assert.equal(buildMatchParticipantStatusLabel('background'), '백그라운드');
  assert.equal(buildMatchParticipantStatusLabel('forfeited'), '포기함');
  assert.equal(buildMatchParticipantStatusLabel(undefined), '준비됨');
});

test('match transition notices cover cleanup and rematch cases', () => {
  assert.equal(buildMatchTransitionNotice('duel', 'waiting', 'idle'), '대기 시간이 지나 자동으로 정리됐어요. 다시 찾으면 새 대기열로 들어가요.');
  assert.equal(buildMatchTransitionNotice('duel', 'matched', 'waiting'), '상대가 빠져서 다시 비슷한 상대를 찾는 중이에요.');
  assert.equal(buildMatchTransitionNotice('group', 'active', 'waiting'), '일부 참가자가 빠져서 다시 비슷한 그룹을 모으는 중이에요.');
  assert.equal(buildMatchTransitionNotice('group', 'active', 'idle'), '매칭이 정리됐어요. 다시 찾으면 새 대기열로 들어가요.');
  assert.equal(buildMatchTransitionNotice('duel', 'active', 'active'), null);
});
