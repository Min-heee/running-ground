import type { RankState } from '@/domain';
import { colors } from '@/theme/tokens';

export const RANK_TIERS = ['입문', '러너', '페이서', '레이서', '엘리트'] as const;
export const LP_PER_TIER = 200;
export const DEFAULT_RANK_STATE: RankState = { tier: '입문', lp: 0 };
const LEGACY_TIER_ALIASES: Record<string, (typeof RANK_TIERS)[number]> = {
  조거: '러너',
};

// ⚠️ 이 모듈은 _layout의 백그라운드 트래킹 체인(liveActivityController → liveCardTierColor)을
// 타고 테마 하이드레이션 **전에** 평가된다. 값으로 캡처하면 라이트 팔레트가 굳어 다크에서
// 파스텔 배경+밝은 글씨(숫자 소실)가 되므로, getter로 접근 시점의 colors를 읽는다.
export const RANK_TIER_COLOR: Record<string, string> = {
  get 입문() { return colors.rankIntroAccent; },
  get 러너() { return colors.rankRunnerAccent; },
  get 페이서() { return colors.rankPacerAccent; },
  get 레이서() { return colors.rankRacerAccent; },
  get 엘리트() { return colors.rankEliteAccent; },
};

export const RANK_TIER_SOFT_COLOR: Record<string, string> = {
  get 입문() { return colors.rankIntroSoft; },
  get 러너() { return colors.rankRunnerSoft; },
  get 페이서() { return colors.rankPacerSoft; },
  get 레이서() { return colors.rankRacerSoft; },
  get 엘리트() { return colors.rankEliteSoft; },
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
