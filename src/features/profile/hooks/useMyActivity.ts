import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { MyActivityResponse } from '@/lib/api/types';
import { fetchMyActivity } from '@/services';

export type ActivityRun = MyActivityResponse['runs'][number];

export function useMyActivity() {
  const [activity, setActivity] = useState<MyActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadActivity = useCallback(() => {
    setLoading(true);
    setError(null);

    fetchMyActivity()
      .then((data) => setActivity(data))
      .catch(() => setError('내 활동 정보를 불러오지 못했어.'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => {
    loadActivity();
  }, [loadActivity]));

  const activityRuns = useMemo(() => activity?.runs ?? [], [activity?.runs]);

  return {
    activity,
    activityRuns,
    error,
    loading,
  };
}
