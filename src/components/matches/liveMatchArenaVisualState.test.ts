import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLiveMatchRunnerVisualState } from './liveMatchArenaVisualState';

test('runner visual state paints forfeited runner as red forfeited marker data', () => {
  const state = buildLiveMatchRunnerVisualState({
    name: '상대',
    paceLabel: '06:20/km',
    liveStatus: 'forfeited',
  }, '상');

  assert.equal(state.isForfeited, true);
  assert.equal(state.markerLabel, '기권');
  assert.equal(state.markerTone, 'forfeited');
  assert.equal(state.bubbleLabel, '기권 처리됨');
  assert.equal(state.averagePaceLabel, '기권');
});

test('runner visual state keeps current runner and leader tones distinct', () => {
  assert.equal(buildLiveMatchRunnerVisualState({
    name: '나',
    paceLabel: '05:55/km',
    isCurrentUser: true,
  }, '나').markerTone, 'current');

  assert.equal(buildLiveMatchRunnerVisualState({
    name: '선두',
    paceLabel: '05:50/km',
    isLeader: true,
  }, '선').markerTone, 'leader');
});
