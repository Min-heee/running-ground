import Constants, { AppOwnership } from 'expo-constants';
import { NativeModules, Platform } from 'react-native';
import { getRunnigappHealthConnectModule } from '../../modules/runnigapp-health-connect';
import { ConnectedSource, RunSourceType } from '@/domain';
import { syncIntegrationSources } from '@/services';
import { IntegrationSyncResponse } from '@/lib/api/types';
import { ImportableRunSourceType, NormalizedProviderRun, submitProviderRuns } from './provider';

export type NativeHealthSourceType = Extract<RunSourceType, 'apple_health' | 'health_connect'>;

export type NativeHealthReadinessState =
  | 'mobile_required'
  | 'connect_source_first'
  | 'wrong_platform'
  | 'needs_custom_build'
  | 'config_ready';

export type NativeHealthReadiness = {
  sourceType: NativeHealthSourceType;
  title: string;
  description: string;
  badgeLabel: string;
  state: NativeHealthReadinessState;
  steps: string[];
  expectedPlatform: 'ios' | 'android';
  connected: boolean;
};

type NativeHealthBridgeRun = {
  externalId?: string;
  sourceLabel?: string;
  date?: string;
  startedAt?: string;
  endedAt?: string;
  distanceKm?: number;
  distanceMeters?: number;
  pace?: string;
  paceMinutesPerKm?: number;
  paceSecondsPerKm?: number;
  durationSeconds?: number;
};

type NativeHealthBridgeModule = {
  isAvailable?: () => boolean | Promise<boolean>;
  readRuns?: (input?: {
    limit?: number;
    sourceType?: NativeHealthSourceType;
  }) => Promise<NativeHealthBridgeRun[]>;
};

export type NativeHealthImportResult = {
  sourceType: NativeHealthSourceType;
  sourceLabel: string;
  fetchedRuns: number;
  queuedRuns: number;
  syncResult: IntegrationSyncResponse | null;
};

const PLATFORM_COPY: Record<NativeHealthSourceType, {
  title: string;
  expectedPlatform: 'ios' | 'android';
  connectStep: string;
  configReadyDescription: string;
}> = {
  apple_health: {
    title: 'Apple Health 자동 연동',
    expectedPlatform: 'ios',
    connectStep: '연동 관리에서 Apple Health 연결을 먼저 켜세요.',
    configReadyDescription: 'NRC로 달린 뒤 Apple 건강 앱에 운동이 들어온 걸 확인하고, 여기서 바로 가져오면 돼.',
  },
  health_connect: {
    title: 'Health Connect 자동 연동',
    expectedPlatform: 'android',
    connectStep: '연동 관리에서 Health Connect 연결을 먼저 켜세요.',
    configReadyDescription: '앱 권한 설정은 준비됐고, 다음 단계는 실제 Health Connect reader를 붙여 기기 기록을 가져오는 것입니다.',
  },
};

function isExpoGoRuntime() {
  return Constants.appOwnership === AppOwnership.Expo;
}

function getSourceLabel(sourceType: NativeHealthSourceType) {
  return sourceType === 'apple_health' ? 'Apple Health' : 'Health Connect';
}

export function isNativeHealthSource(sourceType: RunSourceType): sourceType is NativeHealthSourceType {
  return sourceType === 'apple_health' || sourceType === 'health_connect';
}

export function getPreferredNativeHealthSource(): NativeHealthSourceType | null {
  if (Platform.OS === 'ios') {
    return 'apple_health';
  }

  if (Platform.OS === 'android') {
    return 'health_connect';
  }

  return null;
}

