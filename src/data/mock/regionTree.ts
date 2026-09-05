import type { RegionDrilldownNode } from '@/domain';
import { addressCatalog, type AddressRegionNode } from '@/features/location/addressCatalog';

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
    // 실서버는 월간 우승 리프에만 stars를 싣는다 — 목도 1위 리프에 별 하나를 얹어
    // 히어로/행의 ★ 표기를 개발에서 보이게.
    ...(input.rank === 1 ? { stars: 1 } : {}),
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
