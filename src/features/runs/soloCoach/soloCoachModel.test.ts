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
