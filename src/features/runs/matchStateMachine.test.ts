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
  resolveActiveMatchId,
  resolveRunTrackingState,
  shouldAutoFocusMatchArena,
  shouldEnterMatchArenaForLifecycle,
  shouldKeepMatchArenaForceOpen,
  shouldPreferRoomLinkedArena,
  shouldUseCenteredMatchCountdown,
  shouldUseFullscreenMatchCountdown,
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

test('countdown visibility separates fullscreen and arena handoff windows', () => {
  assert.equal(shouldUseFullscreenMatchCountdown({ hasCountdownEntry: true, remainingSeconds: 30 }), true);
  assert.equal(shouldUseFullscreenMatchCountdown({ hasCountdownEntry: true, remainingSeconds: 20 }), false);
  assert.equal(shouldUseCenteredMatchCountdown({
    hasCountdownEntry: true,
    remainingSeconds: 20,
    showLiveArena: true,
    hasRoomCountdownEntry: false,
  }), true);
  assert.equal(shouldUseCenteredMatchCountdown({
    hasCountdownEntry: true,
    remainingSeconds: 20,
    showLiveArena: false,
    hasRoomCountdownEntry: false,
  }), false);
});

test('arena state machine covers 20-second handoff and active pinning', () => {
  assert.equal(shouldAutoFocusMatchArena(true, 20), true);
  assert.equal(shouldAutoFocusMatchArena(false, 20), false);
  assert.equal(shouldPreferRoomLinkedArena('matched', 20), true);
  assert.equal(shouldPreferRoomLinkedArena('active', null), true);
  assert.equal(shouldEnterMatchArenaForLifecycle({
    duelState: 'matched',
    groupState: 'idle',
    duelShouldOpenCountdownArena: true,
    groupShouldOpenCountdownArena: false,
  }), true);
  assert.equal(shouldEnterMatchArenaForLifecycle({
    duelState: 'waiting',
    groupState: 'idle',
    duelShouldOpenCountdownArena: false,
    groupShouldOpenCountdownArena: false,
  }), false);
});

test('arena force-open guard keeps party run stable during focused transitions', () => {
  assert.equal(shouldKeepMatchArenaForceOpen({
    isResolvingFocusedMatch: true,
    duelState: 'idle',
    groupState: 'idle',
    duelShouldOpenCountdownArena: false,
    groupShouldOpenCountdownArena: false,
    roomShouldOpenCountdownArena: false,
    forceOpenActiveMatch: false,
    shouldKeepRunningMatchArena: false,
  }), true);
  assert.equal(shouldKeepMatchArenaForceOpen({
    isResolvingFocusedMatch: false,
    duelState: 'matched',
    groupState: 'idle',
    duelShouldOpenCountdownArena: false,
    groupShouldOpenCountdownArena: false,
    roomShouldOpenCountdownArena: false,
    forceOpenActiveMatch: true,
    shouldKeepRunningMatchArena: false,
  }), true);
  assert.equal(shouldKeepMatchArenaForceOpen({
    isResolvingFocusedMatch: false,
    duelState: 'idle',
    groupState: 'idle',
    duelShouldOpenCountdownArena: false,
    groupShouldOpenCountdownArena: false,
    roomShouldOpenCountdownArena: false,
    forceOpenActiveMatch: false,
    shouldKeepRunningMatchArena: false,
  }), false);
});

test('active match identity prefers explicit match status and falls back to active room link', () => {
  assert.equal(resolveActiveMatchId({
    matchMode: 'duel',
    duelMatchId: 'duel-status-match',
    roomLinkedMatchContext: { mode: 'duel', matchId: 'room-match', state: 'active' },
  }), 'duel-status-match');
  assert.equal(resolveActiveMatchId({
    matchMode: 'duel',
    roomLinkedMatchContext: { mode: 'duel', matchId: 'room-match', state: 'active' },
  }), 'room-match');
  assert.equal(resolveActiveMatchId({
    matchMode: 'group',
    roomLinkedMatchContext: { mode: 'duel', matchId: 'room-match', state: 'active' },
  }), null);
  assert.equal(resolveActiveMatchId({
    matchMode: 'room',
    roomLinkedMatchContext: { mode: 'duel', matchId: 'room-match', state: 'active' },
  }), null);
});
