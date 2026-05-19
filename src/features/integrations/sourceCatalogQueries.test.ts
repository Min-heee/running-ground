import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConnectedSource } from '@/domain';
import {
  getCoverageSummaryForPlatform,
  getPrimarySourceForCatalogPlatform,
  getRecommendedSourcesForPlatform,
  getSourceByTypeFromCatalog,
  sortSourcesByPriorityWithMetadata,
  splitSourcesByStatus,
  type SourceMetadataMap,
} from './sourceCatalogQueries';

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
  garmin: {
    shortDescription: 'Garmin',
    capabilities: [],
    setupHint: '',
    priority: 60,
  },
  strava: {
    shortDescription: 'Strava',
    capabilities: [],
    setupHint: '',
    priority: 55,
  },
  mynb: {
    shortDescription: 'MyNB',
    capabilities: [],
    setupHint: '',
    priority: 45,
  },
  nrc: {
    shortDescription: 'NRC',
    capabilities: [],
    setupHint: '',
    priority: 40,
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
  const sorted = sortSourcesByPriorityWithMetadata([
    source({ sourceType: 'manual' }),
    source({ connected: true, sourceType: 'strava' }),
    source({ sourceType: 'apple_health' }),
  ], metadata);

  assert.deepEqual(sorted.map((item) => item.sourceType), [
    'apple_health',
    'manual',
    'strava',
  ]);
});

test('source catalog queries filter recommended sources by platform', () => {
  const recommended = getRecommendedSourcesForPlatform([
    source({ sourceType: 'apple_health', recommendedPlatform: 'ios' }),
    source({ sourceType: 'health_connect', recommendedPlatform: 'android' }),
    source({ sourceType: 'manual', recommendedPlatform: 'all' }),
    source({ sourceType: 'strava', recommendedPlatform: 'all' }),
  ], 'ios', metadata);

  assert.deepEqual(recommended.map((item) => item.sourceType), [
    'apple_health',
    'manual',
    'strava',
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

test('source catalog queries build coverage summary from recommended sources', () => {
  const summary = getCoverageSummaryForPlatform([
    source({ connected: true, sourceType: 'apple_health', recommendedPlatform: 'ios' }),
    source({ sourceType: 'manual', recommendedPlatform: 'all' }),
    source({ sourceType: 'strava', recommendedPlatform: 'all' }),
  ], 'ios', metadata);

  assert.deepEqual(summary, {
    connectedCount: 1,
    connectedRecommendedCount: 1,
    needsPrimarySource: false,
    recommendedCount: 3,
  });
});
