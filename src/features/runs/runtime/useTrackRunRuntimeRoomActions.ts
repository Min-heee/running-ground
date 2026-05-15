import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useTrackRunRoomCreateAction } from '@/features/runs/runtime/useTrackRunRoomCreateAction';
import { useTrackRunRoomJoinAction } from '@/features/runs/runtime/useTrackRunRoomJoinAction';
import { useTrackRunRoomLoader } from '@/features/runs/runtime/useTrackRunRoomLoader';
import { useTrackRunRuntimeRecipientInviteInbox } from '@/features/runs/runtime/useTrackRunRuntimeRecipientInviteInbox';
import { useTrackRunRuntimeRoomInviteActions } from '@/features/runs/runtime/useTrackRunRuntimeRoomInviteActions';
import type { RunningMatchRoom } from '@/lib/api/types';
import { fetchFriendLeaderboard } from '@/services';

type UseTrackRunRuntimeRoomActionsInput = {
  commitMatchRoom: (room: RunningMatchRoom | null) => void;
  currentUserId: string;
  isCreatingMatchRoom: boolean;
  isJoiningMatchRoom: boolean;
  isLeavingMatchRoom: boolean;
  joinMatchRoomInFlightRef: MutableRefObject<boolean>;
  lastDisplayedRecipientInviteKeyRef: MutableRefObject<string | null>;
  latestMatchRoomServerNowMsRef: MutableRefObject<number>;
  leaveMatchRoomInFlightRef: MutableRefObject<boolean>;
  recipientInviteFetchInFlightRef: MutableRefObject<boolean>;
  roomCreateActionInput: Parameters<typeof useTrackRunRoomCreateAction>[0];
  roomJoinActionInput: Parameters<typeof useTrackRunRoomJoinAction>[0];
  roomLoaderInput: Parameters<typeof useTrackRunRoomLoader>[0];
  setError: Dispatch<SetStateAction<string | null>>;
  setFriendLeaderboard: Dispatch<SetStateAction<Awaited<ReturnType<typeof fetchFriendLeaderboard>> | null>>;
  setIsJoiningMatchRoom: Dispatch<SetStateAction<boolean>>;
  setIsLeavingMatchRoom: Dispatch<SetStateAction<boolean>>;
  setSelectedRoomFriendIds: Dispatch<SetStateAction<string[]>>;
  syncServerClock: (serverNow?: string) => void;
  visibleMatchRoom: RunningMatchRoom | null;
};

export function useTrackRunRuntimeRoomActions({
  commitMatchRoom,
  currentUserId,
  isCreatingMatchRoom,
  isJoiningMatchRoom,
  isLeavingMatchRoom,
  joinMatchRoomInFlightRef,
  lastDisplayedRecipientInviteKeyRef,
  latestMatchRoomServerNowMsRef,
  leaveMatchRoomInFlightRef,
  recipientInviteFetchInFlightRef,
  roomCreateActionInput,
  roomJoinActionInput,
  roomLoaderInput,
  setError,
  setFriendLeaderboard,
  setIsJoiningMatchRoom,
  setIsLeavingMatchRoom,
  setSelectedRoomFriendIds,
  syncServerClock,
  visibleMatchRoom,
}: UseTrackRunRuntimeRoomActionsInput) {
  const loadMatchRoom = useTrackRunRoomLoader(roomLoaderInput);
  const handleCreateMatchRoom = useTrackRunRoomCreateAction(roomCreateActionInput);
  const handleJoinMatchRoom = useTrackRunRoomJoinAction(roomJoinActionInput);

  const loadFriendLeaderboardData = useCallback(async () => {
    const payload = await fetchFriendLeaderboard();
    setFriendLeaderboard(payload);
    return payload;
  }, [setFriendLeaderboard]);

  const fetchRecipientInviteInbox = useTrackRunRuntimeRecipientInviteInbox({
    commitMatchRoom,
    currentUserId,
    isCreatingMatchRoom,
    isJoiningMatchRoom,
    isLeavingMatchRoom,
    lastDisplayedRecipientInviteKeyRef,
    latestMatchRoomServerNowMsRef,
    recipientInviteFetchInFlightRef,
    syncServerClock,
  });

  const {
    handleAcceptRoomInviteFromRunning,
    handleDeclineRoomInviteFromRunning,
  } = useTrackRunRuntimeRoomInviteActions({
    commitMatchRoom,
    isJoiningMatchRoom,
    isLeavingMatchRoom,
    joinMatchRoomInFlightRef,
    latestMatchRoomServerNowMsRef,
    leaveMatchRoomInFlightRef,
    navigateToMatchRoomWithTrace: roomCreateActionInput.navigateToMatchRoomWithTrace,
    prepareMatchRoomMutation: roomJoinActionInput.prepareMatchRoomMutation,
    setError,
    setIsJoiningMatchRoom,
    setIsLeavingMatchRoom,
    setSelectedRoomFriendIds,
    syncServerClock,
    visibleMatchRoom,
  });

  return {
    fetchRecipientInviteInbox,
    handleAcceptRoomInviteFromRunning,
    handleCreateMatchRoom,
    handleDeclineRoomInviteFromRunning,
    handleJoinMatchRoom,
    loadFriendLeaderboardData,
    loadMatchRoom,
  };
}
