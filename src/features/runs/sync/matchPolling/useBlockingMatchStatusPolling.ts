import { useEffect, useMemo, useRef, useState } from 'react';
import type { RunningMatchStatusResponse } from '@/lib/api/types';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { isBlockingMatchState } from '@/features/runs/lifecycle/matchStateMachine';
import {
  isLiveMatchMarkedMounted,
  subscribeLiveMatchMounted,
} from '@/features/runs/lifecycle/liveMatchMountedRegistry';
import {
  getMatchStartRemainingSeconds,
  shouldShowMatchStartOverlay,
} from '@/lib/matchCountdown';
import { buildBlockingMatchStatusRegistryKey } from '@/features/runs/sync/registryKeys';
import { startRgPollingInterval } from '@/utils/rgPollingRegistry';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type UseBlockingMatchStatusPollingInput = {
  matchMode: RunMatchMode;
  duelMatchStatus: RunningMatchStatusResponse | null;
  groupMatchStatus: RunningMatchStatusResponse | null;
  syncedNowMs: number;
  fastPollMs: number;
  idlePollMs: number;
  loadDuelMatchStatus: MatchStatusLoader;
  loadGroupMatchStatus: MatchStatusLoader;
  enabled?: boolean;
  linkedMatchContext?: LinkedMatchStatusPollingContext | null;
  recoveryMatchId?: string | null;
};

type MatchStatusLoadOptions = {
  distanceKm?: number;
  forceAccept?: boolean;
  matchId?: string;
  testMode?: boolean;
};

type MatchStatusLoader = (
  slotStartAt?: string,
  options?: MatchStatusLoadOptions,
) => Promise<unknown>;

