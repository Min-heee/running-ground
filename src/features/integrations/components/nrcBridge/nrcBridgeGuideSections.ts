import type { GuideSection } from './types';

export function buildIosSections(input: {
  nrcConnected: boolean;
  mynbConnected: boolean;
  appleHealthConnected: boolean;
  appleHealthReady: boolean;
  stravaConnected: boolean;
  garminConnected: boolean;
}): GuideSection[] {
  return [
    {
      id: 'nrc',
      kicker: 'Nike Run Club 가이드',
      title: 'NRC 기록을 Apple Health 경유로 가져오는 방법',
      badge: 'iPhone',
      statusLabel: '준비 상태',
      statusValue: input.appleHealthReady ? '가져오기 가능' : '설정 필요',
      sourceStatusLabel: 'NRC',
      sourceStatusValue: input.nrcConnected ? '표시됨' : '연결 전',
      bridgeStatusLabel: 'Apple Health',
      bridgeStatusValue: input.appleHealthConnected ? '연결됨' : '연결 전',
      steps: [
        {
          title: 'NRC와 Apple Health 공유 켜두기',
          description: '아이폰 설정 -> 개인정보 보호 및 보안 -> 건강 -> Nike Run Club에서 운동, 거리, 심박수 공유를 켜 주세요.',
        },
        {
          title: '러닝은 NRC로 기록하기',
          description: '러닝하실 때는 NRC에서 평소처럼 기록하고, 우리 앱은 그 기록을 Apple Health에서 읽어와요.',
        },
        {
          title: 'Apple 건강 앱에 운동이 들어왔는지 확인하기',
          description: '러닝 후 Apple 건강 앱 운동 탭에 방금 뛴 기록이 보이는지 먼저 확인하면 흐름이 가장 안정적이에요.',
        },
        {
          title: '우리 앱에서 기록 가져오기',
          description: '그다음 우리 앱에서 기기 기록 가져오기 또는 동기화 다시 하기를 누르면 돼요.',
        },
      ],
    },
    {
      id: 'mynb',
      kicker: 'MyNB 가이드',
      title: 'MyNB 기록을 Apple Health 경유로 가져오는 방법',
      badge: 'Apple Watch',
      statusLabel: '준비 상태',
      statusValue: input.appleHealthReady ? '가져오기 가능' : '설정 필요',
      sourceStatusLabel: 'MyNB',
      sourceStatusValue: input.mynbConnected ? '표시됨' : '연결 전',
      bridgeStatusLabel: 'Apple Health',
      bridgeStatusValue: input.appleHealthConnected ? '연결됨' : '연결 전',
      steps: [
        {
          title: 'MyNB와 Apple Health 공유 켜두기',
          description: 'MyNB가 Apple Health에 러닝을 쓰도록 허용해 두면 우리 앱은 그 결과를 Apple Health에서 읽을 수 있어요.',
        },
        {
          title: '러닝은 MyNB 또는 Apple Watch 경로로 기록하기',
          description: '실제 기록은 MyNB 쪽에서 만들고, 우리 앱은 Apple Health로 모인 운동만 가져오는 구조로 가면 중복이 적어요.',
        },
        {
          title: 'Apple 건강 앱 반영 확인하기',
          description: '러닝 후 Apple 건강 앱에 운동이 보이는지 먼저 확인해 두면 가져오기 성공률이 높아져요.',
        },
        {
          title: '우리 앱에서 가져오기 또는 동기화',
          description: '기록이 들어왔으면 우리 앱에서 바로 가져오기나 동기화 다시 하기를 눌러 주세요.',
        },
      ],
      footnote: 'MyNB 직접 API보다 Apple Health를 중심 허브로 두는 편이 iPhone에서는 훨씬 덜 흔들려요.',
    },
    {
      id: 'strava',
      kicker: 'Strava 가이드',
      title: 'Strava 기록을 직접 소스로 쓰는 방법',
      badge: '직접 연동',
      statusLabel: '연결 상태',
      statusValue: input.stravaConnected ? '연결됨' : '연결 전',
      sourceStatusLabel: 'Strava',
      sourceStatusValue: input.stravaConnected ? '준비됨' : '연결 전',
      bridgeStatusLabel: '기본 허브',
      bridgeStatusValue: input.appleHealthConnected ? 'Apple Health 연결됨' : '선택 사항',
      steps: [
        {
          title: 'Strava 앱 동기화 확인하기',
          description: '먼저 Strava 앱 안에 최근 러닝이 제대로 올라와 있는지 확인해 주세요.',
        },
        {
          title: '우리 앱에서 Strava 연결하기',
          description: '연동 관리에서 Strava를 연결해 두면 Strava 쪽 기록을 직접 소스로 다룰 준비가 됩니다.',
        },
        {
          title: '러닝 후 Strava 반영 먼저 보기',
          description: '기록이 우리 앱에 늦게 보일 때는 Strava 자체 반영 여부를 먼저 확인하는 편이 원인 파악이 빨라요.',
        },
        {
          title: '필요하면 동기화 다시 하기',
          description: '우리 앱에서 동기화 다시 하기를 누르면 최신 상태로 재확인할 수 있어요.',
        },
      ],
    },
    {
      id: 'garmin',
      kicker: 'Garmin 가이드',
      title: 'Garmin Connect 기록을 직접 소스로 쓰는 방법',
      badge: '워치 연동',
      statusLabel: '연결 상태',
      statusValue: input.garminConnected ? '연결됨' : '연결 전',
      sourceStatusLabel: 'Garmin',
      sourceStatusValue: input.garminConnected ? '준비됨' : '연결 전',
      bridgeStatusLabel: '기본 허브',
      bridgeStatusValue: input.appleHealthConnected ? 'Apple Health 연결됨' : '선택 사항',
      steps: [
        {
          title: 'Garmin Connect 동기화 확인하기',
          description: '워치 러닝이 Garmin Connect에 정상 반영되는지 먼저 확인해 주세요.',
        },
        {
          title: '우리 앱에서 Garmin 연결하기',
          description: '연동 관리에서 Garmin을 연결해 두면 Garmin Connect를 직접 소스로 다룰 수 있어요.',
        },
        {
          title: '러닝 후 Garmin Connect 반영 먼저 보기',
          description: '우리 앱보다 앞서 Garmin Connect 쪽 상태를 먼저 보는 게 가장 확실한 점검 순서예요.',
        },
        {
          title: '우리 앱에서 동기화 다시 하기',
          description: '기록이 늦게 보이면 우리 앱에서 다시 동기화해 최신 상태를 확인해 주세요.',
        },
      ],
    },
  ];
}

