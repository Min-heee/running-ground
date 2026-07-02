import { useEffect } from 'react';
import { recordLiveMatchForfeitDiagnosticsSnapshot } from '@/features/runs/debug/liveMatchForfeitDiagnostics';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { PartyRunLinkedMatchContext } from '@/features/runs/lifecycle/matchStateMachine';
import type { ArenaParticipantViewModel } from '@/features/runs/viewModels/matchViewModels';
import type { RunningMatchRoom, RunningMatchStatusResponse } from '@/lib/api/types';

// Same gate as LiveMatchForfeitDebugPanel — the only consumer of these snapshots. When the
// panel cannot render, skip the per-poll bookkeeping entirely so release builds do zero work.
const FORFEIT_DIAGNOSTICS_ENABLED = process.env.EXPO_PUBLIC_ENABLE_ANDROID_MATCH_PERF === '1';

type UseTrackRunForfeitDiagnosticsSnapshotInput = {
  matchMode: RunMatchMode;
  activeLiveMatchProgressMatchId: string | null;
  currentUserId: string;
  duelMatchStatus: RunningMatchStatusResponse | null;
  groupMatchStatus: RunningMatchStatusResponse | null;
  roomLinkedMatchContext: PartyRunLinkedMatchContext | null;
  linkedRuntimeRoom: RunningMatchRoom | null;
  duelArenaParticipants: ArenaParticipantViewModel[];
  groupArenaParticipants: ArenaParticipantViewModel[];
  roomLinkedDuelPlaceholderParticipants: ArenaParticipantViewModel[];
  roomLinkedGroupPlaceholderParticipants: ArenaParticipantViewModel[];
};

export function useTrackRunForfeitDiagnosticsSnapshot({
  matchMode,
  activeLiveMatchProgressMatchId,
  currentUserId,
  duelMatchStatus,
  groupMatchStatus,
  roomLinkedMatchContext,
  linkedRuntimeRoom,
  duelArenaParticipants,
  groupArenaParticipants,
  roomLinkedDuelPlaceholderParticipants,
  roomLinkedGroupPlaceholderParticipants,
}: UseTrackRunForfeitDiagnosticsSnapshotInput) {
  useEffect(() => {
    if (!FORFEIT_DIAGNOSTICS_ENABLED) {
      return;
    }

    const placeholderParticipants = matchMode === 'duel'
      ? roomLinkedDuelPlaceholderParticipants
      : matchMode === 'group'
        ? roomLinkedGroupPlaceholderParticipants
        : [];
    const arenaParticipants = matchMode === 'duel'
      ? duelArenaParticipants
      : matchMode === 'group'
        ? groupArenaParticipants
        : [];
    const source = matchMode === 'duel'
      ? duelMatchStatus?.matchId
        ? 'duelMatchStatus'
        : roomLinkedMatchContext?.mode === 'duel'
          ? 'roomLinkedMatchContext'
          : roomLinkedDuelPlaceholderParticipants.length
            ? 'roomLinkedPlaceholder'
            : 'none'
      : matchMode === 'group'
        ? groupMatchStatus?.matchId
          ? 'groupMatchStatus'
          : roomLinkedMatchContext?.mode === 'group'
            ? 'roomLinkedMatchContext'
            : roomLinkedGroupPlaceholderParticipants.length
              ? 'roomLinkedPlaceholder'
              : 'none'
        : 'none';

    recordLiveMatchForfeitDiagnosticsSnapshot({
      mode: matchMode,
      matchId: activeLiveMatchProgressMatchId,
      source,
      currentUserId,
      duelMatchStatus,
      groupMatchStatus,
      roomLinkedMatchContext,
      linkedRuntimeRoom,
      placeholderParticipants,
      arenaParticipants,
    });
  }, [
    activeLiveMatchProgressMatchId,
    currentUserId,
    duelArenaParticipants,
    duelMatchStatus,
    groupArenaParticipants,
    groupMatchStatus,
    linkedRuntimeRoom,
    matchMode,
    roomLinkedDuelPlaceholderParticipants,
    roomLinkedGroupPlaceholderParticipants,
    roomLinkedMatchContext,
  ]);
}
