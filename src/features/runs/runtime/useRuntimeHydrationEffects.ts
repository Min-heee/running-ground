import { useEffect } from 'react';
import { fetchMatchDemandSummary } from '@/services';
import { isRgInputInteractionRecent } from '@/utils/rgInputTrace';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import { useAndroidDeferredEffect } from '@/utils/useAndroidDeferredInteractionEffect';
import type { RuntimeHydrationEffectsInput } from '@/features/runs/types/runtimeEffects';

export function useRuntimeHydrationEffects({
  demandSummaryEffects,
  directStatusEffects,
  initialLoadEffects,
}: RuntimeHydrationEffectsInput) {
  useEffect(() => {
    if (directStatusEffects.matchMode !== 'duel') {
      return;
    }

    if (directStatusEffects.roomLinkedMatchMode === 'duel') {
      return;
    }

    let canceled = false;
    void directStatusEffects.loadDuelMatchStatus(directStatusEffects.activeDuelSlotStartAt, {
      testMode: directStatusEffects.focusRequestedDuelTest || directStatusEffects.isDuelTestFlow,
    }).catch(() => {
      if (!canceled) {
        directStatusEffects.setDuelMatchStatus(null);
      }
    });

    return () => {
      canceled = true;
    };
  }, [
    directStatusEffects.activeDuelSlotStartAt,
    directStatusEffects.duelDistanceKm,
    directStatusEffects.focusRequestedDuelTest,
    directStatusEffects.isDuelTestFlow,
    directStatusEffects.matchMode,
    directStatusEffects.roomLinkedMatchMode,
  ]);

  useEffect(() => {
    if (directStatusEffects.matchMode !== 'group') {
      return;
    }

    if (directStatusEffects.roomLinkedMatchMode === 'group') {
      return;
    }

    let canceled = false;
    void directStatusEffects.loadGroupMatchStatus(directStatusEffects.activeGroupSlotStartAt, {
      testMode: directStatusEffects.focusRequestedGroupTest || directStatusEffects.isGroupTestFlow,
    }).catch(() => {
      if (!canceled) {
        directStatusEffects.setGroupMatchStatus(null);
      }
    });

    return () => {
      canceled = true;
    };
  }, [
    directStatusEffects.activeGroupSlotStartAt,
    directStatusEffects.focusRequestedGroupTest,
    directStatusEffects.groupDistanceKm,
    directStatusEffects.isGroupTestFlow,
    directStatusEffects.matchMode,
    directStatusEffects.roomLinkedMatchMode,
  ]);

  useAndroidDeferredEffect(() => {
    if (demandSummaryEffects.matchMode !== 'duel') {
      return;
    }

    let canceled = false;
    demandSummaryEffects.setIsLoadingDuelDemandSummary(true);

    void fetchMatchDemandSummary({
      mode: 'duel',
      distanceKm: demandSummaryEffects.duelDistanceKm,
      slotStartAt: demandSummaryEffects.duelSlotStartAt,
    })
      .then((payload) => {
        if (!canceled) {
          demandSummaryEffects.setDuelDemandSummary(payload);
        }
      })
      .catch(() => {
        if (!canceled) {
          demandSummaryEffects.setDuelDemandSummary(null);
        }
      })
      .finally(() => {
        if (!canceled) {
          demandSummaryEffects.setIsLoadingDuelDemandSummary(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [
    demandSummaryEffects.duelDistanceKm,
    demandSummaryEffects.duelSlotStartAt,
    demandSummaryEffects.matchMode,
  ]);

  useAndroidDeferredEffect(() => {
    if (demandSummaryEffects.matchMode !== 'group') {
      return;
    }

    let canceled = false;
    demandSummaryEffects.setIsLoadingGroupDemandSummary(true);

    void fetchMatchDemandSummary({
      mode: 'group',
      distanceKm: demandSummaryEffects.groupDistanceKm,
      slotStartAt: demandSummaryEffects.groupSlotStartAt,
    })
      .then((payload) => {
        if (!canceled) {
          demandSummaryEffects.setGroupDemandSummary(payload);
        }
      })
      .catch(() => {
        if (!canceled) {
          demandSummaryEffects.setGroupDemandSummary(null);
        }
      })
      .finally(() => {
        if (!canceled) {
          demandSummaryEffects.setIsLoadingGroupDemandSummary(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [
    demandSummaryEffects.groupDistanceKm,
    demandSummaryEffects.groupSlotStartAt,
    demandSummaryEffects.matchMode,
  ]);

  useAndroidDeferredEffect(() => {
    let canceled = false;
    let activeRoomCheckDelay: ReturnType<typeof setTimeout> | null = null;
    const {
      commitMatchRoom,
      loadFriendLeaderboardData,
      loadMatchRoom,
      setFriendLeaderboard,
      trackRunIdleViewModel,
    } = initialLoadEffects;
    const isLowPriorityActiveRoomCheck = trackRunIdleViewModel.activeRoomCheckPriority === 'low-priority';

    if (trackRunIdleViewModel.shouldRunActiveRoomCheck) {
      const runDeferredActiveRoomCheck = () => {
        if (canceled) {
          return;
        }

        void loadMatchRoom({
          ignoreDuringInteraction: isLowPriorityActiveRoomCheck,
          localActiveMatchId: trackRunIdleViewModel.activeMatchId,
          localActiveRoomId: trackRunIdleViewModel.activeRoomId,
          priority: trackRunIdleViewModel.activeRoomCheckPriority,
          requireLocalActiveHint: isLowPriorityActiveRoomCheck,
        }).catch(() => {
          if (!canceled) {
            commitMatchRoom(null);
          }
        });
      };

      if (isLowPriorityActiveRoomCheck) {
        const delayMs = 4_000;
        rgPerfMark('active room check deferred idle', {
          delayMs,
          hasLocalActiveHint: trackRunIdleViewModel.hasLocalActiveHint,
          reason: trackRunIdleViewModel.idleReason,
          source: 'track-run experience',
        });
        rgPerfMark('active room check foreground debounce', {
          delayMs,
          hasLocalActiveHint: trackRunIdleViewModel.hasLocalActiveHint,
          reason: trackRunIdleViewModel.idleReason,
          source: 'track-run experience',
        });
        activeRoomCheckDelay = setTimeout(runDeferredActiveRoomCheck, delayMs);
      } else {
        runDeferredActiveRoomCheck();
      }
    } else {
      if (trackRunIdleViewModel.isUserActionPending || isRgInputInteractionRecent()) {
        rgPerfMark('active room check suppressed by user interaction', {
          reason: trackRunIdleViewModel.idleReason,
          source: 'track-run initial load',
        });
      } else if (!trackRunIdleViewModel.hasLocalActiveHint) {
        rgPerfMark('active room check skipped no local active hint', {
          reason: trackRunIdleViewModel.idleReason,
          source: 'track-run initial load',
        });
      } else {
        rgPerfMark('track run heavy hooks skipped idle', {
          hook: 'active room check',
          reason: trackRunIdleViewModel.idleReason,
          source: 'track-run initial load',
        });
      }
    }

    void loadFriendLeaderboardData().catch(() => {
      if (!canceled) {
        setFriendLeaderboard(null);
      }
    });

    return () => {
      canceled = true;
      if (activeRoomCheckDelay) {
        clearTimeout(activeRoomCheckDelay);
      }
    };
  }, [
    initialLoadEffects.trackRunIdleViewModel.activeMatchId,
    initialLoadEffects.trackRunIdleViewModel.activeRoomCheckPriority,
    initialLoadEffects.trackRunIdleViewModel.activeRoomId,
    initialLoadEffects.trackRunIdleViewModel.hasLocalActiveHint,
    initialLoadEffects.trackRunIdleViewModel.idleReason,
    initialLoadEffects.trackRunIdleViewModel.isUserActionPending,
    initialLoadEffects.trackRunIdleViewModel.shouldRunActiveRoomCheck,
  ]);
}
