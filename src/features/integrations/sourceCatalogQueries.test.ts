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

// Hub-only catalog, availability-gated on iOS: 'apple_health' metadata exists
// ONLY when the RunnigappAppleHealth native reader is present in the running
// binary (build 49+). `moduleAbsentMetadata` mirrors the HealthKit-free build
// 48, `moduleAvailableMetadata` mirrors build 49+ — the same OTA'd JS produces
// both maps (sourceCatalog.ts getSelectableSourceMetadata). Brand apps
// (nrc / strava / garmin) intentionally have no metadata in either.
const moduleAbsentMetadata: SourceMetadataMap = {
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

const moduleAvailableMetadata: SourceMetadataMap = {
  apple_health: {
    shortDescription: 'Apple Health',
    capabilities: [],
    setupHint: '',
    priority: 100,
  },
  ...moduleAbsentMetadata,
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
  // Legacy rows the server may still return (nrc / strava / garmin / mynb)
  // have no metadata and must be filtered out everywhere instead of rendering
  // blank entries. On the module-absent (build 48) map that includes
  // apple_health rows — even connected ones.
  const sorted = sortSourcesByPriorityWithMetadata([
    source({ connected: true, sourceType: 'nrc' }),
    source({ sourceType: 'strava' }),
    source({ sourceType: 'garmin' }),
    source({ connected: true, sourceType: 'apple_health' }),
    source({ sourceType: 'health_connect' }),
  ], moduleAbsentMetadata);

  assert.deepEqual(sorted.map((item) => item.sourceType), ['health_connect']);
});

test('module present: apple_health sorts back in at hub priority', () => {
  const sorted = sortSourcesByPriorityWithMetadata([
    source({ sourceType: 'health_connect' }),
    source({ sourceType: 'apple_health' }),
    source({ connected: true, sourceType: 'nrc' }),
  ], moduleAvailableMetadata);

  assert.deepEqual(sorted.map((item) => item.sourceType), [
    'apple_health',
    'health_connect',
  ]);
});

test('source catalog queries filter recommended sources by platform', () => {
  const sources = [
    source({ sourceType: 'apple_health', recommendedPlatform: 'ios' }),
    source({ sourceType: 'health_connect', recommendedPlatform: 'android' }),
    source({ sourceType: 'manual', recommendedPlatform: 'all' }),
    source({ sourceType: 'runningground', recommendedPlatform: 'all' }),
  ];

  // iOS, module absent (build 48): apple_health has no metadata, so only the
  // cross-platform manual/runningground entries remain recommended.
  assert.deepEqual(
    getRecommendedSourcesForPlatform(sources, 'ios', moduleAbsentMetadata).map((item) => item.sourceType),
    ['manual', 'runningground'],
  );

  // iOS, module present (build 49+): Apple Health leads the recommendations.
  assert.deepEqual(
    getRecommendedSourcesForPlatform(sources, 'ios', moduleAvailableMetadata).map((item) => item.sourceType),
    ['apple_health', 'manual', 'runningground'],
  );

  // Android keeps its hub either way.
  assert.deepEqual(
    getRecommendedSourcesForPlatform(sources, 'android', moduleAbsentMetadata).map((item) => item.sourceType),
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

test('platform-native import target is availability-gated on iOS', () => {
  // Default (no availability flag) is the safe HealthKit-free behavior: the
  // OTA'd JS must treat build 48 exactly like today's build — iOS resolves to
  // NO primary import source.
  assert.equal(getPrimarySourceTypeForPlatform('ios'), null);
  assert.equal(getPrimarySourceTypeForPlatform('ios', false), null);

  // Module present (build 49+): iOS resolves to Apple Health again.
  assert.equal(getPrimarySourceTypeForPlatform('ios', true), 'apple_health');

  // Android and non-device platforms ignore the flag entirely.
  assert.equal(getPrimarySourceTypeForPlatform('android'), 'health_connect');
  assert.equal(getPrimarySourceTypeForPlatform('android', true), 'health_connect');
  assert.equal(getPrimarySourceTypeForPlatform('all'), null);
  assert.equal(getPrimarySourceTypeForPlatform('all', true), null);
});

test('primary source resolution follows the availability gate, not brand rows', () => {
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

  const legacyIosSources = [
    source({ connected: true, sourceType: 'strava' }),
    source({ connected: true, sourceType: 'apple_health' }),
  ];

  // Module absent (build 48): even a legacy connected apple_health row
  // resolves to no primary source.
  assert.equal(getPrimarySourceForCatalogPlatform(legacyIosSources, 'ios'), null);

  // Module present (build 49+): the same row resolves to Apple Health, brand
  // rows notwithstanding.
  assert.equal(
    getPrimarySourceForCatalogPlatform(legacyIosSources, 'ios', true)?.sourceType,
    'apple_health',
  );
});

test('source catalog queries build coverage summary from recommended sources', () => {
  const summary = getCoverageSummaryForPlatform([
    source({ connected: true, sourceType: 'health_connect', recommendedPlatform: 'android' }),
    source({ sourceType: 'manual', recommendedPlatform: 'all' }),
    source({ sourceType: 'runningground', recommendedPlatform: 'all' }),
  ], 'android', moduleAbsentMetadata);

  assert.deepEqual(summary, {
    connectedCount: 1,
    connectedRecommendedCount: 1,
    needsPrimarySource: false,
    recommendedCount: 3,
  });
});
