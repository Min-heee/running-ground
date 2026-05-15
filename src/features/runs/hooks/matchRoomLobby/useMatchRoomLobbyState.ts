import { useState } from 'react';
import { useRoomSettings } from '@/features/match/hooks/lobby/useRoomSettings';
import { useRoomSnapshot } from '@/features/match/hooks/lobby/useRoomSnapshot';

export function useMatchRoomLobbyState() {
  const [saving, setSaving] = useState(false);
  const snapshot = useRoomSnapshot();
  const settings = useRoomSettings({
    room: snapshot.room,
    latestRoomServerNowMsRef: snapshot.latestRoomServerNowMsRef,
    commitRoom: snapshot.commitRoom,
    syncServerClock: snapshot.syncServerClock,
    setError: snapshot.setError,
    setSaving,
  });

  return {
    ...snapshot,
    saving,
    setSaving,
    settings,
  };
}
