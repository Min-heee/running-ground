import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RUNNING_TAB_IDLE_RUNTIME_DEFER_MS,
  getRunningTabRuntimeInitialMountDelayMs,
  shouldDeferRunningTabRuntimeInitialMount,
} from './runningTabInitialLoadPolicy';

test('running tab initial mount defers runtime only for plain idle tab entry', () => {
  assert.equal(shouldDeferRunningTabRuntimeInitialMount({
    mode: 'tab',
    routeShellHint: 'idle',
  }), true);
});

test('running tab initial mount loads runtime immediately for live, lobby, and invite routes', () => {
  assert.equal(shouldDeferRunningTabRuntimeInitialMount({
    mode: 'tab',
    routeShellHint: 'live',
    focusMatchId: 'duel-match-1',
  }), false);
  assert.equal(shouldDeferRunningTabRuntimeInitialMount({
    mode: 'tab',
    routeShellHint: 'lobby',
    focusRoomId: 'duel-room-1',
  }), false);
  assert.equal(shouldDeferRunningTabRuntimeInitialMount({
    mode: 'tab',
    routeShellHint: 'idle',
    roomInviteToken: 'ABC123',
  }), false);
});

test('stack running screen does not defer runtime mount', () => {
  assert.equal(shouldDeferRunningTabRuntimeInitialMount({
    mode: 'stack',
    routeShellHint: 'idle',
  }), false);
});

test('running tab idle runtime delay gives the initial shell a first-frame window', () => {
  assert.equal(getRunningTabRuntimeInitialMountDelayMs({
    mode: 'tab',
    routeShellHint: 'idle',
  }), RUNNING_TAB_IDLE_RUNTIME_DEFER_MS);
});

test('running tab live and lobby routes do not delay runtime import', () => {
  assert.equal(getRunningTabRuntimeInitialMountDelayMs({
    mode: 'tab',
    routeShellHint: 'live',
    focusMatchId: 'duel-match-1',
  }), 0);
  assert.equal(getRunningTabRuntimeInitialMountDelayMs({
    mode: 'tab',
    routeShellHint: 'lobby',
    focusRoomId: 'duel-room-1',
  }), 0);
});
