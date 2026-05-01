import { Platform } from 'react-native';
import { ConnectedSource, RunSourceType } from '@/domain/types';

export type DevicePlatform = 'ios' | 'android' | 'all';

type SourceMetadata = {
  shortDescription: string;
  capabilities: string[];
  setupHint: string;
  priority: number;
};

const SOURCE_METADATA: Record<RunSourceType, SourceMetadata> = {
  apple_health: {
    shortDescription: 'iPhone에서 가장 자연스럽게 자동 반영되는 기본 건강 허브',
    capabilities: ['자동 동기화', '백그라운드 기록 반영', 'iPhone 기본 추천'],
    setupHint: 'iPhone에서는 NRC 같은 러닝 앱 기록을 Apple Health에 모아두고 여기서 읽어오는 구성이 가장 안정적이야.',
    priority: 100,
  },
  health_connect: {
    shortDescription: 'Android 러닝 데이터를 통합하는 기본 허브',
    capabilities: ['자동 동기화', '앱 간 기록 통합', 'Android 기본 추천'],
    setupHint: '삼성 헬스나 다른 기록 앱을 Health Connect에 연결해 두면 흐름이 단순해져.',
    priority: 95,
  },
  manual: {
    shortDescription: '자동 연동이 어려울 때 바로 기록을 채울 수 있는 보조 경로',
    capabilities: ['즉시 기록 입력', '온보딩 안전망', '모든 플랫폼 사용 가능'],
    setupHint: '초기에는 수동 입력을 열어 두고, 이후 자동 소스로 유도하는 편이 좋아.',
    priority: 80,
  },
  garmin: {
    shortDescription: '기기 기반 러너를 위한 고정밀 외부 소스',
    capabilities: ['외부 웨어러블 연동', '자동 동기화'],
    setupHint: '핵심 기본 소스 연결 후 추가 확장 소스로 안내하는 게 좋아.',
    priority: 60,
  },
  strava: {
    shortDescription: '러닝 커뮤니티 중심 사용자가 선호하는 확장 소스',
    capabilities: ['외부 앱 연동', '자동 동기화'],
    setupHint: '중복 소스 문제를 피하려면 기본 건강 허브와 역할을 구분해서 안내해야 해.',
    priority: 55,
  },
  nrc: {
    shortDescription: 'Nike Run Club 기록을 브리지 소스로 넘기는 출발점',
    capabilities: ['Apple Health 브리지', '파트너 앱/기기 브리지'],
    setupHint: '직접 API보다 iPhone은 Apple Health, Android는 Strava/워치 파트너를 거쳐 연결하는 흐름이 현실적이야.',
    priority: 40,
  },
  mynb: {
    shortDescription: 'MyNB 기록을 기본 건강 허브나 파트너 경로로 넘기는 브리지 소스',
    capabilities: ['Apple Health 브리지', 'Health Connect 브리지', '앱 파트너 경로'],
    setupHint: 'iPhone은 Apple Health, Android는 Health Connect나 파트너 경로로 정리해 두면 흐름이 가장 안정적이야.',
    priority: 45,
  },
  runningground: {
    shortDescription: '앱 안에서 직접 러닝을 측정하고 저장하는 자체 기록 소스',
    capabilities: ['실시간 지도', '거리/페이스 측정', '바로 저장'],
    setupHint: '연동이 없어도 앱 안에서 바로 러닝을 측정해 기록으로 남길 수 있어.',
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
        shortDescription: 'Nike Run Club 기록을 Apple Health로 넘겨 우리 앱에 반영하는 경로',
        capabilities: ['Apple Health 브리지', 'NRC 가이드 런'],
        setupHint: 'iPhone에서는 NRC를 Apple Health에 연결하고, 우리 앱은 Apple Health에서 읽어오는 방식이 가장 안정적이야.',
        priority: 40,
      };
    }

    if (platform === 'android') {
      return {
        shortDescription: '직접 연동보다 파트너 앱/기기 브리지로 다루기 좋은 소스',
        capabilities: ['Strava 브리지', 'Garmin/COROS 파트너'],
        setupHint: 'Android에서는 NRC > Settings > Partners에서 Strava나 워치를 연결한 뒤 같은 소스를 우리 앱에도 연결하는 흐름이 현실적이야.',
        priority: 40,
      };
    }
  }

  if (sourceType === 'mynb') {
    if (platform === 'ios') {
      return {
        shortDescription: 'MyNB 기록을 Apple Health로 넘겨 우리 앱에 반영하는 경로',
        capabilities: ['Apple Health 브리지', 'MyNB 앱 러닝 기록'],
        setupHint: 'iPhone에서는 MyNB를 Apple Health에 연결하고, 우리 앱은 Apple Health에서 읽어오는 흐름이 가장 현실적이야.',
        priority: 45,
      };
    }

    if (platform === 'android') {
      return {
        shortDescription: 'MyNB 기록을 Health Connect나 파트너 소스로 정리해 받는 경로',
        capabilities: ['Health Connect 브리지', 'Strava/워치 파트너'],
        setupHint: 'Android에서는 MyNB 직접 수집보다 Health Connect나 Strava 같은 파트너 경로를 함께 보는 편이 안전해.',
        priority: 45,
      };
    }
  }

  if (sourceType === 'strava' && platform === 'android') {
    return {
      ...SOURCE_METADATA.strava,
      shortDescription: 'Android에서 NRC 브리지로도 활용하기 좋은 확장 소스',
      setupHint: 'NRC를 쓰고 있다면 NRC > Settings > Partners에서 Strava를 연결한 뒤 여기서도 Strava를 붙이면 흐름이 단순해져.',
    };
  }

  return SOURCE_METADATA[sourceType];
}

