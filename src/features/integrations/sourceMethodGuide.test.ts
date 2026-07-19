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

test('module absent (build 48): no Apple-Health guide on any platform', () => {
  // The HealthKit-free build 48 binary has no Apple-Health reader, so the
  // same OTA'd JS must never surface an Apple-Health guide there — even for a
  // legacy apple_health row.
  assert.equal(getSourceMethodGuide('apple_health', 'ios'), null);
  assert.equal(getSourceMethodGuide('apple_health', 'ios', false), null);
  assert.equal(getSourceMethodGuide('apple_health', 'android'), null);
});

test('module present (build 49+): Apple-Health guide returns title and steps', () => {
  const guide = getSourceMethodGuide('apple_health', 'ios', true);

  assert.ok(guide, 'apple_health should have a guide when the module is available');
  assert.ok(guide.title.length > 0);
  assert.ok(guide.steps.length >= 1);
  assert.match(guide.title, /Apple 건강/);
});

test('source method guide instructs the manual import button, not sync', () => {
  // Import is manual-only: pressing '기기에서 기록 가져오기' is the ONLY thing
  // that reads runs off the device. The guides must never equate sync with
  // import ('동기화 다시 하기' reads nothing from the device).
  const guides = [
    getSourceMethodGuide('health_connect', 'android'),
    getSourceMethodGuide('apple_health', 'ios', true),
  ];

  for (const guide of guides) {
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
  const appleGuide = getSourceMethodGuide('apple_health', 'ios', true);
  const healthConnectGuide = getSourceMethodGuide('health_connect', 'android');

  assert.ok(appleGuide);
  assert.match(appleGuide.steps.map((step) => step.description).join(' '), /NRC/);

  assert.ok(healthConnectGuide);
  assert.match(healthConnectGuide.steps.map((step) => step.description).join(' '), /삼성헬스/);
});

test('source method guide has no guide for retired brand sources', () => {
  // nrc / strava / garmin were removed from the selectable catalog; legacy
  // rows keep the type but must not surface a guide anymore — with or without
  // the Apple-Health module.
  for (const sourceType of ['nrc', 'strava', 'garmin'] as RunSourceType[]) {
    assert.equal(getSourceMethodGuide(sourceType, 'ios'), null);
    assert.equal(getSourceMethodGuide(sourceType, 'ios', true), null);
    assert.equal(getSourceMethodGuide(sourceType, 'android'), null);
  }
});

test('source method guide ignores non-automatic sources', () => {
  assert.equal(getSourceMethodGuide('manual', 'ios'), null);
  assert.equal(getSourceMethodGuide('manual', 'ios', true), null);
  assert.equal(getSourceMethodGuide('runningground', 'android'), null);
});

test('source method guide has no guide for retired mynb source', () => {
  // MyNB consumes records (it reads FROM Strava) and never writes workouts to
  // Apple Health / Health Connect, so it is not an import source anymore.
  assert.equal(getSourceMethodGuide('mynb', 'ios'), null);
  assert.equal(getSourceMethodGuide('mynb', 'android'), null);
});
