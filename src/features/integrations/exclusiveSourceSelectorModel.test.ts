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

test('exclusive selector offers only the platform hub sources', () => {
  const model = buildExclusiveSourceSelectorModel([
    source({ sourceType: 'manual' }),
    source({ sourceType: 'runningground' }),
    source({ sourceType: 'apple_health' }),
    source({ sourceType: 'health_connect' }),
  ], 'all');

  assert.deepEqual(model.rows.map((row) => row.source.sourceType), ['apple_health', 'health_connect']);
});

test('exclusive selector filters platform-specific native health sources', () => {
  const iosModel = buildExclusiveSourceSelectorModel([
    source({ sourceType: 'apple_health', recommendedPlatform: 'ios' }),
    source({ sourceType: 'health_connect', recommendedPlatform: 'android' }),
  ], 'ios');
  const androidModel = buildExclusiveSourceSelectorModel([
    source({ sourceType: 'apple_health', recommendedPlatform: 'ios' }),
    source({ sourceType: 'health_connect', recommendedPlatform: 'android' }),
  ], 'android');

  assert.deepEqual(iosModel.rows.map((row) => row.source.sourceType), ['apple_health']);
  assert.deepEqual(androidModel.rows.map((row) => row.source.sourceType), ['health_connect']);
});

test('exclusive selector drops retired brand and mynb sources from legacy data', () => {
  // The server may still return brand sources (nrc / strava / garmin) or the
  // retired mynb as connected rows for legacy users. They have no catalog
  // metadata anymore, so the selector must silently drop them instead of
  // rendering blank rows or crashing.
  const model = buildExclusiveSourceSelectorModel([
    source({ connected: true, sourceType: 'mynb' }),
    source({ connected: true, sourceType: 'nrc' }),
    source({ sourceType: 'strava' }),
    source({ sourceType: 'garmin' }),
    source({ sourceType: 'apple_health' }),
  ], 'all');

  assert.deepEqual(model.rows.map((row) => row.source.sourceType), ['apple_health']);
  assert.equal(model.selectedSourceType, null);
});

test('exclusive selector marks the connected source as selected', () => {
  const model = buildExclusiveSourceSelectorModel([
    source({ sourceType: 'apple_health' }),
    source({ connected: true, sourceType: 'health_connect' }),
  ], 'all');

  assert.equal(model.selectedSourceType, 'health_connect');
  assert.deepEqual(model.rows.map((row) => [row.source.sourceType, row.selected]), [
    ['apple_health', false],
    ['health_connect', true],
  ]);
});

test('exclusive selector returns no selected source when nothing is connected', () => {
  const model = buildExclusiveSourceSelectorModel([
    source({ sourceType: 'apple_health', recommendedPlatform: 'ios' }),
  ], 'ios');

  assert.equal(model.selectedSourceType, null);
  assert.deepEqual(model.rows.map((row) => row.selected), [false]);
});

test('exclusive selector keeps catalog priority order', () => {
  const model = buildExclusiveSourceSelectorModel([
    source({ sourceType: 'health_connect' }),
    source({ sourceType: 'apple_health' }),
  ], 'all');

  assert.deepEqual(model.rows.map((row) => row.source.sourceType), [
    'apple_health',
    'health_connect',
  ]);
});
