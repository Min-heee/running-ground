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

test('exclusive selector includes only automatic exclusive sources', () => {
  const model = buildExclusiveSourceSelectorModel([
    source({ sourceType: 'manual' }),
    source({ sourceType: 'runningground' }),
    source({ sourceType: 'strava' }),
    source({ sourceType: 'nrc' }),
  ], 'all');

  assert.deepEqual(model.rows.map((row) => row.source.sourceType), ['strava', 'nrc']);
});

test('exclusive selector filters platform-specific native health sources', () => {
  const iosModel = buildExclusiveSourceSelectorModel([
    source({ sourceType: 'apple_health', recommendedPlatform: 'ios' }),
    source({ sourceType: 'health_connect', recommendedPlatform: 'android' }),
    source({ sourceType: 'garmin', recommendedPlatform: 'all' }),
    source({ sourceType: 'nrc', recommendedPlatform: undefined }),
  ], 'ios');
  const androidModel = buildExclusiveSourceSelectorModel([
    source({ sourceType: 'apple_health', recommendedPlatform: 'ios' }),
    source({ sourceType: 'health_connect', recommendedPlatform: 'android' }),
    source({ sourceType: 'garmin', recommendedPlatform: 'all' }),
    source({ sourceType: 'nrc', recommendedPlatform: undefined }),
  ], 'android');

  assert.deepEqual(iosModel.rows.map((row) => row.source.sourceType), ['apple_health', 'garmin', 'nrc']);
  assert.deepEqual(androidModel.rows.map((row) => row.source.sourceType), ['health_connect', 'garmin', 'nrc']);
});

test('exclusive selector drops retired mynb sources from legacy data', () => {
  // Legacy connectedSources rows may still carry 'mynb'; the selector must not
  // offer it because MyNB never writes workouts to the platform health stores.
  const model = buildExclusiveSourceSelectorModel([
    source({ connected: true, sourceType: 'mynb' }),
    source({ sourceType: 'strava' }),
  ], 'all');

  assert.deepEqual(model.rows.map((row) => row.source.sourceType), ['strava']);
  assert.equal(model.selectedSourceType, null);
});

test('exclusive selector marks the connected source as selected', () => {
  const model = buildExclusiveSourceSelectorModel([
    source({ sourceType: 'apple_health', recommendedPlatform: 'ios' }),
    source({ connected: true, sourceType: 'strava' }),
    source({ sourceType: 'nrc' }),
  ], 'ios');

  assert.equal(model.selectedSourceType, 'strava');
  assert.deepEqual(model.rows.map((row) => [row.source.sourceType, row.selected]), [
    ['apple_health', false],
    ['strava', true],
    ['nrc', false],
  ]);
});

test('exclusive selector returns no selected source when nothing is connected', () => {
  const model = buildExclusiveSourceSelectorModel([
    source({ sourceType: 'apple_health', recommendedPlatform: 'ios' }),
    source({ sourceType: 'strava' }),
  ], 'ios');

  assert.equal(model.selectedSourceType, null);
  assert.deepEqual(model.rows.map((row) => row.selected), [false, false]);
});

test('exclusive selector keeps catalog priority order', () => {
  const model = buildExclusiveSourceSelectorModel([
    source({ sourceType: 'nrc' }),
    source({ sourceType: 'apple_health', recommendedPlatform: 'ios' }),
    source({ sourceType: 'garmin' }),
    source({ connected: true, sourceType: 'strava' }),
  ], 'ios');

  assert.deepEqual(model.rows.map((row) => row.source.sourceType), [
    'apple_health',
    'garmin',
    'strava',
    'nrc',
  ]);
});
