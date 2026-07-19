import type { ConnectedSource } from '@/domain';
import type { NativeHealthReadiness } from '@/integrations/nativeHealth';
import type { DevicePlatform } from './sourceCatalog';
import {
  getPlatformLabel,
  getPrimarySourceForCatalogPlatform,
  getSourceByTypeFromCatalog,
} from './sourceCatalogQueries';

export type IntegrationJourneyStep = {
  id: string;
  title: string;
  description: string;
  complete: boolean;
};

export type IntegrationJourneyModel = {
  headline: string;
  body: string;
  steps: IntegrationJourneyStep[];
  primarySource: ConnectedSource | null;
  manualSource: ConnectedSource | null;
  connectedCount: number;
  primaryConnected: boolean;
  manualConnected: boolean;
  deviceImportCompleted: boolean;
  showImportButton: boolean;
};

// Pure derivation of the journey card's copy, step list, and button visibility.
// Kept react-native-free (sourceCatalogQueries only) so it runs under the node
// test runner.
export function buildIntegrationJourneyModel({
  sources,
  platform,
  nativeHealthReadiness,
  importEligible,
  appleHealthAvailable = false,
}: {
  sources: ConnectedSource[];
  platform: DevicePlatform;
  nativeHealthReadiness: NativeHealthReadiness | null;
  importEligible?: boolean;
  // Whether the RunnigappAppleHealth native reader exists in the running
  // binary (isAppleHealthModuleAvailable()). Defaults to the HealthKit-free
  // build-48 behavior: iOS resolves no primary source.
  appleHealthAvailable?: boolean;
}): IntegrationJourneyModel {
  const platformLabel = getPlatformLabel(platform);
  const primarySource = getPrimarySourceForCatalogPlatform(sources, platform, appleHealthAvailable);
  const manualSource = getSourceByTypeFromCatalog(sources, 'manual');
  const connectedCount = sources.filter((source) => source.connected).length;
  const syncedCount = sources.filter((source) => Boolean(source.lastSyncedAt)).length;
  const pendingImportCount = sources.reduce((total, source) => total + (source.pendingImportCount ?? 0), 0);
  const primaryConnected = Boolean(primarySource?.connected);
  const manualConnected = Boolean(manualSource?.connected);
  const deviceImportCompleted = syncedCount > 0 || pendingImportCount > 0;
  const canImportFromDevice = nativeHealthReadiness?.state === 'config_ready';
  // The import button can appear whenever the platform store is readable, even
  // if the connected source is a brand app (NRC / Strava / Garmin …). Fall back
  // to the display readiness when the caller doesn't pass an explicit signal.
  const showImportButton = importEligible ?? canImportFromDevice;

  const headline = !primaryConnected
    ? `${platformLabel}에서는 ${primarySource?.displayName ?? '기본 건강 허브'}부터 연결하면 돼.`
    : canImportFromDevice
      ? `${primarySource?.displayName ?? '기본 건강 허브'}는 준비됐고, 이제 기기 기록을 가져오면 돼.`
      : manualConnected
        ? '연동으로 안 들어온 기록은 수동 기록으로 바로 채울 수 있어.'
        : '소스 연결 다음엔 수동 입력 안전망까지 열어두면 든든해.';

  const body = !primaryConnected
    ? '기본 연동 소스를 먼저 붙여두면 이후 기기 기록 가져오기, 홈 요약까지 한 흐름으로 연결돼.'
    : canImportFromDevice
      ? "'기기에서 기록 가져오기' 버튼을 누르면 기기에 쌓인 러닝 기록을 바로 가져올 수 있어."
      : manualConnected
        ? '가져오기로 안 들어온 날도 직접 입력만 하면 기록이 바로 반영돼.'
        : '가져오기와 별개로 수동 입력 경로를 열어 두면 기록이 빌 일이 없어.';

  const steps: IntegrationJourneyStep[] = [
    {
      id: 'primary',
      title: `${primarySource?.displayName ?? '기본 건강 허브'} 연결`,
      description: primaryConnected
        ? '기본 기록 소스가 준비돼 있어.'
        : `${platformLabel}에서 가장 먼저 연결할 기본 소스야.`,
      complete: primaryConnected,
    },
    {
      id: 'import',
      title: '기기 기록 가져오기',
      description: canImportFromDevice
        ? "'기기에서 기록 가져오기' 버튼을 누르면 기기에 쌓인 러닝 기록이 들어와."
        : primaryConnected
          ? "연동 관리에서 '기기에서 기록 가져오기' 버튼을 누르면 기록이 들어와."
          : '기본 소스를 연결하면 그다음 단계로 넘어갈 수 있어.',
      complete: primaryConnected && deviceImportCompleted,
    },
    {
      id: 'manual',
      title: manualConnected ? '수동 입력 준비 완료' : '수동 입력 안전망 열기',
      description: manualConnected
        ? '가져오기가 비는 날에는 수동 기록 추가로 바로 이어갈 수 있어.'
        : '가져오기와 별개로 수동 입력 경로를 열어 두면 기록이 빌 일이 없어.',
      complete: manualConnected,
    },
  ];

  return {
    headline,
    body,
    steps,
    primarySource,
    manualSource,
    connectedCount,
    primaryConnected,
    manualConnected,
    deviceImportCompleted,
    showImportButton,
  };
}
