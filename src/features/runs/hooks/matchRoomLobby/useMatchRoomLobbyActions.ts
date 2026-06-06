import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useRoomInviteActions } from '@/features/match/hooks/lobby/useRoomInviteActions';
import { useRoomSettings } from '@/features/match/hooks/lobby/useRoomSettings';
import { useRoomStartActions } from '@/features/match/hooks/lobby/useRoomStartActions';
import type { RunningMatchRoom } from '@/lib/api/types';
import type { MatchRoomUxModel } from '@/features/runs/lifecycle/matchRoomFlow';

type MatchRoomSettings = ReturnType<typeof useRoomSettings>;

type UseMatchRoomLobbyActionsInput = {
  commitRoom: (room: RunningMatchRoom | null) => void;
  isReady: boolean;
  latestRoomServerNowMsRef: MutableRefObject<number>;
  pauseRoomPolling: () => void;
  room: RunningMatchRoom | null;
  roomUxModel: MatchRoomUxModel;
  setError: Dispatch<SetStateAction<string | null>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
  settings: Pick<MatchRoomSettings, 'saveRoomSettings' | 'selectedFriendIds'>;
  syncServerClock: (serverNow?: string, timingSource?: unknown) => void;
};

export function useMatchRoomLobbyActions({
  commitRoom,
  isReady,
  latestRoomServerNowMsRef,
  pauseRoomPolling,
  room,
  roomUxModel,
  setError,
  setSaving,
  settings,
  syncServerClock,
}: UseMatchRoomLobbyActionsInput) {
  const startActions = useRoomStartActions({
    room,
    roomUxModel,
    isReady,
    latestRoomServerNowMsRef,
    commitRoom,
    syncServerClock,
    pauseRoomPolling,
    setError,
    setSaving,
  });
  const inviteActions = useRoomInviteActions({
    room,
    roomUxModel,
    selectedFriendIds: settings.selectedFriendIds,
    latestRoomServerNowMsRef,
    commitRoom,
    syncServerClock,
    setError,
    setSaving,
    saveRoomSettings: settings.saveRoomSettings,
  });

  return {
    ...startActions,
    ...inviteActions,
  };
}
