import { useMemo } from 'react';
import type { PartyRunFlowSnapshot } from '@/features/runs/types/matchStateMachine';
import type { PartyRunLinkedMatchContext } from '@/features/runs/lifecycle/matchStateMachine';
import type { RunningMatchRoom } from '@/lib/api/types';

type UseTrackRunDiagnosticsSlotElapsedInput = {
  roomLinkedMatchContext: PartyRunLinkedMatchContext | null;
  matchRoomFlow: PartyRunFlowSnapshot;
  visiblePartyRunFlow: PartyRunFlowSnapshot;
  matchRoom: RunningMatchRoom | null;
  visibleMatchRoom: RunningMatchRoom | null;
  syncedNowMs: number;
};

export function useTrackRunDiagnosticsSlotElapsed({
  roomLinkedMatchContext,
  matchRoomFlow,
  visiblePartyRunFlow,
  matchRoom,
  visibleMatchRoom,
  syncedNowMs,
}: UseTrackRunDiagnosticsSlotElapsedInput) {
  const roomLinkedSlotStartAtForDiagnostics =
    roomLinkedMatchContext?.slotStartAt
    ?? matchRoomFlow.linkedMatchContext?.slotStartAt
    ?? visiblePartyRunFlow.linkedMatchContext?.slotStartAt
    ?? matchRoom?.linkedMatchSlotStartAt
    ?? visibleMatchRoom?.linkedMatchSlotStartAt
    ?? matchRoom?.slotStartAt
    ?? visibleMatchRoom?.slotStartAt
    ?? null;
  const roomLinkedSlotElapsedMsForDiagnostics = useMemo(() => {
    if (!roomLinkedSlotStartAtForDiagnostics) {
      return null;
    }

    const slotStartMs = Date.parse(roomLinkedSlotStartAtForDiagnostics);
    return Number.isFinite(slotStartMs) ? syncedNowMs - slotStartMs : null;
  }, [roomLinkedSlotStartAtForDiagnostics, syncedNowMs]);

  return {
    roomLinkedSlotStartAtForDiagnostics,
    roomLinkedSlotElapsedMsForDiagnostics,
  };
}
