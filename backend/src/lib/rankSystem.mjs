export const RANK_TIERS = ['입문', '러너', '페이서', '레이서', '엘리트'];
export const LP_PER_TIER = 200;
export const INITIAL_RANK = { tier: '입문', lp: 0 };
const LEGACY_TIER_ALIASES = { '조거': '러너' };

export const DUEL_LP = {
  winVsFaster: 28,
  winVsSimilar: 20,
  winVsSlower: 12,
  lossVsFaster: -12,
  lossVsSimilar: -20,
  lossVsSlower: -28,
};

export const RANK_PACE_SIMILAR_THRESHOLD_SEC = 8;

export const GROUP_LP = { top: 20, middle: 6, bottom: -15 };
export const GROUP_TOP_RATIO = 0.3;
export const GROUP_BOTTOM_RATIO = 0.7;

export function resolveRankTier(tier) {
  return typeof tier === 'string' ? (LEGACY_TIER_ALIASES[tier] ?? tier) : tier;
}

function normalizeRankState(rankState) {
  const tier = resolveRankTier(rankState?.tier);

  if (
    !rankState
    || typeof rankState !== 'object'
    || Array.isArray(rankState)
    || !RANK_TIERS.includes(tier)
    || 'division' in rankState
  ) {
    return {
      tierIndex: RANK_TIERS.indexOf(INITIAL_RANK.tier),
      lp: INITIAL_RANK.lp,
    };
  }

  const tierIndex = RANK_TIERS.indexOf(tier);
  const rawLp = Number(rankState?.lp);
  const safeLp = Number.isFinite(rawLp) && rawLp >= 0 ? Math.trunc(rawLp) : INITIAL_RANK.lp;

  return {
    tierIndex,
    lp: safeLp,
  };
}

export function applyLpDelta(rankState, deltaLp) {
  let { tierIndex, lp } = normalizeRankState(rankState);
  const delta = Number.isFinite(Number(deltaLp)) ? Math.trunc(Number(deltaLp)) : 0;
  let nextLp = lp + delta;
  let promoted = false;
  let demoted = false;

  while (nextLp >= LP_PER_TIER && tierIndex < RANK_TIERS.length - 1) {
    nextLp -= LP_PER_TIER;
    tierIndex += 1;
    promoted = true;
  }

  while (nextLp < 0) {
    if (tierIndex === 0) {
      nextLp = 0;
      break;
    }

    nextLp += LP_PER_TIER;
    tierIndex -= 1;
    demoted = true;
  }

  return {
    tier: RANK_TIERS[tierIndex],
    lp: nextLp,
    promoted,
    demoted,
  };
}

function isValidPaceSeconds(value) {
  return Number.isFinite(value) && value > 0;
}

export function resolveDuelMatchLpDeltas({ winnerPaceSecPerKm, loserPaceSecPerKm } = {}) {
  const winnerPace = Number(winnerPaceSecPerKm);
  const loserPace = Number(loserPaceSecPerKm);

  if (!isValidPaceSeconds(winnerPace) || !isValidPaceSeconds(loserPace)) {
    return {
      winnerLpDelta: DUEL_LP.winVsSimilar,
      loserLpDelta: DUEL_LP.lossVsSimilar,
    };
  }

  if (Math.abs(loserPace - winnerPace) <= RANK_PACE_SIMILAR_THRESHOLD_SEC) {
    return {
      winnerLpDelta: DUEL_LP.winVsSimilar,
      loserLpDelta: DUEL_LP.lossVsSimilar,
    };
  }

  if (loserPace < winnerPace) {
    return {
      winnerLpDelta: DUEL_LP.winVsFaster,
      loserLpDelta: DUEL_LP.lossVsSlower,
    };
  }

  return {
    winnerLpDelta: DUEL_LP.winVsSlower,
    loserLpDelta: DUEL_LP.lossVsFaster,
  };
}

export function resolveGroupMatchLpDelta({ placement, totalParticipants } = {}) {
  const safePlacement = Number(placement);
  const safeTotalParticipants = Number(totalParticipants);

  if (
    !Number.isFinite(safePlacement)
    || !Number.isFinite(safeTotalParticipants)
    || safePlacement <= 0
    || safeTotalParticipants <= 0
    || safePlacement > safeTotalParticipants
  ) {
    return 0;
  }

  if (safePlacement <= safeTotalParticipants * GROUP_TOP_RATIO) {
    return GROUP_LP.top;
  }

  if (safePlacement > safeTotalParticipants * GROUP_BOTTOM_RATIO) {
    return GROUP_LP.bottom;
  }

  return GROUP_LP.middle;
}
