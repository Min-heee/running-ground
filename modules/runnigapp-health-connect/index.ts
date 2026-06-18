import { requireNativeModule } from 'expo-modules-core';

// Shape of a single workout the native Health Connect reader returns. Mirrors the
// `NativeHealthBridgeRun` contract consumed by src/integrations/nativeHealth.ts.
export type NativeHealthBridgeRun = {
  externalId?: string;
  sourceLabel?: string;
  date?: string;
  startedAt?: string;
  endedAt?: string;
  distanceKm?: number;
  distanceMeters?: number;
  durationSeconds?: number;
};

export type ReadRunsInput = {
  limit?: number;
  sourceType?: 'apple_health' | 'health_connect';
};

export type RunnigappHealthConnectNativeModule = {
  isAvailable(): Promise<boolean>;
  readRuns(input?: ReadRunsInput): Promise<NativeHealthBridgeRun[]>;
};

let nativeModule: RunnigappHealthConnectNativeModule | null = null;

try {
  nativeModule = requireNativeModule<RunnigappHealthConnectNativeModule>('RunnigappHealthConnect');
} catch {
  // Missing on Expo Go / non-Android / older builds without the native module linked.
  nativeModule = null;
}

export function getRunnigappHealthConnectModule(): RunnigappHealthConnectNativeModule | null {
  return nativeModule;
}
