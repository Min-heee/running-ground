import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunSourceType } from '@/domain';
import { getSourceMethodGuide } from './sourceMethodGuide';

const hubSources: RunSourceType[] = [
  'apple_health',
  'health_connect',
];

test('source method guide returns title and steps for both platform hubs', () => {
  for (const sourceType of hubSources) {
    const guide = getSourceMethodGuide(sourceType, 'ios');

    assert.ok(guide, `${sourceType} should have a guide`);
    assert.ok(guide.title.length > 0);
    assert.ok(guide.steps.length >= 1);
  }
});

test('source method guide instructs the manual import button, not sync', () => {
  // Import is manual-only: pressing '기기에서 기록 가져오기' is the ONLY thing
  // that reads runs off the device. The guides must never equate sync with
  // import ('동기화 다시 하기' reads nothing from the device).
  for (const sourceType of hubSources) {
    const guide = getSourceMethodGuide(sourceType, 'ios');

    assert.ok(guide);
    const allCopy = guide.steps.map((step) => `${step.title} ${step.description}`).join(' ');
    assert.match(allCopy, /기기에서 기록 가져오기/);
    assert.doesNotMatch(allCopy, /동기화 다시 하기/);
  }
});

test('source method guide explains brand app routing inside the hub guides', () => {
  // Brand apps (NRC / Strava / Garmin / 삼성헬스) are no longer selectable
  // sources — their runs flow in via the platform hubs, and the hub guides
  // carry that explanation instead.
  const appleGuide = getSourceMethodGuide('apple_health', 'ios');
  const healthConnectGuide = getSourceMethodGuide('health_connect', 'android');

  assert.ok(appleGuide);
  assert.match(appleGuide.steps.map((step) => step.description).join(' '), /NRC/);

  assert.ok(healthConnectGuide);
  assert.match(healthConnectGuide.steps.map((step) => step.description).join(' '), /삼성헬스/);
});

test('source method guide has no guide for retired brand sources', () => {
  // nrc / strava / garmin were removed from the selectable catalog; legacy
  // rows keep the type but must not surface a guide anymore.
  for (const sourceType of ['nrc', 'strava', 'garmin'] as RunSourceType[]) {
    assert.equal(getSourceMethodGuide(sourceType, 'ios'), null);
    assert.equal(getSourceMethodGuide(sourceType, 'android'), null);
  }
});

test('source method guide ignores non-automatic sources', () => {
  assert.equal(getSourceMethodGuide('manual', 'ios'), null);
  assert.equal(getSourceMethodGuide('runningground', 'android'), null);
});

test('source method guide has no guide for retired mynb source', () => {
  // MyNB consumes records (it reads FROM Strava) and never writes workouts to
  // Apple Health / Health Connect, so it is not an import source anymore.
  assert.equal(getSourceMethodGuide('mynb', 'ios'), null);
  assert.equal(getSourceMethodGuide('mynb', 'android'), null);
});
