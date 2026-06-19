import type { ConnectedSource } from '@/domain';

export const connectedSources: ConnectedSource[] = [
  { sourceType: 'apple_health', displayName: 'Apple Health', connected: true, connectionStatus: 'connected', lastSyncedAt: '2026-03-31 14:02', recommendedPlatform: 'ios' },
  { sourceType: 'manual', displayName: 'Manual', connected: true, connectionStatus: 'connected', lastSyncedAt: '2026-03-30 22:10', recommendedPlatform: 'all' },
  { sourceType: 'health_connect', displayName: 'Health Connect', connected: false, connectionStatus: 'planned', recommendedPlatform: 'android' },
  { sourceType: 'garmin', displayName: 'Garmin', connected: false, connectionStatus: 'planned', recommendedPlatform: 'all' },
  { sourceType: 'strava', displayName: 'Strava', connected: false, connectionStatus: 'planned', recommendedPlatform: 'all' },
  { sourceType: 'nrc', displayName: 'Nike Run Club', connected: false, connectionStatus: 'planned', recommendedPlatform: 'all' },
  // MyNB(뉴발란스)는 러닝 기록 앱이 쇼핑·적립용이라 Apple 건강/Health Connect에 운동을 쓰지 않아 선택 가능한 가져오기 소스에서 제외합니다.
];
