import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCoachStartAnnouncement,
  buildDistanceGoalReachedAnnouncement,
  buildSoloCoachAnnouncement,
  buildTimeGoalReachedAnnouncement,
  type SoloCoachConfig,
} from './soloCoachModel';

function baseConfig(overrides: Partial<SoloCoachConfig> = {}): SoloCoachConfig {
  return {
    targetPaceSecPerKm: 360, // 6'00"
    goalDistanceKm: 5,
    goalTimeMinutes: null,
    intervalMinutes: 2,
    announcePace: true,
    announceElapsed: true,
    announceDistance: true,
    ...overrides,
  };
}

test('slower than target: says how many seconds behind and encourages', () => {
  // 10 min for 1.5km → avg 400s/km vs target 360 → 40s slow.
  const text = buildSoloCoachAnnouncement(baseConfig(), { elapsedSeconds: 600, distanceKm: 1.5 });

  assert.ok(text.includes('목표보다 40초 느려요'));
  assert.ok(text.includes('속도를 올려봐요'));
});

test('faster than target: warns about overpace', () => {
  // 10 min for 2km → avg 300s/km vs target 360 → 60s fast.
  const text = buildSoloCoachAnnouncement(baseConfig(), { elapsedSeconds: 600, distanceKm: 2 });

  assert.ok(text.includes('목표보다 60초 빨라요'));
  assert.ok(text.includes('오버페이스'));
});

test('within ±10s tolerance counts as on-pace', () => {
  // 6'05"/km vs 6'00" target → within tolerance.
  const text = buildSoloCoachAnnouncement(baseConfig(), { elapsedSeconds: 365, distanceKm: 1 });

  assert.ok(text.includes('목표 페이스를 잘 지키고 있어요'));
});

test('pace part is skipped before there is enough distance to trust the average', () => {
  const text = buildSoloCoachAnnouncement(baseConfig(), { elapsedSeconds: 30, distanceKm: 0.05 });

  assert.ok(!text.includes('페이스'));
  assert.ok(text.includes('경과 시간'));
});

test('elapsed part carries the remaining time toward a time goal', () => {
  const config = baseConfig({ goalTimeMinutes: 30, announcePace: false, announceDistance: false });
  const text = buildSoloCoachAnnouncement(config, { elapsedSeconds: 12 * 60, distanceKm: 2 });

  assert.equal(text, '경과 시간 12분. 목표 시간까지 18분 남았어요.');
});

test('distance part reports progress toward the goal', () => {
  const config = baseConfig({ announcePace: false, announceElapsed: false });
  const text = buildSoloCoachAnnouncement(config, { elapsedSeconds: 600, distanceKm: 2 });

  assert.equal(text, '현재 2킬로미터. 목표까지 3킬로미터 남았어요.');
});

test('disabled items produce nothing', () => {
  const config = baseConfig({ announcePace: false, announceElapsed: false, announceDistance: false });

  assert.equal(buildSoloCoachAnnouncement(config, { elapsedSeconds: 600, distanceKm: 2 }), '');
});

test('goal and start announcements read naturally', () => {
  assert.equal(buildDistanceGoalReachedAnnouncement(5), '목표 거리 5킬로미터 달성! 수고했어요.');
  assert.equal(buildTimeGoalReachedAnnouncement(30), '목표 시간 30분이 됐어요.');

  const start = buildCoachStartAnnouncement(baseConfig());
  assert.ok(start.startsWith('페이스메이커를 시작해요.'));
  assert.ok(start.includes('목표 페이스 6분.'));
  assert.ok(start.includes('목표 거리 5킬로미터.'));
  assert.ok(start.includes('2분마다 알려드릴게요.'));
});

// ── 목표 3요소 자동 계산 ─────────────────────────────────────────────────────

test('default goal state derives time from pace × distance', async () => {
  const { createDefaultGoalState, getDerivedGoalField } = await import('./soloCoachModel');
  const state = createDefaultGoalState();

  assert.equal(getDerivedGoalField(state), 'time');
  assert.equal(state.timeSec, 360 * 3); // 6'00" × 3km = 18분
});

test('editing a source keeps deriving the third field', async () => {
  const { applyGoalEdit, createDefaultGoalState, getDerivedGoalField } = await import('./soloCoachModel');
  const state = applyGoalEdit(createDefaultGoalState(), 'distance', 5);

  assert.equal(getDerivedGoalField(state), 'time');
  assert.equal(state.timeSec, 360 * 5); // 30분
});

test('editing the derived field flips the oldest source to derived', async () => {
  const { applyGoalEdit, createDefaultGoalState, getDerivedGoalField } = await import('./soloCoachModel');
  // sources [pace, distance] → edit TIME → sources [distance, time], pace derived.
  const state = applyGoalEdit(createDefaultGoalState(), 'time', 30 * 60);

  assert.equal(getDerivedGoalField(state), 'pace');
  assert.equal(state.paceSecPerKm, (30 * 60) / 3); // 600s = 10'00"/km

  // Then edit PACE → sources [time, pace], distance derived: 1800s / 360s = 5km.
  const next = applyGoalEdit(state, 'pace', 360);
  assert.equal(getDerivedGoalField(next), 'distance');
  assert.equal(next.distanceKm, 5);
});

test('goal edits clamp to sane ranges', async () => {
  const { applyGoalEdit, createDefaultGoalState } = await import('./soloCoachModel');

  assert.equal(applyGoalEdit(createDefaultGoalState(), 'pace', 10).paceSecPerKm, 180);
  assert.equal(applyGoalEdit(createDefaultGoalState(), 'distance', 0).distanceKm, 0.5);
  assert.equal(applyGoalEdit(createDefaultGoalState(), 'time', 1).timeSec, 300);
});
