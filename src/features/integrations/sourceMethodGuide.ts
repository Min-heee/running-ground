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

const appleHealthGuide: SourceMethodGuide = {
  title: 'Apple 건강으로 러닝 기록 가져오기',
  steps: [
    {
      title: '권한 켜기',
      description: '아이폰 설정 > 개인정보 보호 및 보안 > 건강에서 우리 앱에 운동·거리 권한을 허용해 주세요.',
    },
    {
      title: '러닝 앱을 Apple 건강에 연결',
      description: "NRC·Strava·가민 같은 러닝 앱이 Apple 건강에 기록을 저장하도록 켜두면, 가져오기 한 번으로 함께 들어와요. 각 앱 설정에서 Apple 건강 '운동(Workouts)' 쓰기 권한을 켜 주세요.",
    },
    {
      title: '반영 확인',
      description: "러닝 후 Apple 건강 앱 '운동' 탭에 기록이 보이는지 확인하면 가장 안정적이에요.",
    },
    {
      title: '우리 앱에서 가져오기',
      description: "'기기에서 기록 가져오기' 버튼을 누르면 그때 Apple 건강 기록을 읽어와요. 버튼을 눌러야 새 기록이 들어와요.",
    },
  ],
};

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
  appleHealthAvailable = false,
): SourceMethodGuide | null {
  // The Apple-Health guide is availability-gated: it surfaces only when the
  // RunnigappAppleHealth native reader exists in the running binary (build
  // 49+). On the HealthKit-free build 48 the same OTA'd JS returns null, so no
  // platform ever shows an Apple-Health guide there.
  if (sourceType === 'apple_health') {
    return appleHealthAvailable ? appleHealthGuide : null;
  }

  if (sourceType === 'health_connect') {
    return healthConnectGuide;
  }

  // Brand sources (nrc / strava / garmin) are no longer selectable — their
  // runs flow in through the platform hubs, and the hub guides above explain
  // that routing. Legacy source types (incl. 'mynb') get no guide.
  return null;
}
