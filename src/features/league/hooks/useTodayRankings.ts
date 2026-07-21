import { useCallback, useRef, useState } from 'react';

import type { TodayRankingCategory } from '@/domain';
import type { TodayRankingResponse } from '@/lib/api/types';
import { getApiErrorMessage } from '@/services/apiError';
import { fetchTodayRanking } from '@/services/leagueService';
import { useAndroidDeferredEffect } from '@/utils/useAndroidDeferredInteractionEffect';

export const TODAY_RANKING_CATEGORIES: TodayRankingCategory[] = ['pace', 'distance', 'streak'];

const TODAY_RANKING_FETCH_DEFER_MS = 140;

type TodayRankingCache = Partial<Record<TodayRankingCategory, TodayRankingResponse>>;

export function useTodayRankings() {
  const [category, setCategory] = useState<TodayRankingCategory>('pace');
  const [rankingsByCategory, setRankingsByCategory] = useState<TodayRankingCache>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadTodayRanking = useCallback((nextCategory: TodayRankingCategory = category) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    fetchTodayRanking(nextCategory)
      .then((response) => {
        if (requestIdRef.current !== requestId) {
          return;
        }

        setRankingsByCategory((current) => ({
          ...current,
          [nextCategory]: response,
        }));
      })
      .catch((loadError) => {
        if (requestIdRef.current !== requestId) {
          return;
        }

        setError(getApiErrorMessage(loadError, '오늘의 랭킹을 불러오지 못했어요.'));
      })
      .finally(() => {
        if (requestIdRef.current === requestId) {
          setLoading(false);
        }
      });
  }, [category]);

  useAndroidDeferredEffect(() => {
    loadTodayRanking(category);
  }, [category, loadTodayRanking], {
    delayMs: TODAY_RANKING_FETCH_DEFER_MS,
    source: 'league screen model',
    tab: 'league',
    traceInitialFetch: true,
    work: 'today ranking fetch',
  });

  return {
    categories: TODAY_RANKING_CATEGORIES,
    category,
    error,
    loadTodayRanking,
    loading,
    ranking: rankingsByCategory[category] ?? null,
    setCategory,
  };
}