export function getSourceByType(sources: ConnectedSource[], sourceType: RunSourceType) {
  return sources.find((source) => source.sourceType === sourceType) ?? null;
}

export function isExclusiveIntegrationSourceType(sourceType: RunSourceType) {
  return sourceType !== 'manual' && sourceType !== 'runningground';
}

export function getConnectedExclusiveSources(sources: ConnectedSource[]) {
  return sources.filter((source) => source.connected && isExclusiveIntegrationSourceType(source.sourceType));
}

export function getPrimarySourceType(platform = getCurrentDevicePlatform()): RunSourceType | null {
  if (platform === 'ios') {
    return 'apple_health';
  }

  if (platform === 'android') {
    return 'health_connect';
  }

  return null;
}

export function getPrimarySourceForPlatform(
  sources: ConnectedSource[],
  platform = getCurrentDevicePlatform(),
) {
  const primarySourceType = getPrimarySourceType(platform);

  if (!primarySourceType) {
    return null;
  }

  return getSourceByType(sources, primarySourceType);
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
  return sortSourcesByPriority(
    sources.filter((source) => {
      if (source.sourceType === 'manual') {
        return true;
      }

      return source.recommendedPlatform === platform || source.recommendedPlatform === 'all';
    }),
  )
    .slice(0, 3);
}

export function sortSourcesByPriority(sources: ConnectedSource[]): ConnectedSource[] {
  return [...sources]
    .filter((source) => {
      return Boolean(SOURCE_METADATA[source.sourceType]);
    })
    .sort((left, right) => {
      const leftScore = SOURCE_METADATA[left.sourceType].priority + (left.connected ? 5 : 0);
      const rightScore = SOURCE_METADATA[right.sourceType].priority + (right.connected ? 5 : 0);

      return rightScore - leftScore;
    });
}

export function splitSourcesByStatus(sources: ConnectedSource[]) {
  return {
    connected: sources.filter((source) => source.connected),
    available: sources.filter((source) => !source.connected),
  };
}

export function getCoverageSummary(sources: ConnectedSource[], platform = getCurrentDevicePlatform()) {
  const connectedCount = sources.filter((source) => source.connected).length;
  const recommended = getRecommendedSources(sources, platform);
  const connectedRecommendedCount = recommended.filter((source) => source.connected).length;

  return {
    connectedCount,
    recommendedCount: recommended.length,
    connectedRecommendedCount,
    needsPrimarySource: connectedRecommendedCount === 0,
  };
}
