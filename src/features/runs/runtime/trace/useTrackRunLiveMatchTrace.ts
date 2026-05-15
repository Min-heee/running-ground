import { useEffect } from 'react';

import { rgPerfMark } from '@/utils/rgPerfTrace';

import type { TrackRunLiveMatchTraceInput } from './types';

export function useTrackRunLiveMatchTrace({
  liveMatchRenderIdentity,
  liveMatchRenderMode,
  liveMatchShellPreservation,
  matchLifecycleStage,
  previousPreservedLiveMatchShell,
  showLiveArena,
}: TrackRunLiveMatchTraceInput) {
  useEffect(() => {
    if (liveMatchShellPreservation.key) {
      rgPerfMark('live match key stable', {
        key: liveMatchShellPreservation.key,
        matchId: liveMatchRenderIdentity,
        mode: liveMatchRenderMode,
        source: 'track-run experience',
      });
    }

    if (liveMatchShellPreservation.preserved) {
      rgPerfMark('live match unmount prevented same match', {
        key: liveMatchShellPreservation.key,
        matchId: previousPreservedLiveMatchShell?.matchId ?? liveMatchRenderIdentity,
        mode: previousPreservedLiveMatchShell?.mode ?? liveMatchRenderMode,
        source: 'track-run experience',
        stage: matchLifecycleStage,
      });
      rgPerfMark('live match preserved through tracking transition', {
        key: liveMatchShellPreservation.key,
        matchId: previousPreservedLiveMatchShell?.matchId ?? liveMatchRenderIdentity,
        mode: previousPreservedLiveMatchShell?.mode ?? liveMatchRenderMode,
        requestedShowLiveArena: showLiveArena,
        source: 'track-run experience',
        stage: matchLifecycleStage,
      });
    }
  }, [
    liveMatchRenderIdentity,
    liveMatchRenderMode,
    liveMatchShellPreservation.key,
    liveMatchShellPreservation.preserved,
    matchLifecycleStage,
    previousPreservedLiveMatchShell?.matchId,
    previousPreservedLiveMatchShell?.mode,
    showLiveArena,
  ]);
}
