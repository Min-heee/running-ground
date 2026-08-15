import { regionDrilldownTree } from '@/data/mock';

import { apiGet } from '../client';

import { USE_MOCK_API } from '../config';

import type {
  UniverseBody,
  UniverseLevel,
  UniverseResponse,
} from '../types';

import {
  capRegionPathDepth,
  findRegionPath,
  isRegionLeafLevel,
  requireAccessToken,
} from './_shared';

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
    me: { userId: 'mock-user', galaxyNodeId: null, galaxyName: null },
    bodies: level === 'galaxy' ? [] : buildMockUniverseBodies(currentNode.children ?? []),
    galaxy: level === 'galaxy' ? { star: null, planets: [], nebula: null } : null,
  };
}

export async function fetchUniverse(nodeId?: string): Promise<UniverseResponse> {
  if (USE_MOCK_API) {
    return buildMockUniverseResponse(nodeId);
  }

  const query = nodeId ? `?nodeId=${encodeURIComponent(nodeId)}` : '';

  return apiGet<UniverseResponse>(`/universe${query}`, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '우주를 불러오지 못했어요.',
  });
}
