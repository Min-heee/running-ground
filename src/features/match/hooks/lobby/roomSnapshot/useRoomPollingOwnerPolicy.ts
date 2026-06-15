import { useMemo } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import { resolveMatchRoomSnapshotPollingPolicy } from './roomSnapshotPollingPolicy';

export function useRoomPollingOwnerPolicy({
  linkedMatchId,
  state,
  linkedMatchStatus,
}: {
  linkedMatchId?: string | null;
  state?: RunningMatchRoom['state'] | null;
  linkedMatchStatus?: RunningMatchRoom['linkedMatchStatus'] | null;
}) {
  return useMemo(() => resolveMatchRoomSnapshotPollingPolicy({
    linkedMatchId,
    state,
    linkedMatchStatus,
  }), [linkedMatchId, state, linkedMatchStatus]);
}
