import type { RankLeaderboard, RankLeaderboardTier } from '@/features/league/types/league';
import { RANK_TIERS } from '@/features/rank/rankDisplay';

const RANK_TIER_ORDER = new Map<string, number>(RANK_TIERS.map((tier, index) => [tier, index]));

function resolveTierOrder(tier: string) {
  return RANK_TIER_ORDER.get(tier) ?? RANK_TIERS.length;
}

export function resolveOrderedRankTiers(data: RankLeaderboard | null): RankLeaderboardTier[] {
  return [...(data?.tiers ?? [])].sort((left, right) => {
    const orderDelta = resolveTierOrder(left.tier) - resolveTierOrder(right.tier);
    return orderDelta === 0 ? left.tier.localeCompare(right.tier) : orderDelta;
  });
}

export function resolveDefaultSelectedTier(data: RankLeaderboard | null): string | null {
  const orderedTiers = resolveOrderedRankTiers(data);
  const currentUserId = data?.currentUserId;

  if (currentUserId) {
    const currentUserTier = orderedTiers.find((tierGroup) => (
      tierGroup.users.some((user) => user.id === currentUserId)
    ));

    if (currentUserTier) {
      return currentUserTier.tier;
    }
  }

  return orderedTiers[0]?.tier ?? null;
}
