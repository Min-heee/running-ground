import { useEffect, useMemo, useRef } from 'react';
import type { RunningMatchStatusResponse } from '@/lib/api/types';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { isBlockingMatchState } from '@/features/runs/lifecycle/matchStateMachine';
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
  recoveryMatchId?: string | null;
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
  recoveryMatchId = null,
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
  const effectiveDuelMatchId = duelMatchId ?? (matchMode === 'duel' ? recoveryMatchId : null);
  const duelMatchSlotStartAt = duelMatchStatus?.slotStartAt;
  const duelMatchState = duelMatchStatus?.state;
  const groupMatchId = groupMatchStatus?.matchId;
  const effectiveGroupMatchId = groupMatchId ?? (matchMode === 'group' ? recoveryMatchId : null);
  const groupMatchSlotStartAt = groupMatchStatus?.slotStartAt;
  const groupMatchState = groupMatchStatus?.state;

  useEffect(() => {
    const isRecoveryPolling = Boolean(effectiveDuelMatchId && !duelMatchId);
    if (!enabled || matchMode !== 'duel' || (!isBlockingMatchState(duelMatchState) && !isRecoveryPolling)) {
      return;
    }

    const intervalMs = shouldFastPollDuelMatchStatus ? fastPollMs : idlePollMs;
    if (isRecoveryPolling) {
      rgPerfMark('live match recovery polling started', {
        intervalMs,
        matchId: effectiveDuelMatchId,
        mode: 'duel',
        source: 'blocking match status',
      });
    }
    rgPerfMark('match polling start', {
      intervalMs,
      matchId: effectiveDuelMatchId ?? null,
      mode: 'duel',
      source: 'blocking match status',
    });
    const stopPollingTrace = rgPerfTrackResource('polling', 'blocking duel match status polling', {
      intervalMs,
      matchId: effectiveDuelMatchId ?? null,
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
    effectiveDuelMatchId,
    fastPollMs,
    idlePollMs,
    matchMode,
    shouldFastPollDuelMatchStatus,
  ]);

  useEffect(() => {
    const isRecoveryPolling = Boolean(effectiveGroupMatchId && !groupMatchId);
    if (!enabled || matchMode !== 'group' || (!isBlockingMatchState(groupMatchState) && !isRecoveryPolling)) {
      return;
    }

    const intervalMs = shouldFastPollGroupMatchStatus ? fastPollMs : idlePollMs;
    if (isRecoveryPolling) {
      rgPerfMark('live match recovery polling started', {
        intervalMs,
        matchId: effectiveGroupMatchId,
        mode: 'group',
        source: 'blocking match status',
      });
    }
    rgPerfMark('match polling start', {
      intervalMs,
      matchId: effectiveGroupMatchId ?? null,
      mode: 'group',
      source: 'blocking match status',
    });
    const stopPollingTrace = rgPerfTrackResource('polling', 'blocking group match status polling', {
      intervalMs,
      matchId: effectiveGroupMatchId ?? null,
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
    effectiveGroupMatchId,
    enabled,
    groupMatchId,
    groupMatchSlotStartAt,
    groupMatchState,
    idlePollMs,
    matchMode,
    shouldFastPollGroupMatchStatus,
  ]);
}
