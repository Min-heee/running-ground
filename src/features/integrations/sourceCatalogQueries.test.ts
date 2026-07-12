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

// Hub-only catalog: the selectable import sources are the two platform hubs;
// brand apps (nrc / strava / garmin) intentionally have no metadata.
const metadata: SourceMetadataMap = {
  apple_health: {
    shortDescription: 'Apple Health',
    capabilities: [],
    setupHint: '',
    priority: 100,
  },
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
    apple_health: { shortDescription: '', capabilities: [], setupHint: '', priority: 100 },
    health_connect: { shortDescription: '', capabilities: [], setupHint: '', priority: 97 },
    manual: { shortDescription: '', capabilities: [], setupHint: '', priority: 80 },
  };
  const sorted = sortSourcesByPriorityWithMetadata([
    source({ sourceType: 'manual' }),
    source({ connected: true, sourceType: 'health_connect' }),
    source({ sourceType: 'apple_health' }),
  ], boostMetadata);

  assert.deepEqual(sorted.map((item) => item.sourceType), [
    'health_connect',
    'apple_health',
    'manual',
  ]);
});

test('source catalog queries drop sources without catalog metadata', () => {
  // Legacy rows the server may still return (nrc / strava / garmin / mynb)
  // have no metadata in the hub-only catalog and must be filtered out
  // everywhere instead of rendering blank entries.
  const sorted = sortSourcesByPriorityWithMetadata([
    source({ connected: true, sourceType: 'nrc' }),
    source({ sourceType: 'strava' }),
    source({ sourceType: 'garmin' }),
    source({ sourceType: 'apple_health' }),
  ], metadata);

  assert.deepEqual(sorted.map((item) => item.sourceType), ['apple_health']);
});

test('source catalog queries filter recommended sources by platform', () => {
  const recommended = getRecommendedSourcesForPlatform([
    source({ sourceType: 'apple_health', recommendedPlatform: 'ios' }),
    source({ sourceType: 'health_connect', recommendedPlatform: 'android' }),
    source({ sourceType: 'manual', recommendedPlatform: 'all' }),
    source({ sourceType: 'runningground', recommendedPlatform: 'all' }),
  ], 'ios', metadata);

  assert.deepEqual(recommended.map((item) => item.sourceType), [
    'apple_health',
    'manual',
    'runningground',
  ]);
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

test('platform-native import target resolves by platform regardless of connected brand source', () => {
  // The device-import path resolves the native reader purely by platform
  // (iOS → Apple Health, Android → Health Connect), NOT by which brand source
  // the user connected. A legacy user who still has NRC / Strava / Garmin
  // connected must still resolve to the platform store, because brand apps
  // route their workouts into it.
  assert.equal(getPrimarySourceTypeForPlatform('ios'), 'apple_health');
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

  // Same on iOS with a legacy Strava row: still resolves to Apple Health.
  const stravaOnlySources = [
    source({ connected: true, sourceType: 'strava' }),
    source({ connected: false, sourceType: 'apple_health' }),
  ];
  assert.equal(
    getPrimarySourceForCatalogPlatform(stravaOnlySources, 'ios')?.sourceType,
    'apple_health',
  );
});

test('source catalog queries build coverage summary from recommended sources', () => {
  const summary = getCoverageSummaryForPlatform([
    source({ connected: true, sourceType: 'apple_health', recommendedPlatform: 'ios' }),
    source({ sourceType: 'manual', recommendedPlatform: 'all' }),
    source({ sourceType: 'runningground', recommendedPlatform: 'all' }),
  ], 'ios', metadata);

  assert.deepEqual(summary, {
    connectedCount: 1,
    connectedRecommendedCount: 1,
    needsPrimarySource: false,
    recommendedCount: 3,
  });
});
