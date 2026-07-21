import { Platform } from 'react-native';
import { ConnectedSource, RunSourceType } from '@/domain';
import { isAppleHealthModuleAvailable } from '@/integrations/appleHealthAvailability';
import {
  getConnectedExclusiveSourcesFromCatalog,
  getCoverageSummaryForPlatform,
  getPrimarySourceForCatalogPlatform,
  getPrimarySourceTypeForPlatform,
  getRecommendedSourcesForPlatform,
  getSourceByTypeFromCatalog,
  sortSourcesByPriorityWithMetadata,
  splitSourcesByStatus as splitSourcesByStatusQuery,
} from './sourceCatalogQueries';

export type DevicePlatform = 'ios' | 'android' | 'all';

export type SourceMetadata = {
  shortDescription: string;
  capabilities: string[];
  setupHint: string;
  priority: number;
};

// The selectable import catalog offers ONLY the two platform hubs
// (apple_health / health_connect) plus the non-selector entries other code
// needs (manual / runningground). Brand apps (NRC · Strava · Garmin · 삼성헬스
// …) are intentionally absent — same mechanism as the retired 'mynb': their
// runs flow INTO the hubs, so dropping their metadata makes every catalog and
// priority filter skip them. Legacy connected rows keep their RunSourceType;
// see LEGACY_SOURCE_METADATA.
//
// 'apple_health' is availability-gated, not static: its metadata joins the map
// only when the RunnigappAppleHealth native reader is present in the running
// binary (getSelectableSourceMetadata below). On the HealthKit-free build 48
// this same OTA'd JS drops apple_health everywhere — previously imported
// records still display, but the source is never offered — and on build 49+
// it reappears automatically.
const APPLE_HEALTH_SOURCE_METADATA: SourceMetadata = {
  shortDescription: 'Apple 건강에 모인 러닝 기록',
  capabilities: ['버튼 한 번으로 가져오기', '러닝 앱 기록 통합', 'iPhone 기본 추천'],
  setupHint: "애플워치·NRC 등 기록이 Apple 건강에 모이게 해두면, '기기에서 기록 가져오기' 버튼으로 한 번에 가져와요.",
  priority: 100,
};

const SOURCE_METADATA: Partial<Record<RunSourceType, SourceMetadata>> = {
  health_connect: {
    shortDescription: '헬스 커넥트에 모인 러닝 기록',
    capabilities: ['버튼 한 번으로 가져오기', '앱 간 기록 통합', 'Android 기본 추천'],
    setupHint: "삼성헬스·갤럭시워치 등 기록이 헬스 커넥트에 모이게 해두면, '기기에서 기록 가져오기' 버튼으로 한 번에 가져와요.",
    priority: 95,
  },
  manual: {
    shortDescription: '직접 입력하는 러닝 기록',
    capabilities: ['즉시 기록 입력', '온보딩 안전망', '모든 플랫폼 사용 가능'],
    setupHint: '연동이 어려울 때 기록을 직접 추가해요.',
    priority: 80,
  },
  runningground: {
    shortDescription: '앱에서 직접 측정한 러닝',
    capabilities: ['실시간 지도', '거리/페이스 측정', '바로 저장'],
    setupHint: '연동 없이 앱에서 바로 측정해 저장해요.',
    priority: 70,
  },
};

function getSelectableSourceMetadata(): Partial<Record<RunSourceType, SourceMetadata>> {
  return isAppleHealthModuleAvailable()
    ? { apple_health: APPLE_HEALTH_SOURCE_METADATA, ...SOURCE_METADATA }
    : SOURCE_METADATA;
}

export function getCurrentDevicePlatform(): DevicePlatform {
  if (Platform.OS === 'ios') {
    return 'ios';
  }

  if (Platform.OS === 'android') {
    return 'android';
  }

  return 'all';
}

// Harmless fallback for source types outside the selectable catalog (legacy
// runs/connectedSources may still carry 'mynb' / 'nrc' / 'strava' / 'garmin');
// never surfaced as a selectable import source.
const LEGACY_SOURCE_METADATA: SourceMetadata = {
  shortDescription: '지원이 종료된 소스',
  capabilities: [],
  setupHint: '',
  priority: 0,
};

export function getSourceMetadata(sourceType: RunSourceType): SourceMetadata {
  return getSelectableSourceMetadata()[sourceType] ?? LEGACY_SOURCE_METADATA;
}

export function getSourceByType(sources: ConnectedSource[], sourceType: RunSourceType) {
  return getSourceByTypeFromCatalog(sources, sourceType);
}

export { isExclusiveIntegrationSourceType } from './sourceCatalogQueries';

export function getConnectedExclusiveSources(sources: ConnectedSource[]) {
  return getConnectedExclusiveSourcesFromCatalog(sources);
}

export function getPrimarySourceType(platform = getCurrentDevicePlatform()): RunSourceType | null {
  return getPrimarySourceTypeForPlatform(platform, isAppleHealthModuleAvailable());
}

export function getPrimarySourceForPlatform(
  sources: ConnectedSource[],
  platform = getCurrentDevicePlatform(),
) {
  return getPrimarySourceForCatalogPlatform(sources, platform, isAppleHealthModuleAvailable());
}

export { getPlatformLabel } from './sourceCatalogQueries';

export function getRecommendationCopy(platform: DevicePlatform): string {
  if (platform === 'ios') {
    // Availability-gated copy: only promise Apple 건강 when the native reader
    // actually exists in this binary (build 49+); build 48 keeps the
    // HealthKit-free wording.
    return isAppleHealthModuleAvailable()
      ? "지금 기기 기준으로는 Apple 건강을 연결하는 게 기본이야. NRC·Strava 같은 러닝 앱 기록도 Apple 건강에 모아두면 '기기에서 기록 가져오기' 한 번으로 함께 들어와."
      : '지금 버전 iPhone에서는 자동 가져오기 연동 없이 앱 측정과 수동 기록으로 기록을 쌓는 흐름이 기본이야.';
  }

  if (platform === 'android') {
    return "지금 기기 기준으로는 헬스 커넥트를 연결하는 게 기본이야. 삼성헬스·워치 기록도 헬스 커넥트에 모아두면 '기기에서 기록 가져오기' 한 번으로 함께 들어와.";
  }

  return '기본 건강 허브를 먼저 연결하고, 필요할 때 수동 기록을 덧붙이는 흐름이 가장 안정적이야.';
}

export function getRecommendedSources(sources: ConnectedSource[], platform = getCurrentDevicePlatform()): ConnectedSource[] {
  return getRecommendedSourcesForPlatform(sources, platform, getSelectableSourceMetadata());
}

export function sortSourcesByPriority(sources: ConnectedSource[]): ConnectedSource[] {
  return sortSourcesByPriorityWithMetadata(sources, getSelectableSourceMetadata());
}

export function splitSourcesByStatus(sources: ConnectedSource[]) {
  return splitSourcesByStatusQuery(sources);
}

export function getCoverageSummary(sources: ConnectedSource[], platform = getCurrentDevicePlatform()) {
  return getCoverageSummaryForPlatform(sources, platform, getSelectableSourceMetadata());
}
