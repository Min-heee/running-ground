import { ConnectedSource, DistrictBattleRank, FriendRank, RegionDrilldownNode, UserProfile, WeeklySummary } from '@/domain/types';

export const myProfile: UserProfile = {
  name: '민병희',
  districtName: '강남구',
  publicTag: '#BH7K2',
};

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
  { id: '1', rank: 1, name: '김관우', tag: '#KW8M4', distanceKm: 89, points: 98 },
  { id: '2', rank: 2, name: '민병희', tag: '#BH7K2', distanceKm: 84, points: 91 },
  { id: '3', rank: 3, name: '이서준', tag: '#SJ4Q8', distanceKm: 77, points: 86 },
];

export const districtBattleRanks: DistrictBattleRank[] = [
  { rank: 1, districtName: '송파구', averageDistanceKm: 28.4, participationRate: 68, participants: 142 },
  { rank: 2, districtName: '서초구', averageDistanceKm: 26.1, participationRate: 64, participants: 131 },
  { rank: 3, districtName: '강남구', averageDistanceKm: 24.7, participationRate: 62, participants: 128 },
  { rank: 4, districtName: '마포구', averageDistanceKm: 23.9, participationRate: 58, participants: 119 },
  { rank: 5, districtName: '성동구', averageDistanceKm: 22.8, participationRate: 55, participants: 111 },
];

export const regionDrilldownTree: RegionDrilldownNode = {
  id: 'kr',
  name: '대한민국',
  level: 'country',
  averageDistanceKm: 21.8,
  participationRate: 57,
  participants: 12450,
  rank: 1,
  children: [
    {
      id: 'kr-gg',
      name: '경기도',
      level: 'province',
      averageDistanceKm: 23.1,
      participationRate: 61,
      participants: 3180,
      rank: 1,
      children: [
        {
          id: 'kr-gg-goyang',
          name: '고양시',
          level: 'city',
          averageDistanceKm: 24.4,
          participationRate: 63,
          participants: 620,
          rank: 1,
          children: [
            {
              id: 'kr-gg-goyang-ilsanseo',
              name: '일산서구',
              level: 'district',
              averageDistanceKm: 25.2,
              participationRate: 65,
              participants: 182,
              rank: 1,
            },
            {
              id: 'kr-gg-goyang-deogyang',
              name: '덕양구',
              level: 'district',
              averageDistanceKm: 23.7,
              participationRate: 61,
              participants: 204,
              rank: 2,
            },
            {
              id: 'kr-gg-goyang-ilsandong',
              name: '일산동구',
              level: 'district',
              averageDistanceKm: 22.9,
              participationRate: 58,
              participants: 171,
              rank: 3,
            },
          ],
        },
        {
          id: 'kr-gg-seongnam',
          name: '성남시',
          level: 'city',
          averageDistanceKm: 22.8,
          participationRate: 59,
          participants: 590,
          rank: 2,
        },
        {
          id: 'kr-gg-suwon',
          name: '수원시',
          level: 'city',
          averageDistanceKm: 21.9,
          participationRate: 57,
          participants: 540,
          rank: 3,
        },
      ],
    },
    {
      id: 'kr-seoul',
      name: '서울특별시',
      level: 'province',
      averageDistanceKm: 22.4,
      participationRate: 58,
      participants: 2710,
      rank: 2,
    },
    {
      id: 'kr-busan',
      name: '부산광역시',
      level: 'province',
      averageDistanceKm: 20.9,
      participationRate: 54,
      participants: 1430,
      rank: 3,
    },
  ],
};

export const connectedSources: ConnectedSource[] = [
  { sourceType: 'apple_health', displayName: 'Apple Health', connected: true, connectionStatus: 'connected' },
  { sourceType: 'manual', displayName: 'Manual', connected: true, connectionStatus: 'connected' },
  { sourceType: 'health_connect', displayName: 'Health Connect', connected: false, connectionStatus: 'planned' },
  { sourceType: 'garmin', displayName: 'Garmin', connected: false, connectionStatus: 'planned' },
  { sourceType: 'strava', displayName: 'Strava', connected: false, connectionStatus: 'planned' },
  { sourceType: 'nrc', displayName: 'NRC', connected: false, connectionStatus: 'planned' },
];
