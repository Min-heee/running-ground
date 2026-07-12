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

// Selectable auto-import sources are the two platform hubs only. Brand apps
// (NRC / Strava / Garmin …) have no metadata here, so legacy connected rows
// the server may still return are silently dropped from the selector — the
// same mechanism that retired 'mynb'.
const EXCLUSIVE_SOURCE_SELECTOR_METADATA: SourceMetadataMap = {
  apple_health: {
    shortDescription: '',
    capabilities: [],
    setupHint: '',
    priority: 100,
  },
  health_connect: {
    shortDescription: '',
    capabilities: [],
    setupHint: '',
    priority: 95,
  },
  manual: {
    shortDescription: '',
    capabilities: [],
    setupHint: '',
    priority: 80,
  },
  runningground: {
    shortDescription: '',
    capabilities: [],
    setupHint: '',
    priority: 70,
  },
};

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
): ExclusiveSourceSelectorModel {
  const rowsSources = sortSourcesByPriorityWithMetadata(
    sources.filter((source) => (
      isExclusiveIntegrationSourceType(source.sourceType)
      && isSourceVisibleOnPlatform(source, platform)
    )),
    EXCLUSIVE_SOURCE_SELECTOR_METADATA,
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
