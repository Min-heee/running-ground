import type { RegionDrilldownNode } from '@/domain';
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
