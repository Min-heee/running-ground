import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunSourceType } from '@/domain';
import { getSourceMethodGuide } from './sourceMethodGuide';

const exclusiveSources: RunSourceType[] = [
  'apple_health',
  'health_connect',
  'garmin',
  'strava',
  'nrc',
];

test('source method guide returns title and steps for every exclusive source', () => {
  for (const sourceType of exclusiveSources) {
    const guide = getSourceMethodGuide(sourceType, 'ios');

    assert.ok(guide, `${sourceType} should have a guide`);
    assert.ok(guide.title.length > 0);
    assert.ok(guide.steps.length >= 1);
  }
});

test('source method guide keeps NRC platform instructions distinct', () => {
  const iosGuide = getSourceMethodGuide('nrc', 'ios');
  const androidGuide = getSourceMethodGuide('nrc', 'android');

  assert.ok(iosGuide);
  assert.ok(androidGuide);
  assert.notEqual(iosGuide.title, androidGuide.title);
  assert.notDeepEqual(iosGuide.steps, androidGuide.steps);
});

test('source method guide falls back to iOS guide for all-platform bridge sources', () => {
  assert.deepEqual(
    getSourceMethodGuide('strava', 'all'),
    getSourceMethodGuide('strava', 'ios'),
  );
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
