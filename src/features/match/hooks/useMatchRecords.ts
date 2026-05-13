import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { MyActivityResponse } from '@/lib/api/types';
import { fetchMyActivity } from '@/services';
import { buildMatchRecordStats } from '@/features/match/utils/matchRecordStats';

export function useMatchRecords() {
  const [activity, setActivity] = useState<MyActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadActivity = useCallback(() => {
    setLoading(true);
    setError(null);

    fetchMyActivity()
      .then((data) => setActivity(data))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '전적을 불러오지 못했어요.'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => {
    loadActivity();
  }, [loadActivity]));

  const stats = useMemo(() => buildMatchRecordStats(activity), [activity]);

  return {
    activity,
    error,
    loading,
    stats,
  };
}
