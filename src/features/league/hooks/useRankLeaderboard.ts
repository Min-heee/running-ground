import { useCallback, useRef, useState } from 'react';

import type { RankLeaderboard } from '@/features/league/types/league';
import { getApiErrorMessage } from '@/services/apiError';
import { fetchRankLeaderboard } from '@/services/leagueService';
import { useAndroidDeferredEffect } from '@/utils/useAndroidDeferredInteractionEffect';

const RANK_LEADERBOARD_FETCH_DEFER_MS = 140;

export function useRankLeaderboard() {
  const [data, setData] = useState<RankLeaderboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadRankLeaderboard = useCallback(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    fetchRankLeaderboard()
      .then((response) => {
        if (requestIdRef.current === requestId) {
          setData(response);
        }
      })
      .catch((loadError) => {
        if (requestIdRef.current === requestId) {
          setError(getApiErrorMessage(loadError, '랭크 랭킹을 불러오지 못했어.'));
        }
      })
      .finally(() => {
        if (requestIdRef.current === requestId) {
          setLoading(false);
        }
      });
  }, []);

  useAndroidDeferredEffect(() => {
    loadRankLeaderboard();
  }, [loadRankLeaderboard], {
    delayMs: RANK_LEADERBOARD_FETCH_DEFER_MS,
    source: 'league screen model',
    tab: 'league',
    traceInitialFetch: true,
    work: 'rank leaderboard fetch',
  });

  return {
    data,
    error,
    loadRankLeaderboard,
    loading,
  };
}
