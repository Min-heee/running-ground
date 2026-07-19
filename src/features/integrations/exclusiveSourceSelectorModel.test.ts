import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConnectedSource } from '@/domain';
import { buildExclusiveSourceSelectorModel } from './exclusiveSourceSelectorModel';

function source(overrides: Partial<ConnectedSource> & Pick<ConnectedSource, 'sourceType'>): ConnectedSource {
  return {
    connected: false,
    connectionStatus: 'planned',
    displayName: overrides.sourceType,
    recommendedPlatform: 'all',
    ...overrides,
  };
}

test('exclusive selector offers only the Android hub source', () => {
  const model = buildExclusiveSourceSelectorModel([
    source({ sourceType: 'manual' }),
    source({ sourceType: 'runningground' }),
    source({ sourceType: 'apple_health' }),
    source({ sourceType: 'health_connect' }),
  ], 'all');

  assert.deepEqual(model.rows.map((row) => row.source.sourceType), ['health_connect']);
});

test('exclusive selector never offers apple_health, even on iOS', () => {
  // Retired for the App Store 2.5.1 resolution: the iOS binary has no Apple-
  // Health reader anymore, so the selector must show only the "연동 안 함"
  // path on iOS — even when the server still returns an apple_health row.
  const iosModel = buildExclusiveSourceSelectorModel([
    source({ sourceType: 'apple_health', recommendedPlatform: 'ios' }),
    source({ sourceType: 'health_connect', recommendedPlatform: 'android' }),
  ], 'ios');
  const androidModel = buildExclusiveSourceSelectorModel([
    source({ sourceType: 'apple_health', recommendedPlatform: 'ios' }),
    source({ sourceType: 'health_connect', recommendedPlatform: 'android' }),
  ], 'android');

  assert.deepEqual(iosModel.rows, []);
  assert.equal(iosModel.selectedSourceType, null);
  assert.deepEqual(androidModel.rows.map((row) => row.source.sourceType), ['health_connect']);
});

test('exclusive selector treats a legacy connected apple_health row as no selection', () => {
  // A user who connected Apple 건강 before the retirement must degrade to the
  // "연동 안 함" state instead of crashing or showing a blank selected row.
  const model = buildExclusiveSourceSelectorModel([
    source({ connected: true, sourceType: 'apple_health', recommendedPlatform: 'ios' }),
  ], 'ios');

  assert.deepEqual(model.rows, []);
  assert.equal(model.selectedSourceType, null);
});

test('exclusive selector drops retired brand and mynb sources from legacy data', () => {
  // The server may still return brand sources (nrc / strava / garmin), the
  // retired mynb, or the retired apple_health as connected rows for legacy
  // users. They have no catalog metadata anymore, so the selector must
  // silently drop them instead of rendering blank rows or crashing.
  const model = buildExclusiveSourceSelectorModel([
    source({ connected: true, sourceType: 'mynb' }),
    source({ connected: true, sourceType: 'nrc' }),
    source({ sourceType: 'strava' }),
    source({ sourceType: 'garmin' }),
    source({ sourceType: 'apple_health' }),
    source({ sourceType: 'health_connect' }),
  ], 'all');

  assert.deepEqual(model.rows.map((row) => row.source.sourceType), ['health_connect']);
  assert.equal(model.selectedSourceType, null);
});

test('exclusive selector marks the connected source as selected', () => {
  const model = buildExclusiveSourceSelectorModel([
    source({ sourceType: 'manual' }),
    source({ connected: true, sourceType: 'health_connect' }),
  ], 'all');

  assert.equal(model.selectedSourceType, 'health_connect');
  assert.deepEqual(model.rows.map((row) => [row.source.sourceType, row.selected]), [
    ['health_connect', true],
  ]);
});

test('exclusive selector returns no selected source when nothing is connected', () => {
  const model = buildExclusiveSourceSelectorModel([
    source({ sourceType: 'health_connect', recommendedPlatform: 'android' }),
  ], 'android');

  assert.equal(model.selectedSourceType, null);
  assert.deepEqual(model.rows.map((row) => row.selected), [false]);
});
