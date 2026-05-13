export type RunSourceType =
  | 'apple_health'
  | 'health_connect'
  | 'garmin'
  | 'strava'
  | 'nrc'
  | 'mynb'
  | 'runningground'
  | 'manual';

export type ConnectedSource = {
  sourceType: RunSourceType;
  displayName: string;
  connected: boolean;
  connectionStatus: 'connected' | 'planned';
  lastSyncedAt?: string;
  pendingImportCount?: number;
  recommendedPlatform?: 'ios' | 'android' | 'all';
};
