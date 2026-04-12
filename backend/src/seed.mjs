import { addressCatalog } from './addressCatalog.mjs';

function createSource({
  sourceType,
  displayName,
  connected = false,
  connectionStatus = connected ? 'connected' : 'planned',
  lastSyncedAt,
  recommendedPlatform = 'all',
}) {
  return {
    sourceType,
    displayName,
    connected,
    connectionStatus,
    lastSyncedAt,
    recommendedPlatform,
  };
}

function createConnectedSources(profile = 'default') {
  if (profile === 'ios') {
    return [
      createSource({
        sourceType: 'apple_health',
        displayName: 'Apple Health',
        connected: true,
        lastSyncedAt: '2026-03-31 14:02',
        recommendedPlatform: 'ios',
      }),
      createSource({
        sourceType: 'manual',
        displayName: 'Manual',
        connected: true,
        lastSyncedAt: '2026-03-30 22:10',
      }),
      createSource({ sourceType: 'health_connect', displayName: 'Health Connect', recommendedPlatform: 'android' }),
      createSource({ sourceType: 'garmin', displayName: 'Garmin' }),
      createSource({ sourceType: 'strava', displayName: 'Strava' }),
      createSource({ sourceType: 'nrc', displayName: 'NRC' }),
    ];
  }

  if (profile === 'android') {
    return [
      createSource({
        sourceType: 'health_connect',
        displayName: 'Health Connect',
        connected: true,
        lastSyncedAt: '2026-03-31 09:40',
        recommendedPlatform: 'android',
      }),
      createSource({
        sourceType: 'manual',
        displayName: 'Manual',
        connected: true,
        lastSyncedAt: '2026-03-30 20:24',
      }),
      createSource({ sourceType: 'apple_health', displayName: 'Apple Health', recommendedPlatform: 'ios' }),
      createSource({ sourceType: 'garmin', displayName: 'Garmin' }),
      createSource({ sourceType: 'strava', displayName: 'Strava' }),
      createSource({ sourceType: 'nrc', displayName: 'NRC' }),
    ];
  }

  return [
    createSource({
      sourceType: 'manual',
      displayName: 'Manual',
      connected: true,
      lastSyncedAt: '2026-03-29 18:10',
    }),
    createSource({ sourceType: 'apple_health', displayName: 'Apple Health', recommendedPlatform: 'ios' }),
    createSource({ sourceType: 'health_connect', displayName: 'Health Connect', recommendedPlatform: 'android' }),
    createSource({ sourceType: 'garmin', displayName: 'Garmin' }),
    createSource({ sourceType: 'strava', displayName: 'Strava' }),
    createSource({ sourceType: 'nrc', displayName: 'NRC' }),
  ];
}

function createNotificationSettings(profile = 'default') {
  if (profile === 'ios') {
    return {
      friendAlerts: true,
      districtAlerts: true,
      marketAlerts: false,
    };
  }

  if (profile === 'android') {
    return {
      friendAlerts: true,
      districtAlerts: false,
      marketAlerts: false,
    };
  }

  return {
    friendAlerts: true,
    districtAlerts: true,
    marketAlerts: true,
  };
}

