import { addressCatalog } from './addressCatalog.mjs';
import { hashPassword } from './auth.mjs';
import { buildUserRunMetrics } from './points.mjs';

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
  return [
    createSource({ sourceType: 'manual', displayName: 'Manual' }),
    createSource({ sourceType: 'apple_health', displayName: 'Apple Health', recommendedPlatform: 'ios' }),
    createSource({ sourceType: 'health_connect', displayName: 'Health Connect', recommendedPlatform: 'android' }),
    createSource({ sourceType: 'garmin', displayName: 'Garmin' }),
    createSource({ sourceType: 'strava', displayName: 'Strava' }),
    createSource({ sourceType: 'nrc', displayName: 'Nike Run Club' }),
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
  const { password, realName, ...rest } = input;

  return {
    ...rest,
    realName: typeof realName === 'string' && realName.trim() ? realName.trim() : rest.name,
    passwordHash: hashPassword(password),
    passwordUpdatedAt: '2026-03-01T09:00:00.000Z',
    rewardPoints: input.rewardPoints ?? 0,
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

export function createRegionTree(data = {}) {
  const users = Array.isArray(data.users) ? data.users : [];
  const runs = Array.isArray(data.runs) ? data.runs : [];
  const distanceByUserId = new Map();
  const membersByKey = new Map();
  const activeMembersByKey = new Map();
  const distanceByKey = new Map();
  const runsByUserId = new Map();

  for (const run of runs) {
    if (!run?.userId || typeof run.distanceKm !== 'number') {
      continue;
    }

    runsByUserId.set(run.userId, [...(runsByUserId.get(run.userId) ?? []), run]);
  }

  for (const user of users) {
    const weeklyDistanceKm = buildUserRunMetrics(runsByUserId.get(user.id) ?? []).currentWeekDistanceKm;
    distanceByUserId.set(user.id, weeklyDistanceKm);
  }

  for (const user of users) {
    const provinceName = typeof user.provinceName === 'string' ? user.provinceName.trim() : '';
    const cityName = typeof user.cityName === 'string' ? user.cityName.trim() : '';
    const districtName = typeof user.districtName === 'string' ? user.districtName.trim() : '';
    const totalDistanceKm = Number((distanceByUserId.get(user.id) ?? 0).toFixed(1));
    const isActive = totalDistanceKm > 0;

    if (!provinceName) {
      continue;
    }

    const nodeKeys = [`province:${provinceName}`];

    if (cityName) {
      nodeKeys.push(`province:${provinceName}/city:${cityName}`);

      if (districtName && districtName !== cityName) {
        nodeKeys.push(`province:${provinceName}/city:${cityName}/district:${districtName}`);
      }
    } else if (districtName) {
      nodeKeys.push(`province:${provinceName}/district:${districtName}`);
    }

    for (const key of nodeKeys) {
      membersByKey.set(key, (membersByKey.get(key) ?? 0) + 1);
      distanceByKey.set(key, Number(((distanceByKey.get(key) ?? 0) + totalDistanceKm).toFixed(1)));

      if (isActive) {
        activeMembersByKey.set(key, (activeMembersByKey.get(key) ?? 0) + 1);
      }
    }
  }

  const buildNode = (node, id, rank, parentKey = '') => {
    const currentKey = parentKey ? `${parentKey}/${node.type}:${node.name}` : `${node.type}:${node.name}`;
    const children = (node.children ?? []).map((child, index) =>
      buildNode(child, `${id}-${String(index + 1).padStart(2, '0')}`, index + 1, currentKey));

    if (children.length > 0) {
      const participants = children.reduce((sum, child) => sum + child.participants, 0);
      const totalDistanceKm = Number(children.reduce((sum, child) => sum + child.totalDistanceKm, 0).toFixed(1));
      const activeParticipants = children.reduce(
        (sum, child) => sum + Math.round((child.participationRate / 100) * child.participants),
        0,
      );

      return {
        id,
        name: node.name,
        level: node.type,
        averageDistanceKm: participants > 0 ? Number((totalDistanceKm / participants).toFixed(1)) : 0,
        totalDistanceKm,
        participationRate: participants > 0 ? Math.round((activeParticipants / participants) * 100) : 0,
        participants,
        rank,
        children,
      };
    }

    const participants = membersByKey.get(currentKey) ?? 0;
    const totalDistanceKm = Number((distanceByKey.get(currentKey) ?? 0).toFixed(1));
    const activeParticipants = activeMembersByKey.get(currentKey) ?? 0;

    return {
      id,
      name: node.name,
      level: node.type,
      averageDistanceKm: participants > 0 ? Number((totalDistanceKm / participants).toFixed(1)) : 0,
      totalDistanceKm,
      participationRate: participants > 0 ? Math.round((activeParticipants / participants) * 100) : 0,
      participants,
      rank,
    };
  };

  const children = addressCatalog.map((region, index) =>
    buildNode(region, `kr-${String(index + 1).padStart(2, '0')}`, index + 1));
  const participants = children.reduce((sum, child) => sum + child.participants, 0);
  const totalDistanceKm = Number(children.reduce((sum, child) => sum + child.totalDistanceKm, 0).toFixed(1));
  const activeParticipants = children.reduce(
    (sum, child) => sum + Math.round((child.participationRate / 100) * child.participants),
    0,
  );

  return {
    id: 'kr',
    name: '대한민국',
    level: 'country',
    averageDistanceKm: participants > 0 ? Number((totalDistanceKm / participants).toFixed(1)) : 0,
    totalDistanceKm,
    participationRate: participants > 0 ? Math.round((activeParticipants / participants) * 100) : 0,
    participants,
    rank: 1,
    children,
  };
}

export function createSeedStore() {
  const users = [];
  const runs = [];

  return {
    version: 1,
    users,
    runs,
    integrationImports: [],
    friendRequests: [],
    friendships: [],
    rewardRedemptions: [],
    sessions: [],
    marketCatalog: [],
    regionTree: createRegionTree({ users, runs }),
  };
}
