import { ConnectedSource, DistrictBattleRank, DistrictPersonalRank, FriendRank, FriendRequest, FriendRunRecord, MarketOverview, MyRunRecord, OfflineRaceHub, OfflineRaceParticipantPreview, RegionDrilldownNode, UniversityLeagueRank, UserProfile, WeeklySummary } from '@/domain/types';
import { addressCatalog, type AddressRegionNode } from '@/features/location/addressCatalog';

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
  { id: '4', rank: 4, name: '박지훈', tag: '#JH3N1', distanceKm: 61.2, points: 74 },
  { id: '5', rank: 5, name: '최민준', tag: '#MJ5T2', distanceKm: 58.4, points: 70 },
  { id: '6', rank: 6, name: '정이안', tag: '#IA9L3', distanceKm: 46.2, points: 54 },
  { id: '7', rank: 7, name: '이서윤', tag: '#SY1R4', distanceKm: 40.8, points: 48 },
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

export const universityLeagueRanks: UniversityLeagueRank[] = [
  { rank: 1, universityName: '서울대학교', totalDistanceKm: 312.4, participants: 18 },
  { rank: 2, universityName: '연세대학교', totalDistanceKm: 286.7, participants: 16 },
  { rank: 3, universityName: '고려대학교', totalDistanceKm: 271.9, participants: 15 },
  { rank: 4, universityName: '성균관대학교', totalDistanceKm: 224.8, participants: 13 },
  { rank: 5, universityName: '한양대학교', totalDistanceKm: 212.5, participants: 12 },
  { rank: 6, universityName: '경희대학교', totalDistanceKm: 194.3, participants: 11 },
  { rank: 7, universityName: '중앙대학교', totalDistanceKm: 181.6, participants: 10 },
  { rank: 8, universityName: '이화여자대학교', totalDistanceKm: 169.2, participants: 9 },
];

