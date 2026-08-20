import { regionDrilldownTree } from '@/data/mock';

import { apiGet } from '../client';

import { USE_MOCK_API } from '../config';

import type {
  UniverseBody,
  UniverseLevel,
  UniverseResponse,
  UniverseSearchResponse,
} from '../types';

import {
  capRegionPathDepth,
  findRegionPath,
  isRegionLeafLevel,
} from './_shared';
import { getAccessToken } from '@/lib/session';

function universeLevelFor(regionLevel: string): UniverseLevel {
  if (isRegionLeafLevel(regionLevel as never)) {
    return 'galaxy';
  }

  return regionLevel === 'province' ? 'group' : 'cluster';
}

// 목 전용 근사치 — 실제 크기/밝기 공식은 백엔드 lib/universeBodies.mjs가 유일한 근원이다.
// 여기서 진짜 공식을 흉내 내면 두 벌이 되어 갈라지므로, 오프라인 개발용 눈요기로만 만든다.
function buildMockUniverseBodies(nodes: { id: string; name: string; level: string; averageDistanceKm: number; totalDistanceKm: number; participants: number; participationRate: number; stars?: number }[]): UniverseBody[] {
  const maxTotal = nodes.reduce((max, node) => Math.max(max, node.totalDistanceKm), 0);
  const averageOfAverages = nodes.length > 0
    ? nodes.reduce((sum, node) => sum + node.averageDistanceKm, 0) / nodes.length
    : 0;

  return nodes.map((node) => ({
    id: node.id,
    name: node.name,
    level: universeLevelFor(node.level),
    memberCount: node.participants,
    totalDistanceKm: node.totalDistanceKm,
    averageDistanceKm: node.averageDistanceKm,
    participationRate: node.participationRate,
    stars: node.stars ?? 0,
    scale: averageOfAverages > 0
      ? Math.min(2.2, Math.max(0.45, node.averageDistanceKm / averageOfAverages))
      : 1,
    brightness: maxTotal > 0
      ? Math.max(0.15, Math.log1p(node.totalDistanceKm) / Math.log1p(maxTotal))
      : 0.05,
    isMine: false,
  }));
}

// 목에서도 '내 별'이 있어야 한다 — 없으면 '내 행성으로'도, 별 탄생 연출도 개발 중에는
// 영영 안 나와 눈으로 확인할 수가 없다. buildMockGalaxy가 isMine으로 찍는 4번째 행성과
// 같은 사람을 가리킨다.
function mockMe(): UniverseResponse['me'] {
  const findLeaf = (node: typeof regionDrilldownTree): typeof regionDrilldownTree | null => {
    if (isRegionLeafLevel(node.level as never)) {
      return node;
    }

    for (const child of node.children ?? []) {
      const leaf = findLeaf(child as typeof regionDrilldownTree);

      if (leaf) {
        return leaf;
      }
    }

    return null;
  };

  const leaf = findLeaf(regionDrilldownTree);

  return leaf
    ? { userId: `${leaf.id}-mock-3`, galaxyNodeId: leaf.id, galaxyName: leaf.name }
    : { userId: 'mock-user', galaxyNodeId: null, galaxyName: null };
}

function buildMockUniverseResponse(nodeId?: string): UniverseResponse {
  const rawPath = nodeId
    ? (findRegionPath(regionDrilldownTree, nodeId) ?? [regionDrilldownTree])
    : [regionDrilldownTree];
  const path = capRegionPathDepth(rawPath);
  const currentNode = path[path.length - 1];
  const level = universeLevelFor(currentNode.level);

  return {
    level,
    node: {
      id: currentNode.id,
      name: currentNode.name,
      level,
      memberCount: currentNode.participants,
      totalDistanceKm: currentNode.totalDistanceKm,
      averageDistanceKm: currentNode.averageDistanceKm,
      participationRate: currentNode.participationRate,
      stars: currentNode.stars ?? 0,
    },
    breadcrumb: path.map(({ id, name, level: regionLevel }) => ({
      id,
      name,
      level: universeLevelFor(regionLevel),
    })),
    nationwideAverageDistanceKm: regionDrilldownTree.averageDistanceKm,
    me: mockMe(),
    bodies: level === 'galaxy' ? [] : buildMockUniverseBodies(currentNode.children ?? []),
    galaxy: level === 'galaxy' ? buildMockGalaxy(currentNode) : null,
  };
}


