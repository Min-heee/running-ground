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

test('module absent (build 48): exclusive selector offers only the Android hub source', () => {
  const model = buildExclusiveSourceSelectorModel([
    source({ sourceType: 'manual' }),
    source({ sourceType: 'runningground' }),
    source({ sourceType: 'apple_health' }),
    source({ sourceType: 'health_connect' }),
  ], 'all');

  assert.deepEqual(model.rows.map((row) => row.source.sourceType), ['health_connect']);
});

test('module present (build 49+): exclusive selector offers both platform hubs', () => {
  const model = buildExclusiveSourceSelectorModel([
    source({ sourceType: 'manual' }),
    source({ sourceType: 'runningground' }),
    source({ sourceType: 'health_connect' }),
    source({ sourceType: 'apple_health' }),
  ], 'all', true);

  // Catalog priority order: apple_health (100) before health_connect (95).
  assert.deepEqual(model.rows.map((row) => row.source.sourceType), [
    'apple_health',
    'health_connect',
  ]);
});

test('module absent: selector never offers apple_health, even on iOS', () => {
  // The HealthKit-free build 48 binary has no Apple-Health reader, so the
  // selector must show only the "연동 안 함" path on iOS — even when the
  // server still returns an apple_health row.
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

test('module present: selector offers apple_health on iOS again', () => {
  // Build 49+ restores the RunnigappAppleHealth reader; the caller reports it
  // via isAppleHealthModuleAvailable() and the SAME OTA'd JS offers Apple 건강.
  const iosModel = buildExclusiveSourceSelectorModel([
    source({ sourceType: 'apple_health', recommendedPlatform: 'ios' }),
    source({ sourceType: 'health_connect', recommendedPlatform: 'android' }),
  ], 'ios', true);

  assert.deepEqual(iosModel.rows.map((row) => row.source.sourceType), ['apple_health']);
});

test('module absent: a legacy connected apple_health row degrades to no selection', () => {
  // A user who connected Apple 건강 on an earlier binary must degrade to the
  // "연동 안 함" state on build 48 instead of crashing or showing a blank
  // selected row.
  const model = buildExclusiveSourceSelectorModel([
    source({ connected: true, sourceType: 'apple_health', recommendedPlatform: 'ios' }),
  ], 'ios');

  assert.deepEqual(model.rows, []);
  assert.equal(model.selectedSourceType, null);
});

test('module present: a legacy connected apple_health row is selected again', () => {
  const model = buildExclusiveSourceSelectorModel([
    source({ connected: true, sourceType: 'apple_health', recommendedPlatform: 'ios' }),
  ], 'ios', true);

  assert.equal(model.selectedSourceType, 'apple_health');
  assert.deepEqual(model.rows.map((row) => [row.source.sourceType, row.selected]), [
    ['apple_health', true],
  ]);
});

test('exclusive selector drops retired brand and mynb sources from legacy data', () => {
  // The server may still return brand sources (nrc / strava / garmin) or the
  // retired mynb as connected rows for legacy users. They have no catalog
  // metadata in ANY build, so the selector must silently drop them instead of
  // rendering blank rows or crashing — with or without the Apple-Health module.
  const legacySources = [
    source({ connected: true, sourceType: 'mynb' }),
    source({ connected: true, sourceType: 'nrc' }),
    source({ sourceType: 'strava' }),
    source({ sourceType: 'garmin' }),
    source({ sourceType: 'apple_health' }),
    source({ sourceType: 'health_connect' }),
  ];

  const moduleAbsentModel = buildExclusiveSourceSelectorModel(legacySources, 'all');
  assert.deepEqual(moduleAbsentModel.rows.map((row) => row.source.sourceType), ['health_connect']);
  assert.equal(moduleAbsentModel.selectedSourceType, null);

  const moduleAvailableModel = buildExclusiveSourceSelectorModel(legacySources, 'all', true);
  assert.deepEqual(
    moduleAvailableModel.rows.map((row) => row.source.sourceType),
    ['apple_health', 'health_connect'],
  );
  assert.equal(moduleAvailableModel.selectedSourceType, null);
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
