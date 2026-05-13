import { useEffect, useMemo, useRef } from 'react';
import type { RunningMatchStatusResponse } from '@/lib/api/types';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { isBlockingMatchState } from '@/features/runs/matchStateMachine';
import {
  getMatchStartRemainingSeconds,
  shouldShowMatchStartOverlay,
} from '@/lib/matchCountdown';
import { rgPerfMark, rgPerfTrackResource } from '@/utils/rgPerfTrace';

type UseBlockingMatchStatusPollingInput = {
  matchMode: RunMatchMode;
  duelMatchStatus: RunningMatchStatusResponse | null;
  groupMatchStatus: RunningMatchStatusResponse | null;
  syncedNowMs: number;
  fastPollMs: number;
  idlePollMs: number;
  loadDuelMatchStatus: () => Promise<unknown>;
  loadGroupMatchStatus: () => Promise<unknown>;
  enabled?: boolean;
};

function shouldUseFastMatchStatusPolling(
  status: RunningMatchStatusResponse | null,
  syncedNowMs: number,
) {
  if (!status?.slotStartAt || !status.state) {
    return false;
  }

  const remainingSeconds = getMatchStartRemainingSeconds(status.slotStartAt, syncedNowMs);
  return status.state === 'active' || shouldShowMatchStartOverlay(remainingSeconds);
}

export function useBlockingMatchStatusPolling({
  matchMode,
  duelMatchStatus,
  groupMatchStatus,
  syncedNowMs,
  fastPollMs,
  idlePollMs,
  loadDuelMatchStatus,
  loadGroupMatchStatus,
  enabled = true,
}: UseBlockingMatchStatusPollingInput) {
  const callbackRef = useRef({
    loadDuelMatchStatus,
    loadGroupMatchStatus,
  });

  callbackRef.current = {
    loadDuelMatchStatus,
    loadGroupMatchStatus,
  };

  const shouldFastPollDuelMatchStatus = useMemo(
    () => shouldUseFastMatchStatusPolling(duelMatchStatus, syncedNowMs),
    [duelMatchStatus, syncedNowMs],
  );
  const shouldFastPollGroupMatchStatus = useMemo(
    () => shouldUseFastMatchStatusPolling(groupMatchStatus, syncedNowMs),
    [groupMatchStatus, syncedNowMs],
  );
  const duelMatchId = duelMatchStatus?.matchId;
  const duelMatchSlotStartAt = duelMatchStatus?.slotStartAt;
  const duelMatchState = duelMatchStatus?.state;
  const groupMatchId = groupMatchStatus?.matchId;
  const groupMatchSlotStartAt = groupMatchStatus?.slotStartAt;
  const groupMatchState = groupMatchStatus?.state;

  useEffect(() => {
    if (!enabled || matchMode !== 'duel' || !isBlockingMatchState(duelMatchState)) {
      return;
    }

    const intervalMs = shouldFastPollDuelMatchStatus ? fastPollMs : idlePollMs;
    rgPerfMark('match polling start', {
      intervalMs,
      matchId: duelMatchId ?? null,
      mode: 'duel',
      source: 'blocking match status',
    });
    const stopPollingTrace = rgPerfTrackResource('polling', 'blocking duel match status polling', {
      intervalMs,
      matchId: duelMatchId ?? null,
    });
    const timer = setInterval(() => {
      void callbackRef.current.loadDuelMatchStatus().catch(() => {});
    }, intervalMs);

    return () => {
      stopPollingTrace();
      clearInterval(timer);
    };
  }, [
    duelMatchId,
    duelMatchSlotStartAt,
    duelMatchState,
    enabled,
    fastPollMs,
    idlePollMs,
    matchMode,
    shouldFastPollDuelMatchStatus,
  ]);

  useEffect(() => {
    if (!enabled || matchMode !== 'group' || !isBlockingMatchState(groupMatchState)) {
      return;
    }

    const intervalMs = shouldFastPollGroupMatchStatus ? fastPollMs : idlePollMs;
    rgPerfMark('match polling start', {
      intervalMs,
      matchId: groupMatchId ?? null,
      mode: 'group',
      source: 'blocking match status',
    });
    const stopPollingTrace = rgPerfTrackResource('polling', 'blocking group match status polling', {
      intervalMs,
      matchId: groupMatchId ?? null,
    });
    const timer = setInterval(() => {
      void callbackRef.current.loadGroupMatchStatus().catch(() => {});
    }, intervalMs);

    return () => {
      stopPollingTrace();
      clearInterval(timer);
    };
  }, [
    fastPollMs,
    enabled,
    groupMatchId,
    groupMatchSlotStartAt,
    groupMatchState,
    idlePollMs,
    matchMode,
    shouldFastPollGroupMatchStatus,
  ]);
}