function createMarketCatalog() {
  return [
    {
      id: 'reward-theme-midnight',
      title: '러닝 양말 2팩',
      category: '러닝 용품',
      description: '가볍고 땀 배출이 빠른 데일리 러닝 양말 세트예요.',
      costPoints: 40,
      repeatable: false,
    },
    {
      id: 'reward-coupon-coffee',
      title: '메가커피 5천원',
      category: '키프티콘',
      description: '러닝 후 가볍게 마시기 좋은 모바일 교환권이에요.',
      costPoints: 60,
      partnerName: '메가커피',
      repeatable: false,
    },
    {
      id: 'reward-badge-sprinter',
      title: '드라이핏 반팔 티',
      category: '런닝 티',
      description: '가볍고 빠르게 마르는 기본 러닝 티셔츠예요.',
      costPoints: 90,
      repeatable: false,
    },
    {
      id: 'reward-challenge-ticket',
      title: '경량 러닝 쇼츠',
      category: '런닝 바지',
      description: '가볍게 입기 좋은 베이직 5인치 러닝 쇼츠예요.',
      costPoints: 140,
      repeatable: false,
    },
    {
      id: 'reward-running-shoes-daily',
      title: '데일리 쿠셔닝 러닝화',
      category: '런닝화',
      description: '장거리 러닝에도 편안한 쿠셔닝 중심 러닝화예요.',
      costPoints: 280,
      repeatable: false,
    },
    {
      id: 'reward-running-shoes-race',
      title: '레이스 데이 러닝화',
      category: '런닝화',
      description: '조금 더 가볍고 반응성이 좋은 레이스용 모델이에요.',
      costPoints: 340,
      repeatable: false,
    },
    {
      id: 'reward-running-tee-sleeveless',
      title: '메쉬 슬리브리스',
      category: '런닝 티',
      description: '한여름 러닝에 어울리는 통기성 중심 탑이에요.',
      costPoints: 120,
      repeatable: false,
    },
    {
      id: 'reward-running-pants-tights',
      title: '컴프레션 롱타이츠',
      category: '런닝 바지',
      description: '기온이 낮은 날 입기 좋은 압박형 타이츠예요.',
      costPoints: 180,
      repeatable: false,
    },
    {
      id: 'reward-running-gear-belt',
      title: '보틀 벨트',
      category: '러닝 용품',
      description: '장거리 러닝 때 휴대성과 수분 보충을 챙기기 좋아요.',
      costPoints: 110,
      repeatable: false,
    },
    {
      id: 'reward-gifticon-gs',
      title: 'GS25 5천원',
      category: '키프티콘',
      description: '러닝 후 간단한 간식이나 음료를 고르기 좋은 교환권이에요.',
      costPoints: 70,
      partnerName: 'GS25',
      repeatable: false,
    },
    {
      id: 'reward-gifticon-olive',
      title: '올리브영 1만원',
      category: '키프티콘',
      description: '러닝 보조용품이나 케어 아이템 구매에 쓰기 좋아요.',
      costPoints: 150,
      partnerName: '올리브영',
      repeatable: false,
    },
  ];
}

const SEOUL_DISTRICT_NAMES = [
  '종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구', '성북구', '강북구', '도봉구',
  '노원구', '은평구', '서대문구', '마포구', '양천구', '강서구', '구로구', '금천구', '영등포구', '동작구',
  '관악구', '서초구', '강남구', '송파구', '강동구',
];

const GYEONGGI_CITY_SPECS = [
  { name: '수원시', districts: ['장안구', '권선구', '팔달구', '영통구'] },
  { name: '성남시', districts: ['수정구', '중원구', '분당구'] },
  { name: '의정부시' },
  { name: '안양시', districts: ['만안구', '동안구'] },
  { name: '부천시' },
  { name: '광명시' },
  { name: '평택시' },
  { name: '동두천시' },
  { name: '안산시', districts: ['상록구', '단원구'] },
  { name: '고양시', districts: ['덕양구', '일산동구', '일산서구'] },
  { name: '과천시' },
  { name: '구리시' },
  { name: '남양주시' },
  { name: '오산시' },
  { name: '시흥시' },
  { name: '군포시' },
  { name: '의왕시' },
  { name: '하남시' },
  { name: '용인시', districts: ['처인구', '기흥구', '수지구'] },
  { name: '파주시' },
  { name: '이천시' },
  { name: '안성시' },
  { name: '김포시' },
  { name: '화성시' },
  { name: '광주시' },
  { name: '양주시' },
  { name: '포천시' },
  { name: '여주시' },
  { name: '연천군' },
  { name: '가평군' },
  { name: '양평군' },
];

function roundMetric(value) {
  return Number(value.toFixed(1));
}

function createLeafRegionNode({
  id,
  name,
  level,
  rank,
  averageDistanceKm,
  totalDistanceKm,
  participationRate,
  participants,
}) {
  const normalizedAverageDistanceKm = roundMetric(averageDistanceKm);
  const normalizedParticipants = Math.max(24, Math.round(participants));

  return {
    id,
    name,
    level,
    averageDistanceKm: normalizedAverageDistanceKm,
    totalDistanceKm: totalDistanceKm ?? Math.round(normalizedAverageDistanceKm * normalizedParticipants),
    participationRate: Math.max(35, Math.round(participationRate)),
    participants: normalizedParticipants,
    rank,
  };
}

