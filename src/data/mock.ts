import { ConnectedSource, FriendRank, FriendRequest, FriendRunRecord, MarketOverview, MyRunRecord, OfflineRaceEvent, OfflineRaceHub, OfflineRaceParticipantPreview, RegionDrilldownNode, UniversityLeagueRank, UserProfile, WeeklySummary } from '@/domain';
import { addressCatalog, type AddressRegionNode } from '@/features/location/addressCatalog';

export const myProfile: UserProfile = {
  name: '민병희',
  provinceName: '서울특별시',
  districtName: '강남구',
  addressDetail: '테헤란로 123',
  publicTag: '#BH7K2',
  lifetimeDistanceKm: 126.8,
};

export const myNotificationSettings = {
  friendAlerts: true,
  districtAlerts: true,
  marketAlerts: false,
  matchReminders: true,
};

export const marketOverview: MarketOverview = {
  currentPoints: 128,
  totalRedeemedCount: 1,
  items: [
    {
      id: 'reward-theme-midnight',
      title: '러닝 양말 2팩',
      category: '러닝 용품',
      description: '가볍고 땀 배출이 빠른 데일리 러닝 양말 세트예요.',
      costPoints: 40,
      repeatable: false,
      claimState: 'claimed',
    },
    {
      id: 'reward-coupon-coffee',
      title: '메가커피 5천원',
      category: '키프티콘',
      description: '러닝 후 가볍게 마시기 좋은 모바일 교환권이에요.',
      costPoints: 60,
      partnerName: '메가커피',
      repeatable: false,
      claimState: 'claimable',
    },
    {
      id: 'reward-badge-sprinter',
      title: '드라이핏 반팔 티',
      category: '런닝 티',
      description: '가볍고 빠르게 마르는 기본 러닝 티셔츠예요.',
      costPoints: 90,
      repeatable: false,
      claimState: 'claimable',
    },
    {
      id: 'reward-challenge-ticket',
      title: '경량 러닝 쇼츠',
      category: '런닝 바지',
      description: '가볍게 입기 좋은 베이직 5인치 러닝 쇼츠예요.',
      costPoints: 140,
      repeatable: false,
      claimState: 'locked',
    },
    {
      id: 'reward-running-shoes-daily',
      title: '데일리 쿠셔닝 러닝화',
      category: '런닝화',
      description: '장거리 러닝에도 편안한 쿠셔닝 중심 러닝화예요.',
      costPoints: 280,
      repeatable: false,
      claimState: 'locked',
    },
    {
      id: 'reward-running-shoes-race',
      title: '레이스 데이 러닝화',
      category: '런닝화',
      description: '조금 더 가볍고 반응성이 좋은 레이스용 모델이에요.',
      costPoints: 340,
      repeatable: false,
      claimState: 'locked',
    },
    {
      id: 'reward-running-tee-sleeveless',
      title: '메쉬 슬리브리스',
      category: '런닝 티',
      description: '한여름 러닝에 어울리는 통기성 중심 탑이에요.',
      costPoints: 120,
      repeatable: false,
      claimState: 'claimable',
    },
    {
      id: 'reward-running-pants-tights',
      title: '컴프레션 롱타이츠',
      category: '런닝 바지',
      description: '기온이 낮은 날 입기 좋은 압박형 타이츠예요.',
      costPoints: 180,
      repeatable: false,
      claimState: 'locked',
    },
    {
      id: 'reward-running-gear-belt',
      title: '보틀 벨트',
      category: '러닝 용품',
      description: '장거리 러닝 때 휴대성과 수분 보충을 챙기기 좋아요.',
      costPoints: 110,
      repeatable: false,
      claimState: 'claimable',
    },
    {
      id: 'reward-gifticon-gs',
      title: 'GS25 5천원',
      category: '키프티콘',
      description: '러닝 후 간단한 간식이나 음료를 고르기 좋은 교환권이에요.',
      costPoints: 70,
      partnerName: 'GS25',
      repeatable: false,
      claimState: 'claimable',
    },
    {
      id: 'reward-gifticon-olive',
      title: '올리브영 1만원',
      category: '키프티콘',
      description: '러닝 보조용품이나 케어 아이템 구매에 쓰기 좋아요.',
      costPoints: 150,
      partnerName: '올리브영',
      repeatable: false,
      claimState: 'locked',
    },
  ],
};