// 목 전용 은하 내부 — 실서버에선 universeBuilder가 채운다. 오프라인에서 행성/항성 렌더를
// 눈으로 확인할 수 있게 결정적(회원수 기반) 샘플을 만든다. 진짜 공식은 백엔드에만 있다.
// 항성 = 누적 거리 1등, 은하마다 하나뿐. 원시성(이번 달 1등)은 이 사이트에 없다.
function buildMockGalaxy(node: { id: string; name: string; participants: number; averageDistanceKm: number }): {
  planets: {
    userId: string; userName: string; lifetimeDistanceKm: number; monthDistanceKm: number;
    scale: number; brightness: number; stars: number; isStar: boolean; isMine: boolean;
  }[];
  nebula: { memberCount: number; totalLifetimeDistanceKm: number } | null;
} {
  const NAMES = ['민병희', '회원F', '회원K', '회원I', '회원G', '회원C', '회원J', '회원H', '한강러너', '새벽조깅', '언덕왕', '페이스메이커'];
  const visible = Math.max(0, Math.min(NAMES.length, node.participants));
  // 누적 거리는 현실적인 스펙트럼으로 — 전엔 전원이 1.6배 안에 몰려 '누적 1등이 제일
  // 크다'가 화면에서 안 읽혔다.
  const lifetimes = Array.from({ length: visible }, (_, index) => {
    const monthDistanceKm = Number((node.averageDistanceKm * (1.9 - index * 0.13)).toFixed(1));
    const lifetimeDistanceKm = Math.round(node.averageDistanceKm * 110 * 0.58 ** index);
    return { monthDistanceKm, lifetimeDistanceKm };
  });
  const maxLifetimeKm = lifetimes.reduce((max, entry) => Math.max(max, entry.lifetimeDistanceKm), 0);

  const planets = lifetimes.map(({ monthDistanceKm, lifetimeDistanceKm }, index) => ({
    userId: `${node.id}-mock-${index}`,
    userName: NAMES[index],
    lifetimeDistanceKm,
    monthDistanceKm,
    // 크기 = 누적 거리의 선형 비율(진짜 규칙 planetScale과 같은 모양: 바닥 0.22).
    scale: maxLifetimeKm > 0
      ? Number((0.22 + 0.78 * (lifetimeDistanceKm / maxLifetimeKm)).toFixed(3))
      : 0.22,
    brightness: Number((0.35 + 0.65 * (1 - index / NAMES.length)).toFixed(2)),
    stars: index === 0 ? 2 : index === 1 ? 1 : 0,
    isStar: false,
    isMine: index === 3,
  }));

  // 항성 = 누적 거리 1등 — 진짜 규칙(universeBuilder.pickStarUserId)과 같은 그림이 나오게.
  const starIndex = planets.reduce(
    (best, planet, index) => (planet.lifetimeDistanceKm > planets[best]?.lifetimeDistanceKm ? index : best),
    0,
  );

  if (planets.length > 0) {
    planets[starIndex].isStar = true;
  }

  return {
    planets,
    nebula: node.participants > visible
      ? { memberCount: node.participants - visible, totalLifetimeDistanceKm: (node.participants - visible) * 180 }
      : null,
  };
}

// 우주는 로그인 없이도 볼 수 있다 (오너 2026-08-16: 사이트는 공개, 자기 별을 가지려면
// 로그인). 토큰이 있으면 인증 경로로 — 그래야 '내 별'이 표시된다. 없으면 공개 경로로.
// TestFlight 검증용 게이트 — 우주 백엔드가 아직 미배포라(/api/universe 404) 실서버
// 모드에서도 우주만 표본 데이터로 돌린다. 백엔드가 배포되면 eas.json의
// EXPO_PUBLIC_UNIVERSE_MOCK을 끄면 된다. 우주 외 앱 기능에는 영향이 없다.
const UNIVERSE_FORCE_MOCK = process.env.EXPO_PUBLIC_UNIVERSE_MOCK === 'true';

export async function fetchUniverse(nodeId?: string): Promise<UniverseResponse> {
  if (USE_MOCK_API || UNIVERSE_FORCE_MOCK) {
    return buildMockUniverseResponse(nodeId);
  }

  const query = nodeId ? `?nodeId=${encodeURIComponent(nodeId)}` : '';
  const accessToken = await getAccessToken();

  if (!accessToken) {
    return apiGet<UniverseResponse>(`/public/universe${query}`, {
      fallbackMessage: '우주를 불러오지 못했어요.',
    });
  }

  return apiGet<UniverseResponse>(`/universe${query}`, {
    accessToken,
    fallbackMessage: '우주를 불러오지 못했어요.',
  });
}

// 목 전용 검색 — 지역 트리의 리프를 돌며 buildMockGalaxy가 만드는 이름들에서 찾는다.
// 진짜 명부는 백엔드에만 있다(lib/universeSearch.mjs).
function searchMockUniverse(query: string): UniverseSearchResponse {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, '');

  if (normalized.length < 2) {
    return { query: normalized, results: [] };
  }

  const results: UniverseSearchResponse['results'] = [];
  const visit = (node: typeof regionDrilldownTree, trail: string[]) => {
    if (isRegionLeafLevel(node.level as never)) {
      for (const planet of buildMockGalaxy(node).planets) {
        if (planet.userName.toLowerCase().replace(/\s+/g, '').includes(normalized)) {
          results.push({
            userId: planet.userId,
            userName: planet.userName,
            galaxyNodeId: node.id,
            galaxyName: node.name,
            regionPath: [...trail, node.name].join(' · '),
            monthDistanceKm: planet.monthDistanceKm,
            isMine: planet.isMine,
          });
        }
      }

      return;
    }

    for (const child of node.children ?? []) {
      visit(child as typeof regionDrilldownTree, node.level === 'country' ? trail : [...trail, node.name]);
    }
  };

  visit(regionDrilldownTree, []);

  return { query: normalized, results: results.slice(0, 12) };
}

export async function searchUniverse(query: string): Promise<UniverseSearchResponse> {
  if (USE_MOCK_API || UNIVERSE_FORCE_MOCK) {
    return searchMockUniverse(query);
  }

  const path = `?q=${encodeURIComponent(query)}`;
  const accessToken = await getAccessToken();

  if (!accessToken) {
    return apiGet<UniverseSearchResponse>(`/public/universe/search${path}`, {
      fallbackMessage: '검색하지 못했어요.',
    });
  }

  return apiGet<UniverseSearchResponse>(`/universe/search${path}`, {
    accessToken,
    fallbackMessage: '검색하지 못했어요.',
  });
}
