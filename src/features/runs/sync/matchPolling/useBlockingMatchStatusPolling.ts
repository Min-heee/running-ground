import { useEffect, useMemo, useRef } from 'react';
import type { RunningMatchStatusResponse } from '@/lib/api/types';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { isBlockingMatchState } from '@/features/runs/lifecycle/matchStateMachine';
import {
  getMatchStartRemainingSeconds,
  shouldShowMatchStartOverlay,
} from '@/lib/matchCountdown';
import { acquireRgPollingSlot } from '@/utils/rgPollingRegistry';
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

export function buildBlockingMatchStatusPollingKey(matchId: string) {
  return `blocking-match-status:${matchId}`;
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
    if (!effectiveDuelMatchId) {
      return;
    }

    const intervalMs = shouldFastPollDuelMatchStatus ? fastPollMs : idlePollMs;
    const pollingKey = buildBlockingMatchStatusPollingKey(effectiveDuelMatchId);
    const pollingSlot = acquireRgPollingSlot(pollingKey, 'blocking match status polling', {
      intervalMs,
      matchId: effectiveDuelMatchId,
      mode: 'duel',
      source: 'blocking match status',
    });
    if (!pollingSlot.acquired) {
      rgPerfMark('live match recovery polling skipped duplicate', {
        matchId: effectiveDuelMatchId,
        mode: 'duel',
        pollingKey,
        source: 'blocking match status',
      });
      rgPerfMark('live match recovery polling singleton reused', {
        matchId: effectiveDuelMatchId,
        mode: 'duel',
        ownerId: pollingSlot.ownerId,
        pollingKey,
        source: 'blocking match status',
      });
      return;
    }

    if (isRecoveryPolling) {
      rgPerfMark('live match recovery polling started', {
        intervalMs,
        matchId: effectiveDuelMatchId,
        mode: 'duel',
        pollingKey,
        source: 'blocking match status',
      });
    }
    rgPerfMark('match polling start', {
      intervalMs,
      matchId: effectiveDuelMatchId ?? null,
      mode: 'duel',
      pollingKey,
      source: 'blocking match status',
    });
    const stopPollingTrace = rgPerfTrackResource('polling', 'blocking match status polling', {
      intervalMs,
      matchId: effectiveDuelMatchId ?? null,
      mode: 'duel',
      pollingKey,
    });
    const timer = setInterval(() => {
      void callbackRef.current.loadDuelMatchStatus().catch(() => {});
    }, intervalMs);

    return () => {
      stopPollingTrace();
      clearInterval(timer);
      pollingSlot.release();
      if (isRecoveryPolling) {
        rgPerfMark('live match recovery polling stopped after mounted', {
          matchId: effectiveDuelMatchId,
          mode: 'duel',
          pollingKey,
          source: 'blocking match status',
        });
      }
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
    if (!effectiveGroupMatchId) {
      return;
    }

    const intervalMs = shouldFastPollGroupMatchStatus ? fastPollMs : idlePollMs;
    const pollingKey = buildBlockingMatchStatusPollingKey(effectiveGroupMatchId);
    const pollingSlot = acquireRgPollingSlot(pollingKey, 'blocking match status polling', {
      intervalMs,
      matchId: effectiveGroupMatchId,
      mode: 'group',
      source: 'blocking match status',
    });
    if (!pollingSlot.acquired) {
      rgPerfMark('live match recovery polling skipped duplicate', {
        matchId: effectiveGroupMatchId,
        mode: 'group',
        pollingKey,
        source: 'blocking match status',
      });
      rgPerfMark('live match recovery polling singleton reused', {
        matchId: effectiveGroupMatchId,
        mode: 'group',
        ownerId: pollingSlot.ownerId,
        pollingKey,
        source: 'blocking match status',
      });
      return;
    }

    if (isRecoveryPolling) {
      rgPerfMark('live match recovery polling started', {
        intervalMs,
        matchId: effectiveGroupMatchId,
        mode: 'group',
        pollingKey,
        source: 'blocking match status',
      });
    }
    rgPerfMark('match polling start', {
      intervalMs,
      matchId: effectiveGroupMatchId ?? null,
      mode: 'group',
      pollingKey,
      source: 'blocking match status',
    });
    const stopPollingTrace = rgPerfTrackResource('polling', 'blocking match status polling', {
      intervalMs,
      matchId: effectiveGroupMatchId ?? null,
      mode: 'group',
      pollingKey,
    });
    const timer = setInterval(() => {
      void callbackRef.current.loadGroupMatchStatus().catch(() => {});
    }, intervalMs);

    return () => {
      stopPollingTrace();
      clearInterval(timer);
      pollingSlot.release();
      if (isRecoveryPolling) {
        rgPerfMark('live match recovery polling stopped after mounted', {
          matchId: effectiveGroupMatchId,
          mode: 'group',
          pollingKey,
          source: 'blocking match status',
        });
      }
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
