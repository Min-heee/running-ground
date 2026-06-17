import { shouldAcceptServerSnapshot } from '@/features/runs/sync/serverClockSync';
import { unmarkLiveMatchMounted } from '@/features/runs/lifecycle/liveMatchMountedRegistry';
import { acknowledgeRunningMatchRoomCountdown } from '@/services';
import type { PartyRunLinkedMatchContext } from '@/features/runs/lifecycle/matchStateMachine';
import type { UseTrackRunRuntimeMatchActionsInput } from '@/features/runs/runtime/trackRunRuntimeMatchActionTypes';
import { rgDiagLog } from '@/utils/rgPerfTrace';

export function useTrackRunRuntimeMatchMaintenanceActions(input: UseTrackRunRuntimeMatchActionsInput) {
  const {
    activeDuelSlotStartAt,
    activeGroupSlotStartAt,
    autoStartedMatchIdRef,
    clearLocalDuelMatchState,
    clearLocalGroupMatchState,
    commitMatchRoom,
    duelMatchResult,
    duelMatchStatus,
    forfeitedMatchIdsRef,
    groupMatchResult,
    groupMatchStatus,
    isDuelTestFlow,
    isGroupTestFlow,
    latestMatchRoomServerNowMsRef,
    liveMatchMountedRef,
    liveMatchViewConfirmationRef,
    livePagerRef,
    loadDuelMatchStatus,
    loadGroupMatchStatus,
    loadMatchRoom,
    loadUpcomingMatches,
    matchProgressHeartbeatRef,
    matchRoom,
    preservedLiveMatchShellRef,
    preStartWarmupMatchIdRef,
    resetLiveMatchNavigationOwner,
    roomLinkedMatchContextRef,
    setForceOpenActiveMatch,
    setLastSyncedMatchProgress,
    setLiveArenaPage,
    setMatchMode,
    setUpcomingMatches,
    status,
    syncServerClock,
    trackRunIdleViewModel,
    upcomingMatches,
  } = input;

  function clearLocalForfeitedMatchState(source: 'duel' | 'group', matchId: string) {
    forfeitedMatchIdsRef.current.add(matchId);
    matchProgressHeartbeatRef.current = 0;
    preStartWarmupMatchIdRef.current = null;
    autoStartedMatchIdRef.current = null;
    roomLinkedMatchContextRef.current = null;

    // Leave/forfeit is the most stale end path: evict only this ended matchId from the
    // module mount registry, clear the same per-instance shell latches the save path
    // clears, and drop the navigation-owner records so a back-to-back match #2 isn't
    // blocked from loading→active (B2b). Eviction is a mounted-latch removal scoped to
    // the ended matchId — it does NOT revive this match; forfeitedMatchIdsRef still drops
    // any later payload for it.
    unmarkLiveMatchMounted({ matchId, mode: source });
    preservedLiveMatchShellRef.current = null;
    if (liveMatchMountedRef.current?.matchId === matchId) {
      liveMatchMountedRef.current = null;
    }
    if (liveMatchViewConfirmationRef.current.matchId === matchId) {
      liveMatchViewConfirmationRef.current = {
        matchId: null,
        mode: null,
        showLiveArena: false,
      };
    }
    resetLiveMatchNavigationOwner();

    setForceOpenActiveMatch(false);
    setLiveArenaPage(0);
    setLastSyncedMatchProgress(null);
    setUpcomingMatches((currentItems) => currentItems.filter((match) => match.matchId !== matchId));

    if (matchRoom?.linkedMatchId === matchId) {
      commitMatchRoom(null);
    }

    if (source === 'duel') {
      clearLocalDuelMatchState(null);
    } else {
      clearLocalGroupMatchState(null);
    }

    setMatchMode('solo');
    livePagerRef.current?.scrollTo({ x: 0, animated: false });
  }

  async function refreshStaleMatchArtifacts() {
    const isLowPriorityActiveRoomCheck = trackRunIdleViewModel.activeRoomCheckPriority === 'low-priority';
    const [roomPayload, upcomingItems, duelStatusPayload, groupStatusPayload] = await Promise.all([
      loadMatchRoom({
        ignoreDuringInteraction: isLowPriorityActiveRoomCheck,
        localActiveMatchId: trackRunIdleViewModel.activeMatchId,
        localActiveRoomId: trackRunIdleViewModel.activeRoomId,
        priority: trackRunIdleViewModel.activeRoomCheckPriority,
        requireLocalActiveHint: isLowPriorityActiveRoomCheck,
      }).catch(() => matchRoom),
      loadUpcomingMatches().catch(() => upcomingMatches),
      (isDuelTestFlow || duelMatchStatus || duelMatchResult)
        ? loadDuelMatchStatus(activeDuelSlotStartAt, { testMode: isDuelTestFlow || Boolean(duelMatchStatus?.isTestMatch || duelMatchResult?.isTestMatch) }).catch(() => null)
        : Promise.resolve(null),
      (isGroupTestFlow || groupMatchStatus || groupMatchResult)
        ? loadGroupMatchStatus(activeGroupSlotStartAt, { testMode: isGroupTestFlow || Boolean(groupMatchStatus?.isTestMatch || groupMatchResult?.isTestMatch) }).catch(() => null)
        : Promise.resolve(null),
    ]);

    const hasUpcomingDuel = upcomingItems.some((match) => match.mode === 'duel');
    const hasUpcomingGroup = upcomingItems.some((match) => match.mode === 'group');
    const hasLinkedRoomMatch = Boolean(roomPayload?.linkedMatchId || roomPayload?.linkedMatchSlotStartAt);

    if (duelStatusPayload?.state === 'idle' && !hasUpcomingDuel && (isDuelTestFlow || duelMatchStatus || duelMatchResult)) {
      const shouldKeepTestArtifacts = isDuelTestFlow || duelMatchStatus?.isTestMatch || duelMatchResult?.isTestMatch;
      clearLocalDuelMatchState(
        shouldKeepTestArtifacts ? '이전 테스트 1대1 대결은 이미 정리됐어요. 새로 시작할 수 있어요.' : null,
      );
    }

    if (groupStatusPayload?.state === 'idle' && !hasUpcomingGroup && (isGroupTestFlow || groupMatchStatus || groupMatchResult)) {
      const shouldKeepTestArtifacts = isGroupTestFlow || groupMatchStatus?.isTestMatch || groupMatchResult?.isTestMatch;
      clearLocalGroupMatchState(
        shouldKeepTestArtifacts ? '이전 테스트 그룹 대결은 이미 정리됐어요. 새로 시작할 수 있어요.' : null,
      );
    }

    if (status !== 'idle' || hasLinkedRoomMatch) {
      return;
    }

    if (!hasUpcomingDuel && duelMatchStatus?.state !== 'active' && !duelMatchStatus?.isTestMatch) {
      clearLocalDuelMatchState();
    }

    if (!hasUpcomingGroup && groupMatchStatus?.state !== 'active' && !groupMatchStatus?.isTestMatch) {
      clearLocalGroupMatchState();
    }
  }

  async function acknowledgeRoomCountdownReady(roomId: string) {
    const payload = await acknowledgeRunningMatchRoomCountdown({ roomId });
    if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
      // This one-shot ACK response is a guest's ONLY delivery of linkedMatchSlotStartAt
      // (room polling + the active-room re-fetch are both disabled once linkedMatchId is
      // set, and the ACK never re-fires after an HTTP success). The shared monotonic room
      // guard is a never-reset high-water mark, so on a 2nd consecutive party-run it can
      // drop this response, leaving the room with no slot start and the arming overlay
      // stuck forever. The slot-start transition is authoritative, so commit it even when
      // the snapshot is otherwise rejected — never regressing, since the room only gains a
      // slot start it previously lacked (commitMatchRoom dedupes by render key).
      if (payload.room?.linkedMatchSlotStartAt) {
        commitMatchRoom(payload.room);
      }
      return;
    }

    syncServerClock(payload.serverNow, payload);
    commitMatchRoom(payload.room);
  }

  async function syncRoomLinkedMatchStatus(context: PartyRunLinkedMatchContext) {
    rgDiagLog('linked match status request', {
      distanceKm: context.distanceKm,
      matchId: context.matchId,
      mode: context.mode,
      slotStartAt: context.slotStartAt,
    });

    return context.mode === 'duel'
      ? loadDuelMatchStatus(context.slotStartAt, {
          distanceKm: context.distanceKm,
          matchId: context.matchId,
          testMode: false,
          forceAccept: true,
        })
      : loadGroupMatchStatus(context.slotStartAt, {
          distanceKm: context.distanceKm,
          matchId: context.matchId,
          testMode: false,
          forceAccept: true,
        });
  }

  return {
    acknowledgeRoomCountdownReady,
    clearLocalForfeitedMatchState,
    refreshStaleMatchArtifacts,
    syncRoomLinkedMatchStatus,
  };
}
