import type { DistrictPersonalMetric, DistrictPersonalRank, RegionDrilldownNode } from '@/domain';
import type { LeagueProfileRegion, LeagueRegionNodeIdentity, PodiumRank, PodiumTheme } from '@/features/league/types/league';
import { colors } from '@/theme/tokens';
import { formatDistanceValue } from '@/utils/formatUnits';

export const PODIUM_THEME: Record<PodiumRank, PodiumTheme> = {
  1: {
    iconColor: colors.podiumGold,
    backgroundColor: colors.podiumGoldSoft,
    borderColor: colors.podiumGoldBorder,
    textColor: colors.podiumGoldText,
  },
  2: {
    iconColor: colors.podiumSilver,
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.indigoBorder,
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

export function isMyRegionNode(node: LeagueRegionNodeIdentity, profile: LeagueProfileRegion | null | undefined) {
  if (!profile) {
    return false;
  }

  switch (node.level) {
    case 'province':
      return node.name === profile.provinceName;
    case 'city':
      return node.name === profile.cityName;
    case 'district':
      return node.name === profile.districtName;
    default:
      return false;
  }
}
