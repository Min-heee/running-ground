import { ensureUserRankState } from '../lib/userStoreHelpers.mjs';
import { RANK_TIERS } from '../lib/rankSystem.mjs';

const RANK_LEADERBOARD_TIER_LIMIT = 50;
const RANK_TIERS_DESCENDING = [...RANK_TIERS].reverse();

function normalizeUserName(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '러너';
}

function compareRankLeaderboardUsers(left, right) {
  if (right.lp !== left.lp) {
    return right.lp - left.lp;
  }

  const nameCompare = left.name.localeCompare(right.name, 'ko');

  if (nameCompare !== 0) {
    return nameCompare;
  }

  return left.id.localeCompare(right.id);
}

export function buildRankLeaderboardResponse(store, currentUser) {
  const usersByTier = new Map(RANK_TIERS.map((tier) => [tier, []]));

  for (const user of store.users ?? []) {
    const rankState = ensureUserRankState(user);

    usersByTier.get(rankState.tier)?.push({
      id: user.id,
      name: normalizeUserName(user.name),
      lp: rankState.lp,
    });
  }

  return {
    tiers: RANK_TIERS_DESCENDING.map((tier) => {
      const users = [...(usersByTier.get(tier) ?? [])]
        .sort(compareRankLeaderboardUsers)
        .map((user, index) => ({
          ...user,
          rankInTier: index + 1,
        }))
        .slice(0, RANK_LEADERBOARD_TIER_LIMIT);

      return {
        tier,
        users,
      };
    }),
    currentUserId: currentUser.id,
  };
}
