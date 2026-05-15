import { useRunTrackingActions } from '@/features/runs/tracking/actions/useRunTrackingActions';
import { useMatchAutoTrackingEffects } from '@/features/runs/tracking/lifecycle/useMatchAutoTrackingEffects';
import { useTrackingAppStateSync } from '@/features/runs/tracking/useTrackingAppStateSync';
import type { BackgroundRunTrackingSnapshot } from '@/features/runs/tracking/background';
import type {
  DisplayedMatchProgress,
  SyncLiveSharingInput,
  UseRunTrackingFlowInput,
} from '@/features/runs/types/runTrackingFlow';
import type { UpdateRunningMatchProgressInput } from '@/lib/api/types';

const ANDROID_LIVE_MATCH_GPS_START_DELAY_MS = 1_500;

export function useTrackingLifecycleActions({
  buildDisplayedMatchProgress,
  clearElapsedTicker,
  ensureBackgroundLocationPermission,
  ensureLocationPermission,
  finishSoloStartCountdown,
  flow,
  pushRunningMatchProgress,
  refreshLiveSharingHeartbeat,
  refreshMatchProgressHeartbeat,
  resetForegroundTrackingState,
  resolveLiveShareLabel,
  runSoloStartCountdown,
  startElapsedTicker,
  stopForegroundTrackingHelpers,
  syncFromBackgroundTracking,
  syncLiveSharing,
  syncMatchLifecycleStatus,
}: {
  buildDisplayedMatchProgress: (snapshot?: BackgroundRunTrackingSnapshot) => DisplayedMatchProgress;
  clearElapsedTicker: () => void;
  ensureBackgroundLocationPermission: (options?: { required?: boolean }) => Promise<boolean>;
  ensureLocationPermission: () => Promise<void>;
  finishSoloStartCountdown: (completed: boolean) => void;
  flow: UseRunTrackingFlowInput;
  pushRunningMatchProgress: (input: UpdateRunningMatchProgressInput) => Promise<unknown>;
  refreshLiveSharingHeartbeat: (snapshot: BackgroundRunTrackingSnapshot) => void;
  refreshMatchProgressHeartbeat: (snapshot: BackgroundRunTrackingSnapshot) => void;
  resetForegroundTrackingState: () => void;
  resolveLiveShareLabel: (coordinate?: { latitude: number; longitude: number }) => Promise<string>;
  runSoloStartCountdown: () => Promise<boolean>;
  startElapsedTicker: () => void;
  stopForegroundTrackingHelpers: () => void;
  syncFromBackgroundTracking: (snapshot?: BackgroundRunTrackingSnapshot) => void;
  syncLiveSharing: (input: SyncLiveSharingInput) => Promise<unknown>;
  syncMatchLifecycleStatus: (
    nextStatus: Extract<UpdateRunningMatchProgressInput['status'], 'running' | 'background'>,
    snapshot?: BackgroundRunTrackingSnapshot,
  ) => Promise<unknown>;
}) {
  const trackingSubscriptionsEnabled = flow.trackingSubscriptionsEnabled ?? true;
  const lifecycleWarmupMatchId = flow.matchLifecycleController?.gps.warmupMatch?.matchId ?? null;
  const lifecycleActiveMatchId = flow.matchLifecycleController?.gps.activeMatch?.matchId ?? null;
  const lifecycleActiveMatchSlotStartAt = flow.matchLifecycleController?.gps.activeMatch?.slotStartAt ?? null;
  const hasLifecycleController = Boolean(flow.matchLifecycleController);

  const actions = useRunTrackingActions({
    appStateRef: flow.appStateRef,
    liveShareEnabledRef: flow.liveShareEnabledRef,
    liveShareLabelRef: flow.liveShareLabelRef,
    officialStartBaselineRef: flow.officialStartBaselineRef,
    autoStartingMatchTrackingRef: flow.autoStartingMatchTrackingRef,
    autoStartedMatchIdRef: flow.autoStartedMatchIdRef,
    preStartWarmupMatchIdRef: flow.preStartWarmupMatchIdRef,
    matchMode: flow.matchMode,
    duelMatchState: flow.duelMatchState,
    groupMatchState: flow.groupMatchState,
    duelMatchStatus: flow.duelMatchStatus,
    groupMatchStatus: flow.groupMatchStatus,
    roomLinkedMatchContext: flow.roomLinkedMatchContext,
    setStatus: flow.setStatus,
    setError: flow.setError,
    androidLiveMatchGpsStartDelayMs: ANDROID_LIVE_MATCH_GPS_START_DELAY_MS,
    buildDisplayedMatchProgress,
    ensureBackgroundLocationPermission,
    ensureLocationPermission,
    finishSoloStartCountdown,
    pushRunningMatchProgress,
    resetForegroundTrackingState,
    resolveLiveShareLabel,
    runSoloStartCountdown,
    stopForegroundTrackingHelpers,
    syncFromBackgroundTracking,
    syncLiveSharing,
  });

  useMatchAutoTrackingEffects({
    autoStartedMatchIdRef: flow.autoStartedMatchIdRef,
    preStartWarmupMatchIdRef: flow.preStartWarmupMatchIdRef,
    officialStartBaselineRef: flow.officialStartBaselineRef,
    matchMode: flow.matchMode,
    duelMatchState: flow.duelMatchState,
    groupMatchState: flow.groupMatchState,
    duelMatchStatus: flow.duelMatchStatus,
    groupMatchStatus: flow.groupMatchStatus,
    roomLinkedMatchContext: flow.roomLinkedMatchContext,
    status: flow.status,
    visiblePartyRunShouldOpenArena: flow.visiblePartyRunShouldOpenArena,
    duelStartCountdownSeconds: flow.duelStartCountdownSeconds,
    groupStartCountdownSeconds: flow.groupStartCountdownSeconds,
    trackingSubscriptionsEnabled,
    hasLifecycleController,
    lifecycleActiveMatchId,
    lifecycleActiveMatchSlotStartAt,
    lifecycleWarmupMatchId,
    skippedAndroidWarmupMatchIdRef: actions.skippedAndroidWarmupMatchIdRef,
    startMatchTrackingAutomatically: actions.startMatchTrackingAutomatically,
    syncFromBackgroundTracking,
  });

  useTrackingAppStateSync({
    enabled: trackingSubscriptionsEnabled,
    appStateRef: flow.appStateRef,
    trackerStatusRef: flow.trackerStatusRef,
    syncFromBackgroundTracking,
    refreshLiveSharingHeartbeat,
    refreshMatchProgressHeartbeat,
    refreshStaleMatchArtifacts: flow.refreshStaleMatchArtifacts,
    syncMatchLifecycleStatus,
    startElapsedTicker,
    clearElapsedTicker,
    finishSoloStartCountdown,
    stopForegroundTrackingHelpers,
  });

  return actions;
}