export function getNativeHealthReadiness(
  sourceType: NativeHealthSourceType,
  connectedSources: ConnectedSource[],
): NativeHealthReadiness {
  const metadata = PLATFORM_COPY[sourceType];
  const source = connectedSources.find((entry) => entry.sourceType === sourceType);
  const connected = Boolean(source?.connected);
  const currentPlatform = Platform.OS;

  if (currentPlatform !== 'ios' && currentPlatform !== 'android') {
    return {
      sourceType,
      title: metadata.title,
      description: '실제 건강 데이터 연동은 모바일 빌드에서만 확인할 수 있어요.',
      badgeLabel: '모바일에서 확인',
      state: 'mobile_required',
      expectedPlatform: metadata.expectedPlatform,
      connected,
      steps: [
        'iPhone 또는 Android 빌드에서 연동 상태를 확인하세요.',
        metadata.connectStep,
      ],
    };
  }

  if (!connected) {
    return {
      sourceType,
      title: metadata.title,
      description: '기기 권한 준비 전에 앱 안에서 이 소스를 먼저 연결해야 해요.',
      badgeLabel: '연결 먼저',
      state: 'connect_source_first',
      expectedPlatform: metadata.expectedPlatform,
      connected,
      steps: [
        metadata.connectStep,
        '연결 후 이 화면에서 기기 자동 연동 준비 상태를 다시 확인하세요.',
      ],
    };
  }

  if (currentPlatform !== metadata.expectedPlatform) {
    return {
      sourceType,
      title: metadata.title,
      description: `${metadata.expectedPlatform === 'ios' ? 'iPhone' : 'Android'} 빌드에서 확인해야 하는 자동 연동 경로예요.`,
      badgeLabel: '다른 플랫폼용',
      state: 'wrong_platform',
      expectedPlatform: metadata.expectedPlatform,
      connected,
      steps: [
        `${metadata.expectedPlatform === 'ios' ? 'iPhone' : 'Android'} 기기에서 이 연동 경로를 테스트하세요.`,
        metadata.connectStep,
      ],
    };
  }

  if (isExpoGoRuntime()) {
    return {
      sourceType,
      title: metadata.title,
      description: 'Expo Go에서는 이 네이티브 건강 연동 권한을 실제로 붙일 수 없어서 개발 빌드나 출시 빌드가 필요해요.',
      badgeLabel: '개발 빌드 필요',
      state: 'needs_custom_build',
      expectedPlatform: metadata.expectedPlatform,
      connected,
      steps: [
        'EAS development build 또는 내부 테스트 빌드로 앱을 설치하세요.',
        '그 빌드에서 건강 데이터 권한 요청과 실제 동기화 reader를 붙이면 됩니다.',
      ],
    };
  }

  return {
    sourceType,
    title: metadata.title,
    description: metadata.configReadyDescription,
    badgeLabel: '설정 준비됨',
    state: 'config_ready',
    expectedPlatform: metadata.expectedPlatform,
    connected,
    steps: [
      sourceType === 'apple_health'
        ? '오늘 러닝은 NRC로 기록하고, 끝난 뒤 Apple 건강 앱에 운동이 들어왔는지 먼저 확인하세요.'
        : '이제 네이티브 reader에서 러닝 기록을 읽어 shared import payload로 변환하면 됩니다.',
      sourceType === 'apple_health'
        ? '그다음 기기 기록 가져오기를 누르면 Apple Health 러닝 기록을 읽어오고 바로 동기화돼요.'
        : '변환된 기록은 기존 backend import/sync 파이프라인으로 바로 보낼 수 있어요.',
    ],
  };
}

export function getRecommendedNativeHealthReadiness(connectedSources: ConnectedSource[]): NativeHealthReadiness | null {
  const preferredSource = getPreferredNativeHealthSource();

  if (!preferredSource) {
    return null;
  }

  return getNativeHealthReadiness(preferredSource, connectedSources);
}

export type NativeHealthImportEligibility = {
  sourceType: NativeHealthSourceType;
  // Whether the device import button should be shown / be tappable.
  canImport: boolean;
  // Present when canImport is false, so the UI can explain why.
  blockedReason?: string;
};

