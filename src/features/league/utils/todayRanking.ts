import type { TodayRankingCategory, TodayRankingResponse } from '@/domain';

export const todayRankingCategoryLabels: Record<TodayRankingCategory, string> = {
  pace: '페이스',
  distance: '거리',
  // 일 단위임을 명시 — 지역 멤버 랭킹의 'N주 연속' 필과 같은 화면에 있어 기준 혼동 방지.
  streak: '일 연속',
};

export const todayRankingCategoryDescriptions: Record<TodayRankingCategory, string> = {
  pace: '오늘 가장 빠른 평균 페이스',
  distance: '오늘 가장 멀리 달린 거리',
  streak: '40일 연속 러닝 챌린지',
};

export function hasTodayRankingEntries(ranking: TodayRankingResponse | null | undefined) {
  return Boolean(ranking?.entries.length);
}
