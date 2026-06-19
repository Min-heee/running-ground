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
          title: '먼저 알아두기 (1번 단계)',
          description: "우리 앱은 각 러닝 앱을 직접 연동하지 않고 Apple 건강(아이폰) / Health Connect(안드로이드)에 쌓인 운동을 읽어와요. 그래서 각 앱(스트라바·나이키런·가민)에서 'Apple 건강에 쓰기(특히 운동/Workouts)'를 먼저 켜는 게 1번 단계예요.",
        },
        {
          title: 'NRC에서 Apple 건강 쓰기(운동) 켜기',
          description: 'NRC가 Apple 건강에 운동을 쓰도록 먼저 켜 주세요. iOS는 NRC 첫 실행 때 권한 화면에서 운동·거리 쓰기에 한 번 \'허용\'하면 이후 자동으로 들어와요. (아이폰 설정 → 개인정보 보호 및 보안 → 건강 → Nike Run Club에서 운동·거리 쓰기가 켜져 있는지 확인.)',
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
      kicker: '뉴발란스 안내',
      title: '뉴발란스(MyNB)는 가져오기 소스로 쓸 수 없어요',
      badge: '안내',
      statusLabel: '가져오기',
      statusValue: '불가',
      sourceStatusLabel: 'MyNB',
      sourceStatusValue: '운동 쓰기 미지원',
      bridgeStatusLabel: 'Apple Health',
      bridgeStatusValue: '연결 대상 아님',
      steps: [
        {
          title: '왜 안 되나요',
          description: '뉴발란스는 러닝 기록 앱(MyNB)이 쇼핑·적립용이라 Apple 건강에 운동을 쓰지 않아요. 뉴발란스 신발로 뛴 기록은 실제로 측정한 앱(스트라바·나이키런·애플워치)에서 Apple 건강 쓰기를 켜서 가져오세요.',
        },
      ],
    },
    {
      id: 'strava',
      kicker: 'Strava 가이드',
      title: 'Strava 기록을 Apple 건강 경유로 가져오는 방법',
      badge: 'iPhone',
      statusLabel: '연결 상태',
      statusValue: input.stravaConnected ? '연결됨' : '연결 전',
      sourceStatusLabel: 'Strava',
      sourceStatusValue: input.stravaConnected ? '준비됨' : '연결 전',
      bridgeStatusLabel: '기본 허브',
      bridgeStatusValue: input.appleHealthConnected ? 'Apple Health 연결됨' : '선택 사항',
      steps: [
        {
          title: '먼저 알아두기 (1번 단계)',
          description: "우리 앱은 각 러닝 앱을 직접 연동하지 않고 Apple 건강(아이폰) / Health Connect(안드로이드)에 쌓인 운동을 읽어와요. 그래서 각 앱(스트라바·나이키런·가민)에서 'Apple 건강에 쓰기(특히 운동/Workouts)'를 먼저 켜는 게 1번 단계예요.",
        },
        {
          title: '스트라바에서 Apple 건강 쓰기 켜기 (가장 중요)',
          description: '스트라바 앱 → 나(You) → 설정(톱니) → 애플리케이션·서비스·기기 → Health → +로 Connect → 권한 화면에서 반드시 "운동(Workouts)"을 켜고 허용. 설치·로그인만으로는 안 써집니다.',
        },
        {
          title: '러닝은 스트라바 앱으로 직접 기록',
          description: '가민·워치에서 스트라바로 넘어온 활동은 Apple 건강으로 다시 안 넘어갈 수 있어요. 설정을 켠 뒤 새 러닝을 직접 측정. (켜기 전 옛 기록은 소급 반영이 안 될 수 있어요.)',
        },
        {
          title: 'Apple 건강에 운동이 들어왔는지 먼저 확인',
          description: '러닝 후 iPhone "건강" 앱 운동 탭에 보이는지 확인. 여기 안 보이면 우리 앱에도 안 들어와요.',
        },
        {
          title: '우리 앱에 읽기 권한 주고 가져오기',
          description: 'iPhone 설정 → 개인정보 보호 및 보안 → 건강 → RunningGround에서 운동·거리 읽기를 켠 뒤, 연동관리에서 "기기에서 기록 가져오기".',
        },
      ],
    },
    {
      id: 'garmin',
      kicker: 'Garmin 가이드',
      title: 'Garmin Connect 기록을 Apple 건강 경유로 가져오는 방법',
      badge: 'iPhone',
      statusLabel: '연결 상태',
      statusValue: input.garminConnected ? '연결됨' : '연결 전',
      sourceStatusLabel: 'Garmin',
      sourceStatusValue: input.garminConnected ? '준비됨' : '연결 전',
      bridgeStatusLabel: '기본 허브',
      bridgeStatusValue: input.appleHealthConnected ? 'Apple Health 연결됨' : '선택 사항',
      steps: [
        {
          title: '먼저 알아두기 (1번 단계)',
          description: "우리 앱은 각 러닝 앱을 직접 연동하지 않고 Apple 건강(아이폰) / Health Connect(안드로이드)에 쌓인 운동을 읽어와요. 그래서 각 앱(스트라바·나이키런·가민)에서 'Apple 건강에 쓰기(특히 운동/Workouts)'를 먼저 켜는 게 1번 단계예요.",
        },
        {
          title: 'Garmin Connect에서 Apple 건강 쓰기 켜기 (가장 중요)',
          description: 'Garmin Connect 앱에서 Apple 건강 연결을 켜고 운동 쓰기 권한을 허용해 주세요. iOS는 Garmin Connect 앱이 떠 있어야(백그라운드라도 실행 중) Apple 건강으로 푸시돼요.',
        },
        {
          title: 'Garmin Connect 동기화 확인하기',
          description: '워치 러닝이 Garmin Connect에 정상 반영되는지 먼저 확인해 주세요.',
        },
        {
          title: 'Apple 건강에 운동이 들어왔는지 확인하기',
          description: '러닝 후 iPhone "건강" 앱 운동 탭에 보이는지 먼저 확인. 여기 안 보이면 우리 앱에도 안 들어와요.',
        },
        {
          title: '우리 앱에서 가져오기 또는 동기화',
          description: '연동관리에서 "기기에서 기록 가져오기" 또는 동기화 다시 하기를 누르면 최신 상태로 반영돼요.',
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
          title: '먼저 알아두기 (1번 단계)',
          description: "우리 앱은 각 러닝 앱을 직접 연동하지 않고 Apple 건강(아이폰) / Health Connect(안드로이드)에 쌓인 운동을 읽어와요. 그래서 각 앱(스트라바·나이키런·가민)에서 'Health Connect에 쓰기(특히 운동/Workouts)'를 먼저 켜는 게 1번 단계예요.",
        },
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
      kicker: '뉴발란스 안내',
      title: '뉴발란스(MyNB)는 가져오기 소스로 쓸 수 없어요',
      badge: '안내',
      statusLabel: '가져오기',
      statusValue: '불가',
      sourceStatusLabel: 'MyNB',
      sourceStatusValue: '운동 쓰기 미지원',
      bridgeStatusLabel: 'Health Connect',
      bridgeStatusValue: '연결 대상 아님',
      steps: [
        {
          title: '왜 안 되나요',
          description: '뉴발란스는 러닝 기록 앱(MyNB)이 쇼핑·적립용이라 Health Connect에 운동을 쓰지 않아요. 뉴발란스 신발로 뛴 기록은 실제로 측정한 앱(스트라바·나이키런·갤럭시워치)에서 Health Connect 쓰기를 켜서 가져오세요.',
        },
      ],
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
          title: '먼저 알아두기 (1번 단계)',
          description: "우리 앱은 각 러닝 앱을 직접 연동하지 않고 Apple 건강(아이폰) / Health Connect(안드로이드)에 쌓인 운동을 읽어와요. 그래서 각 앱(스트라바·나이키런·가민)에서 'Health Connect에 쓰기(특히 운동/Workouts)'를 먼저 켜는 게 1번 단계예요.",
        },
        {
          title: '스트라바에서 Health Connect 쓰기 켜기 (가장 중요)',
          description: '스트라바 앱 설정에서 Health Connect 연결을 켜고 "운동(Workouts)" 쓰기 권한을 반드시 허용해 주세요. 설치·로그인만으로는 안 써집니다.',
        },
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
          title: '먼저 알아두기 (1번 단계)',
          description: "우리 앱은 각 러닝 앱을 직접 연동하지 않고 Apple 건강(아이폰) / Health Connect(안드로이드)에 쌓인 운동을 읽어와요. 그래서 각 앱(스트라바·나이키런·가민)에서 'Health Connect에 쓰기(특히 운동/Workouts)'를 먼저 켜는 게 1번 단계예요.",
        },
        {
          title: 'Garmin Connect에서 Health Connect 쓰기 켜기 (가장 중요)',
          description: 'Garmin Connect 앱에서 Health Connect 연결을 켜고 운동 쓰기 권한을 허용해 주세요. 이걸 켜야 워치 러닝이 Health Connect로 넘어와요.',
        },
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