type LinkedMatchStatusPollingContext = {
  mode: 'duel' | 'group';
  matchId: string;
  slotStartAt: string;
  distanceKm: number;
  state: 'matched' | 'active';
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

function shouldUseFastLinkedMatchStatusPolling(
  context: LinkedMatchStatusPollingContext | null,
  syncedNowMs: number,
) {
  if (!context) {
    return false;
  }

  const remainingSeconds = getMatchStartRemainingSeconds(context.slotStartAt, syncedNowMs);
  return context.state === 'active' || shouldShowMatchStartOverlay(remainingSeconds);
}

function buildLinkedMatchStatusLoadArgs(context: LinkedMatchStatusPollingContext) {
  return {
    slotStartAt: context.slotStartAt,
    options: {
      distanceKm: context.distanceKm,
      forceAccept: true,
      matchId: context.matchId,
      testMode: false,
    } satisfies MatchStatusLoadOptions,
  };
}

export function buildBlockingMatchStatusPollingKey(matchId: string) {
  return buildBlockingMatchStatusRegistryKey(matchId);
}

export function shouldSkipBlockingMatchStatusPollingForMountedMatch({
  matchId,
  mode,
}: {
  matchId?: string | null;
  mode: 'duel' | 'group';
}) {
  return isLiveMatchMarkedMounted({ matchId, mode });
}

function logMountedMatchPollingSkip({
  isRecoveryPolling,
  matchId,
  mode,
  pollingKey,
}: {
  isRecoveryPolling: boolean;
  matchId: string;
  mode: 'duel' | 'group';
  pollingKey: string;
}) {
  rgPerfMark('blocking match status polling skipped mounted match', {
    matchId,
    mode,
    pollingKey,
    source: 'blocking match status',
  });
  if (isRecoveryPolling) {
    rgPerfMark('live match recovery polling skipped already mounted', {
      matchId,
      mode,
      pollingKey,
      source: 'blocking match status',
    });
  }
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
  linkedMatchContext = null,
  recoveryMatchId = null,
}: UseBlockingMatchStatusPollingInput) {
  const callbackRef = useRef({
    loadDuelMatchStatus,
    loadGroupMatchStatus,
  });
  const [mountedSignalVersion, setMountedSignalVersion] = useState(0);

  callbackRef.current = {
    loadDuelMatchStatus,
    loadGroupMatchStatus,
  };

  useEffect(() => subscribeLiveMatchMounted(() => {
    setMountedSignalVersion((version) => version + 1);
  }), []);

  const linkedDuelMatchContext = linkedMatchContext?.mode === 'duel' ? linkedMatchContext : null;
  const linkedGroupMatchContext = linkedMatchContext?.mode === 'group' ? linkedMatchContext : null;
  const shouldFastPollLinkedDuelMatchStatus = useMemo(
    () => shouldUseFastLinkedMatchStatusPolling(linkedDuelMatchContext, syncedNowMs),
    [linkedDuelMatchContext, syncedNowMs],
  );
  const shouldFastPollLinkedGroupMatchStatus = useMemo(
    () => shouldUseFastLinkedMatchStatusPolling(linkedGroupMatchContext, syncedNowMs),
    [linkedGroupMatchContext, syncedNowMs],
  );
  const shouldFastPollDuelMatchStatus = useMemo(
    () => (
      shouldUseFastMatchStatusPolling(duelMatchStatus, syncedNowMs)
      || shouldFastPollLinkedDuelMatchStatus
    ),
    [duelMatchStatus, shouldFastPollLinkedDuelMatchStatus, syncedNowMs],
  );
  const shouldFastPollGroupMatchStatus = useMemo(
    () => (
      shouldUseFastMatchStatusPolling(groupMatchStatus, syncedNowMs)
      || shouldFastPollLinkedGroupMatchStatus
    ),
    [groupMatchStatus, shouldFastPollLinkedGroupMatchStatus, syncedNowMs],
  );
  const duelMatchId = duelMatchStatus?.matchId;
  const effectiveDuelMatchId = duelMatchId ?? linkedDuelMatchContext?.matchId ?? (
    matchMode === 'duel' ? recoveryMatchId : null
  );
  const duelMatchSlotStartAt = duelMatchStatus?.slotStartAt ?? linkedDuelMatchContext?.slotStartAt;
  const duelMatchState = duelMatchStatus?.state ?? linkedDuelMatchContext?.state;
  const groupMatchId = groupMatchStatus?.matchId;
  const effectiveGroupMatchId = groupMatchId ?? linkedGroupMatchContext?.matchId ?? (
    matchMode === 'group' ? recoveryMatchId : null
  );
  const groupMatchSlotStartAt = groupMatchStatus?.slotStartAt ?? linkedGroupMatchContext?.slotStartAt;
  const groupMatchState = groupMatchStatus?.state ?? linkedGroupMatchContext?.state;

  useEffect(() => {
    const isRecoveryPolling = Boolean(effectiveDuelMatchId && !duelMatchId);
    const isLinkedMatchPolling = Boolean(
      linkedDuelMatchContext
      && effectiveDuelMatchId === linkedDuelMatchContext.matchId,
    );
    if (!enabled || matchMode !== 'duel' || (!isBlockingMatchState(duelMatchState) && !isRecoveryPolling)) {
      return;
    }
    if (!effectiveDuelMatchId) {
      return;
    }

    const intervalMs = shouldFastPollDuelMatchStatus ? fastPollMs : idlePollMs;
    const pollingKey = buildBlockingMatchStatusPollingKey(effectiveDuelMatchId);
    const isMountedMatch = shouldSkipBlockingMatchStatusPollingForMountedMatch({
      matchId: effectiveDuelMatchId,
      mode: 'duel',
    });
    if (isMountedMatch && !isLinkedMatchPolling) {
      logMountedMatchPollingSkip({
        isRecoveryPolling,
        matchId: effectiveDuelMatchId,
        mode: 'duel',
        pollingKey,
      });
      return;
    }

    const polling = startRgPollingInterval({
      intervalMs,
      key: pollingKey,
      label: 'blocking match status polling',
      onTick: () => {
        if (isLinkedMatchPolling && linkedDuelMatchContext) {
          const { slotStartAt, options } = buildLinkedMatchStatusLoadArgs(linkedDuelMatchContext);
          return callbackRef.current.loadDuelMatchStatus(slotStartAt, options);
        }
        return callbackRef.current.loadDuelMatchStatus();
      },
      detail: {
        intervalMs,
        matchId: effectiveDuelMatchId,
        mode: 'duel',
        source: isLinkedMatchPolling ? 'linked match via blocking status' : 'blocking match status',
      },
    });
    if (!polling.acquired) {
      rgPerfMark('live match recovery polling skipped duplicate', {
        matchId: effectiveDuelMatchId,
        mode: 'duel',
        pollingKey,
        source: 'blocking match status',
      });
      rgPerfMark('live match recovery polling singleton reused', {
        matchId: effectiveDuelMatchId,
        mode: 'duel',
        ownerId: polling.ownerId,
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

    return () => {
      const stoppedAfterMounted = shouldSkipBlockingMatchStatusPollingForMountedMatch({
        matchId: effectiveDuelMatchId,
        mode: 'duel',
      });
      polling.stop();
      if (isRecoveryPolling && stoppedAfterMounted) {
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
    linkedDuelMatchContext,
    matchMode,
    mountedSignalVersion,
    shouldFastPollDuelMatchStatus,
  ]);

  useEffect(() => {
    const isRecoveryPolling = Boolean(effectiveGroupMatchId && !groupMatchId);
    const isLinkedMatchPolling = Boolean(
      linkedGroupMatchContext
      && effectiveGroupMatchId === linkedGroupMatchContext.matchId,
    );
    if (!enabled || matchMode !== 'group' || (!isBlockingMatchState(groupMatchState) && !isRecoveryPolling)) {
      return;
    }
    if (!effectiveGroupMatchId) {
      return;
    }

    const intervalMs = shouldFastPollGroupMatchStatus ? fastPollMs : idlePollMs;
    const pollingKey = buildBlockingMatchStatusPollingKey(effectiveGroupMatchId);
    const isMountedMatch = shouldSkipBlockingMatchStatusPollingForMountedMatch({
      matchId: effectiveGroupMatchId,
      mode: 'group',
    });
    if (isMountedMatch && !isLinkedMatchPolling) {
      logMountedMatchPollingSkip({
        isRecoveryPolling,
        matchId: effectiveGroupMatchId,
        mode: 'group',
        pollingKey,
      });
      return;
    }

    const polling = startRgPollingInterval({
      intervalMs,
      key: pollingKey,
      label: 'blocking match status polling',
      onTick: () => {
        if (isLinkedMatchPolling && linkedGroupMatchContext) {
          const { slotStartAt, options } = buildLinkedMatchStatusLoadArgs(linkedGroupMatchContext);
          return callbackRef.current.loadGroupMatchStatus(slotStartAt, options);
        }
        return callbackRef.current.loadGroupMatchStatus();
      },
      detail: {
        intervalMs,
        matchId: effectiveGroupMatchId,
        mode: 'group',
        source: isLinkedMatchPolling ? 'linked match via blocking status' : 'blocking match status',
      },
    });
    if (!polling.acquired) {
      rgPerfMark('live match recovery polling skipped duplicate', {
        matchId: effectiveGroupMatchId,
        mode: 'group',
        pollingKey,
        source: 'blocking match status',
      });
      rgPerfMark('live match recovery polling singleton reused', {
        matchId: effectiveGroupMatchId,
        mode: 'group',
        ownerId: polling.ownerId,
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

    return () => {
      const stoppedAfterMounted = shouldSkipBlockingMatchStatusPollingForMountedMatch({
        matchId: effectiveGroupMatchId,
        mode: 'group',
      });
      polling.stop();
      if (isRecoveryPolling && stoppedAfterMounted) {
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
    linkedGroupMatchContext,
    matchMode,
    mountedSignalVersion,
    shouldFastPollGroupMatchStatus,
  ]);
}
