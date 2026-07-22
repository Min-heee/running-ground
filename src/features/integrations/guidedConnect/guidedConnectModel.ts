// PURE model for the guided source-connect wizard (연동 관리 상단의 "어떤 앱으로
// 달리세요?" 플로우).
//
// The import MECHANISM is unchanged — brand apps write into the platform hub
// (iOS → Apple 건강, Android → 헬스 커넥트) and we read the hub. What this model
// adds is the user-facing ROUTE: pick the app you actually run with, get that
// app's exact "건강으로 보내기" menu path + an open-the-app button, then our
// read-permission prompt, then import. No React, no I/O — unit-testable.

export type GuidedPlatform = 'ios' | 'android';

export type GuidedAppId = 'apple_watch' | 'samsung_health' | 'nrc' | 'strava' | 'garmin';

type GuideInstruction = {
  // One-line summary of what to flip on inside the brand app.
  summary: string;
  // Ordered menu path inside the brand app ("설정" → …). Rendered joined with ' → '.
  menuPath: string[];
  // Version-proof OS-level fallback ("메뉴가 안 보이면 …") — brand apps rename
  // their menus constantly (Strava dropped '응용 프로그램, 서비스 및 기기' in
  // 2026), but the OS-side health-permission switch never moves.
  fallbackNote?: string;
  // Custom URL scheme to jump straight into the app. Omitted when the scheme is
  // not reliably known — the store link below still opens/installs the app.
  appScheme?: string;
  storeUrl: string;
};

export type GuidedApp = {
  id: GuidedAppId;
  label: string;
  emoji: string;
  platforms: GuidedPlatform[];
  // Per-platform instructions for routing the app's workouts into the hub.
  // null → nothing to set up (the watch writes to the hub automatically).
  routeGuide: Partial<Record<GuidedPlatform, GuideInstruction>> | null;
};

const GUIDED_APPS: GuidedApp[] = [
  {
    id: 'apple_watch',
    label: '애플워치',
    emoji: '⌚',
    platforms: ['ios'],
    // Watch workouts land in Apple 건강 automatically — no routing step.
    routeGuide: null,
  },
  {
    id: 'samsung_health',
    label: '삼성헬스·갤럭시워치',
    emoji: '⌚',
    platforms: ['android'],
    routeGuide: {
      android: {
        summary: '삼성헬스 기록이 헬스 커넥트로 공유되도록 켜주세요.',
        menuPath: ['삼성헬스 앱', '설정', '헬스 커넥트', '데이터 공유 켜기'],
        storeUrl: 'https://play.google.com/store/apps/details?id=com.sec.android.app.shealth',
      },
    },
  },
  {
    id: 'nrc',
    label: '나이키 런 클럽',
    emoji: '👟',
    platforms: ['ios', 'android'],
    routeGuide: {
      ios: {
        summary: 'NRC가 러닝을 Apple 건강에 저장하도록 연결해주세요.',
        menuPath: ['NRC 앱', '프로필', '설정', '파트너 앱', 'Apple 건강 연결'],
        fallbackNote: "메뉴가 안 보이면 iPhone 설정 → 개인정보 보호 및 보안 → 건강 → Nike Run Club에서 '데이터 쓰기'를 켜도 돼요.",
        appScheme: 'nikerunclub://',
        storeUrl: 'https://apps.apple.com/kr/app/id387771637',
      },
      android: {
        summary: 'NRC가 러닝을 헬스 커넥트에 저장하도록 연결해주세요.',
        menuPath: ['NRC 앱', '프로필', '설정', '파트너 앱', '헬스 커넥트 연결'],
        fallbackNote: '메뉴가 안 보이면 헬스 커넥트 앱 → 앱 권한 → Nike Run Club에서 쓰기를 허용해도 돼요.',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.nike.plusgps',
      },
    },
  },
  {
    id: 'strava',
    label: '스트라바',
    emoji: '🏃',
    platforms: ['ios', 'android'],
    routeGuide: {
      // Menu verified on the 2026-07 Strava iOS build (owner screenshots): the old
      // '응용 프로그램, 서비스 및 기기' menu is gone; app/device connections now
      // live under the ACCOUNT section. (설정의 'Health Data' 항목은 Apple 건강
      // 연동이 아니라 스트라바 자체 심박 데이터 수집 동의 — 안내에서 제외.)
      // 2026-07 Strava iOS Health Settings (owner screenshots): 'Send to Health'가
      // 스트라바→건강 자동 저장 토글. 'Automatic uploads'는 반대 방향(건강→스트라바)
      // 이라 우리 플로우엔 불필요 — 안내에서 제외.
      ios: {
        summary: "건강 설정에서 'Send to Health'를 켜면 스트라바 활동이 자동으로 Apple 건강에 저장돼요.",
        menuPath: [
          '스트라바 앱',
          '나(You) 탭',
          '설정',
          '앱 및 기기 관리(Manage apps and devices)',
          '건강(Health)',
          "'Send to Health(건강으로 자동 전송)' 켜기",
        ],
        fallbackNote: "메뉴가 안 보이면 iPhone 설정 → 개인정보 보호 및 보안 → 건강 → Strava에서 '데이터 쓰기'를 켜도 돼요. 이미 켜져 있다면 그대로 두면 돼요.",
        appScheme: 'strava://',
        storeUrl: 'https://apps.apple.com/kr/app/id426826309',
      },
      android: {
        summary: '스트라바가 활동을 헬스 커넥트로 보내도록 연결해주세요.',
        menuPath: ['스트라바 앱', '나(You) 탭', '설정', '앱 및 기기 관리(Manage apps and devices)', '헬스 커넥트 연결'],
        fallbackNote: '메뉴가 안 보이면 헬스 커넥트 앱 → 앱 권한 → Strava에서 쓰기를 허용해도 돼요.',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.strava',
      },
    },
  },
  {
    id: 'garmin',
    label: '가민',
    emoji: '⌚',
    platforms: ['ios', 'android'],
    routeGuide: {
      ios: {
        summary: '가민 커넥트가 활동을 Apple 건강과 동기화하도록 켜주세요.',
        menuPath: ['가민 커넥트 앱', '더보기', '설정', 'Apple 건강', '동기화 켜기'],
        fallbackNote: "메뉴가 안 보이면 iPhone 설정 → 개인정보 보호 및 보안 → 건강 → Connect에서 '데이터 쓰기'를 켜도 돼요.",
        storeUrl: 'https://apps.apple.com/kr/app/id583446403',
      },
      android: {
        summary: '가민 커넥트가 활동을 헬스 커넥트와 동기화하도록 켜주세요.',
        menuPath: ['가민 커넥트 앱', '더보기', '설정', '헬스 커넥트', '동기화 켜기'],
        fallbackNote: '메뉴가 안 보이면 헬스 커넥트 앱 → 앱 권한 → Connect에서 쓰기를 허용해도 돼요.',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.garmin.android.apps.connectmobile',
      },
    },
  },
];

