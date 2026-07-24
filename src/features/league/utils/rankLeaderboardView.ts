import type { RankLeaderboard, RankLeaderboardTier } from '@/features/league/types/league';
import { RANK_TIERS } from '@/features/rank/rankDisplay';

const RANK_TIER_ORDER = new Map<string, number>(RANK_TIERS.map((tier, index) => [tier, index]));

// 최하위(입문) 랭크 — 이 랭크의 0 LP는 "아직 랭크전을 시작 안 함"을 뜻한다.
const ENTRY_TIER = RANK_TIERS[0];

function resolveTierOrder(tier: string) {
  return RANK_TIER_ORDER.get(tier) ?? RANK_TIERS.length;
}

// 공개처형 방지: 아직 랭크전을 뛰지 않은 입문 0 LP 유저는 줄 세우지 않는다.
// 승급 직후 LP가 0으로 리셋된 상위 랭크는 성과가 있으므로 그대로 표시.
// 필터 후 순번(rankInTier)은 다시 매긴다 (서버가 LP 내림차순으로 준다).
function withoutUnstartedEntrants(tierGroup: RankLeaderboardTier): RankLeaderboardTier {
  if (tierGroup.tier !== ENTRY_TIER) {
    return tierGroup;
  }

  const users = tierGroup.users.filter((user) => user.lp > 0);

  if (users.length === tierGroup.users.length) {
    return tierGroup;
  }

  return {
    ...tierGroup,
    users: users.map((user, index) => ({ ...user, rankInTier: index + 1 })),
  };
}

export function resolveOrderedRankTiers(data: RankLeaderboard | null): RankLeaderboardTier[] {
  return [...(data?.tiers ?? [])]
    .map(withoutUnstartedEntrants)
    .sort((left, right) => {
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
