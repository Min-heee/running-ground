import { useCallback, useEffect, useState } from 'react';
import type { DistrictPersonalResponse } from '@/lib/api/types';
import { fetchDistrictPersonal } from '@/services';

export type DistrictPersonalRank = DistrictPersonalResponse['ranks'][number];

export function useDistrictPersonal() {
  const [competition, setCompetition] = useState<DistrictPersonalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCompetition = useCallback(() => {
    setLoading(true);
    setError(null);

    fetchDistrictPersonal()
      .then((data) => setCompetition(data))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '구 내 개인 경쟁 정보를 불러오지 못했어.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCompetition();
  }, [loadCompetition]);

  return {
    competition,
    error,
    loadCompetition,
    loading,
  };
}