// Decide whether the platform-native health store import can run, INDEPENDENTLY
// of which brand source (NRC / Strava / Garmin) the user selected as
// their display source. Brand apps route their workouts INTO the platform store
// (iOS → Apple Health, Android → Health Connect) anyway, so as long as we're on
// the right platform in a custom build with the reader linked, we can read the
// device. We deliberately do NOT require the platform source itself
// (apple_health / health_connect) to be the connected exclusive source.
export function getNativeHealthImportEligibility(): NativeHealthImportEligibility | null {
  const preferredSource = getPreferredNativeHealthSource();

  if (!preferredSource) {
    return null;
  }

  if (isExpoGoRuntime()) {
    return {
      sourceType: preferredSource,
      canImport: false,
      blockedReason: 'Expo Go에서는 기기 건강 데이터를 읽을 수 없어. 개발 빌드나 출시 빌드에서 가져와줘.',
    };
  }

  return {
    sourceType: preferredSource,
    canImport: true,
  };
}

function resolveNativeHealthBridgeModule(sourceType: NativeHealthSourceType): NativeHealthBridgeModule | null {
  // Mixed resolution. Both paths return null when the native side is not linked into this build
  // (e.g. Expo Go) so we degrade to the "reader 모듈이 아직 이 빌드에 연결되지 않았어" error
  // instead of crashing.
  if (sourceType === 'apple_health') {
    // iOS Apple Health is the legacy ObjC RCT module written by plugins/withHealthAccess.js, so it
    // surfaces through React Native's NativeModules registry rather than expo's requireNativeModule.
    return (NativeModules.RunnigappAppleHealth as NativeHealthBridgeModule | undefined) ?? null;
  }

  // Android Health Connect is the Expo Kotlin module, resolved via requireNativeModule(...) inside
  // modules/runnigapp-health-connect/index.ts (mirroring modules/match-progress-uploader).
  return getRunnigappHealthConnectModule() as NativeHealthBridgeModule | null;
}

function toDateOnly(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error('기기 기록 날짜 형식이 올바르지 않아.');
  }

  return parsedDate.toISOString().slice(0, 10);
}

