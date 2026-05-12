import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLiveMatchPerfSummary,
  clearLiveMatchPerfSamples,
  diagnoseLiveMatchPerfSample,
  getLiveMatchPerfSamples,
  recordLiveMatchPerfSample,
} from './liveMatchPerfQaLog';

test('live match perf QA log stores latest samples and summarizes by label', () => {
  clearLiveMatchPerfSamples();

  recordLiveMatchPerfSample({
    label: 'duel-arena',
    mode: 'duel',
    fps: 48,
    renders: 6,
    progressUpdates: 4,
    visibleProgressUpdates: 4,
    hiddenProgressUpdates: 0,
    layoutUpdates: 0,
    targetUpdates: 0,
    staticRenders: 1,
    windowMs: 5000,
    participants: 2,
    targetDistanceKm: 5,
    capturedAt: 1000,
  });
  recordLiveMatchPerfSample({
    label: 'duel-arena',
    mode: 'duel',
    fps: 54,
    renders: 4,
    progressUpdates: 3,
    visibleProgressUpdates: 3,
    hiddenProgressUpdates: 0,
    layoutUpdates: 0,
    targetUpdates: 0,
    staticRenders: 0,
    windowMs: 5000,
    participants: 2,
    targetDistanceKm: 5,
    capturedAt: 6000,
  });

  const summary = buildLiveMatchPerfSummary(getLiveMatchPerfSamples(), 'duel-arena');

  assert.deepEqual(summary, {
    label: 'duel-arena',
    mode: 'duel',
    latestFps: 54,
    averageFps: 51,
    latestRenders: 4,
    averageRenders: 5,
    latestProgressUpdates: 3,
    latestVisibleProgressUpdates: 3,
    latestHiddenProgressUpdates: 0,
    latestLayoutUpdates: 0,
    latestTargetUpdates: 0,
    latestStaticRenders: 0,
    diagnosis: {
      level: 'stable',
      label: '안정',
      hint: '현재 샘플 기준으로 렉 원인이 크게 보이지 않아요.',
    },
    sampleCount: 2,
    participants: 2,
    visibleParticipants: undefined,
    targetDistanceKm: 5,
    capturedAt: 6000,
  });
});

test('live match perf QA log can summarize the latest sample globally', () => {
  clearLiveMatchPerfSamples();

  recordLiveMatchPerfSample({
    label: 'duel-arena',
    mode: 'duel',
    fps: 50,
    renders: 3,
    progressUpdates: 2,
    visibleProgressUpdates: 2,
    hiddenProgressUpdates: 0,
    layoutUpdates: 0,
    targetUpdates: 0,
    staticRenders: 0,
    windowMs: 5000,
    participants: 2,
    targetDistanceKm: 5,
    capturedAt: 1000,
  });
  recordLiveMatchPerfSample({
    label: 'group-arena',
    mode: 'group',
    fps: 44,
    renders: 9,
    progressUpdates: 8,
    visibleProgressUpdates: 5,
    hiddenProgressUpdates: 3,
    layoutUpdates: 0,
    targetUpdates: 0,
    staticRenders: 1,
    windowMs: 5000,
    participants: 30,
    visibleParticipants: 10,
    targetDistanceKm: 10,
    capturedAt: 2000,
  });

  const summary = buildLiveMatchPerfSummary(getLiveMatchPerfSamples());

  assert.equal(summary?.label, 'group-arena');
  assert.equal(summary?.participants, 30);
  assert.equal(summary?.visibleParticipants, 10);
});

test('live match perf diagnosis highlights likely lag causes', () => {
  assert.deepEqual(diagnoseLiveMatchPerfSample({
    label: 'group-arena',
    mode: 'group',
    fps: 29,
    renders: 14,
    progressUpdates: 13,
    visibleProgressUpdates: 6,
    hiddenProgressUpdates: 7,
    layoutUpdates: 0,
    targetUpdates: 0,
    staticRenders: 0,
    windowMs: 5000,
    participants: 30,
    visibleParticipants: 10,
    targetDistanceKm: 5,
    capturedAt: 1000,
  }), {
    level: 'critical',
    label: '숨은 참가자 갱신 과다',
    hint: '화면 밖 참가자 변화가 카드 렌더를 밀어 올려요.',
  });

  assert.deepEqual(diagnoseLiveMatchPerfSample({
    label: 'group-arena',
    mode: 'group',
    fps: 50,
    renders: 8,
    progressUpdates: 8,
    visibleProgressUpdates: 2,
    hiddenProgressUpdates: 6,
    layoutUpdates: 0,
    targetUpdates: 0,
    staticRenders: 0,
    windowMs: 5000,
    participants: 30,
    visibleParticipants: 10,
    targetDistanceKm: 5,
    capturedAt: 1000,
  }), {
    level: 'watch',
    label: '숨은 참가자 갱신 영향',
    hint: '경량 모드 밖 참가자 변화가 상위 렌더에 섞여요.',
  });
});
