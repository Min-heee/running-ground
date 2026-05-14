import { useEffect } from 'react';
import {
  formatMatchDateKey,
  resolveMatchTimeSection,
  type MatchTimeSection,
} from '@/features/runs/utils/matchScheduling';
import type { RunningMatchRoom } from '@/lib/api/types';

type UseMatchRoomSelectionSyncInput = {
  matchRoom: RunningMatchRoom | null;
  onRoomModeChange: (mode: RunningMatchRoom['mode']) => void;
  onRoomStartModeChange: (mode: RunningMatchRoom['startMode']) => void;
  onRoomMaxParticipantsChange: (value: string) => void;
  onSelectedRoomFriendIdsChange: (ids: string[]) => void;
  onRoomInviteTokenInputChange: (value: string) => void;
  onDuelDistanceTextChange: (value: string) => void;
  onDuelSlotStartAtChange: (value: string) => void;
  onDuelDateKeyChange: (value: string) => void;
  onDuelTimeSectionChange: (value: MatchTimeSection) => void;
  onGroupDistanceTextChange: (value: string) => void;
  onGroupSlotStartAtChange: (value: string) => void;
  onGroupDateKeyChange: (value: string) => void;
  onGroupTimeSectionChange: (value: MatchTimeSection) => void;
};

export function useMatchRoomSelectionSync({
  matchRoom,
  onRoomModeChange,
  onRoomStartModeChange,
  onRoomMaxParticipantsChange,
  onSelectedRoomFriendIdsChange,
  onRoomInviteTokenInputChange,
  onDuelDistanceTextChange,
  onDuelSlotStartAtChange,
  onDuelDateKeyChange,
  onDuelTimeSectionChange,
  onGroupDistanceTextChange,
  onGroupSlotStartAtChange,
  onGroupDateKeyChange,
  onGroupTimeSectionChange,
}: UseMatchRoomSelectionSyncInput) {
  useEffect(() => {
    if (!matchRoom) {
      return;
    }

    onRoomModeChange(matchRoom.mode);
    onRoomStartModeChange(matchRoom.startMode);
    onRoomMaxParticipantsChange(String(matchRoom.maxParticipants));
    onSelectedRoomFriendIdsChange(matchRoom.invitedFriendIds);
    onRoomInviteTokenInputChange(matchRoom.inviteToken);

    if (matchRoom.mode === 'duel') {
      onDuelDistanceTextChange(String(matchRoom.distanceKm));
      onDuelSlotStartAtChange(matchRoom.slotStartAt);
      onDuelDateKeyChange(formatMatchDateKey(new Date(matchRoom.slotStartAt)));
      onDuelTimeSectionChange(resolveMatchTimeSection(matchRoom.slotStartAt));
      return;
    }

    onGroupDistanceTextChange(String(matchRoom.distanceKm));
    onGroupSlotStartAtChange(matchRoom.slotStartAt);
    onGroupDateKeyChange(formatMatchDateKey(new Date(matchRoom.slotStartAt)));
    onGroupTimeSectionChange(resolveMatchTimeSection(matchRoom.slotStartAt));
  }, [
    matchRoom,
    onDuelDateKeyChange,
    onDuelDistanceTextChange,
    onDuelSlotStartAtChange,
    onDuelTimeSectionChange,
    onGroupDateKeyChange,
    onGroupDistanceTextChange,
    onGroupSlotStartAtChange,
    onGroupTimeSectionChange,
    onRoomInviteTokenInputChange,
    onRoomMaxParticipantsChange,
    onRoomModeChange,
    onRoomStartModeChange,
    onSelectedRoomFriendIdsChange,
  ]);
}
