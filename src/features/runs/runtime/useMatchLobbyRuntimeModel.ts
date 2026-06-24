import { useMemo } from 'react';
import type { RunningMatchStatusResponse } from '@/lib/api/types';
import { formatMatchExpiryCountdown } from '@/features/runs/utils/matchScheduling';

type UseMatchLobbyRuntimeModelInput = {
  duelMatchStatus: RunningMatchStatusResponse | null;
  isDuelTestFlow: boolean;
  groupMatchStatus: RunningMatchStatusResponse | null;
};

export function useMatchLobbyRuntimeModel({
  duelMatchStatus,
  isDuelTestFlow,
  groupMatchStatus,
}: UseMatchLobbyRuntimeModelInput) {
  return useMemo(() => {
    // Minimal waiting card: a single short line. Matching is pace-only now, so no
    // level mention and no verbose "X/Y명 / 30분 전까지" breakdown.
    const duelWaitingTitle = isDuelTestFlow
      ? '테스트 상대를 찾는 중이에요'
      : '비슷한 상대를 찾는 중이에요';

    return {
      duelExpiryCountdownLabel: formatMatchExpiryCountdown(duelMatchStatus?.expiresInSeconds),
      groupExpiryCountdownLabel: formatMatchExpiryCountdown(groupMatchStatus?.expiresInSeconds),
      duelWaitingTitle,
    };
  }, [
    duelMatchStatus?.expiresInSeconds,
    groupMatchStatus?.expiresInSeconds,
    isDuelTestFlow,
  ]);
}
