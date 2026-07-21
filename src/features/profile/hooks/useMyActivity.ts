import { useCallback, useMemo, useRef, useState } from 'react';
import type { MyActivityResponse } from '@/lib/api/types';
import { fetchMyActivity, getApiErrorMessage } from '@/services';
import { useAndroidDeferredFocusEffect } from '@/utils/useAndroidDeferredInteractionEffect';

export type ActivityRun = MyActivityResponse['runs'][number];

export function useMyActivity() {
  const [activity, setActivity] = useState<MyActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const loadActivity = useCallback(() => {
    if (!hasLoadedRef.current) {
      setLoading(true);
    }
    setError(null);

    fetchMyActivity()
      .then((data) => setActivity(data))
      .catch((loadError) => setError(getApiErrorMessage(loadError, '내 활동 정보를 불러오지 못했어요.')))
      .finally(() => {
        hasLoadedRef.current = true;
        setLoading(false);
      });
  }, []);

  useAndroidDeferredFocusEffect(() => {
    loadActivity();
  }, [loadActivity]);

  const activityRuns = useMemo(() => activity?.runs ?? [], [activity?.runs]);

  return {
    activity,
    activityRuns,
    error,
    loading,
  };
}
