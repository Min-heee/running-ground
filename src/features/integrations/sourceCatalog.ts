import { Platform } from 'react-native';
import { ConnectedSource, RunSourceType } from '@/domain';
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

const SOURCE_METADATA: Record<RunSourceType, SourceMetadata> = {
  apple_health: {
    shortDescription: 'Apple 건강에 모인 러닝 기록',
    capabilities: ['자동 동기화', '백그라운드 기록 반영', 'iPhone 기본 추천'],
    setupHint: '애플워치·NRC 등 기록을 Apple 건강에 모은 뒤 연결하면 자동으로 들어와요.',
    priority: 100,
  },
  health_connect: {
    shortDescription: 'Health Connect에 모인 러닝 기록',
    capabilities: ['자동 동기화', '앱 간 기록 통합', 'Android 기본 추천'],
    setupHint: '삼성헬스·갤럭시워치 등을 Health Connect에 연결한 뒤 연결하세요.',
    priority: 95,
  },
  manual: {
    shortDescription: '직접 입력하는 러닝 기록',
    capabilities: ['즉시 기록 입력', '온보딩 안전망', '모든 플랫폼 사용 가능'],
    setupHint: '자동 연동이 어려울 때 기록을 직접 추가해요.',
    priority: 80,
  },
  garmin: {
    shortDescription: '가민 기기로 측정한 러닝 기록',
    capabilities: ['외부 웨어러블 연동', '자동 동기화'],
    setupHint: '가민 커넥트를 Apple 건강(iPhone)·Health Connect(Android)에 연결한 뒤 연결하세요.',
    priority: 60,
  },
  strava: {
    shortDescription: 'Strava에 쌓인 러닝 기록',
    capabilities: ['외부 앱 연동', '자동 동기화'],
    setupHint: 'Strava를 Apple 건강·Health Connect에 연결한 뒤 연결하세요.',
    priority: 55,
  },
  nrc: {
    shortDescription: 'Nike Run Club 러닝 기록',
    capabilities: ['Apple Health 브리지', '파트너 앱/기기 브리지'],
    setupHint: 'NRC 기록을 Apple 건강(iPhone)·파트너(Android)로 보낸 뒤 연결하세요.',
    priority: 40,
  },
  mynb: {
    shortDescription: 'MyNB 러닝 기록',
    capabilities: ['Apple Health 브리지', 'Health Connect 브리지', '앱 파트너 경로'],
    setupHint: 'MyNB 기록을 Apple 건강·Health Connect로 보낸 뒤 연결하세요.',
    priority: 45,
  },
  runningground: {
    shortDescription: '앱에서 직접 측정한 러닝',
    capabilities: ['실시간 지도', '거리/페이스 측정', '바로 저장'],
    setupHint: '연동 없이 앱에서 바로 측정해 저장해요.',
    priority: 70,
  },
};

export function getCurrentDevicePlatform(): DevicePlatform {
  if (Platform.OS === 'ios') {
    return 'ios';
  }

  if (Platform.OS === 'android') {
    return 'android';
  }

  return 'all';
}

export function getSourceMetadata(
  sourceType: RunSourceType,
  platform = getCurrentDevicePlatform(),
): SourceMetadata {
  if (sourceType === 'nrc') {
    if (platform === 'ios') {
      return {
        shortDescription: 'Nike Run Club 러닝 기록',
        capabilities: ['Apple Health 브리지', 'NRC 가이드 런'],
        setupHint: 'NRC를 Apple 건강에 연결한 뒤 연결하세요.',
        priority: 40,
      };
    }

    if (platform === 'android') {
      return {
        shortDescription: 'Nike Run Club 러닝 기록',
        capabilities: ['Strava 브리지', 'Garmin/COROS 파트너'],
        setupHint: 'NRC 설정 > 파트너에서 Strava·워치를 연결한 뒤 그 소스를 연결하세요.',
        priority: 40,
      };
    }
  }

  if (sourceType === 'mynb') {
    if (platform === 'ios') {
      return {
        shortDescription: 'MyNB 러닝 기록',
        capabilities: ['Apple Health 브리지', 'MyNB 앱 러닝 기록'],
        setupHint: 'MyNB를 Apple 건강에 연결한 뒤 연결하세요.',
        priority: 45,
      };
    }

    if (platform === 'android') {
      return {
        shortDescription: 'MyNB 러닝 기록',
        capabilities: ['Health Connect 브리지', 'Strava/워치 파트너'],
        setupHint: 'MyNB를 Health Connect나 파트너 앱에 연결한 뒤 연결하세요.',
        priority: 45,
      };
    }
  }

  if (sourceType === 'strava' && platform === 'android') {
    return {
      ...SOURCE_METADATA.strava,
      shortDescription: 'Strava에 쌓인 러닝 기록',
      setupHint: 'NRC를 쓰면 NRC > 파트너에서 Strava를 연결한 뒤 여기서 연결하세요.',
    };
  }

  return SOURCE_METADATA[sourceType];
}

export function getSourceByType(sources: ConnectedSource[], sourceType: RunSourceType) {
  return getSourceByTypeFromCatalog(sources, sourceType);
}

export function isExclusiveIntegrationSourceType(sourceType: RunSourceType) {
  return sourceType !== 'manual' && sourceType !== 'runningground';
}

export function getConnectedExclusiveSources(sources: ConnectedSource[]) {
  return getConnectedExclusiveSourcesFromCatalog(sources);
}

export function getPrimarySourceType(platform = getCurrentDevicePlatform()): RunSourceType | null {
  return getPrimarySourceTypeForPlatform(platform);
}

export function getPrimarySourceForPlatform(
  sources: ConnectedSource[],
  platform = getCurrentDevicePlatform(),
) {
  return getPrimarySourceForCatalogPlatform(sources, platform);
}

export function getPlatformLabel(platform: DevicePlatform): string {
  if (platform === 'ios') {
    return 'iPhone';
  }

  if (platform === 'android') {
    return 'Android';
  }

  return '현재 기기';
}

export function getRecommendationCopy(platform: DevicePlatform): string {
  if (platform === 'ios') {
    return '지금 기기 기준으로는 Apple Health를 먼저 붙이고, NRC나 MyNB를 쓰고 있다면 그 앱 기록을 Apple Health까지 보내는 흐름이 가장 매끄러워.';
  }

  if (platform === 'android') {
    return '지금 기기 기준으로는 Health Connect를 먼저 붙이고, NRC나 MyNB를 주로 쓴다면 Strava나 워치 파트너까지 함께 보는 편이 현실적이야.';
  }

  return '기본 건강 허브를 먼저 연결하고, 필요할 때 Manual이나 외부 앱 소스를 덧붙이는 흐름이 가장 안정적이야.';
}

export function getRecommendedSources(sources: ConnectedSource[], platform = getCurrentDevicePlatform()): ConnectedSource[] {
  return getRecommendedSourcesForPlatform(sources, platform, SOURCE_METADATA);
}

export function sortSourcesByPriority(sources: ConnectedSource[]): ConnectedSource[] {
  return sortSourcesByPriorityWithMetadata(sources, SOURCE_METADATA);
}

export function splitSourcesByStatus(sources: ConnectedSource[]) {
  return splitSourcesByStatusQuery(sources);
}

export function getCoverageSummary(sources: ConnectedSource[], platform = getCurrentDevicePlatform()) {
  return getCoverageSummaryForPlatform(sources, platform, SOURCE_METADATA);
}
