import { ConnectedSource, FriendRank, WeeklySummary } from '@/domain/types';

export const weeklySummary: WeeklySummary = {
  totalDistanceKm: 42.4,
  totalRuns: 5,
  goalAchievementRate: 84,
  streakDays: 11,
  latestRun: {
    distanceKm: 8.2,
    source: 'Apple Health',
  },
  friendName: '김관우',
  friendGapKm: 3.4,
  districtName: '강남구',
  districtRank: 7,
  districtPoints: 98,
  districtBattle: {
    myDistrict: '강남구',
    averageDistancePerMember: 24.7,
    totalDistanceKm: 2480,
    participationRate: 62,
    districtRank: 3,
  },
};

export const friendRanks: FriendRank[] = [
  { id: '1', rank: 1, name: '김관우', distanceKm: 89, points: 98 },
  { id: '2', rank: 2, name: '민병희', distanceKm: 84, points: 91 },
  { id: '3', rank: 3, name: '이서준', distanceKm: 77, points: 86 },
];

export const connectedSources: ConnectedSource[] = [
  { sourceType: 'apple_health', displayName: 'Apple Health', connected: true, connectionStatus: 'connected' },
  { sourceType: 'manual', displayName: 'Manual', connected: true, connectionStatus: 'connected' },
  { sourceType: 'health_connect', displayName: 'Health Connect', connected: false, connectionStatus: 'planned' },
  { sourceType: 'garmin', displayName: 'Garmin', connected: false, connectionStatus: 'planned' },
  { sourceType: 'strava', displayName: 'Strava', connected: false, connectionStatus: 'planned' },
  { sourceType: 'nrc', displayName: 'NRC', connected: false, connectionStatus: 'planned' },
];
