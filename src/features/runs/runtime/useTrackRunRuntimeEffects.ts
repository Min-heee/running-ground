import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { useMatchEntryEffects } from '@/features/runs/lifecycle/hooks/useMatchEntryEffects';
import { useLiveMatchNavigationEffects } from '@/features/runs/lifecycle/hooks/useLiveMatchNavigationEffects';
import { useSyncedCountdownTicker } from '@/features/runs/lifecycle/hooks/useSyncedCountdownTicker';
import { useStaleMatchCleanup } from '@/features/runs/sync/matchPolling/useStaleMatchCleanup';
import { useUpcomingMatchPolling } from '@/features/runs/sync/matchPolling/useUpcomingMatchPolling';
import { useBlockingMatchStatusPolling } from '@/features/runs/sync/matchPolling/useBlockingMatchStatusPolling';
import { usePartyRunSync } from '@/features/runs/sync/usePartyRunSync';
import { useTrackRunNotificationSync } from '@/features/runs/hooks/useTrackRunNotificationSync';
import { fetchMatchDemandSummary } from '@/services';
import type {
  FriendLeaderboardResponse,
  MatchDemandSummaryResponse,
  RunningMatchRoom,
  RunningMatchStatusResponse,
} from '@/lib/api/types';
import { isRgInputInteractionRecent } from '@/utils/rgInputTrace';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import { useAndroidDeferredEffect } from '@/utils/useAndroidDeferredInteractionEffect';

type LoadMatchStatusOptions = {
  distanceKm?: number;
  forceAccept?: boolean;
  matchId?: string;
  testMode?: boolean;
};

type LoadMatchRoomOptions = {
  ignoreDuringInteraction?: boolean;
  localActiveMatchId?: string | null;
  localActiveRoomId?: string | null;
  priority?: 'normal' | 'low-priority';
  requireLocalActiveHint?: boolean;
};

type TrackRunIdleEffectModel = {
  activeMatchId: string | null;
  activeRoomCheckPriority: 'normal' | 'low-priority';
  activeRoomId: string | null;
  hasLocalActiveHint: boolean;
  idleReason: string;
  isUserActionPending: boolean;
  shouldRunActiveRoomCheck: boolean;
};

type DirectStatusEffectsInput = {
  activeDuelSlotStartAt: string;
  activeGroupSlotStartAt: string;
  duelDistanceKm: number;
  focusRequestedDuelTest: boolean;
  focusRequestedGroupTest: boolean;
  groupDistanceKm: number;
  isDuelTestFlow: boolean;
  isGroupTestFlow: boolean;
  loadDuelMatchStatus: (slotStartAt?: string, options?: LoadMatchStatusOptions) => Promise<RunningMatchStatusResponse>;
  loadGroupMatchStatus: (slotStartAt?: string, options?: LoadMatchStatusOptions) => Promise<RunningMatchStatusResponse>;
  matchMode: RunMatchMode;
  roomLinkedMatchMode: 'duel' | 'group' | null;
  setDuelMatchStatus: Dispatch<SetStateAction<RunningMatchStatusResponse | null>>;
  setGroupMatchStatus: Dispatch<SetStateAction<RunningMatchStatusResponse | null>>;
};

type DemandSummaryEffectsInput = {
  duelDistanceKm: number;
  duelSlotStartAt: string;
  groupDistanceKm: number;
  groupSlotStartAt: string;
  matchMode: RunMatchMode;
  setDuelDemandSummary: Dispatch<SetStateAction<MatchDemandSummaryResponse | null>>;
  setGroupDemandSummary: Dispatch<SetStateAction<MatchDemandSummaryResponse | null>>;
  setIsLoadingDuelDemandSummary: Dispatch<SetStateAction<boolean>>;
  setIsLoadingGroupDemandSummary: Dispatch<SetStateAction<boolean>>;
};

type InitialLoadEffectsInput = {
  commitMatchRoom: (room: RunningMatchRoom | null) => void;
  loadFriendLeaderboardData: () => Promise<FriendLeaderboardResponse>;
  loadMatchRoom: (options?: LoadMatchRoomOptions) => Promise<RunningMatchRoom | null>;
  setFriendLeaderboard: Dispatch<SetStateAction<FriendLeaderboardResponse | null>>;
  trackRunIdleViewModel: TrackRunIdleEffectModel;
};

type UseTrackRunRuntimeEffectsInput = {
  blockingMatchStatusPolling: Parameters<typeof useBlockingMatchStatusPolling>[0];
  countdownTicker: Parameters<typeof useSyncedCountdownTicker>[0];
  demandSummaryEffects: DemandSummaryEffectsInput;
  directStatusEffects: DirectStatusEffectsInput;
  initialLoadEffects: InitialLoadEffectsInput;
  liveMatchNavigationEffects: Parameters<typeof useLiveMatchNavigationEffects>[0];
  matchEntryEffects: Parameters<typeof useMatchEntryEffects>[0];
  notificationSync: Parameters<typeof useTrackRunNotificationSync>[0];
  partyRunSync: Parameters<typeof usePartyRunSync>[0];
  staleMatchCleanup: Parameters<typeof useStaleMatchCleanup>[0];
  upcomingMatchPolling: Parameters<typeof useUpcomingMatchPolling>[0];
};

export function useTrackRunRuntimeEffects({
  blockingMatchStatusPolling,
  countdownTicker,
  demandSummaryEffects,
  directStatusEffects,
  initialLoadEffects,
  liveMatchNavigationEffects,
  matchEntryEffects,
  notificationSync,
  partyRunSync,
  staleMatchCleanup,
  upcomingMatchPolling,
}: UseTrackRunRuntimeEffectsInput) {
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

  useUpcomingMatchPolling(upcomingMatchPolling);

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

  usePartyRunSync(partyRunSync);
  useStaleMatchCleanup(staleMatchCleanup);
  useMatchEntryEffects(matchEntryEffects);
  useLiveMatchNavigationEffects(liveMatchNavigationEffects);
  useTrackRunNotificationSync(notificationSync);
  useSyncedCountdownTicker(countdownTicker);
  useBlockingMatchStatusPolling(blockingMatchStatusPolling);
}