export const weeklySummary: WeeklySummary = {
  totalDistanceKm: 42.4,
  totalRuns: 8,
  goalAchievementRate: 84,
  streakDays: 3,
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
  { id: 'mr1', date: '2026-04-12', distanceKm: 8.2, pace: '5:34/km', source: 'Apple Health' },
  { id: 'mr2', date: '2026-04-11', distanceKm: 7.0, pace: '5:22/km', source: 'Apple Health' },
  { id: 'mr3', date: '2026-04-10', distanceKm: 6.4, pace: '5:41/km', source: 'Manual' },
  { id: 'mr4', date: '2026-04-08', distanceKm: 5.8, pace: '5:19/km', source: 'Apple Health' },
  { id: 'mr5', date: '2026-04-06', distanceKm: 4.5, pace: '5:48/km', source: 'Apple Health' },
  { id: 'mr6', date: '2026-04-05', distanceKm: 3.9, pace: '5:56/km', source: 'Manual' },
  { id: 'mr7', date: '2026-04-04', distanceKm: 3.5, pace: '6:02/km', source: 'Apple Health' },
  { id: 'mr8', date: '2026-04-03', distanceKm: 3.1, pace: '6:10/km', source: 'Apple Health' },
];

export const friendRanks: FriendRank[] = [
  { id: '1', rank: 1, name: '김관우', tag: '#KW8M4', distanceKm: 89, points: 98, isRunningNow: true, liveLocationLabel: '서울숲 근처' },
  { id: '2', rank: 2, name: '민병희', tag: '#BH7K2', distanceKm: 84, points: 91 },
  { id: '3', rank: 3, name: '이서준', tag: '#SJ4Q8', distanceKm: 77, points: 86, isRunningNow: true, liveLocationLabel: '반포한강공원 근처' },
  { id: '4', rank: 4, name: '박지훈', tag: '#JH3N1', distanceKm: 61.2, points: 74 },
  { id: '5', rank: 5, name: '최민준', tag: '#MJ5T2', distanceKm: 58.4, points: 70, isRunningNow: true, liveLocationLabel: '송정동 근처' },
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

export const universityLeagueRanks: UniversityLeagueRank[] = [
  { rank: 1, universityName: '서울대학교', totalDistanceKm: 312.4, participants: 18, averageDistanceKm: 17.4 },
  { rank: 2, universityName: '연세대학교', totalDistanceKm: 286.7, participants: 16, averageDistanceKm: 17.9 },
  { rank: 3, universityName: '고려대학교', totalDistanceKm: 271.9, participants: 15, averageDistanceKm: 18.1 },
  { rank: 4, universityName: '성균관대학교', totalDistanceKm: 224.8, participants: 13, averageDistanceKm: 17.3 },
  { rank: 5, universityName: '한양대학교', totalDistanceKm: 212.5, participants: 12, averageDistanceKm: 17.7 },
  { rank: 6, universityName: '경희대학교', totalDistanceKm: 194.3, participants: 11, averageDistanceKm: 17.7 },
  { rank: 7, universityName: '중앙대학교', totalDistanceKm: 181.6, participants: 10, averageDistanceKm: 18.2 },
  { rank: 8, universityName: '이화여자대학교', totalDistanceKm: 169.2, participants: 9, averageDistanceKm: 18.8 },
];

function addHours(base: Date, hours: number) {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function addDays(base: Date, days: number) {
  return addHours(base, days * 24);
}

function setRaceStart(base: Date, dayOffset: number, hour: number, minute = 0) {
  const next = new Date(base);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + dayOffset);
  next.setHours(hour, minute, 0, 0);
  return next;
}

const offlineRacePreview: OfflineRaceParticipantPreview[] = [
  { id: 'orp-1', name: '김관우', paceGoal: '4:55/km', regionLabel: '강남구' },
  { id: 'orp-2', name: '박지훈', paceGoal: '5:10/km', regionLabel: '송파구' },
  { id: 'orp-3', name: '최민준', paceGoal: '5:28/km', regionLabel: '성동구' },
  { id: 'orp-4', name: '한예린', paceGoal: '5:35/km', regionLabel: '마포구' },
];

function createRaceOption(input: {
  id: string;
  title: string;
  subtitle: string;
  distanceKm: number;
  startsAt: Date;
  participantCount: number;
  capacity: number;
  entryFeePoints: number;
  hostLabel: string;
  participationMode?: string;
  proofMethod?: string;
  runWindowMinutes?: number;
  operationNote?: string;
  participantPreview?: OfflineRaceParticipantPreview[];
}): OfflineRaceEvent {
  return {
    id: input.id,
    title: input.title,
    subtitle: input.subtitle,
    distanceKm: input.distanceKm,
    startsAt: input.startsAt.toISOString(),
    registrationClosesAt: addHours(input.startsAt, -1).toISOString(),
    participationMode: input.participationMode ?? '각자 원하는 코스에서 동시 출발',
    proofMethod: input.proofMethod ?? '러닝 앱 연동 후 자동 집계',
    runWindowMinutes: input.runWindowMinutes ?? 20,
    hostLabel: input.hostLabel,
    participantCount: input.participantCount,
    capacity: input.capacity,
    entryFeePoints: input.entryFeePoints,
    operationNote: input.operationNote ?? '출발 시각 기준 허용 시간 안에 시작한 기록만 같은 회차로 반영해.',
    registered: false,
    status: 'registration_open',
    participantPreview: input.participantPreview ?? offlineRacePreview,
  };
}

export function createOfflineRaceHubMock(now = new Date()): OfflineRaceHub {
  const featuredStartsAt = setRaceStart(now, 1, 18, 0);
  const firstNightStartsAt = setRaceStart(now, 1, 20, 0);
  const secondMorningStartsAt = setRaceStart(now, 2, 7, 0);
  const secondEveningStartsAt = setRaceStart(now, 2, 19, 30);
  const thirdEveningStartsAt = setRaceStart(now, 3, 18, 30);
  const thirdNightStartsAt = setRaceStart(now, 3, 20, 30);

  return {
    featuredEvent: createRaceOption({
      id: 'offline-race-hangang-night-10k',
      title: '한강 나이트',
      subtitle: '퇴근 후 같은 시각에 각자 출발하는 대표 야간 레이스.',
      distanceKm: 10,
      startsAt: featuredStartsAt,
      participantCount: 42,
      capacity: 80,
      entryFeePoints: 20,
      hostLabel: 'Runnig Crew Live',
      proofMethod: '연동 기록 또는 수동 인증 업로드',
      operationNote: '출발 시각 기준 20분 안에 러닝을 시작하면 같은 회차로 인정해.',
    }),
    upcomingEvents: [
      createRaceOption({
        id: 'offline-race-hangang-night-5k',
        title: '한강 나이트',
        subtitle: '퇴근 후 같은 시각에 각자 출발하는 대표 야간 레이스.',
        distanceKm: 5,
        startsAt: featuredStartsAt,
        participantCount: 34,
        capacity: 60,
        entryFeePoints: 10,
        hostLabel: 'Runnig Crew Live',
        participantPreview: offlineRacePreview.slice(0, 3),
      }),
      createRaceOption({
        id: 'offline-race-hangang-night-15k',
        title: '한강 나이트',
        subtitle: '퇴근 후 같은 시각에 각자 출발하는 대표 야간 레이스.',
        distanceKm: 15,
        startsAt: featuredStartsAt,
        participantCount: 25,
        capacity: 50,
        entryFeePoints: 28,
        hostLabel: 'Runnig Crew Live',
        participantPreview: offlineRacePreview.slice(1),
      }),
      createRaceOption({
        id: 'offline-race-hangang-night-20k',
        title: '한강 나이트',
        subtitle: '퇴근 후 같은 시각에 각자 출발하는 대표 야간 레이스.',
        distanceKm: 20,
        startsAt: featuredStartsAt,
        participantCount: 14,
        capacity: 30,
        entryFeePoints: 36,
        hostLabel: 'Runnig Crew Live',
        runWindowMinutes: 25,
        participantPreview: offlineRacePreview.slice(2),
      }),
      createRaceOption({
        id: 'offline-race-city-tempo-3k',
        title: '도심 템포',
        subtitle: '저녁 시간에 템포를 끌어올리는 실시간 도심 러닝.',
        distanceKm: 3,
        startsAt: firstNightStartsAt,
        participantCount: 20,
        capacity: 40,
        entryFeePoints: 8,
        hostLabel: 'Night Tempo Crew',
        proofMethod: 'GPS 연동 기록 우선 인증',
        runWindowMinutes: 12,
      }),
      createRaceOption({
        id: 'offline-race-city-tempo-5k',
        title: '도심 템포',
        subtitle: '저녁 시간에 템포를 끌어올리는 실시간 도심 러닝.',
        distanceKm: 5,
        startsAt: firstNightStartsAt,
        participantCount: 31,
        capacity: 55,
        entryFeePoints: 12,
        hostLabel: 'Night Tempo Crew',
        proofMethod: 'GPS 연동 기록 우선 인증',
        runWindowMinutes: 15,
      }),
      createRaceOption({
        id: 'offline-race-city-tempo-10k',
        title: '도심 템포',
        subtitle: '저녁 시간에 템포를 끌어올리는 실시간 도심 러닝.',
        distanceKm: 10,
        startsAt: firstNightStartsAt,
        participantCount: 18,
        capacity: 35,
        entryFeePoints: 20,
        hostLabel: 'Night Tempo Crew',
        proofMethod: 'GPS 연동 기록 우선 인증',
        runWindowMinutes: 18,
      }),
      createRaceOption({
        id: 'offline-race-sunrise-run-5k',
        title: '선라이즈 런',
        subtitle: '아침 공기 속에서 함께 시작하는 새벽 러닝 세션.',
        distanceKm: 5,
        startsAt: secondMorningStartsAt,
        participantCount: 24,
        capacity: 50,
        entryFeePoints: 10,
        hostLabel: 'Morning Pacers',
        participantPreview: offlineRacePreview.slice(0, 2),
      }),
      createRaceOption({
        id: 'offline-race-sunrise-run-10k',
        title: '선라이즈 런',
        subtitle: '아침 공기 속에서 함께 시작하는 새벽 러닝 세션.',
        distanceKm: 10,
        startsAt: secondMorningStartsAt,
        participantCount: 28,
        capacity: 45,
        entryFeePoints: 18,
        hostLabel: 'Morning Pacers',
        participantPreview: offlineRacePreview.slice(1, 4),
      }),
      createRaceOption({
        id: 'offline-race-sunrise-run-15k',
        title: '선라이즈 런',
        subtitle: '아침 공기 속에서 함께 시작하는 새벽 러닝 세션.',
        distanceKm: 15,
        startsAt: secondMorningStartsAt,
        participantCount: 16,
        capacity: 32,
        entryFeePoints: 26,
        hostLabel: 'Morning Pacers',
        runWindowMinutes: 25,
        participantPreview: offlineRacePreview.slice(2),
      }),
      createRaceOption({
        id: 'offline-race-river-recovery-3k',
        title: '리버 리커버리',
        subtitle: '부담 없이 가볍게 뛰는 평일 저녁 회복 러닝.',
        distanceKm: 3,
        startsAt: secondEveningStartsAt,
        participantCount: 19,
        capacity: 45,
        entryFeePoints: 6,
        hostLabel: 'Easy Run Club',
        participationMode: '회복 페이스 동시 출발',
        proofMethod: 'GPS 연동 또는 수동 업로드',
        runWindowMinutes: 12,
      }),
      createRaceOption({
        id: 'offline-race-river-recovery-5k',
        title: '리버 리커버리',
        subtitle: '부담 없이 가볍게 뛰는 평일 저녁 회복 러닝.',
        distanceKm: 5,
        startsAt: secondEveningStartsAt,
        participantCount: 29,
        capacity: 60,
        entryFeePoints: 10,
        hostLabel: 'Easy Run Club',
        participationMode: '회복 페이스 동시 출발',
        proofMethod: 'GPS 연동 또는 수동 업로드',
        runWindowMinutes: 15,
      }),
      createRaceOption({
        id: 'offline-race-river-recovery-8k',
        title: '리버 리커버리',
        subtitle: '부담 없이 가볍게 뛰는 평일 저녁 회복 러닝.',
        distanceKm: 8,
        startsAt: secondEveningStartsAt,
        participantCount: 18,
        capacity: 36,
        entryFeePoints: 14,
        hostLabel: 'Easy Run Club',
        participationMode: '회복 페이스 동시 출발',
        proofMethod: 'GPS 연동 또는 수동 업로드',
        runWindowMinutes: 18,
      }),
      createRaceOption({
        id: 'offline-race-campus-loop-5k',
        title: '캠퍼스 루프',
        subtitle: '저녁 시간에 가볍게 몰입하는 캠퍼스 감성 루프 레이스.',
        distanceKm: 5,
        startsAt: thirdEveningStartsAt,
        participantCount: 21,
        capacity: 40,
        entryFeePoints: 10,
        hostLabel: 'Campus Run Club',
        proofMethod: '연동 기록 우선 인증',
      }),
      createRaceOption({
        id: 'offline-race-campus-loop-7k',
        title: '캠퍼스 루프',
        subtitle: '저녁 시간에 가볍게 몰입하는 캠퍼스 감성 루프 레이스.',
        distanceKm: 7,
        startsAt: thirdEveningStartsAt,
        participantCount: 26,
        capacity: 44,
        entryFeePoints: 14,
        hostLabel: 'Campus Run Club',
        proofMethod: '연동 기록 우선 인증',
      }),
      createRaceOption({
        id: 'offline-race-campus-loop-10k',
        title: '캠퍼스 루프',
        subtitle: '저녁 시간에 가볍게 몰입하는 캠퍼스 감성 루프 레이스.',
        distanceKm: 10,
        startsAt: thirdEveningStartsAt,
        participantCount: 17,
        capacity: 30,
        entryFeePoints: 20,
        hostLabel: 'Campus Run Club',
        proofMethod: '연동 기록 우선 인증',
        runWindowMinutes: 20,
      }),
      createRaceOption({
        id: 'offline-race-riverside-night-10k',
        title: '리버사이드 나이트',
        subtitle: '한밤의 강변 감각으로 달리는 장거리 실시간 레이스.',
        distanceKm: 10,
        startsAt: thirdNightStartsAt,
        participantCount: 18,
        capacity: 40,
        entryFeePoints: 20,
        hostLabel: 'River Long Crew',
        runWindowMinutes: 20,
      }),
      createRaceOption({
        id: 'offline-race-riverside-night-15k',
        title: '리버사이드 나이트',
        subtitle: '한밤의 강변 감각으로 달리는 장거리 실시간 레이스.',
        distanceKm: 15,
        startsAt: thirdNightStartsAt,
        participantCount: 12,
        capacity: 28,
        entryFeePoints: 28,
        hostLabel: 'River Long Crew',
        runWindowMinutes: 24,
      }),
      createRaceOption({
        id: 'offline-race-riverside-night-20k',
        title: '리버사이드 나이트',
        subtitle: '한밤의 강변 감각으로 달리는 장거리 실시간 레이스.',
        distanceKm: 20,
        startsAt: thirdNightStartsAt,
        participantCount: 8,
        capacity: 20,
        entryFeePoints: 36,
        hostLabel: 'River Long Crew',
        runWindowMinutes: 28,
      }),
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
  { sourceType: 'nrc', displayName: 'Nike Run Club', connected: false, connectionStatus: 'planned', recommendedPlatform: 'all' },
  { sourceType: 'mynb', displayName: 'MyNB', connected: false, connectionStatus: 'planned', recommendedPlatform: 'all' },
];
