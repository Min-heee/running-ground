import type { ConnectedSource } from '@/domain';

export const connectedSources: ConnectedSource[] = [
  { sourceType: 'apple_health', displayName: 'Apple Health', connected: true, connectionStatus: 'connected', lastSyncedAt: '2026-03-31 14:02', recommendedPlatform: 'ios' },
  { sourceType: 'manual', displayName: 'Manual', connected: true, connectionStatus: 'connected', lastSyncedAt: '2026-03-30 22:10', recommendedPlatform: 'all' },
  { sourceType: 'health_connect', displayName: 'Health Connect', connected: false, connectionStatus: 'planned', recommendedPlatform: 'android' },
  { sourceType: 'garmin', displayName: 'Garmin', connected: false, connectionStatus: 'planned', recommendedPlatform: 'all' },
  { sourceType: 'strava', displayName: 'Strava', connected: false, connectionStatus: 'planned', recommendedPlatform: 'all' },
  { sourceType: 'nrc', displayName: 'Nike Run Club', connected: false, connectionStatus: 'planned', recommendedPlatform: 'all' },
  { sourceType: 'mynb', displayName: 'MyNB', connected: false, connectionStatus: 'planned', recommendedPlatform: 'all' },
];
