import type { RunSourceType } from '@/domain';
import {
  buildAndroidSections,
  buildIosSections,
} from '@/features/integrations/components/nrcBridge/nrcBridgeGuideSections';

export type SourceMethodGuideStep = {
  title: string;
  description: string;
};

export type SourceMethodGuide = {
  title: string;
  steps: SourceMethodGuideStep[];
  footnote?: string;
};

type SourceMethodGuidePlatform = 'ios' | 'android' | 'all';

const emptyIosGuideStatus = {
  nrcConnected: false,
  mynbConnected: false,
  appleHealthConnected: false,
  appleHealthReady: false,
  stravaConnected: false,
  garminConnected: false,
};

const emptyAndroidGuideStatus = {
  nrcConnected: false,
  mynbConnected: false,
  healthConnectConnected: false,
  healthConnectReady: false,
  stravaConnected: false,
  garminConnected: false,
};

const appleHealthGuide: SourceMethodGuide = {
  title: 'Apple 건강으로 러닝 기록 가져오기',
  steps: [
    {
      title: '권한 켜기',
      description: '아이폰 설정 > 개인정보 보호 및 보안 > 건강에서 우리 앱에 운동·거리 권한을 허용해 주세요.',
    },
    {
      title: '러닝 앱을 Apple 건강에 연결',
      description: "애플워치·NRC 등으로 측정한 기록이 Apple 건강에 쌓이도록 각 앱(스트라바·나이키런·가민)에서 Apple 건강 '운동(Workouts)' 쓰기 권한을 켜 주세요.",
    },
    {
      title: '반영 확인',
      description: "러닝 후 Apple 건강 앱 '운동' 탭에 기록이 보이는지 확인하면 가장 안정적이에요.",
    },
    {
      title: '우리 앱에서 가져오기',
      description: "'기기에서 기록 가져오기' 또는 '동기화 다시 하기'를 누르면 반영돼요.",
    },
  ],
};

const healthConnectGuide: SourceMethodGuide = {
  title: 'Health Connect로 러닝 기록 가져오기',
  steps: [
    {
      title: 'Health Connect 준비',
      description: 'Health Connect 앱을 설치·설정하고 우리 앱에 권한을 허용해 주세요.',
    },
    {
      title: '워치·앱 연결',
      description: '삼성헬스·갤럭시워치 등 러닝 기록이 Health Connect에 모이도록 연결해 주세요.',
    },
    {
      title: '반영 확인',
      description: '러닝 후 Health Connect에 운동이 들어왔는지 확인하면 흐름이 단순해요.',
    },
    {
      title: '우리 앱에서 가져오기',
      description: "'기기에서 기록 가져오기' 또는 '동기화 다시 하기'를 누르면 반영돼요.",
    },
  ],
};

function getBridgeGuide(sourceType: RunSourceType, platform: SourceMethodGuidePlatform): SourceMethodGuide | null {
  const sections = platform === 'android'
    ? buildAndroidSections(emptyAndroidGuideStatus)
    : buildIosSections(emptyIosGuideStatus);
  const section = sections.find((item) => item.id === sourceType);

  if (!section) {
    return null;
  }

  return {
    title: section.title,
    steps: section.steps,
    footnote: section.footnote,
  };
}

export function getSourceMethodGuide(
  sourceType: RunSourceType,
  platform: SourceMethodGuidePlatform,
): SourceMethodGuide | null {
  if (sourceType === 'apple_health') {
    return appleHealthGuide;
  }

  if (sourceType === 'health_connect') {
    return healthConnectGuide;
  }

  if (
    sourceType === 'nrc'
    || sourceType === 'mynb'
    || sourceType === 'strava'
    || sourceType === 'garmin'
  ) {
    return getBridgeGuide(sourceType, platform === 'all' ? 'ios' : platform);
  }

  return null;
}
