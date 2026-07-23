import type { DistrictPersonalMetric, DistrictPersonalRank, RegionDrilldownNode } from '@/domain';
import type { LeagueProfileRegion, LeagueRegionNodeIdentity, PodiumRank, PodiumTheme } from '@/features/league/types/league';
import { colors } from '@/theme/tokens';
import { formatDistanceValue } from '@/utils/formatUnits';
import { normalizeRegionName } from '@/utils/legacyRegionNames';

export const PODIUM_THEME: Record<PodiumRank, PodiumTheme> = {
  1: {
    iconColor: colors.podiumGold,
    backgroundColor: colors.podiumGoldSoft,
    borderColor: colors.podiumGoldBorder,
    textColor: colors.podiumGoldText,
  },
  2: {
    iconColor: colors.podiumSilver,
    backgroundColor: colors.podiumSilverSoft,
    borderColor: colors.podiumSilverBorder,
    textColor: colors.podiumSilverText,
  },
  3: {
    iconColor: colors.podiumBronze,
    backgroundColor: colors.podiumBronzeSoft,
    borderColor: colors.podiumBronzeBorder,
    textColor: colors.podiumBronzeText,
  },
};

export function formatLeagueDistanceValue(value: number) {
  return formatDistanceValue(value);
}

export function getPodiumTheme(rank: number) {
  return rank === 1 || rank === 2 || rank === 3 ? PODIUM_THEME[rank] : null;
}

export function sortRegionChildrenByRank(children: RegionDrilldownNode[]) {
  return [...children].sort((left, right) => left.rank - right.rank);
}

function getDistrictMetricValue(runner: DistrictPersonalRank, metric: DistrictPersonalMetric) {
  return metric === 'monthlyDistance' ? runner.monthlyDistanceKm : runner.rankScore;
}

// Re-sort the member list by the selected metric (descending), re-numbering the
// displayed rank. Sorting happens client-side because every row carries both
// metric values, so no extra server round-trip is needed when the user toggles.
export function sortDistrictRanksByMetric(
  ranks: DistrictPersonalRank[],
  metric: DistrictPersonalMetric,
): DistrictPersonalRank[] {
  return [...ranks]
    .sort((left, right) => {
      const metricDelta = getDistrictMetricValue(right, metric) - getDistrictMetricValue(left, metric);

      if (metricDelta !== 0) {
        return metricDelta;
      }

      // Stable tiebreak so equal metric values keep a deterministic order.
      const distanceDelta = right.distanceKm - left.distanceKm;

      if (distanceDelta !== 0) {
        return distanceDelta;
      }

      return left.name.localeCompare(right.name, 'ko');
    })
    .map((runner, index) => ({ ...runner, rank: index + 1 }));
}

// "내 지역" 판정은 이름 하나가 아니라 트리 조상까지 본다. 같은 구 이름이 전국에
// 반복되므로 (동구가 6개 광역시에 존재) 이름만 비교하면 광주 동구 유저에게 인천·
// 대전 동구까지 전부 내 지역으로 하이라이트되는 버그가 있었다 (2026-07-23).
// `ancestors`는 노드까지의 경로에서 노드 위에 있는 항목들 — 조상을 모르는 호출부
// (빈 배열)는 이름 비교로만 동작하는 관대한 폴백.
export function isMyRegionNode(
  node: LeagueRegionNodeIdentity,
  profile: LeagueProfileRegion | null | undefined,
  ancestors: LeagueRegionNodeIdentity[] = [],
) {
  if (!profile) {
    return false;
  }

  const provinceAncestor = ancestors.find((entry) => entry.level === 'province')?.name ?? null;
  const cityAncestor = ancestors.find((entry) => entry.level === 'city')?.name ?? null;

  // 2026-07 행정통합(광주+전남→전남광주통합특별시): OTA/백엔드 재배포 시차 동안
  // 서버 트리와 캐시된 프로필 중 한쪽만 옛 시·도 이름일 수 있어 시·도 비교는 양쪽
  // 모두 정규화해서 견준다. (빈 프로필 이름은 ''가 되고 노드 이름은 항상 비어있지
  // 않으므로 미설정 프로필이 오판되는 일은 없다.)
  const profileProvince = normalizeRegionName(profile.provinceName);
  const provinceAncestorMatches = provinceAncestor === null
    || normalizeRegionName(provinceAncestor) === profileProvince;

  switch (node.level) {
    case 'province':
      return normalizeRegionName(node.name) === profileProvince;
    case 'city':
      return node.name === profile.cityName && provinceAncestorMatches;
    case 'district':
      // 광역시 트리는 city 레벨이 없으므로: city 조상 부재(null→'')와 프로필의
      // 빈 cityName('')이 일치해야 한다. 도 트리라면 city 조상까지 일치 필수.
      return node.name === profile.districtName
        && provinceAncestorMatches
        && (cityAncestor ?? '') === (profile.cityName ?? '');
    default:
      return false;
  }
}
