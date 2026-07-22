import Constants, { AppOwnership } from 'expo-constants';
import { NativeModules, Platform } from 'react-native';
import {
  getRunnigappHealthConnectModule,
  type NativeHealthBridgeRun,
} from '../../modules/runnigapp-health-connect';
import { isAppleHealthModuleAvailable } from './appleHealthAvailability';
import { ConnectedSource, RunSourceType } from '@/domain';
import { syncIntegrationSources } from '@/services';
import { IntegrationSyncResponse } from '@/lib/api/types';
import { partitionRunsByLaunchCutoff } from './importCutoff';
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
  // Post-source-filter count when an app filter was applied — "records that
  // belong to the selected app", so every downstream message stays per-app.
  fetchedRuns: number;
  queuedRuns: number;
  // Records read off the device but dated before the launch cutoff — never queued
  // (see importCutoff.ts; the server enforces the same cutoff authoritatively).
  skippedPreLaunchRuns: number;
  syncResult: IntegrationSyncResponse | null;
  // Present when a guided per-app filter ran: the app's display label and how
  // many hub records were excluded for belonging to OTHER apps.
  appFilterLabel?: string;
  excludedBySourceFilter?: number;
};

// Per-app narrowing for the guided connect flow: multiple apps all write into
// the one platform hub, so step 3 filters the hub read down to the app the
// user actually picked. `matches` receives each record's sourceLabel (iOS app
// display name / Android package name).
export type NativeHealthSourceFilter = {
  label: string;
  matches: (sourceLabel: string | undefined) => boolean;
};

const PLATFORM_COPY: Record<NativeHealthSourceType, {
  title: string;
  expectedPlatform: 'ios' | 'android';
  connectStep: string;
  configReadyDescription: string;
}> = {
  apple_health: {
    title: 'Apple 건강 연동',
    expectedPlatform: 'ios',
    connectStep: '연동 관리에서 Apple 건강 연결을 먼저 켜세요.',
    configReadyDescription: "러닝 앱(NRC 등)으로 달린 기록이 Apple 건강에 들어온 걸 확인하고, '기기에서 기록 가져오기' 버튼으로 가져오면 돼요.",
  },
  health_connect: {
    title: '헬스 커넥트 연동',
    expectedPlatform: 'android',
    connectStep: '연동 관리에서 헬스 커넥트 연결을 먼저 켜세요.',
    configReadyDescription: "권한 준비는 끝났어요. '기기에서 기록 가져오기' 버튼을 누르면 헬스 커넥트에 쌓인 러닝 기록을 읽어와요.",
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
  // iOS is gated on the RUNTIME presence of the RunnigappAppleHealth native
  // module, not on Platform.OS alone: build 48 shipped HealthKit-free (App
  // Store 2.5.1), build 49+ restores the reader via plugins/withHealthAccess.js,
  // and this same OTA'd JS serves both binaries. On a HealthKit-free binary
  // every iOS caller takes the same graceful null path a device without the
  // native module already took.
  if (Platform.OS === 'ios') {
    return isAppleHealthModuleAvailable() ? 'apple_health' : null;
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
        '연결 후 이 화면에서 기기 기록 가져오기 준비 상태를 다시 확인하세요.',
      ],
    };
  }

  if (currentPlatform !== metadata.expectedPlatform) {
    return {
      sourceType,
      title: metadata.title,
      description: `${metadata.expectedPlatform === 'ios' ? 'iPhone' : 'Android'} 기기에서 쓸 수 있는 연동 경로예요.`,
      badgeLabel: '다른 플랫폼용',
      state: 'wrong_platform',
      expectedPlatform: metadata.expectedPlatform,
      connected,
      steps: [
        `${metadata.expectedPlatform === 'ios' ? 'iPhone' : 'Android'} 기기에서 이 연동을 사용할 수 있어요.`,
        metadata.connectStep,
      ],
    };
  }

  if (isExpoGoRuntime()) {
    return {
      sourceType,
      title: metadata.title,
      description: '지금 실행 중인 미리보기 환경에서는 건강 데이터 권한을 쓸 수 없어서 정식 설치된 앱이 필요해요.',
      badgeLabel: '정식 앱 필요',
      state: 'needs_custom_build',
      expectedPlatform: metadata.expectedPlatform,
      connected,
      steps: [
        '앱스토어 또는 테스트 배포로 설치한 앱에서 다시 시도해 주세요.',
        '정식 설치된 앱에서 건강 데이터 권한을 허용하면 기록을 가져올 수 있어요.',
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
        ? '러닝 앱(NRC 등)으로 달린 뒤 Apple 건강 앱에 운동이 들어왔는지 먼저 확인하세요.'
        : '삼성헬스 등 러닝 앱 기록이 헬스 커넥트에 들어왔는지 먼저 확인하세요.',
      sourceType === 'apple_health'
        ? "'기기에서 기록 가져오기'를 누르면 Apple 건강 러닝 기록을 읽어와 바로 반영돼요."
        : "'기기에서 기록 가져오기'를 누르면 헬스 커넥트 러닝 기록을 읽어와 바로 반영돼요.",
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
      blockedReason: '지금 실행 중인 미리보기 환경에서는 기기 건강 데이터를 읽을 수 없어요. 정식 설치된 앱에서 가져와주세요.',
    };
  }

  return {
    sourceType: preferredSource,
    canImport: true,
  };
}