export function getHubLabel(platform: GuidedPlatform): string {
  return platform === 'ios' ? 'Apple 건강' : '헬스 커넥트';
}

export function getGuidedAppsForPlatform(platform: GuidedPlatform): GuidedApp[] {
  return GUIDED_APPS.filter((app) => app.platforms.includes(platform));
}

export function getGuidedAppById(appId: GuidedAppId): GuidedApp | null {
  return GUIDED_APPS.find((app) => app.id === appId) ?? null;
}

export type GuidedStepKey = 'route' | 'permission' | 'import';

export type GuidedStep = {
  key: GuidedStepKey;
  // 1-based display number, renumbered after skipping the route step.
  number: number;
  title: string;
  description: string;
  // route step only — the joined menu path + open-app targets.
  menuPathText?: string;
  // route step only — the version-proof OS-level alternative path.
  fallbackNote?: string;
  appScheme?: string;
  storeUrl?: string;
};

// Derive the wizard steps for one app on one platform. The route step is
// skipped when the app has nothing to set up there (애플워치), and the
// remaining steps renumber so the user always sees 1..N.
export function buildGuidedSteps(appId: GuidedAppId, platform: GuidedPlatform): GuidedStep[] {
  const app = getGuidedAppById(appId);
  const hubLabel = getHubLabel(platform);
  const steps: GuidedStep[] = [];

  const instruction = app?.routeGuide?.[platform];
  if (app && instruction) {
    steps.push({
      key: 'route',
      number: 0,
      title: `${app.label} 기록을 ${hubLabel}로 보내기`,
      description: `${instruction.summary} 메뉴 이름은 앱 버전에 따라 조금 다를 수 있어요.`,
      menuPathText: instruction.menuPath.join(' → '),
      fallbackNote: instruction.fallbackNote,
      appScheme: instruction.appScheme,
      storeUrl: instruction.storeUrl,
    });
  } else if (app && app.id === 'apple_watch') {
    steps.push({
      key: 'route',
      number: 0,
      title: '워치 기록은 자동으로 준비돼요',
      description: '애플워치로 기록한 운동은 자동으로 Apple 건강에 저장돼요. 따로 설정할 게 없어요.',
    });
  }

  steps.push({
    key: 'permission',
    number: 0,
    title: `러닝그라운드에 ${hubLabel} 읽기 허용`,
    description: `버튼을 누르면 ${hubLabel} 허용 팝업이 떠요. 러닝 기록을 가져올 수 있게 '모두 허용'을 선택해주세요.`,
  });

  steps.push({
    key: 'import',
    number: 0,
    title: '기록 가져오기',
    description: `${hubLabel}에 쌓인 최근 러닝을 읽어와 바로 반영돼요. 새로 달린 뒤에는 이 버튼만 다시 누르면 돼요.`,
  });

  return steps.map((step, index) => ({ ...step, number: index + 1 }));
}
