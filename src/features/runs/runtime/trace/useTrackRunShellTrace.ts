import { useEffect } from 'react';

import type { TrackRunShellTraceInput } from './types';

export function useTrackRunShellTrace({
  currentTrackerStatus,
  liveShareEnabled,
  liveShareEnabledRef,
  liveShareLabel,
  liveShareLabelRef,
  matchMode,
  matchModeRef,
  trackerStatusRef,
}: TrackRunShellTraceInput) {
  useEffect(() => {
    liveShareEnabledRef.current = liveShareEnabled;
    liveShareLabelRef.current = liveShareLabel;
    trackerStatusRef.current = currentTrackerStatus;
    matchModeRef.current = matchMode;
  }, [
    currentTrackerStatus,
    liveShareEnabled,
    liveShareEnabledRef,
    liveShareLabel,
    liveShareLabelRef,
    matchMode,
    matchModeRef,
    trackerStatusRef,
  ]);
}
