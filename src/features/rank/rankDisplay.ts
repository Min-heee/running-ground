import type { RankState } from '@/domain';
import { colors } from '@/theme/tokens';

export const RANK_TIERS = ['입문', '러너', '페이서', '레이서', '엘리트'] as const;
export const LP_PER_TIER = 200;
export const DEFAULT_RANK_STATE: RankState = { tier: '입문', lp: 0 };
const LEGACY_TIER_ALIASES: Record<string, (typeof RANK_TIERS)[number]> = {
  조거: '러너',
};

export const RANK_TIER_COLOR: Record<string, string> = {
  입문: colors.slateMuted,
  러너: colors.podiumSilver,
  페이서: colors.podiumGold,
  레이서: colors.indigoAccent,
  엘리트: colors.blueStrong,
};

export const RANK_TIER_SOFT_COLOR: Record<string, string> = {
  입문: colors.rankIntroSoft,
  러너: colors.rankRunnerSoft,
  페이서: colors.rankPacerSoft,
  레이서: colors.rankRacerSoft,
  엘리트: colors.rankEliteSoft,
};

function isRankTier(value: unknown): value is (typeof RANK_TIERS)[number] {
  return typeof value === 'string' && RANK_TIERS.includes(value as (typeof RANK_TIERS)[number]);
}

function resolveRankTier(value: unknown): unknown {
  return typeof value === 'string' ? (LEGACY_TIER_ALIASES[value] ?? value) : value;
}

function buildDefaultRankState(): RankState {
  return { ...DEFAULT_RANK_STATE };
}

export function normalizeRankStateForDisplay(rankState: unknown): RankState {
  if (!rankState || typeof rankState !== 'object' || Array.isArray(rankState)) {
    return buildDefaultRankState();
  }

  const candidate = rankState as Partial<RankState>;
  const tier = resolveRankTier(candidate.tier);
  const lp = Number(candidate.lp);

  if (
    !isRankTier(tier)
    || 'division' in candidate
    || !Number.isFinite(lp)
    || lp < 0
  ) {
    return buildDefaultRankState();
  }

  return {
    tier,
    lp: Math.trunc(lp),
  };
}

export function formatRankLabel(rankState: unknown): string {
  const normalizedRankState = normalizeRankStateForDisplay(rankState);
  return normalizedRankState.tier;
}
