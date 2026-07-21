import { normalizeRankStateForDisplay } from '@/features/rank/rankDisplay';

// Rank-tier accent for the LOCK-SCREEN live card's metric numbers.
//
// The in-app tier accents (tokens rankIntroAccent 등) are DARK hues designed as text on pastel
// tier cards — on the live card's near-black background they are illegible. These are the same
// five tier hues hand-brightened for a dark background. Keep the hue family aligned with
// RANK_TIER_COLOR (rankDisplay.ts): 입문=green, 러너=gold, 페이서=purple, 레이서=red,
// 엘리트=champagne.
const LIVE_CARD_TIER_COLOR_HEX: Record<string, string> = {
  입문: '#5FBF82',
  러너: '#E2B84D',
  페이서: '#AC82DA',
  레이서: '#EA6E62',
  엘리트: '#E8D9A8',
};

// Resolve the card accent from a (possibly missing/legacy) rankState. Always returns a valid
// '#RRGGBB' — normalizeRankStateForDisplay falls back to 입문 for anything malformed.
export function resolveLiveCardTierColorHex(rankState: unknown): string {
  const { tier } = normalizeRankStateForDisplay(rankState);
  return LIVE_CARD_TIER_COLOR_HEX[tier] ?? LIVE_CARD_TIER_COLOR_HEX['입문'];
}
