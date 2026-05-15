import { useEffect } from 'react';

import type { TrackRunRenderTraceInput } from './types';

export function useTrackRunRenderTrace({
  duelMatchStatus,
  duelMatchStatusRef,
  groupMatchStatus,
  groupMatchStatusRef,
}: TrackRunRenderTraceInput) {
  useEffect(() => {
    duelMatchStatusRef.current = duelMatchStatus;
    groupMatchStatusRef.current = groupMatchStatus;
  }, [duelMatchStatus, duelMatchStatusRef, groupMatchStatus, groupMatchStatusRef]);
}
