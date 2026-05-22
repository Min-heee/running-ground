export const RANK_TIERS = ['아이언', '브론즈', '실버', '골드', '플래티넘', '다이아'];
export const DIVISIONS_PER_TIER = 4;
export const LP_PER_DIVISION = 100;
export const INITIAL_RANK = { tier: '아이언', division: 4, lp: 0 };

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

function normalizeRankState(rankState) {
  const tierIndex = RANK_TIERS.indexOf(rankState?.tier);
  const safeTierIndex = tierIndex >= 0 ? tierIndex : RANK_TIERS.indexOf(INITIAL_RANK.tier);
  const rawDivision = Number(rankState?.division);
  const safeDivision = Number.isInteger(rawDivision) && rawDivision >= 1 && rawDivision <= DIVISIONS_PER_TIER
    ? rawDivision
    : INITIAL_RANK.division;
  const rawLp = Number(rankState?.lp);
  const safeLp = Number.isFinite(rawLp) ? Math.trunc(rawLp) : INITIAL_RANK.lp;

  return {
    tierIndex: safeTierIndex,
    division: safeDivision,
    lp: safeLp,
  };
}

function isAtRankFloor(tierIndex, division) {
  return tierIndex === 0 && division === DIVISIONS_PER_TIER;
}

function isAtRankCeiling(tierIndex, division) {
  return tierIndex === RANK_TIERS.length - 1 && division === 1;
}

function promoteOneDivision({ tierIndex, division }) {
  if (isAtRankCeiling(tierIndex, division)) {
    return { tierIndex, division };
  }

  if (division > 1) {
    return { tierIndex, division: division - 1 };
  }

  return { tierIndex: tierIndex + 1, division: DIVISIONS_PER_TIER };
}

function demoteOneDivision({ tierIndex, division }) {
  if (isAtRankFloor(tierIndex, division)) {
    return { tierIndex, division };
  }

  if (division < DIVISIONS_PER_TIER) {
    return { tierIndex, division: division + 1 };
  }

  return { tierIndex: tierIndex - 1, division: 1 };
}

export function applyLpDelta(rankState, deltaLp) {
  let { tierIndex, division, lp } = normalizeRankState(rankState);
  const delta = Number.isFinite(Number(deltaLp)) ? Math.trunc(Number(deltaLp)) : 0;
  let nextLp = lp + delta;
  let promoted = false;
  let demoted = false;

  while (nextLp >= LP_PER_DIVISION) {
    if (isAtRankCeiling(tierIndex, division)) {
      nextLp = LP_PER_DIVISION;
      break;
    }

    nextLp -= LP_PER_DIVISION;
    const nextRank = promoteOneDivision({ tierIndex, division });
    promoted = promoted || nextRank.tierIndex !== tierIndex || nextRank.division !== division;
    tierIndex = nextRank.tierIndex;
    division = nextRank.division;
  }

  while (nextLp < 0) {
    if (isAtRankFloor(tierIndex, division)) {
      nextLp = 0;
      break;
    }

    nextLp += LP_PER_DIVISION;
    const nextRank = demoteOneDivision({ tierIndex, division });
    demoted = demoted || nextRank.tierIndex !== tierIndex || nextRank.division !== division;
    tierIndex = nextRank.tierIndex;
    division = nextRank.division;
  }

  return {
    tier: RANK_TIERS[tierIndex],
    division,
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
