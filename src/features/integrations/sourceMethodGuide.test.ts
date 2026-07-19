import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunSourceType } from '@/domain';
import { getSourceMethodGuide } from './sourceMethodGuide';

test('source method guide returns title and steps for the Android hub', () => {
  const guide = getSourceMethodGuide('health_connect', 'android');

  assert.ok(guide, 'health_connect should have a guide');
  assert.ok(guide.title.length > 0);
  assert.ok(guide.steps.length >= 1);
});

test('source method guide instructs the manual import button, not sync', () => {
  // Import is manual-only: pressing '기기에서 기록 가져오기' is the ONLY thing
  // that reads runs off the device. The guide must never equate sync with
  // import ('동기화 다시 하기' reads nothing from the device).
  const guide = getSourceMethodGuide('health_connect', 'android');

  assert.ok(guide);
  const allCopy = guide.steps.map((step) => `${step.title} ${step.description}`).join(' ');
  assert.match(allCopy, /기기에서 기록 가져오기/);
  assert.doesNotMatch(allCopy, /동기화 다시 하기/);
});

test('source method guide explains brand app routing inside the hub guide', () => {
  // Brand apps (NRC / Strava / Garmin / 삼성헬스) are no longer selectable
  // sources — their runs flow in via the platform hub, and the hub guide
  // carries that explanation instead.
  const healthConnectGuide = getSourceMethodGuide('health_connect', 'android');

  assert.ok(healthConnectGuide);
  assert.match(healthConnectGuide.steps.map((step) => step.description).join(' '), /삼성헬스/);
});

test('source method guide has no guide for retired apple_health', () => {
  // Retired for the App Store 2.5.1 resolution: the iOS binary has no Apple-
  // Health reader anymore, so no platform may surface an Apple-Health guide.
  assert.equal(getSourceMethodGuide('apple_health', 'ios'), null);
  assert.equal(getSourceMethodGuide('apple_health', 'android'), null);
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
  // the platform health stores, so it is not an import source anymore.
  assert.equal(getSourceMethodGuide('mynb', 'ios'), null);
  assert.equal(getSourceMethodGuide('mynb', 'android'), null);
});
