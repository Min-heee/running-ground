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

function createUser(input) {
  return {
    ...input,
    createdAt: input.createdAt ?? '2026-03-01T09:00:00.000Z',
  };
}

function createRun(input) {
  return {
    ...input,
    source: input.source ?? 'Manual',
  };
}

function createRegionTree() {
  return {
    id: 'kr',
    name: '대한민국',
    level: 'country',
    averageDistanceKm: 21.8,
    totalDistanceKm: 271410,
    participationRate: 57,
    participants: 12450,
    rank: 1,
    children: [
      {
        id: 'kr-seoul',
        name: '서울특별시',
        level: 'province',
        averageDistanceKm: 22.4,
        totalDistanceKm: 60704,
        participationRate: 58,
        participants: 2710,
        rank: 1,
        children: [
          { id: 'kr-seoul-gangnam', name: '강남구', level: 'district', averageDistanceKm: 24.7, totalDistanceKm: 2480, participationRate: 62, participants: 128, rank: 1 },
          { id: 'kr-seoul-seocho', name: '서초구', level: 'district', averageDistanceKm: 26.1, totalDistanceKm: 2632, participationRate: 64, participants: 131, rank: 2 },
          { id: 'kr-seoul-songpa', name: '송파구', level: 'district', averageDistanceKm: 28.4, totalDistanceKm: 2840, participationRate: 68, participants: 142, rank: 3 },
          { id: 'kr-seoul-mapo', name: '마포구', level: 'district', averageDistanceKm: 23.9, totalDistanceKm: 2389, participationRate: 58, participants: 119, rank: 4 },
          { id: 'kr-seoul-seongdong', name: '성동구', level: 'district', averageDistanceKm: 22.8, totalDistanceKm: 2280, participationRate: 55, participants: 111, rank: 5 }
        ]
      },
      { id: 'kr-busan', name: '부산광역시', level: 'province', averageDistanceKm: 20.9, totalDistanceKm: 29887, participationRate: 54, participants: 1430, rank: 2 },
      { id: 'kr-daegu', name: '대구광역시', level: 'province', averageDistanceKm: 20.6, totalDistanceKm: 21424, participationRate: 53, participants: 1040, rank: 3 },
      { id: 'kr-incheon', name: '인천광역시', level: 'province', averageDistanceKm: 21.1, totalDistanceKm: 26692, participationRate: 55, participants: 1265, rank: 4 },
      {
        id: 'kr-gg',
        name: '경기도',
        level: 'province',
        averageDistanceKm: 23.1,
        totalDistanceKm: 73458,
        participationRate: 61,
        participants: 3180,
        rank: 5,
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
              { id: 'kr-gg-goyang-ilsandong', name: '일산동구', level: 'district', averageDistanceKm: 22.9, totalDistanceKm: 3915, participationRate: 58, participants: 171, rank: 3 }
            ]
          },
          { id: 'kr-gg-seongnam', name: '성남시', level: 'city', averageDistanceKm: 22.8, totalDistanceKm: 13452, participationRate: 59, participants: 590, rank: 2 },
          { id: 'kr-gg-suwon', name: '수원시', level: 'city', averageDistanceKm: 21.9, totalDistanceKm: 11826, participationRate: 57, participants: 540, rank: 3 }
        ]
      },
      { id: 'kr-gw', name: '강원특별자치도', level: 'province', averageDistanceKm: 22.0, totalDistanceKm: 15488, participationRate: 56, participants: 704, rank: 6 },
      { id: 'kr-cb', name: '충청북도', level: 'province', averageDistanceKm: 21.4, totalDistanceKm: 14723, participationRate: 55, participants: 688, rank: 7 },
      { id: 'kr-cn', name: '충청남도', level: 'province', averageDistanceKm: 21.7, totalDistanceKm: 18228, participationRate: 56, participants: 840, rank: 8 },
      { id: 'kr-jb', name: '전북특별자치도', level: 'province', averageDistanceKm: 20.7, totalDistanceKm: 15318, participationRate: 53, participants: 740, rank: 9 },
      { id: 'kr-jn', name: '전라남도', level: 'province', averageDistanceKm: 20.4, totalDistanceKm: 14484, participationRate: 52, participants: 710, rank: 10 },
      { id: 'kr-gb', name: '경상북도', level: 'province', averageDistanceKm: 21.2, totalDistanceKm: 19716, participationRate: 54, participants: 930, rank: 11 },
      { id: 'kr-gn', name: '경상남도', level: 'province', averageDistanceKm: 21.5, totalDistanceKm: 22188, participationRate: 55, participants: 1032, rank: 12 },
      { id: 'kr-jeju', name: '제주특별자치도', level: 'province', averageDistanceKm: 22.6, totalDistanceKm: 9899, participationRate: 58, participants: 438, rank: 13 }
    ]
  };
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
      districtName: '강남구',
      publicTag: '#BH7K2',
      friendDistanceKm: 84,
      friendPoints: 91,
      districtDistanceKm: 42.4,
      districtPoints: 98,
      streakDays: 11,
      connectedSources: createConnectedSources('ios'),
    }),
    createUser({
      id: 'user-2',
      username: 'kw-user',
      password: 'demo-pass',
      name: '김관우',
      phone: '01022223333',
      birthDate: '1997-07-11',
      districtName: '강남구',
      publicTag: '#KW8M4',
      friendDistanceKm: 89,
      friendPoints: 98,
      districtDistanceKm: 89,
      districtPoints: 98,
      streakDays: 13,
      connectedSources: createConnectedSources('ios'),
    }),
    createUser({
      id: 'user-3',
      username: 'sj-user',
      password: 'demo-pass',
      name: '이서준',
      phone: '01033334444',
      birthDate: '1996-04-02',
      districtName: '서초구',
      publicTag: '#SJ4Q8',
      friendDistanceKm: 77,
      friendPoints: 86,
      districtDistanceKm: 51.8,
      districtPoints: 88,
      streakDays: 9,
      connectedSources: createConnectedSources('android'),
    }),
    createUser({
      id: 'user-4',
      username: 'jh-user',
      password: 'demo-pass',
      name: '박지훈',
      phone: '01044445555',
      birthDate: '1995-12-24',
      districtName: '강남구',
      publicTag: '#JH3N1',
      friendDistanceKm: 61.2,
      friendPoints: 74,
      districtDistanceKm: 86,
      districtPoints: 95,
      streakDays: 8,
      connectedSources: createConnectedSources('android'),
    }),
    createUser({
      id: 'user-5',
      username: 'mj-user',
      password: 'demo-pass',
      name: '최민준',
      phone: '01055556666',
      birthDate: '1997-02-18',
      districtName: '강남구',
      publicTag: '#MJ5T2',
      friendDistanceKm: 58.4,
      friendPoints: 70,
      districtDistanceKm: 81,
      districtPoints: 91,
      streakDays: 7,
      connectedSources: createConnectedSources('default'),
    }),
    createUser({
      id: 'user-6',
      username: 'sy-user',
      password: 'demo-pass',
      name: '이서윤',
      phone: '01066667777',
      birthDate: '1999-06-06',
      districtName: '강남구',
      publicTag: '#SY1R4',
      friendDistanceKm: 40.8,
      friendPoints: 48,
      districtDistanceKm: 41.1,
      districtPoints: 85,
      streakDays: 4,
      connectedSources: createConnectedSources('default'),
    }),
    createUser({
      id: 'user-7',
      username: 'dy-user',
      password: 'demo-pass',
      name: '박도윤',
      phone: '01077778888',
      birthDate: '1998-09-10',
      districtName: '마포구',
      publicTag: '#DY2M8',
      friendDistanceKm: 52.3,
      friendPoints: 60,
      districtDistanceKm: 45.2,
      districtPoints: 83,
      streakDays: 5,
      connectedSources: createConnectedSources('default'),
    }),
    createUser({
      id: 'user-8',
      username: 'yr-user',
      password: 'demo-pass',
      name: '한예린',
      phone: '01088889999',
      birthDate: '2000-01-17',
      districtName: '성동구',
      publicTag: '#YR4P6',
      friendDistanceKm: 47.1,
      friendPoints: 56,
      districtDistanceKm: 39.4,
      districtPoints: 78,
      streakDays: 6,
      connectedSources: createConnectedSources('default'),
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
    createRun({ id: 'u8r1', userId: 'user-8', date: '2026-03-24', distanceKm: 5.4, pace: '5:49/km', source: 'Manual' })
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
      }
    ],
    sessions: [],
    regionTree: createRegionTree()
  };
}