function addHours(base: Date, hours: number) {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function addDays(base: Date, days: number) {
  return addHours(base, days * 24);
}

const offlineRacePreview: OfflineRaceParticipantPreview[] = [
  { id: 'orp-1', name: '김관우', paceGoal: '4:55/km', regionLabel: '강남구' },
  { id: 'orp-2', name: '박지훈', paceGoal: '5:10/km', regionLabel: '송파구' },
  { id: 'orp-3', name: '최민준', paceGoal: '5:28/km', regionLabel: '성동구' },
  { id: 'orp-4', name: '한예린', paceGoal: '5:35/km', regionLabel: '마포구' },
];

export function createOfflineRaceHubMock(now = new Date()): OfflineRaceHub {
  const featuredStartsAt = addHours(now, 30);
  const nextStartsAt = addDays(now, 8);
  const thirdStartsAt = addDays(now, 15);

  return {
    featuredEvent: {
      id: 'offline-race-hangang-night-10k',
      title: '한강 나이트 10K',
      subtitle: '같은 시각에 각자 출발하는 실시간 오프라인 마라톤.',
      distanceKm: 10,
      startsAt: featuredStartsAt.toISOString(),
      registrationClosesAt: addHours(featuredStartsAt, -1).toISOString(),
      participationMode: '각자 원하는 코스에서 동시 출발',
      proofMethod: '연동 기록 또는 수동 인증 업로드',
      runWindowMinutes: 20,
      hostLabel: 'Runnig Crew Live',
      participantCount: 42,
      capacity: 80,
      entryFeePoints: 20,
      operationNote: '출발 시각 기준 20분 안에 러닝을 시작하면 같은 회차로 인정해.',
      registered: false,
      status: 'registration_open',
      participantPreview: offlineRacePreview,
    },
    upcomingEvents: [
      {
        id: 'offline-race-seoul-bridge-5k',
        title: '서울 브리지 5K',
        subtitle: '퇴근 후 각자 코스에서 바로 시작하는 짧고 강한 야간 러닝.',
        distanceKm: 5,
        startsAt: nextStartsAt.toISOString(),
        registrationClosesAt: addHours(nextStartsAt, -1).toISOString(),
        participationMode: '자유 코스 동시 출발',
        proofMethod: 'GPS 연동 기록 우선 인증',
        runWindowMinutes: 15,
        hostLabel: 'Runnig Sprint Club',
        participantCount: 27,
        capacity: 50,
        entryFeePoints: 12,
        operationNote: '출발 시간 기준 15분 내 시작 기록만 집계해.',
        registered: false,
        status: 'registration_open',
        participantPreview: offlineRacePreview.slice(0, 3),
      },
      {
        id: 'offline-race-sunrise-15k',
        title: '선라이즈 15K',
        subtitle: '토요일 새벽, 같은 시각에 각자 뛰는 장거리 세션.',
        distanceKm: 15,
        startsAt: thirdStartsAt.toISOString(),
        registrationClosesAt: addHours(thirdStartsAt, -1).toISOString(),
        participationMode: '자율 출발 장거리 세션',
        proofMethod: '러닝 앱 연동 후 자동 집계',
        runWindowMinutes: 25,
        hostLabel: 'Morning Pacers',
        participantCount: 18,
        capacity: 40,
        entryFeePoints: 28,
        operationNote: '출발 시각 전후 여유 시간을 조금 더 길게 운영해.',
        registered: false,
        status: 'registration_open',
        participantPreview: offlineRacePreview.slice(1),
      },
    ],
    pastEvents: [
      {
        id: 'offline-race-river-loop',
        title: '리버 루프 8K',
        distanceKm: 8,
        finishedAt: addDays(now, -6).toISOString(),
        modeLabel: '각자 출발형',
        winnerName: '김관우',
        finishers: 33,
        summary: '시작 10분 전 알림과 자동 기록 연동 비율이 높아서 운영이 가장 안정적으로 끝났어.',
      },
      {
        id: 'offline-race-campus-run',
        title: '캠퍼스 다운힐 6K',
        distanceKm: 6,
        finishedAt: addDays(now, -13).toISOString(),
        modeLabel: '동시 출발형',
        winnerName: '민서윤',
        finishers: 24,
        summary: '출발 시각은 같게 유지하고, 다음 회차부터는 거리별 그룹 가이드를 더 세분화하기로 했어.',
      },
    ],
    guideSteps: [
      '시작 1시간 전까지 참가 신청을 받고 참가 인원을 확정해.',
      '정해진 시각에 각자 원하는 코스에서 출발하고, 허용 시간 안에 시작한 기록만 집계해.',
      '러닝 앱 연동 또는 수동 인증으로 완주를 확인하고 포인트를 즉시 정산해.',
    ],
  };
}

function roundRegionMetric(value: number) {
  return Number(value.toFixed(1));
}

function createMockLeafRegionNode(input: {
  id: string;
  name: string;
  level: RegionDrilldownNode['level'];
  rank: number;
  averageDistanceKm: number;
  participants: number;
  participationRate: number;
}) {
  const averageDistanceKm = roundRegionMetric(input.averageDistanceKm);
  const participants = Math.max(24, Math.round(input.participants));

  return {
    id: input.id,
    name: input.name,
    level: input.level,
    averageDistanceKm,
    totalDistanceKm: Math.round(averageDistanceKm * participants),
    participationRate: Math.max(35, Math.round(input.participationRate)),
    participants,
    rank: input.rank,
  } satisfies RegionDrilldownNode;
}

function createMockAggregateRegionNode(input: {
  id: string;
  name: string;
  level: RegionDrilldownNode['level'];
  rank: number;
  children: RegionDrilldownNode[];
}) {
  const totalDistanceKm = input.children.reduce((sum, child) => sum + child.totalDistanceKm, 0);
  const participants = input.children.reduce((sum, child) => sum + child.participants, 0);
  const participationRate = roundRegionMetric(input.children.reduce((sum, child) => sum + child.participationRate, 0) / Math.max(input.children.length, 1));

  return {
    id: input.id,
    name: input.name,
    level: input.level,
    averageDistanceKm: roundRegionMetric(totalDistanceKm / Math.max(participants, 1)),
    totalDistanceKm,
    participationRate,
    participants,
    rank: input.rank,
    children: input.children,
  } satisfies RegionDrilldownNode;
}

function buildMockRegionNodeFromCatalog(
  node: AddressRegionNode,
  id: string,
  rank: number,
  depth = 0,
): RegionDrilldownNode {
  const level = node.type;

  if (!node.children?.length) {
    const averageBase = level === 'district' ? 27.8 : level === 'city' ? 23.7 : 21.6;
    const participantsBase = level === 'district' ? 162 : level === 'city' ? 520 : 860;
    const participationBase = level === 'district' ? 66 : level === 'city' ? 61 : 57;

    return createMockLeafRegionNode({
      id,
      name: node.name,
      level,
      rank,
      averageDistanceKm: Math.max(16.4, averageBase - rank * (level === 'district' ? 0.28 : 0.18) - depth * 0.15),
      participants: Math.max(42, participantsBase - rank * (level === 'district' ? 4 : 10) - depth * 6),
      participationRate: Math.max(44, participationBase - Math.floor(rank / 2) - depth),
    });
  }

  const children = node.children.map((child, index) =>
    buildMockRegionNodeFromCatalog(child, `${id}-${String(index + 1).padStart(2, '0')}`, index + 1, depth + 1));

  return createMockAggregateRegionNode({
    id,
    name: node.name,
    level,
    rank,
    children,
  });
}

const regionChildren = addressCatalog.map((region, index) =>
  buildMockRegionNodeFromCatalog(region, `kr-${String(index + 1).padStart(2, '0')}`, index + 1));

export const regionDrilldownTree: RegionDrilldownNode = createMockAggregateRegionNode({
  id: 'kr',
  name: '대한민국',
  level: 'country',
  rank: 1,
  children: regionChildren,
});

export const connectedSources: ConnectedSource[] = [
  { sourceType: 'apple_health', displayName: 'Apple Health', connected: true, connectionStatus: 'connected', lastSyncedAt: '2026-03-31 14:02', recommendedPlatform: 'ios' },
  { sourceType: 'manual', displayName: 'Manual', connected: true, connectionStatus: 'connected', lastSyncedAt: '2026-03-30 22:10', recommendedPlatform: 'all' },
  { sourceType: 'health_connect', displayName: 'Health Connect', connected: false, connectionStatus: 'planned', recommendedPlatform: 'android' },
  { sourceType: 'garmin', displayName: 'Garmin', connected: false, connectionStatus: 'planned', recommendedPlatform: 'all' },
  { sourceType: 'strava', displayName: 'Strava', connected: false, connectionStatus: 'planned', recommendedPlatform: 'all' },
  { sourceType: 'nrc', displayName: 'NRC', connected: false, connectionStatus: 'planned', recommendedPlatform: 'all' },
];
