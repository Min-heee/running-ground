import { useMemo } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import { resolveMatchRoomSnapshotPollingPolicy } from './roomSnapshotPollingPolicy';

export function useRoomPollingOwnerPolicy({
  linkedMatchId,
  state,
}: {
  linkedMatchId?: string | null;
  state?: RunningMatchRoom['state'] | null;
}) {
  return useMemo(() => resolveMatchRoomSnapshotPollingPolicy({
    linkedMatchId,
    state,
  }), [linkedMatchId, state]);
}
