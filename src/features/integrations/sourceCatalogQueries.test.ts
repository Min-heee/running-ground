import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConnectedSource } from '@/domain';
import {
  getCoverageSummaryForPlatform,
  getPrimarySourceForCatalogPlatform,
  getPrimarySourceTypeForPlatform,
  getRecommendedSourcesForPlatform,
  getSourceByTypeFromCatalog,
  sortSourcesByPriorityWithMetadata,
  splitSourcesByStatus,
  type SourceMetadataMap,
} from './sourceCatalogQueries';

// Hub-only catalog: the selectable import source is the Android platform hub;
// brand apps (nrc / strava / garmin) and the retired apple_health (App Store
// 2.5.1 — iOS Apple-Health import removed) intentionally have no metadata.
const metadata: SourceMetadataMap = {
  health_connect: {
    shortDescription: 'Health Connect',
    capabilities: [],
    setupHint: '',
    priority: 95,
  },
  manual: {
    shortDescription: 'Manual',
    capabilities: [],
    setupHint: '',
    priority: 80,
  },
  runningground: {
    shortDescription: 'RunningGround',
    capabilities: [],
    setupHint: '',
    priority: 70,
  },
};

function source(overrides: Partial<ConnectedSource> & Pick<ConnectedSource, 'sourceType'>): ConnectedSource {
  return {
    connected: false,
    connectionStatus: 'planned',
    displayName: overrides.sourceType,
    recommendedPlatform: 'all',
    ...overrides,
  };
}

test('source catalog queries sort sources by priority and connection boost', () => {
  // Local map with a <5 priority gap so the +5 connection boost decisively
  // flips the order for the connected source.
  const boostMetadata: SourceMetadataMap = {
    health_connect: { shortDescription: '', capabilities: [], setupHint: '', priority: 95 },
    manual: { shortDescription: '', capabilities: [], setupHint: '', priority: 93 },
    runningground: { shortDescription: '', capabilities: [], setupHint: '', priority: 80 },
  };
  const sorted = sortSourcesByPriorityWithMetadata([
    source({ sourceType: 'runningground' }),
    source({ connected: true, sourceType: 'manual' }),
    source({ sourceType: 'health_connect' }),
  ], boostMetadata);

  assert.deepEqual(sorted.map((item) => item.sourceType), [
    'manual',
    'health_connect',
    'runningground',
  ]);
});

test('source catalog queries drop sources without catalog metadata', () => {
  // Legacy rows the server may still return (nrc / strava / garmin / mynb /
  // apple_health) have no metadata in the hub-only catalog and must be
  // filtered out everywhere instead of rendering blank entries.
  const sorted = sortSourcesByPriorityWithMetadata([
    source({ connected: true, sourceType: 'nrc' }),
    source({ sourceType: 'strava' }),
    source({ sourceType: 'garmin' }),
    source({ connected: true, sourceType: 'apple_health' }),
    source({ sourceType: 'health_connect' }),
  ], metadata);

  assert.deepEqual(sorted.map((item) => item.sourceType), ['health_connect']);
});

test('source catalog queries filter recommended sources by platform', () => {
  const sources = [
    source({ sourceType: 'apple_health', recommendedPlatform: 'ios' }),
    source({ sourceType: 'health_connect', recommendedPlatform: 'android' }),
    source({ sourceType: 'manual', recommendedPlatform: 'all' }),
    source({ sourceType: 'runningground', recommendedPlatform: 'all' }),
  ];

  // iOS: apple_health is retired (no metadata), so only the cross-platform
  // manual/runningground entries remain recommended.
  assert.deepEqual(
    getRecommendedSourcesForPlatform(sources, 'ios', metadata).map((item) => item.sourceType),
    ['manual', 'runningground'],
  );

  // Android keeps its hub.
  assert.deepEqual(
    getRecommendedSourcesForPlatform(sources, 'android', metadata).map((item) => item.sourceType),
    ['health_connect', 'manual', 'runningground'],
  );
});

test('source catalog queries map sources by status and primary source', () => {
  const sources = [
    source({ connected: true, sourceType: 'health_connect' }),
    source({ sourceType: 'manual' }),
  ];

  assert.equal(getSourceByTypeFromCatalog(sources, 'manual')?.sourceType, 'manual');
  assert.equal(getPrimarySourceForCatalogPlatform(sources, 'android')?.sourceType, 'health_connect');
  assert.deepEqual(splitSourcesByStatus(sources), {
    connected: [sources[0]],
    available: [sources[1]],
  });
});

test('platform-native import target resolves to Health Connect on Android only', () => {
  // Android resolves to its platform store regardless of connected brand
  // sources. iOS resolves to NOTHING: the Apple-Health integration was removed
  // for the App Store 2.5.1 resolution (re-add deferred post-launch), so iOS
  // has no primary import source at all.
  assert.equal(getPrimarySourceTypeForPlatform('ios'), null);
  assert.equal(getPrimarySourceTypeForPlatform('android'), 'health_connect');
  assert.equal(getPrimarySourceTypeForPlatform('all'), null);

  // A legacy connected NRC row on Android does not change the platform
  // resolution: the import still targets Health Connect.
  const brandOnlySources = [
    source({ connected: true, sourceType: 'nrc' }),
    source({ connected: false, sourceType: 'health_connect' }),
  ];
  assert.equal(
    getPrimarySourceForCatalogPlatform(brandOnlySources, 'android')?.sourceType,
    'health_connect',
  );

  // On iOS even a legacy apple_health row resolves to no primary source.
  const legacyIosSources = [
    source({ connected: true, sourceType: 'strava' }),
    source({ connected: true, sourceType: 'apple_health' }),
  ];
  assert.equal(getPrimarySourceForCatalogPlatform(legacyIosSources, 'ios'), null);
});

test('source catalog queries build coverage summary from recommended sources', () => {
  const summary = getCoverageSummaryForPlatform([
    source({ connected: true, sourceType: 'health_connect', recommendedPlatform: 'android' }),
    source({ sourceType: 'manual', recommendedPlatform: 'all' }),
    source({ sourceType: 'runningground', recommendedPlatform: 'all' }),
  ], 'android', metadata);

  assert.deepEqual(summary, {
    connectedCount: 1,
    connectedRecommendedCount: 1,
    needsPrimarySource: false,
    recommendedCount: 3,
  });
});