function createAggregateRegionNode({
  id,
  name,
  level,
  rank,
  children,
}) {
  const totalDistanceKm = children.reduce((sum, child) => sum + child.totalDistanceKm, 0);
  const participants = children.reduce((sum, child) => sum + child.participants, 0);
  const participationRate = roundMetric(children.reduce((sum, child) => sum + child.participationRate, 0) / Math.max(children.length, 1));

  return {
    id,
    name,
    level,
    averageDistanceKm: roundMetric(totalDistanceKm / Math.max(participants, 1)),
    totalDistanceKm,
    participationRate,
    participants,
    rank,
    children,
  };
}

function buildRegionNodeFromCatalog(node, id, rank, depth = 0) {
  if (!node.children?.length) {
    const averageBase = node.type === 'district' ? 27.8 : node.type === 'city' ? 23.7 : 21.6;
    const participantsBase = node.type === 'district' ? 162 : node.type === 'city' ? 520 : 860;
    const participationBase = node.type === 'district' ? 66 : node.type === 'city' ? 61 : 57;

    return createLeafRegionNode({
      id,
      name: node.name,
      level: node.type,
      rank,
      averageDistanceKm: Math.max(16.4, averageBase - rank * (node.type === 'district' ? 0.28 : 0.18) - depth * 0.15),
      participants: Math.max(42, participantsBase - rank * (node.type === 'district' ? 4 : 10) - depth * 6),
      participationRate: Math.max(44, participationBase - Math.floor(rank / 2) - depth),
    });
  }

  const children = node.children.map((child, index) =>
    buildRegionNodeFromCatalog(child, `${id}-${String(index + 1).padStart(2, '0')}`, index + 1, depth + 1));

  return createAggregateRegionNode({
    id,
    name: node.name,
    level: node.type,
    rank,
    children,
  });
}

function buildDistrictNodes(parentId, districtNames, options = {}) {
  const {
    averageBase = 25.8,
    averageStep = 0.32,
    participantsBase = 182,
    participantsStep = 5,
    participationBase = 65,
  } = options;

  return districtNames.map((districtName, index) => createLeafRegionNode({
    id: `${parentId}-${String(index + 1).padStart(2, '0')}`,
    name: districtName,
    level: 'district',
    rank: index + 1,
    averageDistanceKm: Math.max(16.2, averageBase - index * averageStep + (index % 3) * 0.08),
    participants: Math.max(42, participantsBase - index * participantsStep),
    participationRate: Math.max(45, participationBase - Math.floor(index / 2)),
  }));
}

function buildSeoulProvince() {
  const children = buildDistrictNodes('kr-seoul', SEOUL_DISTRICT_NAMES, {
    averageBase: 28.2,
    averageStep: 0.26,
    participantsBase: 154,
    participantsStep: 3,
    participationBase: 68,
  });

  return createAggregateRegionNode({
    id: 'kr-seoul',
    name: '서울특별시',
    level: 'province',
    rank: 1,
    children,
  });
}

function buildGyeonggiProvince() {
  const children = GYEONGGI_CITY_SPECS.map((city, index) => {
    const cityId = `kr-gg-${String(index + 1).padStart(2, '0')}`;

    if (city.districts) {
      const districtChildren = buildDistrictNodes(cityId, city.districts, {
        averageBase: Math.max(20.4, 25.4 - index * 0.08),
        averageStep: 0.28,
        participantsBase: Math.max(74, 212 - index * 5),
        participantsStep: 6,
        participationBase: Math.max(48, 66 - Math.floor(index / 4)),
      });

      return createAggregateRegionNode({
        id: cityId,
        name: city.name,
        level: 'city',
        rank: index + 1,
        children: districtChildren,
      });
    }

    return createLeafRegionNode({
      id: cityId,
      name: city.name,
      level: 'city',
      rank: index + 1,
      averageDistanceKm: Math.max(17.2, 23.7 - index * 0.12),
      participants: Math.max(108, 540 - index * 11),
      participationRate: Math.max(46, 63 - Math.floor(index / 3)),
    });
  });

  return createAggregateRegionNode({
    id: 'kr-gg',
    name: '경기도',
    level: 'province',
    rank: 5,
    children,
  });
}