function resolveNativeHealthBridgeModule(sourceType: NativeHealthSourceType): NativeHealthBridgeModule | null {
  // Mixed resolution. Both paths return null when the native side is not linked into this build
  // (Expo Go, or the HealthKit-free build 48) so we degrade to the "기록 읽기를 지원하지 않아"
  // error instead of crashing.
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
    throw new Error('기기 기록 날짜 형식이 올바르지 않아요.');
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
    throw new Error(`기기 기록 ${index + 1}번의 ${label} 형식이 올바르지 않아요.`);
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
    throw new Error(`기기 기록 ${index + 1}번에 날짜가 없어요.`);
  }

  const distanceKm = typeof run.distanceKm === 'number'
    ? run.distanceKm
    : typeof run.distanceMeters === 'number'
      ? run.distanceMeters / 1000
      : NaN;

  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    throw new Error(`기기 기록 ${index + 1}번의 거리가 올바르지 않아요.`);
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
    throw new Error(`기기 기록 ${index + 1}번의 페이스를 계산할 수 없어요.`);
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
    throw new Error(`이 앱 버전에서는 ${getSourceLabel(sourceType)} 기록 읽기를 지원하지 않아요. 앱을 최신 버전으로 업데이트해주세요.`);
  }

  if (module.isAvailable) {
    const available = await module.isAvailable();

    if (!available) {
      throw new Error(`${getSourceLabel(sourceType)}를 지금 기기에서 사용할 수 없어요. 권한 또는 기기 환경을 먼저 확인해주세요.`);
    }
  }

  const runs = await module.readRuns({
    limit: 30,
    sourceType,
  });

  if (!Array.isArray(runs)) {
    throw new Error(`${getSourceLabel(sourceType)} reader 응답 형식이 올바르지 않아요.`);
  }

  return runs.map((run, index) => normalizeBridgeRun(run, index));
}

// Guided-connect step 2: surface the OS read-permission prompt WITHOUT importing.
// Both native readers request authorization inside readRuns (iOS
// requestAuthorizationToShareTypes, Android the PermissionController contract),
// so a probe read is the supported way to raise the sheet on demand. NOTE the
// HealthKit caveat: iOS never reveals read-grant status — a denied permission
// still resolves (with hidden records), so a resolved probe means "요청 완료",
// not "허용 확인됨"; the wizard copy is written accordingly.
export async function requestNativeHealthReadPermission(): Promise<void> {
  const eligibility = getNativeHealthImportEligibility();

  if (!eligibility?.canImport) {
    throw new Error(eligibility?.blockedReason ?? '이 기기에서는 건강 기록 연동을 사용할 수 없어요.');
  }

  await readRunsFromNativeHealthSource(eligibility.sourceType);
}

export async function importRunsFromNativeHealthSource(
  sourceType: NativeHealthSourceType,
  options: { sourceFilter?: NativeHealthSourceFilter } = {},
): Promise<NativeHealthImportResult> {
  // Gate on platform/runtime eligibility only — NOT on which brand source is
  // connected. Brand apps (NRC / Strava / Garmin / Samsung Health …) write their
  // workouts into the platform health store, so we read that store directly.
  const eligibility = getNativeHealthImportEligibility();

  if (!eligibility?.canImport) {
    throw new Error(eligibility?.blockedReason ?? '이 기기에서는 건강 기록 가져오기를 실행할 수 없어요.');
  }

  const allRuns = await readRunsFromNativeHealthSource(sourceType);

  const sourceFilter = options.sourceFilter;
  const runs = sourceFilter
    ? allRuns.filter((run) => sourceFilter.matches(run.sourceLabel))
    : allRuns;
  const appFilterFields = sourceFilter
    ? {
      appFilterLabel: sourceFilter.label,
      excludedBySourceFilter: allRuns.length - runs.length,
    }
    : {};

  if (runs.length === 0) {
    return {
      sourceType,
      sourceLabel: getSourceLabel(sourceType),
      fetchedRuns: 0,
      queuedRuns: 0,
      skippedPreLaunchRuns: 0,
      syncResult: null,
      ...appFilterFields,
    };
  }

  // Launch-date cutoff (client mirror): drop pre-launch-dated records AFTER
  // readRuns() normalization and BEFORE anything is queued to the backend. The
  // server enforces the same cutoff authoritatively at the import route
  // (backend/src/lib/integrationImportCutoff.mjs), so this is UX-side trimming —
  // it keeps the payload lean and lets the messaging explain what was excluded.
  const { importableRuns, skippedPreLaunchRuns } = partitionRunsByLaunchCutoff(runs);

  if (importableRuns.length === 0) {
    // Every fetched record predates launch: nothing to queue (the import endpoint
    // rejects empty batches), so report the read + skip counts for honest messaging.
    return {
      sourceType,
      sourceLabel: getSourceLabel(sourceType),
      fetchedRuns: runs.length,
      queuedRuns: 0,
      skippedPreLaunchRuns,
      syncResult: null,
      ...appFilterFields,
    };
  }

  const queueResult = await submitProviderRuns(sourceType as ImportableRunSourceType, importableRuns);
  const syncResult = await syncIntegrationSources();

  return {
    sourceType,
    sourceLabel: getSourceLabel(sourceType),
    fetchedRuns: runs.length,
    queuedRuns: queueResult.queuedRuns,
    skippedPreLaunchRuns,
    syncResult,
    ...appFilterFields,
  };
}

export async function importRunsFromRecommendedNativeHealthSource(
  options: { sourceFilter?: NativeHealthSourceFilter } = {},
): Promise<NativeHealthImportResult> {
  const preferredSource = getPreferredNativeHealthSource();

  if (!preferredSource) {
    throw new Error('이 기기에서는 건강 기록 가져오기를 실행할 수 없어요.');
  }

  return importRunsFromNativeHealthSource(preferredSource, options);
}
