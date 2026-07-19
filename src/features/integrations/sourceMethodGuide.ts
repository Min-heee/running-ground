import type { RunSourceType } from '@/domain';

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

const healthConnectGuide: SourceMethodGuide = {
  title: '헬스 커넥트로 러닝 기록 가져오기',
  steps: [
    {
      title: '헬스 커넥트 준비',
      description: '헬스 커넥트 앱을 설치·설정하고 우리 앱에 권한을 허용해 주세요.',
    },
    {
      title: '워치·러닝 앱을 헬스 커넥트에 연결',
      description: '삼성헬스·갤럭시워치는 물론 NRC·Strava 같은 러닝 앱도 헬스 커넥트에 기록을 저장하도록 켜두면, 가져오기 한 번으로 함께 들어와요.',
    },
    {
      title: '반영 확인',
      description: '러닝 후 헬스 커넥트에 운동이 들어왔는지 확인하면 흐름이 단순해요.',
    },
    {
      title: '우리 앱에서 가져오기',
      description: "'기기에서 기록 가져오기' 버튼을 누르면 그때 헬스 커넥트 기록을 읽어와요. 버튼을 눌러야 새 기록이 들어와요.",
    },
  ],
};

export function getSourceMethodGuide(
  sourceType: RunSourceType,
  _platform: SourceMethodGuidePlatform,
): SourceMethodGuide | null {
  if (sourceType === 'health_connect') {
    return healthConnectGuide;
  }

  // Brand sources (nrc / strava / garmin) are no longer selectable — their
  // runs flow in through the platform hubs, and the hub guide above explains
  // that routing. 'apple_health' was retired for the App Store 2.5.1
  // resolution (re-add deferred post-launch). Legacy source types (incl.
  // 'mynb') get no guide.
  return null;
}
