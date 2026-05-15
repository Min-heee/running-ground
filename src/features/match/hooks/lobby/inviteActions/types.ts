import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import type { MatchRoomUxModel } from '@/features/runs/lifecycle/matchRoomFlow';
import type { UpdateRoomSettingsInput } from '@/features/runs/types/matchRoom';

export type RoomInviteActionSharedInput = {
  room: RunningMatchRoom | null;
  roomUxModel: MatchRoomUxModel;
  selectedFriendIds: string[];
  latestRoomServerNowMsRef: MutableRefObject<number>;
  commitRoom: (room: RunningMatchRoom | null) => void;
  syncServerClock: (serverNow?: string) => void;
  setError: Dispatch<SetStateAction<string | null>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
  saveRoomSettings: (overrides?: UpdateRoomSettingsInput) => Promise<RunningMatchRoom | null>;
};