function formatPaceFromMinutesPerKm(minutesPerKm: number) {
  const totalSeconds = Math.max(1, Math.round(minutesPerKm * 60));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}/km`;
}

function normalizeIsoDateTime(value: string, label: string, index: number) {
  const parsedTime = new Date(value);

  if (Number.isNaN(parsedTime.getTime())) {
    throw new Error(`기기 기록 ${index + 1}번의 ${label} 형식이 올바르지 않아.`);
  }

  return parsedTime.toISOString();
}

function normalizeBridgeRun(run: NativeHealthBridgeRun, index: number): NormalizedProviderRun {
  const dateValue = typeof run.date === 'string' && run.date.trim()
    ? run.date
    : typeof run.startedAt === 'string' && run.startedAt.trim()
      ? run.startedAt
      : '';

  if (!dateValue) {
    throw new Error(`기기 기록 ${index + 1}번에 날짜가 없어.`);
  }

  const distanceKm = typeof run.distanceKm === 'number'
    ? run.distanceKm
    : typeof run.distanceMeters === 'number'
      ? run.distanceMeters / 1000
      : NaN;

  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    throw new Error(`기기 기록 ${index + 1}번의 거리가 올바르지 않아.`);
  }

  const pace = typeof run.pace === 'string' && run.pace.trim()
    ? run.pace.trim()
    : typeof run.paceMinutesPerKm === 'number' && Number.isFinite(run.paceMinutesPerKm)
      ? formatPaceFromMinutesPerKm(run.paceMinutesPerKm)
      : typeof run.paceSecondsPerKm === 'number' && Number.isFinite(run.paceSecondsPerKm)
        ? formatPaceFromMinutesPerKm(run.paceSecondsPerKm / 60)
        : typeof run.durationSeconds === 'number' && Number.isFinite(run.durationSeconds)
          ? formatPaceFromMinutesPerKm(run.durationSeconds / 60 / distanceKm)
          : '';

  if (!pace) {
    throw new Error(`기기 기록 ${index + 1}번의 페이스를 계산할 수 없어.`);
  }

  const startedAt = typeof run.startedAt === 'string' && run.startedAt.trim()
    ? normalizeIsoDateTime(run.startedAt, '시작 시각', index)
    : undefined;
  const durationSeconds = typeof run.durationSeconds === 'number' && Number.isFinite(run.durationSeconds) && run.durationSeconds > 0
    ? Math.round(run.durationSeconds)
    : undefined;
  const endedAt = typeof run.endedAt === 'string' && run.endedAt.trim()
    ? normalizeIsoDateTime(run.endedAt, '종료 시각', index)
    : startedAt && durationSeconds
      ? new Date(new Date(startedAt).getTime() + durationSeconds * 1000).toISOString()
      : undefined;

  return {
    ...(run.externalId ? { externalId: String(run.externalId).trim() } : {}),
    ...(typeof run.sourceLabel === 'string' && run.sourceLabel.trim()
      ? { sourceLabel: run.sourceLabel.trim() }
      : {}),
    date: toDateOnly(dateValue),
    distanceKm: Number(distanceKm.toFixed(1)),
    pace,
    ...(startedAt ? { startedAt } : {}),
    ...(endedAt ? { endedAt } : {}),
    ...(typeof durationSeconds === 'number' ? { durationSeconds } : {}),
  };
}

export async function readRunsFromNativeHealthSource(
  sourceType: NativeHealthSourceType,
): Promise<NormalizedProviderRun[]> {
  const module = resolveNativeHealthBridgeModule(sourceType);

  if (!module?.readRuns) {
    throw new Error(`${getSourceLabel(sourceType)} reader 모듈이 아직 이 빌드에 연결되지 않았어.`);
  }

  if (module.isAvailable) {
    const available = await module.isAvailable();

    if (!available) {
      throw new Error(`${getSourceLabel(sourceType)}를 지금 기기에서 사용할 수 없어. 권한 또는 기기 환경을 먼저 확인해줘.`);
    }
  }

  const runs = await module.readRuns({
    limit: 30,
    sourceType,
  });

  if (!Array.isArray(runs)) {
    throw new Error(`${getSourceLabel(sourceType)} reader 응답 형식이 올바르지 않아.`);
  }

  return runs.map((run, index) => normalizeBridgeRun(run, index));
}

export async function importRunsFromNativeHealthSource(
  sourceType: NativeHealthSourceType,
): Promise<NativeHealthImportResult> {
  // Gate on platform/runtime eligibility only — NOT on which brand source is
  // connected. Brand apps (NRC / Strava / Garmin / Samsung Health …) write their
  // workouts into the platform health store, so we read that store directly.
  const eligibility = getNativeHealthImportEligibility();

  if (!eligibility?.canImport) {
    throw new Error(eligibility?.blockedReason ?? '이 기기에서는 자동 건강 연동을 바로 실행할 수 없어.');
  }

  const runs = await readRunsFromNativeHealthSource(sourceType);

  if (runs.length === 0) {
    return {
      sourceType,
      sourceLabel: getSourceLabel(sourceType),
      fetchedRuns: 0,
      queuedRuns: 0,
      syncResult: null,
    };
  }

  const queueResult = await submitProviderRuns(sourceType as ImportableRunSourceType, runs);
  const syncResult = await syncIntegrationSources();

  return {
    sourceType,
    sourceLabel: getSourceLabel(sourceType),
    fetchedRuns: runs.length,
    queuedRuns: queueResult.queuedRuns,
    syncResult,
  };
}

export async function importRunsFromRecommendedNativeHealthSource(): Promise<NativeHealthImportResult> {
  const preferredSource = getPreferredNativeHealthSource();

  if (!preferredSource) {
    throw new Error('이 기기에서는 자동 건강 연동을 바로 실행할 수 없어.');
  }

  return importRunsFromNativeHealthSource(preferredSource);
}
