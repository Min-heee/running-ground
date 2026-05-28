import { useMemo } from 'react';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { PartyRunLinkedMatchContext } from '@/features/runs/lifecycle/matchStateMachine';
import { shouldAutoOpenMatchArena } from '@/lib/matchCountdown';
import type {
  RunningMatchState,
  RunningMatchStatusResponse,
} from '@/lib/api/types';

export function resolveMatchModeIdentity({
  matchMode,
  duelMatchId,
  groupMatchId,
  roomLinkedMatchMode,
  roomLinkedMatchId,
  hydratedFocusMatchMode,
  hydratedFocusMatchId,
  fallbackMatchId = null,
  defaultMatchId = null,
}: {
  matchMode: RunMatchMode;
  duelMatchId?: string | null;
  groupMatchId?: string | null;
  roomLinkedMatchMode?: Extract<RunMatchMode, 'duel' | 'group'> | null;
  roomLinkedMatchId?: string | null;
  hydratedFocusMatchMode?: Extract<RunMatchMode, 'duel' | 'group'> | null;
  hydratedFocusMatchId?: string | null;
  fallbackMatchId?: string | null;
  defaultMatchId?: string | null;
}) {
  if (matchMode === 'duel') {
    return duelMatchId
      ?? (roomLinkedMatchMode === 'duel' ? roomLinkedMatchId ?? null : null)
      ?? (hydratedFocusMatchMode === 'duel' ? hydratedFocusMatchId ?? null : null)
      ?? fallbackMatchId
      ?? null;
  }

  if (matchMode === 'group') {
    return groupMatchId
      ?? (roomLinkedMatchMode === 'group' ? roomLinkedMatchId ?? null : null)
      ?? (hydratedFocusMatchMode === 'group' ? hydratedFocusMatchId ?? null : null)
      ?? fallbackMatchId
      ?? null;
  }

  return defaultMatchId ?? null;
}

export function shouldStageLiveMatchStartup({
  liveMatchStartupIdentity,
  matchMode,
  isRunning,
  forceOpenActiveMatch,
  partyRunShouldOpenArena,
  currentUserDoneWithLinkedMatch = false,
  duelMatchState,
  groupMatchState,
  duelStartCountdownSeconds,
  groupStartCountdownSeconds,
  roomLinkedMatchContext,
}: {
  liveMatchStartupIdentity: string | null;
  matchMode: RunMatchMode;
  isRunning: boolean;
  forceOpenActiveMatch: boolean;
  partyRunShouldOpenArena: boolean;
  currentUserDoneWithLinkedMatch?: boolean;
  duelMatchState: RunningMatchState;
  groupMatchState: RunningMatchState;
  duelStartCountdownSeconds: number | null;
  groupStartCountdownSeconds: number | null;
  roomLinkedMatchContext: PartyRunLinkedMatchContext | null;
}) {
  if (!liveMatchStartupIdentity || matchMode === 'solo' || matchMode === 'room') {
    return false;
  }

  if (currentUserDoneWithLinkedMatch) {
    return false;
  }

  if (isRunning || forceOpenActiveMatch || partyRunShouldOpenArena) {
    return true;
  }

  if (matchMode === 'duel') {
    return duelMatchState === 'active'
      || shouldAutoOpenMatchArena(duelStartCountdownSeconds)
      || roomLinkedMatchContext?.mode === 'duel';
  }

  if (matchMode === 'group') {
    return groupMatchState === 'active'
      || shouldAutoOpenMatchArena(groupStartCountdownSeconds)
      || roomLinkedMatchContext?.mode === 'group';
  }

  return false;
}

export function resolveRoomLinkedContextFlags(roomLinkedMatchContext: PartyRunLinkedMatchContext | null) {
  return {
    hasRoomLinkedDuelContext: roomLinkedMatchContext?.mode === 'duel',
    hasRoomLinkedGroupContext: roomLinkedMatchContext?.mode === 'group',
  };
}

export function resolveArenaUsesLivePace({
  matchMode,
  duelMatchState,
  groupMatchState,
  roomLinkedMatchContext,
}: {
  matchMode: RunMatchMode;
  duelMatchState: RunningMatchState;
  groupMatchState: RunningMatchState;
  roomLinkedMatchContext: PartyRunLinkedMatchContext | null;
}) {
  return {
    duelArenaUsesLivePace: Boolean(
      matchMode === 'duel'
      && (
        duelMatchState === 'active'
        || (roomLinkedMatchContext?.mode === 'duel' && roomLinkedMatchContext.state === 'active')
      ),
    ),
    groupArenaUsesLivePace: Boolean(
      matchMode === 'group'
      && (
        groupMatchState === 'active'
        || (roomLinkedMatchContext?.mode === 'group' && roomLinkedMatchContext.state === 'active')
      ),
    ),
  };
}

export function resolveOfficialCurrentAveragePace({
  matchMode,
  duelAveragePace,
  groupAveragePace,
}: {
  matchMode: RunMatchMode;
  duelAveragePace?: string | null;
  groupAveragePace?: string | null;
}) {
  return matchMode === 'duel'
    ? duelAveragePace ?? null
    : matchMode === 'group'
      ? groupAveragePace ?? null
      : null;
}