export function buildAndroidSections(input: {
  nrcConnected: boolean;
  mynbConnected: boolean;
  healthConnectConnected: boolean;
  healthConnectReady: boolean;
  stravaConnected: boolean;
  garminConnected: boolean;
}): GuideSection[] {
  return [
    {
      id: 'nrc',
      kicker: 'Nike Run Club 가이드',
      title: 'Galaxy 쪽에서는 NRC를 브리지 경로로 붙이는 방법',
      badge: 'Galaxy / Android',
      statusLabel: '추천 경로',
      statusValue: input.healthConnectConnected ? 'Health Connect 우선' : '기본 허브 연결 필요',
      sourceStatusLabel: 'NRC',
      sourceStatusValue: input.nrcConnected ? '표시됨' : '연결 전',
      bridgeStatusLabel: 'Health Connect',
      bridgeStatusValue: input.healthConnectConnected ? '연결됨' : '연결 전',
      steps: [
        {
          title: 'Galaxy Watch 기록이 Samsung Health에 들어오는지 확인하기',
          description: 'Galaxy Watch 러닝은 먼저 Samsung Health 쪽 반영이 안정적인지 보는 게 출발이에요.',
        },
        {
          title: 'Health Connect를 기본 허브로 연결하기',
          description: 'Android에서는 우리 앱이 Health Connect를 직접 읽기 때문에 우선 이 경로를 붙여 두는 게 가장 단순해요.',
        },
        {
          title: 'NRC를 쓰고 있다면 Partners도 함께 보기',
          description: 'NRC 설정 안의 Partners에서 Strava나 Garmin 같은 파트너가 열려 있으면 같은 브리지 소스를 우리 앱에도 연결해 둘 수 있어요.',
        },
        {
          title: '우리 앱에서 동기화 또는 기기 기록 가져오기',
          description: '준비가 끝나면 기기 기록 가져오기나 동기화 다시 하기로 실제 반영 여부를 확인하면 돼요.',
        },
      ],
      footnote: 'Android에서는 NRC 직접 수집보다 Health Connect와 파트너 경로를 같이 보는 편이 덜 흔들려요.',
    },
    {
      id: 'mynb',
      kicker: 'MyNB 가이드',
      title: 'Galaxy 쪽에서는 MyNB를 허브 경유로 붙이는 방법',
      badge: 'Health Connect',
      statusLabel: '추천 경로',
      statusValue: input.healthConnectConnected ? 'Health Connect 우선' : '기본 허브 연결 필요',
      sourceStatusLabel: 'MyNB',
      sourceStatusValue: input.mynbConnected ? '표시됨' : '연결 전',
      bridgeStatusLabel: 'Health Connect',
      bridgeStatusValue: input.healthConnectConnected ? '연결됨' : '연결 전',
      steps: [
        {
          title: 'MyNB 기록이 기기 허브로 모이게 정리하기',
          description: 'Android에서는 MyNB 자체보다 Health Connect에 러닝 기록이 모이도록 정리해 두는 편이 운영이 편해요.',
        },
        {
          title: 'Galaxy Watch / Samsung Health와 충돌 없게 두기',
          description: '같은 러닝이 여러 앱으로 중복 들어오지 않게 기본 허브를 Health Connect 쪽으로 정리해 두면 중복 방지가 쉬워져요.',
        },
        {
          title: '우리 앱에서 MyNB 표시와 Health Connect 연결하기',
          description: 'MyNB는 어떤 앱으로 뛰는지 표시해 두고, 실제 자동 가져오기는 Health Connect에서 받는 구조가 현실적이에요.',
        },
        {
          title: '기기 기록 가져오기 또는 동기화 다시 하기',
          description: '허브에 러닝이 들어왔으면 우리 앱에서 바로 가져오기나 동기화로 반영 여부를 확인하면 됩니다.',
        },
      ],
      footnote: 'MyNB도 Android에서는 직접 API보다 Health Connect 중심 구성이 실제 운영에 더 잘 맞아요.',
    },
    {
      id: 'strava',
      kicker: 'Strava 가이드',
      title: 'Strava를 직접 소스로 붙이는 방법',
      badge: '직접 연동',
      statusLabel: '연결 상태',
      statusValue: input.stravaConnected ? '연결됨' : '연결 전',
      sourceStatusLabel: 'Strava',
      sourceStatusValue: input.stravaConnected ? '준비됨' : '연결 전',
      bridgeStatusLabel: 'Health Connect',
      bridgeStatusValue: input.healthConnectConnected ? '보조 허브 연결됨' : '선택 사항',
      steps: [
        {
          title: 'Strava에 러닝이 정상 반영되는지 확인하기',
          description: '러닝 후 Strava 앱에 기록이 바로 올라오는지 먼저 확인해 주세요.',
        },
        {
          title: '우리 앱에서 Strava 연결하기',
          description: 'Strava를 직접 소스로 연결해 두면 Strava 기록을 우리 앱으로 끌어올 준비가 됩니다.',
        },
        {
          title: '필요하면 Health Connect도 같이 유지하기',
          description: 'Galaxy Watch 쪽 기본 기록은 Health Connect에 남기고, Strava는 추가 소스로 보조하는 구성이 Android에서는 편해요.',
        },
        {
          title: '우리 앱에서 동기화 다시 하기',
          description: '기록이 안 보이거나 늦으면 우리 앱에서 다시 동기화해 최신 상태를 확인해 주세요.',
        },
      ],
    },
    {
      id: 'garmin',
      kicker: 'Garmin 가이드',
      title: 'Garmin Connect를 직접 소스로 붙이는 방법',
      badge: '워치 연동',
      statusLabel: '연결 상태',
      statusValue: input.garminConnected ? '연결됨' : '연결 전',
      sourceStatusLabel: 'Garmin',
      sourceStatusValue: input.garminConnected ? '준비됨' : '연결 전',
      bridgeStatusLabel: 'Health Connect',
      bridgeStatusValue: input.healthConnectConnected ? '보조 허브 연결됨' : '선택 사항',
      steps: [
        {
          title: 'Garmin Connect 반영 먼저 보기',
          description: '워치에서 뛴 기록이 Garmin Connect에 정상 반영되는지 먼저 확인해 주세요.',
        },
        {
          title: '우리 앱에서 Garmin 연결하기',
          description: 'Garmin을 직접 소스로 연결하면 Garmin Connect 기준 러닝을 바로 다룰 수 있어요.',
        },
        {
          title: 'Galaxy Watch 기본 허브와 역할 나누기',
          description: 'Galaxy Watch 기록은 Health Connect, Garmin 워치는 Garmin처럼 역할을 분리하면 중복 관리가 쉬워져요.',
        },
        {
          title: '우리 앱에서 동기화 다시 하기',
          description: '기록이 안 보이면 우리 앱에서 동기화 다시 하기를 눌러 최신 상태를 확인해 주세요.',
        },
      ],
    },
  ];
}
