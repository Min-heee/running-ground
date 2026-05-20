import { useMemo } from 'react';
import type {
  FriendLeaderboardResponse,
  RunningMatchRoom,
  RunningMatchRoomInvitee,
} from '@/lib/api/types';
import { getMatchStartRemainingSeconds } from '@/lib/matchCountdown';
import { buildPartyRunFlowSnapshot } from '@/features/runs/lifecycle/matchStateMachine';
import {
  buildMatchRoomUxModel,
  buildPendingMatchRoomInvitees,
} from '@/features/runs/lifecycle/matchRoomFlow';

type UseMatchRoomLobbyViewModelInput = {
  currentUserTag: string;
  friendLeaderboard: FriendLeaderboardResponse | null;
  room: RunningMatchRoom | null;
  serverClockOffsetMs: number;
};

export function useMatchRoomLobbyViewModel({
  currentUserTag,
  friendLeaderboard,
  room,
  serverClockOffsetMs,
}: UseMatchRoomLobbyViewModelInput) {
  const currentParticipant = room?.participants.find((participant) => (
    participant.userId === currentUserTag || participant.tag === currentUserTag
  )) ?? null;

  const friendOptions = useMemo(() => {
    const excludedIds = new Set<string>([currentUserTag]);

    if (room?.hostUserId) {
      excludedIds.add(room.hostUserId);
    }

    room?.participants.forEach((participant) => {
      excludedIds.add(participant.userId);
      if (participant.tag) {
        excludedIds.add(participant.tag);
      }
    });

    return (friendLeaderboard?.ranks ?? [])
      .filter((friend) => !excludedIds.has(friend.id) && (!friend.tag || !excludedIds.has(friend.tag)))
      .slice(0, 12);
  }, [currentUserTag, friendLeaderboard?.ranks, room?.hostUserId, room?.participants]);

  const pendingInvitees = useMemo<RunningMatchRoomInvitee[]>(
    () => buildPendingMatchRoomInvitees(room, friendLeaderboard?.ranks ?? []),
    [friendLeaderboard?.ranks, room],
  );

  const roomUxModel = useMemo(
    () => buildMatchRoomUxModel({
      room,
      currentUserId: currentUserTag,
      pendingInvitees,
    }),
    [currentUserTag, pendingInvitees, room],
  );
  const syncedNowMs = Date.now() + serverClockOffsetMs;
  const linkedMatchRemainingSeconds = room?.linkedMatchSlotStartAt
    ? getMatchStartRemainingSeconds(room.linkedMatchSlotStartAt, syncedNowMs)
    : null;
  const partyRunFlow = buildPartyRunFlowSnapshot({
    room,
    isCountdownReady: currentParticipant?.isCountdownReady,
    remainingSeconds: linkedMatchRemainingSeconds,
    syncedNowMs,
  });

  return {
    currentParticipant,
    friendOptions,
    isInvitedOnly: roomUxModel.invite.isInvitedOnly,
    isReady: roomUxModel.readyAction.state === 'ready',
    linkedMatchRemainingSeconds,
    partyRunFlow,
    partyRunStartPhase: partyRunFlow.phase,
    roomUxModel,
    showPartyRunCountdownBanner: Boolean(
      partyRunFlow.shouldShowCountdown
      && linkedMatchRemainingSeconds !== null,
    ),
    showPartyRunLoadingBanner: partyRunFlow.shouldShowLoading,
  };
}
