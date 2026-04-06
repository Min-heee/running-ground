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
    shortDescription: 'iPhone에서 가장 자연스럽게 자동 반영되는 기본 경로',
    capabilities: ['자동 동기화', '백그라운드 기록 반영', 'iPhone 기본 추천'],
    setupHint: '권한 허용 후 러닝 앱 기록을 Health로 모으는 구성이 가장 안정적이야.',
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
    shortDescription: 'NRC 사용자 대상 후속 확장 후보',
    capabilities: ['외부 앱 연동'],
    setupHint: 'MVP에서는 기본 소스 안정화 이후 우선순위를 두는 편이 현실적이야.',
    priority: 40,
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

export function getSourceMetadata(sourceType: RunSourceType): SourceMetadata {
  return SOURCE_METADATA[sourceType];
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
    return '지금 기기 기준으로는 Apple Health를 먼저 붙이고, 자동 수집이 비는 구간만 Manual로 보완하는 흐름이 가장 매끄러워.';
  }

  if (platform === 'android') {
    return '지금 기기 기준으로는 Health Connect를 먼저 붙이고, 필요한 경우 Manual을 함께 열어 두는 흐름이 가장 현실적이야.';
  }

  return '기본 건강 허브를 먼저 연결하고, 필요할 때 Manual이나 외부 앱 소스를 덧붙이는 흐름이 가장 안정적이야.';
}

export function getRecommendedSources(sources: ConnectedSource[], platform = getCurrentDevicePlatform()): ConnectedSource[] {
  return [...sources]
    .filter((source) => {
      if (source.sourceType === 'manual') {
        return true;
      }

      return source.recommendedPlatform === platform || source.recommendedPlatform === 'all';
    })
    .sort((left, right) => {
      const leftScore = SOURCE_METADATA[left.sourceType].priority + (left.connected ? 5 : 0);
      const rightScore = SOURCE_METADATA[right.sourceType].priority + (right.connected ? 5 : 0);

      return rightScore - leftScore;
    })
    .slice(0, 3);
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
