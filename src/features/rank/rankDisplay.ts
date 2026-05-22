import type { RankState } from '@/domain';
import { colors } from '@/theme/tokens';

export const RANK_TIERS = ['아이언', '브론즈', '실버', '골드', '플래티넘', '다이아'] as const;
export const LP_PER_DIVISION = 100;
export const DEFAULT_RANK_STATE: RankState = { tier: '아이언', division: 4, lp: 0 };

export const RANK_TIER_COLOR: Record<string, string> = {
  아이언: colors.slateMuted,
  브론즈: colors.podiumBronze,
  실버: colors.podiumSilver,
  골드: colors.podiumGold,
  플래티넘: colors.indigoAccent,
  다이아: colors.blueStrong,
};

function isRankTier(value: unknown): value is (typeof RANK_TIERS)[number] {
  return typeof value === 'string' && RANK_TIERS.includes(value as (typeof RANK_TIERS)[number]);
}

function buildDefaultRankState(): RankState {
  return { ...DEFAULT_RANK_STATE };
}

export function normalizeRankStateForDisplay(rankState: unknown): RankState {
  if (!rankState || typeof rankState !== 'object' || Array.isArray(rankState)) {
    return buildDefaultRankState();
  }

  const candidate = rankState as Partial<RankState>;
  const division = Number(candidate.division);
  const lp = Number(candidate.lp);

  if (
    !isRankTier(candidate.tier)
    || !Number.isInteger(division)
    || division < 1
    || division > 4
    || !Number.isFinite(lp)
    || lp < 0
    || lp > LP_PER_DIVISION
  ) {
    return buildDefaultRankState();
  }

  return {
    tier: candidate.tier,
    division,
    lp: Math.trunc(lp),
  };
}

export function formatRankLabel(rankState: unknown): string {
  const normalizedRankState = normalizeRankStateForDisplay(rankState);
  return `${normalizedRankState.tier} ${normalizedRankState.division}`;
}
