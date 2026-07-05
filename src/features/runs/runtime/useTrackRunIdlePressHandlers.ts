import type { Dispatch, SetStateAction } from 'react';
import type { MatchOptionItem } from '@/features/runs/components/MatchOptionSelector';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { FocusRunningMatchInput } from '@/features/runs/lifecycle/hooks/runningMatchFocus/types';
import { isMatchRoomDeleted } from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import { useStableCallback } from '@/features/runs/runtime/useStableCallback';
import type {
  RunningMatchRoom,
  UpcomingRunningMatchItem,
} from '@/lib/api/types';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type UseTrackRunIdlePressHandlersInput = {
  activeDuelSlotStartAt: string;
  activeGroupSlotStartAt: string;
  focusRunningMatch: (input: FocusRunningMatchInput) => Promise<unknown>;
  handleAcceptRoomInviteFromRunning: () => Promise<unknown>;
  handleCancelDuelMatch: () => Promise<unknown>;
  handleCancelGroupMatch: () => Promise<unknown>;
  handleCancelUpcomingMatch: (match: UpcomingRunningMatchItem) => Promise<unknown>;
  handleDeclineRoomInviteFromRunning: () => Promise<unknown>;
  handleJoinMatchRoom: () => Promise<void>;
  handleRequestDuelMatch: (slotStartAt?: string, options?: { testMode?: boolean }) => Promise<unknown>;
  handleRequestGroupMatch: (slotStartAt?: string, options?: { testMode?: boolean }) => Promise<unknown>;
  navigateToMatchRoomWithTrace: (
    source: string,
    room?: RunningMatchRoom | null,
    serverNow?: string,
    timingSource?: unknown,
  ) => void;
  selectNextDuelSlotForDate: (dateKey: string) => void;
  selectNextGroupSlotForDate: (dateKey: string) => void;
  setMatchMode: Dispatch<SetStateAction<RunMatchMode>>;
  setSelectedDuelDateKey: Dispatch<SetStateAction<string>>;
  setSelectedGroupDateKey: Dispatch<SetStateAction<string>>;
  visibleMatchRoom: RunningMatchRoom | null;
};

export function useTrackRunIdlePressHandlers({
  activeDuelSlotStartAt,
  activeGroupSlotStartAt,
  focusRunningMatch,
  handleAcceptRoomInviteFromRunning,
  handleCancelDuelMatch,
  handleCancelGroupMatch,
  handleCancelUpcomingMatch,
  handleDeclineRoomInviteFromRunning,
  handleJoinMatchRoom,
  handleRequestDuelMatch,
  handleRequestGroupMatch,
  navigateToMatchRoomWithTrace,
  selectNextDuelSlotForDate,
  selectNextGroupSlotForDate,
  setMatchMode,
  setSelectedDuelDateKey,
  setSelectedGroupDateKey,
  visibleMatchRoom,
}: UseTrackRunIdlePressHandlersInput) {
  const handleOpenUpcomingMatch = useStableCallback((match: UpcomingRunningMatchItem) => {
    void focusRunningMatch({
      mode: match.mode,
      distanceKm: match.distanceKm,
      slotStartAt: match.slotStartAt,
      isTestMatch: match.isTestMatch,
    }).catch(() => {});
  });

  const handleCancelUpcomingMatchPress = useStableCallback((match: UpcomingRunningMatchItem) => {
    void handleCancelUpcomingMatch(match);
  });

  const handleSelectMatchOption = useStableCallback((option: MatchOptionItem) => {
    if (option.mode === 'room' && visibleMatchRoom) {
      if (isMatchRoomDeleted(visibleMatchRoom.roomId)) {
        rgPerfMark('room entry skipped deleted room', {
          roomId: visibleMatchRoom.roomId,
          source: 'ready option existing room',
          state: visibleMatchRoom.state,
        });
        return;
      }

      rgPerfMark('already joined room detected', {
        roomId: visibleMatchRoom.roomId,
        source: 'ready option select',
        state: visibleMatchRoom.state,
      });
      navigateToMatchRoomWithTrace('ready option existing room', visibleMatchRoom);
      return;
    }

    setMatchMode(option.mode);
  });

  const handleAcceptRoomInvitePress = useStableCallback(() => {
    void handleAcceptRoomInviteFromRunning();
  });

  const handleDeclineRoomInvitePress = useStableCallback(() => {
    void handleDeclineRoomInviteFromRunning();
  });

  const handleJoinRoomPress = useStableCallback(() => {
    return handleJoinMatchRoom();
  });

  const handleSelectDuelDate = useStableCallback((dateKey: string) => {
    setSelectedDuelDateKey(dateKey);
    selectNextDuelSlotForDate(dateKey);
  });

  const handleCancelDuelMatchPress = useStableCallback(() => {
    void handleCancelDuelMatch();
  });

  const handleRequestDuelMatchPress = useStableCallback(() => {
    void handleRequestDuelMatch();
  });

  const handleRequestDuelRematchPress = useStableCallback(() => {
    void handleRequestDuelMatch(activeDuelSlotStartAt);
  });

  const handleSelectGroupDate = useStableCallback((dateKey: string) => {
    setSelectedGroupDateKey(dateKey);
    selectNextGroupSlotForDate(dateKey);
  });

  const handleCancelGroupMatchPress = useStableCallback(() => {
    void handleCancelGroupMatch();
  });

  const handleRequestGroupMatchPress = useStableCallback(() => {
    void handleRequestGroupMatch();
  });

  const handleRequestGroupRematchPress = useStableCallback(() => {
    void handleRequestGroupMatch(activeGroupSlotStartAt);
  });

  return {
    handleAcceptRoomInvitePress,
    handleCancelDuelMatchPress,
    handleCancelGroupMatchPress,
    handleCancelUpcomingMatchPress,
    handleDeclineRoomInvitePress,
    handleJoinRoomPress,
    handleOpenUpcomingMatch,
    handleRequestDuelMatchPress,
    handleRequestDuelRematchPress,
    handleRequestGroupMatchPress,
    handleRequestGroupRematchPress,
    handleSelectDuelDate,
    handleSelectGroupDate,
    handleSelectMatchOption,
  };
}
