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
  // Label for the open button when it doesn't open the brand app itself
  // (e.g. NRC's setup happens in the iOS 건강 permissions, so the button opens
  // the 건강 앱). Defaults to '앱 열기'.
  openLabel?: string;
  storeUrl: string;
};

// Brand mark for the app chip. Icon-font glyphs where the bundled fonts have
// them (apple/strava in FontAwesome5 Brands), tintable white-on-transparent
// PNG assets where they don't (nike/garmin — assets/branding/brand-*.png,
// OTA-shippable). color/tint omitted → the chip's current text color.
export type GuidedAppIcon =
  | { kind: 'fa5'; name: string; color?: string }
  | { kind: 'mci'; name: string; color?: string }
  | { kind: 'image'; asset: 'nike' | 'garmin'; tint?: string };

export type GuidedApp = {
  id: GuidedAppId;
  label: string;
  icon: GuidedAppIcon;
  platforms: GuidedPlatform[];
  // Per-platform instructions for routing the app's workouts into the hub.
  // null → nothing to set up (the watch writes to the hub automatically).
  routeGuide: Partial<Record<GuidedPlatform, GuideInstruction>> | null;
};

const GUIDED_APPS: GuidedApp[] = [
  {
    id: 'apple_watch',
    label: '애플워치',
    icon: { kind: 'fa5', name: 'apple' },
    platforms: ['ios'],
    // Watch workouts land in Apple 건강 automatically — no routing step.
    routeGuide: null,
  },
  {
    id: 'samsung_health',
    label: '삼성헬스·갤럭시워치',
    icon: { kind: 'mci', name: 'heart-pulse', color: '#F0437F' },
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
    icon: { kind: 'image', asset: 'nike' },
    platforms: ['ios', 'android'],
    routeGuide: {
      // 2026-07 NRC iOS (owner-verified, two screenshot rounds): the app has NO
      // in-app Apple-Health menu anymore — 파트너 lists Garmin/COROS/NTC only,
      // and '운동 정보' is Nike's own data-collection consent. The health link
      // is managed ENTIRELY by the iOS permission switch, so that OS path IS
      // the primary path and the open button targets the 건강 앱.
      ios: {
        summary: 'NRC는 앱 안에 건강 연동 메뉴가 없어요. iPhone의 건강 권한에서 켜주세요.',
        menuPath: ['iPhone 설정', '개인정보 보호 및 보안', '건강', 'Nike Run Club', "'데이터 쓰기' 모두 켜기"],
        fallbackNote: '목록에 Nike Run Club이 없으면 NRC로 러닝을 한 번 기록하면 나타나요. 건강 앱 → 프로필 → 앱에서도 같은 설정을 할 수 있어요.',
        appScheme: 'x-apple-health://',
        openLabel: '건강 앱 열기',
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
    icon: { kind: 'fa5', name: 'strava', color: '#FC4C02' },
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
    icon: { kind: 'image', asset: 'garmin', tint: '#007CC3' },
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

// Which hub records belong to which app. Matched (case-insensitive) against each
// record's sourceLabel — iOS carries the WRITING app's display name ("Strava",
// "○○의 Apple Watch", NRC normalized to 'NRC' by the reader), Android the
// package name ("com.strava", "com.sec.android.app.shealth", …).
// garmin: the iOS app's display name is just 'Connect', hence the exact-match
// alternative — a bare /connect/i would swallow Android's 'Health Connect'
// fallback label.
const GUIDED_APP_SOURCE_PATTERNS: Record<GuidedAppId, RegExp[]> = {
  apple_watch: [/apple\s*watch/i],
  samsung_health: [/samsung|삼성|shealth/i],
  nrc: [/nrc|nike/i],
  strava: [/strava/i],
  garmin: [/garmin/i, /^connect$/i],
};

export function matchesGuidedAppSource(appId: GuidedAppId, sourceLabel: string | undefined): boolean {
  if (!sourceLabel) {
    return false;
  }

  const label = sourceLabel.trim();
  return GUIDED_APP_SOURCE_PATTERNS[appId].some((pattern) => pattern.test(label));
}

export type GuidedImportSourceFilter = {
  label: string;
  matches: (sourceLabel: string | undefined) => boolean;
};

// The filter handed to the device import so step 3 pulls ONLY the selected
// app's records out of the hub (multiple apps all write into the same hub).
export function getGuidedImportSourceFilter(appId: GuidedAppId): GuidedImportSourceFilter {
  const app = getGuidedAppById(appId);

  return {
    label: app?.label ?? appId,
    matches: (sourceLabel) => matchesGuidedAppSource(appId, sourceLabel),
  };
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
  // Open-button label override (default '앱 열기').
  openLabel?: string;
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
      openLabel: instruction.openLabel,
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
    description: `${hubLabel}에 쌓인 러닝 중 ${app?.label ?? '선택한 앱'} 기록만 골라와요. 새로 달린 뒤에는 이 버튼만 다시 누르면 돼요.`,
  });

  return steps.map((step, index) => ({ ...step, number: index + 1 }));
}