export function resolveArenaOpenState({
  duelMatchState,
  groupMatchState,
  duelStartCountdownSeconds,
  groupStartCountdownSeconds,
  partyRunLinkedMatchId,
  partyRunShouldOpenArena,
  forceOpenActiveMatch,
  currentUserDoneWithLinkedMatch = false,
}: {
  duelMatchState: RunningMatchState;
  groupMatchState: RunningMatchState;
  duelStartCountdownSeconds: number | null;
  groupStartCountdownSeconds: number | null;
  partyRunLinkedMatchId?: string | null;
  partyRunShouldOpenArena: boolean;
  forceOpenActiveMatch: boolean;
  currentUserDoneWithLinkedMatch?: boolean;
}) {
  return {
    duelShouldOpenCountdownArena: duelMatchState === 'matched' && shouldAutoOpenMatchArena(duelStartCountdownSeconds),
    groupShouldOpenCountdownArena: groupMatchState === 'matched' && shouldAutoOpenMatchArena(groupStartCountdownSeconds),
    roomShouldOpenCountdownArena: Boolean(
      partyRunLinkedMatchId
      && !currentUserDoneWithLinkedMatch
      && (partyRunShouldOpenArena || forceOpenActiveMatch),
    ),
    duelShouldHoldArenaDuringActivation: duelMatchState === 'matched' && forceOpenActiveMatch,
    groupShouldHoldArenaDuringActivation: groupMatchState === 'matched' && forceOpenActiveMatch,
  };
}

export function useMatchModeDerivedState({
  matchMode,
  isRunning,
  forceOpenActiveMatch,
  duelMatchState,
  groupMatchState,
  duelStartCountdownSeconds,
  groupStartCountdownSeconds,
  duelMatchStatus,
  groupMatchStatus,
  roomLinkedMatchContext,
  hydratedFocusMatchMode,
  hydratedFocusMatchId,
  lastSyncedMatchProgressMatchId,
  liveMatchRouteHydrationMatchId,
  partyRunLinkedMatchId,
  partyRunShouldOpenArena,
  currentUserDoneWithLinkedMatch = false,
}: {
  matchMode: RunMatchMode;
  isRunning: boolean;
  forceOpenActiveMatch: boolean;
  duelMatchState: RunningMatchState;
  groupMatchState: RunningMatchState;
  duelStartCountdownSeconds: number | null;
  groupStartCountdownSeconds: number | null;
  duelMatchStatus: RunningMatchStatusResponse | null;
  groupMatchStatus: RunningMatchStatusResponse | null;
  roomLinkedMatchContext: PartyRunLinkedMatchContext | null;
  hydratedFocusMatchMode?: Extract<RunMatchMode, 'duel' | 'group'> | null;
  hydratedFocusMatchId?: string | null;
  lastSyncedMatchProgressMatchId?: string | null;
  liveMatchRouteHydrationMatchId?: string | null;
  partyRunLinkedMatchId?: string | null;
  partyRunShouldOpenArena: boolean;
  currentUserDoneWithLinkedMatch?: boolean;
}) {
  const liveMatchStartupIdentity = useMemo(() => resolveMatchModeIdentity({
    matchMode,
    duelMatchId: duelMatchStatus?.matchId,
    groupMatchId: groupMatchStatus?.matchId,
    roomLinkedMatchMode: roomLinkedMatchContext?.mode,
    roomLinkedMatchId: roomLinkedMatchContext?.matchId,
    hydratedFocusMatchMode,
    hydratedFocusMatchId,
  }), [
    duelMatchStatus?.matchId,
    groupMatchStatus?.matchId,
    hydratedFocusMatchId,
    hydratedFocusMatchMode,
    matchMode,
    roomLinkedMatchContext?.matchId,
    roomLinkedMatchContext?.mode,
  ]);

  const shouldStageAndroidLiveMatchStartup = shouldStageLiveMatchStartup({
    liveMatchStartupIdentity,
    matchMode,
    isRunning,
    forceOpenActiveMatch,
    partyRunShouldOpenArena,
    currentUserDoneWithLinkedMatch,
    duelMatchState,
    groupMatchState,
    duelStartCountdownSeconds,
    groupStartCountdownSeconds,
    roomLinkedMatchContext,
  });

  const officialCurrentAveragePace = useMemo(() => resolveOfficialCurrentAveragePace({
    matchMode,
    duelAveragePace: duelMatchStatus?.officialComparison?.userAveragePace,
    groupAveragePace: groupMatchStatus?.officialComparison?.userAveragePace,
  }), [
    duelMatchStatus?.officialComparison?.userAveragePace,
    groupMatchStatus?.officialComparison?.userAveragePace,
    matchMode,
  ]);

  const runningMatchIdentity = resolveMatchModeIdentity({
    matchMode,
    duelMatchId: duelMatchStatus?.matchId,
    groupMatchId: groupMatchStatus?.matchId,
    roomLinkedMatchMode: roomLinkedMatchContext?.mode,
    roomLinkedMatchId: roomLinkedMatchContext?.matchId,
    hydratedFocusMatchMode,
    hydratedFocusMatchId,
    fallbackMatchId: lastSyncedMatchProgressMatchId ?? null,
    defaultMatchId: liveMatchRouteHydrationMatchId ?? null,
  });

  return {
    liveMatchStartupIdentity,
    shouldStageAndroidLiveMatchStartup,
    ...resolveRoomLinkedContextFlags(roomLinkedMatchContext),
    ...resolveArenaUsesLivePace({
      matchMode,
      duelMatchState,
      groupMatchState,
      roomLinkedMatchContext,
    }),
    officialCurrentAveragePace,
    ...resolveArenaOpenState({
      duelMatchState,
      groupMatchState,
      duelStartCountdownSeconds,
      groupStartCountdownSeconds,
      partyRunLinkedMatchId,
      partyRunShouldOpenArena,
      forceOpenActiveMatch,
      currentUserDoneWithLinkedMatch,
    }),
    runningMatchIdentity,
  };
}