function createUser(input) {
  return {
    ...input,
    rewardPoints: input.rewardPoints ?? 100,
    notificationSettings: input.notificationSettings ?? createNotificationSettings(),
    createdAt: input.createdAt ?? '2026-03-01T09:00:00.000Z',
  };
}

function createRun(input) {
  return {
    ...input,
    source: input.source ?? 'Manual',
  };
}

export function createRegionTree() {
  const children = addressCatalog.map((region, index) =>
    buildRegionNodeFromCatalog(region, `kr-${String(index + 1).padStart(2, '0')}`, index + 1));

  return createAggregateRegionNode({
    id: 'kr',
    name: '대한민국',
    level: 'country',
    rank: 1,
    children,
  });
}

export function createSeedStore() {
  const users = [
    createUser({
      id: 'user-1',
      username: 'demo-user',
      password: 'demo-pass',
      name: '민병희',
      phone: '01012345678',
      birthDate: '1990-01-01',
      provinceName: '서울특별시',
      districtName: '강남구',
      universityName: '서울대학교',
      addressDetail: '테헤란로 123',
      publicTag: '#BH7K2',
      friendDistanceKm: 84,
      friendPoints: 91,
      districtDistanceKm: 42.4,
      districtPoints: 98,
      rewardPoints: 128,
      streakDays: 11,
      connectedSources: createConnectedSources('ios'),
      notificationSettings: createNotificationSettings('ios'),
    }),
    createUser({
      id: 'user-2',
      username: 'kw-user',
      password: 'demo-pass',
      name: '김관우',
      phone: '01022223333',
      birthDate: '1997-07-11',
      provinceName: '서울특별시',
      districtName: '강남구',
      universityName: '연세대학교',
      addressDetail: '역삼로 55',
      publicTag: '#KW8M4',
      friendDistanceKm: 89,
      friendPoints: 98,
      districtDistanceKm: 89,
      districtPoints: 98,
      rewardPoints: 164,
      streakDays: 13,
      connectedSources: createConnectedSources('ios'),
      notificationSettings: createNotificationSettings('ios'),
    }),
    createUser({
      id: 'user-3',
      username: 'sj-user',
      password: 'demo-pass',
      name: '이서준',
      phone: '01033334444',
      birthDate: '1996-04-02',
      provinceName: '서울특별시',
      districtName: '서초구',
      universityName: '고려대학교',
      addressDetail: '서초대로 201',
      publicTag: '#SJ4Q8',
      friendDistanceKm: 77,
      friendPoints: 86,
      districtDistanceKm: 51.8,
      districtPoints: 88,
      rewardPoints: 112,
      streakDays: 9,
      connectedSources: createConnectedSources('android'),
      notificationSettings: createNotificationSettings('android'),
    }),
    createUser({
      id: 'user-4',
      username: 'jh-user',
      password: 'demo-pass',
      name: '박지훈',
      phone: '01044445555',
      birthDate: '1995-12-24',
      provinceName: '서울특별시',
      districtName: '강남구',
      universityName: '성균관대학교',
      addressDetail: '학동로 77',
      publicTag: '#JH3N1',
      friendDistanceKm: 61.2,
      friendPoints: 74,
      districtDistanceKm: 86,
      districtPoints: 95,
      rewardPoints: 120,
      streakDays: 8,
      connectedSources: createConnectedSources('android'),
      notificationSettings: createNotificationSettings('android'),
    }),
    createUser({
      id: 'user-5',
      username: 'mj-user',
      password: 'demo-pass',
      name: '최민준',
      phone: '01055556666',
      birthDate: '1997-02-18',
      provinceName: '서울특별시',
      districtName: '강남구',
      universityName: '한양대학교',
      addressDetail: '봉은사로 91',
      publicTag: '#MJ5T2',
      friendDistanceKm: 58.4,
      friendPoints: 70,
      districtDistanceKm: 81,
      districtPoints: 91,
      rewardPoints: 94,
      streakDays: 7,
      connectedSources: createConnectedSources('default'),
      notificationSettings: createNotificationSettings('default'),
    }),
    createUser({
      id: 'user-6',
      username: 'sy-user',
      password: 'demo-pass',
      name: '이서윤',
      phone: '01066667777',
      birthDate: '1999-06-06',
      provinceName: '서울특별시',
      districtName: '강남구',
      universityName: '경희대학교',
      addressDetail: '도산대로 45',
      publicTag: '#SY1R4',
      friendDistanceKm: 40.8,
      friendPoints: 48,
      districtDistanceKm: 41.1,
      districtPoints: 85,
      rewardPoints: 66,
      streakDays: 4,
      connectedSources: createConnectedSources('default'),
      notificationSettings: createNotificationSettings('default'),
    }),
    createUser({
      id: 'user-7',
      username: 'dy-user',
      password: 'demo-pass',
      name: '박도윤',
      phone: '01077778888',
      birthDate: '1998-09-10',
      provinceName: '서울특별시',
      districtName: '마포구',
      universityName: '중앙대학교',
      addressDetail: '월드컵북로 88',
      publicTag: '#DY2M8',
      friendDistanceKm: 52.3,
      friendPoints: 60,
      districtDistanceKm: 45.2,
      districtPoints: 83,
      rewardPoints: 72,
      streakDays: 5,
      connectedSources: createConnectedSources('default'),
      notificationSettings: createNotificationSettings('default'),
    }),
    createUser({
      id: 'user-8',
      username: 'yr-user',
      password: 'demo-pass',
      name: '한예린',
      phone: '01088889999',
      birthDate: '2000-01-17',
      provinceName: '서울특별시',
      districtName: '성동구',
      universityName: '이화여자대학교',
      addressDetail: '왕십리로 10',
      publicTag: '#YR4P6',
      friendDistanceKm: 47.1,
      friendPoints: 56,
      districtDistanceKm: 39.4,
      districtPoints: 78,
      rewardPoints: 58,
      streakDays: 6,
      connectedSources: createConnectedSources('default'),
      notificationSettings: createNotificationSettings('default'),
    }),
    createUser({
      id: 'user-9',
      username: 'ia-user',
      password: 'demo-pass',
      name: '정이안',
      phone: '01099990000',
      birthDate: '1998-11-03',
      provinceName: '서울특별시',
      districtName: '송파구',
      universityName: '건국대학교',
      addressDetail: '올림픽로 240',
      publicTag: '#IA9L3',
      friendDistanceKm: 46.2,
      friendPoints: 54,
      districtDistanceKm: 37.5,
      districtPoints: 76,
      rewardPoints: 52,
      streakDays: 3,
      connectedSources: createConnectedSources('default'),
      notificationSettings: createNotificationSettings('default'),
    })
  ];

  const runs = [
    createRun({ id: 'mr1', userId: 'user-1', date: '2026-03-30', distanceKm: 8.2, pace: '5:34/km', source: 'Apple Health' }),
    createRun({ id: 'mr2', userId: 'user-1', date: '2026-03-28', distanceKm: 11.0, pace: '5:22/km', source: 'Apple Health' }),
    createRun({ id: 'mr3', userId: 'user-1', date: '2026-03-25', distanceKm: 6.4, pace: '5:41/km', source: 'Manual' }),
    createRun({ id: 'mr4', userId: 'user-1', date: '2026-03-21', distanceKm: 9.8, pace: '5:19/km', source: 'Apple Health' }),
    createRun({ id: 'mr5', userId: 'user-1', date: '2026-03-18', distanceKm: 7.0, pace: '5:48/km', source: 'Apple Health' }),

    createRun({ id: 'fr1', userId: 'user-2', date: '2026-03-30', distanceKm: 10.0, pace: '5:12/km', source: 'Apple Health' }),
    createRun({ id: 'fr2', userId: 'user-2', date: '2026-03-28', distanceKm: 12.4, pace: '5:05/km', source: 'Apple Health' }),
    createRun({ id: 'fr3', userId: 'user-2', date: '2026-03-24', distanceKm: 8.6, pace: '5:18/km', source: 'Apple Health' }),
    createRun({ id: 'fr4', userId: 'user-2', date: '2026-03-20', distanceKm: 15.0, pace: '5:27/km', source: 'Strava' }),
    createRun({ id: 'fr5', userId: 'user-2', date: '2026-03-16', distanceKm: 9.2, pace: '5:09/km', source: 'Apple Health' }),

    createRun({ id: 'u3r1', userId: 'user-3', date: '2026-03-29', distanceKm: 9.8, pace: '5:26/km', source: 'Health Connect' }),
    createRun({ id: 'u3r2', userId: 'user-3', date: '2026-03-26', distanceKm: 7.4, pace: '5:39/km', source: 'Health Connect' }),
    createRun({ id: 'u3r3', userId: 'user-3', date: '2026-03-23', distanceKm: 8.1, pace: '5:31/km', source: 'Manual' }),
    createRun({ id: 'u3r4', userId: 'user-3', date: '2026-03-19', distanceKm: 6.7, pace: '5:44/km', source: 'Health Connect' }),
    createRun({ id: 'u3r5', userId: 'user-3', date: '2026-03-15', distanceKm: 7.1, pace: '5:36/km', source: 'Manual' }),

    createRun({ id: 'u4r1', userId: 'user-4', date: '2026-03-29', distanceKm: 11.2, pace: '5:11/km', source: 'Health Connect' }),
    createRun({ id: 'u4r2', userId: 'user-4', date: '2026-03-25', distanceKm: 10.4, pace: '5:20/km', source: 'Manual' }),
    createRun({ id: 'u5r1', userId: 'user-5', date: '2026-03-27', distanceKm: 8.7, pace: '5:28/km', source: 'Manual' }),
    createRun({ id: 'u5r2', userId: 'user-5', date: '2026-03-22', distanceKm: 7.6, pace: '5:34/km', source: 'Manual' }),
    createRun({ id: 'u6r1', userId: 'user-6', date: '2026-03-26', distanceKm: 6.2, pace: '5:42/km', source: 'Manual' }),
    createRun({ id: 'u7r1', userId: 'user-7', date: '2026-03-25', distanceKm: 5.9, pace: '5:51/km', source: 'Manual' }),
    createRun({ id: 'u8r1', userId: 'user-8', date: '2026-03-24', distanceKm: 5.4, pace: '5:49/km', source: 'Manual' }),
    createRun({ id: 'u9r1', userId: 'user-9', date: '2026-03-23', distanceKm: 5.8, pace: '5:46/km', source: 'Manual' })
  ];

  return {
    version: 1,
    users,
    runs,
    friendRequests: [
      {
        id: 'r1',
        requesterId: 'user-1',
        receiverId: 'user-7',
        status: 'pending',
        createdAt: '2026-03-30T11:20:00.000Z'
      },
      {
        id: 'r2',
        requesterId: 'user-8',
        receiverId: 'user-1',
        status: 'pending',
        createdAt: '2026-03-31T07:40:00.000Z'
      }
    ],
    friendships: [
      {
        id: 'f1',
        userIds: ['user-1', 'user-2'],
        createdAt: '2026-03-10T08:00:00.000Z'
      },
      {
        id: 'f2',
        userIds: ['user-1', 'user-3'],
        createdAt: '2026-03-12T08:00:00.000Z'
      },
      {
        id: 'f3',
        userIds: ['user-1', 'user-4'],
        createdAt: '2026-03-14T08:00:00.000Z'
      },
      {
        id: 'f4',
        userIds: ['user-1', 'user-5'],
        createdAt: '2026-03-16T08:00:00.000Z'
      },
      {
        id: 'f5',
        userIds: ['user-1', 'user-6'],
        createdAt: '2026-03-18T08:00:00.000Z'
      },
      {
        id: 'f6',
        userIds: ['user-1', 'user-9'],
        createdAt: '2026-03-19T08:00:00.000Z'
      }
    ],
    rewardRedemptions: [
      {
        id: 'redemption-1',
        userId: 'user-1',
        itemId: 'reward-theme-midnight',
        claimedAt: '2026-03-20T08:30:00.000Z'
      }
    ],
    sessions: [],
    marketCatalog: createMarketCatalog(),
    regionTree: createRegionTree()
  };
}
