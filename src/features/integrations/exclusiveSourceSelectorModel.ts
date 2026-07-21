import type { ConnectedSource, RunSourceType } from '@/domain';
import {
  isExclusiveIntegrationSourceType,
  sortSourcesByPriorityWithMetadata,
  type SourceMetadataMap,
} from '@/features/integrations/sourceCatalogQueries';

export type ExclusiveSourceSelectorPlatform = 'ios' | 'android' | 'all';

export type ExclusiveSourceSelectorRow = {
  source: ConnectedSource;
  selected: boolean;
};

export type ExclusiveSourceSelectorModel = {
  rows: ExclusiveSourceSelectorRow[];
  selectedSourceType: RunSourceType | null;
};

// Selectable auto-import sources are the platform hubs only. Brand apps
// (NRC / Strava / Garmin …) have no metadata here, so legacy connected rows
// the server may still return are silently dropped from the selector — the
// same mechanism that retired 'mynb'.
//
// 'apple_health' is availability-gated: it joins the selectable metadata only
// when the caller reports the RunnigappAppleHealth native reader as present in
// the running binary (isAppleHealthModuleAvailable()). On the HealthKit-free
// build 48 the selector therefore offers only the "연동 안 함" path on iOS —
// even for a legacy connected apple_health row — while build 49+ offers
// Apple 건강 again from the same OTA'd JS.
const BASE_EXCLUSIVE_SOURCE_SELECTOR_METADATA: SourceMetadataMap = {
  health_connect: {
    shortDescription: '',
    capabilities: [],
    setupHint: '',
    priority: 95,
  },
};

const APPLE_HEALTH_SELECTOR_METADATA: NonNullable<SourceMetadataMap['apple_health']> = {
  shortDescription: '',
  capabilities: [],
  setupHint: '',
  priority: 100,
};

function getSelectorMetadata(appleHealthAvailable: boolean): SourceMetadataMap {
  return appleHealthAvailable
    ? { apple_health: APPLE_HEALTH_SELECTOR_METADATA, ...BASE_EXCLUSIVE_SOURCE_SELECTOR_METADATA }
    : BASE_EXCLUSIVE_SOURCE_SELECTOR_METADATA;
}

function isSourceVisibleOnPlatform(source: ConnectedSource, platform: ExclusiveSourceSelectorPlatform) {
  if (platform === 'all') {
    return true;
  }

  return (
    source.recommendedPlatform === undefined
    || source.recommendedPlatform === 'all'
    || source.recommendedPlatform === platform
  );
}

export function buildExclusiveSourceSelectorModel(
  sources: ConnectedSource[],
  platform: ExclusiveSourceSelectorPlatform,
  appleHealthAvailable = false,
): ExclusiveSourceSelectorModel {
  const rowsSources = sortSourcesByPriorityWithMetadata(
    sources.filter((source) => (
      isExclusiveIntegrationSourceType(source.sourceType)
      && isSourceVisibleOnPlatform(source, platform)
    )),
    getSelectorMetadata(appleHealthAvailable),
  );
  const selectedSourceType = rowsSources.find((source) => source.connected)?.sourceType ?? null;

  return {
    rows: rowsSources.map((source) => ({
      source,
      selected: source.sourceType === selectedSourceType,
    })),
    selectedSourceType,
  };
}
