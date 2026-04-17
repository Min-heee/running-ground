import Constants, { AppOwnership } from 'expo-constants';
import { NativeModules, Platform } from 'react-native';
import { ConnectedSource, RunSourceType } from '@/domain/types';
import { syncIntegrationSources } from '@/lib/api/services';
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
  date?: string;
  startedAt?: string;
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
    configReadyDescription: '이 iPhone 빌드에서는 실제 HealthKit reader로 Apple Health 러닝 기록을 읽어올 수 있어.',
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
        ? '권한 허용 후 기기 기록 가져오기를 누르면 Apple Health 러닝 기록을 읽어올 수 있어요.'
        : '이제 네이티브 reader에서 러닝 기록을 읽어 shared import payload로 변환하면 됩니다.',
      sourceType === 'apple_health'
        ? '가져온 기록은 기존 backend import/sync 파이프라인으로 바로 반영돼요.'
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

function resolveNativeHealthBridgeModule(sourceType: NativeHealthSourceType): NativeHealthBridgeModule | null {
  if (sourceType === 'apple_health') {
    return (NativeModules.RunnigappAppleHealth ?? null) as NativeHealthBridgeModule | null;
  }

  return (NativeModules.RunnigappHealthConnect ?? null) as NativeHealthBridgeModule | null;
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

  return {
    ...(run.externalId ? { externalId: String(run.externalId).trim() } : {}),
    date: toDateOnly(dateValue),
    distanceKm: Number(distanceKm.toFixed(1)),
    pace,
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
  connectedSources: ConnectedSource[],
): Promise<NativeHealthImportResult> {
  const readiness = getNativeHealthReadiness(sourceType, connectedSources);

  if (readiness.state !== 'config_ready') {
    throw new Error(readiness.description);
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

export async function importRunsFromRecommendedNativeHealthSource(
  connectedSources: ConnectedSource[],
): Promise<NativeHealthImportResult> {
  const preferredSource = getPreferredNativeHealthSource();

  if (!preferredSource) {
    throw new Error('이 기기에서는 자동 건강 연동을 바로 실행할 수 없어.');
  }

  return importRunsFromNativeHealthSource(preferredSource, connectedSources);
}
