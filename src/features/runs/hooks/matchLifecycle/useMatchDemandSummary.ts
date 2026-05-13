import { useState } from 'react';
import type { MatchDemandSummaryResponse } from '@/lib/api/types';

export function useMatchDemandSummary() {
  const [duelDemandSummary, setDuelDemandSummary] = useState<MatchDemandSummaryResponse | null>(null);
  const [isLoadingDuelDemandSummary, setIsLoadingDuelDemandSummary] = useState(false);
  const [groupDemandSummary, setGroupDemandSummary] = useState<MatchDemandSummaryResponse | null>(null);
  const [isLoadingGroupDemandSummary, setIsLoadingGroupDemandSummary] = useState(false);

  return {
    duelDemandSummary,
    setDuelDemandSummary,
    isLoadingDuelDemandSummary,
    setIsLoadingDuelDemandSummary,
    groupDemandSummary,
    setGroupDemandSummary,
    isLoadingGroupDemandSummary,
    setIsLoadingGroupDemandSummary,
  };
}
