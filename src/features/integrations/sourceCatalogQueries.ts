import type { ConnectedSource, RunSourceType } from '@/domain';
import type { DevicePlatform, SourceMetadata } from './sourceCatalog';

// Partial: retired sources (e.g. legacy 'mynb' runs) keep their RunSourceType
// but have no catalog metadata, so catalog queries silently drop them.
export type SourceMetadataMap = Partial<Record<RunSourceType, SourceMetadata>>;

export function getSourceByTypeFromCatalog(sources: ConnectedSource[], sourceType: RunSourceType) {
  return sources.find((source) => source.sourceType === sourceType) ?? null;
}

export function isExclusiveIntegrationSourceType(sourceType: RunSourceType) {
  return sourceType !== 'manual' && sourceType !== 'runningground';
}

export function getConnectedExclusiveSourcesFromCatalog(sources: ConnectedSource[]) {
  return sources.filter((source) => source.connected && isExclusiveIntegrationSourceType(source.sourceType));
}

export function getPrimarySourceTypeForPlatform(platform: DevicePlatform): RunSourceType | null {
  if (platform === 'ios') {
    return 'apple_health';
  }

  if (platform === 'android') {
    return 'health_connect';
  }

  return null;
}

export function getPrimarySourceForCatalogPlatform(
  sources: ConnectedSource[],
  platform: DevicePlatform,
) {
  const primarySourceType = getPrimarySourceTypeForPlatform(platform);

  if (!primarySourceType) {
    return null;
  }

  return getSourceByTypeFromCatalog(sources, primarySourceType);
}

export function sortSourcesByPriorityWithMetadata(
  sources: ConnectedSource[],
  sourceMetadata: SourceMetadataMap,
): ConnectedSource[] {
  return [...sources]
    .filter((source) => {
      return Boolean(sourceMetadata[source.sourceType]);
    })
    .sort((left, right) => {
      const leftScore = (sourceMetadata[left.sourceType]?.priority ?? 0) + (left.connected ? 5 : 0);
      const rightScore = (sourceMetadata[right.sourceType]?.priority ?? 0) + (right.connected ? 5 : 0);

      return rightScore - leftScore;
    });
}

export function getRecommendedSourcesForPlatform(
  sources: ConnectedSource[],
  platform: DevicePlatform,
  sourceMetadata: SourceMetadataMap,
): ConnectedSource[] {
  return sortSourcesByPriorityWithMetadata(
    sources.filter((source) => {
      if (source.sourceType === 'manual') {
        return true;
      }

      return source.recommendedPlatform === platform || source.recommendedPlatform === 'all';
    }),
    sourceMetadata,
  )
    .slice(0, 3);
}

export function splitSourcesByStatus(sources: ConnectedSource[]) {
  return {
    connected: sources.filter((source) => source.connected),
    available: sources.filter((source) => !source.connected),
  };
}

export function getCoverageSummaryForPlatform(
  sources: ConnectedSource[],
  platform: DevicePlatform,
  sourceMetadata: SourceMetadataMap,
) {
  const connectedCount = sources.filter((source) => source.connected).length;
  const recommended = getRecommendedSourcesForPlatform(sources, platform, sourceMetadata);
  const connectedRecommendedCount = recommended.filter((source) => source.connected).length;

  return {
    connectedCount,
    recommendedCount: recommended.length,
    connectedRecommendedCount,
    needsPrimarySource: connectedRecommendedCount === 0,
  };
}
