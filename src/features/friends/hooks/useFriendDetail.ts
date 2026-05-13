import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { FriendActivityResponse } from '@/lib/api/types';
import { fetchFriendActivity } from '@/services';

export type FriendActivityRun = FriendActivityResponse['runs'][number];

export function formatFriendActivityRefreshTime(timestamp: string | null) {
  if (!timestamp) {
    return '방금 갱신 대기 중';
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return '방금 갱신';
  }

  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${hours}:${minutes} 기준`;
}

export function useFriendDetail(friendId?: string) {
  const [activity, setActivity] = useState<FriendActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const loadActivity = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
      setError(null);
    }

    try {
      const data = await fetchFriendActivity(friendId);
      setActivity(data);
      setLastRefreshedAt(new Date().toISOString());
      if (showLoading) {
        setError(null);
      }
    } catch (loadError) {
      if (showLoading) {
        setError(loadError instanceof Error ? loadError.message : '친구 활동 정보를 불러오지 못했어.');
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [friendId]);

  useFocusEffect(useCallback(() => {
    void loadActivity(true);

    const refreshInterval = setInterval(() => {
      void loadActivity(false);
    }, 20000);

    return () => clearInterval(refreshInterval);
  }, [loadActivity]));

  const activityRuns = useMemo(() => activity?.runs ?? [], [activity?.runs]);

  return {
    activity,
    activityRuns,
    error,
    lastRefreshedAt,
    loading,
  };
}
