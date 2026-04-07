import { ConnectedSource, DistrictBattleRank, DistrictPersonalRank, FriendRank, FriendRequest, FriendRunRecord, MarketOverview, MyRunRecord, RegionDrilldownNode, UserProfile, WeeklySummary } from '@/domain/types';

export const myProfile: UserProfile = {
  name: '민병희',
  provinceName: '서울특별시',
  districtName: '강남구',
  addressDetail: '테헤란로 123',
  publicTag: '#BH7K2',
};

export const myNotificationSettings = {
  friendAlerts: true,
  districtAlerts: true,
  marketAlerts: false,
};

export const marketOverview: MarketOverview = {
  currentPoints: 128,
  totalRedeemedCount: 1,
  items: [
    {
      id: 'reward-theme-midnight',
      title: '미드나잇 프로필 테마',
      category: '프로필 테마',
      description: '프로필 카드와 랭킹 강조색을 조금 더 선명하게 바꿔주는 테마야.',
      costPoints: 40,
      repeatable: false,
      claimState: 'claimed',
    },
    {
      id: 'reward-coupon-coffee',
      title: '러닝 후 커피 쿠폰',
      category: '제휴 쿠폰',
      description: '가볍게 회복할 수 있는 아메리카노 1잔 쿠폰이야.',
      costPoints: 60,
      partnerName: 'Daily Beans',
      repeatable: false,
      claimState: 'claimable',
    },
    {
      id: 'reward-badge-sprinter',
      title: '스프린터 한정 배지',
      category: '배지',
      description: '프로필과 친구 랭킹에서 보여줄 수 있는 시즌 배지야.',
      costPoints: 90,
      repeatable: false,
      claimState: 'claimable',
    },
    {
      id: 'reward-challenge-ticket',
      title: '주말 챌린지 입장권',
      category: '챌린지',
      description: '주말 5km 미션 보상 챌린지에 바로 참가할 수 있어.',
      costPoints: 140,
      repeatable: true,
      claimState: 'locked',
    },
  ],
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

export const myRunRecords: MyRunRecord[] = [
  { id: 'mr1', date: '2026-03-30', distanceKm: 8.2, pace: '5:34/km', source: 'Apple Health' },
  { id: 'mr2', date: '2026-03-28', distanceKm: 11.0, pace: '5:22/km', source: 'Apple Health' },
  { id: 'mr3', date: '2026-03-25', distanceKm: 6.4, pace: '5:41/km', source: 'Manual' },
  { id: 'mr4', date: '2026-03-21', distanceKm: 9.8, pace: '5:19/km', source: 'Apple Health' },
  { id: 'mr5', date: '2026-03-18', distanceKm: 7.0, pace: '5:48/km', source: 'Apple Health' },
];

export const friendRanks: FriendRank[] = [
  { id: '1', rank: 1, name: '김관우', tag: '#KW8M4', distanceKm: 89, points: 98 },
  { id: '2', rank: 2, name: '민병희', tag: '#BH7K2', distanceKm: 84, points: 91 },
  { id: '3', rank: 3, name: '이서준', tag: '#SJ4Q8', distanceKm: 77, points: 86 },
];

export const friendRunRecords: FriendRunRecord[] = [
  { id: 'fr1', date: '2026-03-30', distanceKm: 10.0, pace: '5:12/km' },
  { id: 'fr2', date: '2026-03-28', distanceKm: 12.4, pace: '5:05/km' },
  { id: 'fr3', date: '2026-03-24', distanceKm: 8.6, pace: '5:18/km' },
  { id: 'fr4', date: '2026-03-20', distanceKm: 15.0, pace: '5:27/km' },
  { id: 'fr5', date: '2026-03-16', distanceKm: 9.2, pace: '5:09/km' },
];

export const friendRequests: FriendRequest[] = [
  { id: 'r1', name: '박도윤', tag: '#DY2M8', status: 'pending' },
  { id: 'r2', name: '한예린', tag: '#YR4P6', status: 'received' },
  { id: 'r3', name: '김관우', tag: '#KW8M4', status: 'accepted' },
];

export const districtPersonalRanks: DistrictPersonalRank[] = [
  { id: '1', rank: 1, name: '김관우', distanceKm: 89, points: 98 },
  { id: '2', rank: 2, name: '박지훈', distanceKm: 86, points: 95 },
  { id: '3', rank: 3, name: '최민준', distanceKm: 81, points: 91 },
  { id: '4', rank: 4, name: '민병희', distanceKm: 42.4, points: 98, isMe: true },
  { id: '5', rank: 5, name: '이서윤', distanceKm: 41.1, points: 85 },
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
  totalDistanceKm: 271410,
  participationRate: 57,
  participants: 12450,
  rank: 1,
  children: [
    { id: 'kr-seoul', name: '서울특별시', level: 'province', averageDistanceKm: 22.4, totalDistanceKm: 60704, participationRate: 58, participants: 2710, rank: 1 },
    { id: 'kr-busan', name: '부산광역시', level: 'province', averageDistanceKm: 20.9, totalDistanceKm: 29887, participationRate: 54, participants: 1430, rank: 2 },
    { id: 'kr-daegu', name: '대구광역시', level: 'province', averageDistanceKm: 20.6, totalDistanceKm: 21424, participationRate: 53, participants: 1040, rank: 3 },
    { id: 'kr-incheon', name: '인천광역시', level: 'province', averageDistanceKm: 21.1, totalDistanceKm: 26692, participationRate: 55, participants: 1265, rank: 4 },
    { id: 'kr-gwangju', name: '광주광역시', level: 'province', averageDistanceKm: 20.3, totalDistanceKm: 16240, participationRate: 52, participants: 800, rank: 5 },
    { id: 'kr-daejeon', name: '대전광역시', level: 'province', averageDistanceKm: 20.8, totalDistanceKm: 16910, participationRate: 54, participants: 813, rank: 6 },
    { id: 'kr-ulsan', name: '울산광역시', level: 'province', averageDistanceKm: 21.0, totalDistanceKm: 13545, participationRate: 55, participants: 645, rank: 7 },
    { id: 'kr-sejong', name: '세종특별자치시', level: 'province', averageDistanceKm: 22.1, totalDistanceKm: 7418, participationRate: 59, participants: 336, rank: 8 },
    {
      id: 'kr-gg',
      name: '경기도',
      level: 'province',
      averageDistanceKm: 23.1,
      totalDistanceKm: 73458,
      participationRate: 61,
      participants: 3180,
      rank: 9,
      children: [
        {
          id: 'kr-gg-goyang',
          name: '고양시',
          level: 'city',
          averageDistanceKm: 24.4,
          totalDistanceKm: 15128,
          participationRate: 63,
          participants: 620,
          rank: 1,
          children: [
            { id: 'kr-gg-goyang-ilsanseo', name: '일산서구', level: 'district', averageDistanceKm: 25.2, totalDistanceKm: 4586, participationRate: 65, participants: 182, rank: 1 },
            { id: 'kr-gg-goyang-deogyang', name: '덕양구', level: 'district', averageDistanceKm: 23.7, totalDistanceKm: 4834, participationRate: 61, participants: 204, rank: 2 },
            { id: 'kr-gg-goyang-ilsandong', name: '일산동구', level: 'district', averageDistanceKm: 22.9, totalDistanceKm: 3915, participationRate: 58, participants: 171, rank: 3 },
          ],
        },
        { id: 'kr-gg-seongnam', name: '성남시', level: 'city', averageDistanceKm: 22.8, totalDistanceKm: 13452, participationRate: 59, participants: 590, rank: 2 },
        { id: 'kr-gg-suwon', name: '수원시', level: 'city', averageDistanceKm: 21.9, totalDistanceKm: 11826, participationRate: 57, participants: 540, rank: 3 },
      ],
    },
    { id: 'kr-gw', name: '강원특별자치도', level: 'province', averageDistanceKm: 22.0, totalDistanceKm: 15488, participationRate: 56, participants: 704, rank: 10 },
    { id: 'kr-cb', name: '충청북도', level: 'province', averageDistanceKm: 21.4, totalDistanceKm: 14723, participationRate: 55, participants: 688, rank: 11 },
    { id: 'kr-cn', name: '충청남도', level: 'province', averageDistanceKm: 21.7, totalDistanceKm: 18228, participationRate: 56, participants: 840, rank: 12 },
    { id: 'kr-jb', name: '전북특별자치도', level: 'province', averageDistanceKm: 20.7, totalDistanceKm: 15318, participationRate: 53, participants: 740, rank: 13 },
    { id: 'kr-jn', name: '전라남도', level: 'province', averageDistanceKm: 20.4, totalDistanceKm: 14484, participationRate: 52, participants: 710, rank: 14 },
    { id: 'kr-gb', name: '경상북도', level: 'province', averageDistanceKm: 21.2, totalDistanceKm: 19716, participationRate: 54, participants: 930, rank: 15 },
    { id: 'kr-gn', name: '경상남도', level: 'province', averageDistanceKm: 21.5, totalDistanceKm: 22188, participationRate: 55, participants: 1032, rank: 16 },
    { id: 'kr-jeju', name: '제주특별자치도', level: 'province', averageDistanceKm: 22.6, totalDistanceKm: 9899, participationRate: 58, participants: 438, rank: 17 },
  ],
};

export const connectedSources: ConnectedSource[] = [
  { sourceType: 'apple_health', displayName: 'Apple Health', connected: true, connectionStatus: 'connected', lastSyncedAt: '2026-03-31 14:02', recommendedPlatform: 'ios' },
  { sourceType: 'manual', displayName: 'Manual', connected: true, connectionStatus: 'connected', lastSyncedAt: '2026-03-30 22:10', recommendedPlatform: 'all' },
  { sourceType: 'health_connect', displayName: 'Health Connect', connected: false, connectionStatus: 'planned', recommendedPlatform: 'android' },
  { sourceType: 'garmin', displayName: 'Garmin', connected: false, connectionStatus: 'planned', recommendedPlatform: 'all' },
  { sourceType: 'strava', displayName: 'Strava', connected: false, connectionStatus: 'planned', recommendedPlatform: 'all' },
  { sourceType: 'nrc', displayName: 'NRC', connected: false, connectionStatus: 'planned', recommendedPlatform: 'all' },
];
