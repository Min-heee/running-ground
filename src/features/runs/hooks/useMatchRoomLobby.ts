import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Href, router } from 'expo-router';
import { acknowledgeRunningMatchRoomCountdown } from '@/services/matchService';
import { getApiErrorMessage } from '@/services/apiError';
import type { RunningMatchRoomInvitee } from '@/lib/api/types';
import { buildPartyRunFlowSnapshot } from '@/features/runs/lifecycle/matchStateMachine';
import {
  buildMatchRoomUxModel,
  buildPendingMatchRoomInvitees,
} from '@/features/runs/lifecycle/matchRoomFlow';
import { shouldAcceptServerSnapshot } from '@/features/runs/sync/serverClockSync';
import { getMatchStartRemainingSeconds } from '@/lib/matchCountdown';
import { useRoomInviteActions } from '@/features/match/hooks/lobby/useRoomInviteActions';
import { useRoomSettings } from '@/features/match/hooks/lobby/useRoomSettings';
import { useRoomSnapshot } from '@/features/match/hooks/lobby/useRoomSnapshot';
import { useRoomStartActions } from '@/features/match/hooks/lobby/useRoomStartActions';
import { rgPerfMark } from '@/utils/rgPerfTrace';

export function useMatchRoomLobby() {
  const openedLinkedMatchKeyRef = useRef<string | null>(null);
  const countdownReadyRoomAckRef = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const {
    room,
    friendLeaderboard,
    error,
    setError,
    loading,
    currentUserTag,
    serverClockOffsetMs,
    latestRoomServerNowMsRef,
    commitRoom,
    pauseRoomPolling,
    syncServerClock,
  } = useRoomSnapshot();
  const settings = useRoomSettings({
    room,
    latestRoomServerNowMsRef,
    commitRoom,
    syncServerClock,
    setError,
    setSaving,
  });

  const currentParticipant = room?.participants.find((participant) => (
    participant.userId === currentUserTag || participant.tag === currentUserTag
  )) ?? null;

  const openLinkedMatchInRunning = useCallback((nextRoom: NonNullable<typeof room>) => {
    if (!nextRoom.linkedMatchId) {
      return;
    }

    const nextParticipant = nextRoom.participants.find((participant) => (
      participant.userId === currentUserTag || participant.tag === currentUserTag
    )) ?? null;
    const remainingSeconds = getMatchStartRemainingSeconds(
      nextRoom.linkedMatchSlotStartAt ?? nextRoom.slotStartAt,
      Date.now() + serverClockOffsetMs,
    );
    const flow = buildPartyRunFlowSnapshot({
      room: nextRoom,
      isCountdownReady: nextParticipant?.isCountdownReady,
      remainingSeconds,
    });

    if (!flow.canOpenLinkedMatch) {
      return;
    }

    const nextKey = [
      nextRoom.roomId,
      nextRoom.linkedMatchId,
      nextRoom.state,
      nextRoom.linkedMatchSlotStartAt ?? nextRoom.slotStartAt,
    ].join(':');

    if (openedLinkedMatchKeyRef.current === nextKey) {
      return;
    }

    openedLinkedMatchKeyRef.current = nextKey;
    rgPerfMark('live match route state hydrated', {
      matchId: nextRoom.linkedMatchId,
      roomId: nextRoom.roomId,
      source: 'match-room linked match route',
      state: nextRoom.state,
    });

    router.replace({
      pathname: '/(tabs)/running',
      params: {
        focusMatchMode: nextRoom.mode,
        focusMatchId: nextRoom.linkedMatchId,
        focusMatchDistanceKm: String(nextRoom.linkedMatchDistanceKm ?? nextRoom.distanceKm),
        focusMatchSlotStartAt: nextRoom.linkedMatchSlotStartAt ?? nextRoom.slotStartAt,
        focusRoomId: nextRoom.roomId,
        ...(flow.shouldOpenArena ? { forceMatchArena: '1' } : {}),
        focusMatchNonce: `room-${Date.now()}`,
      },
    } as Href);
  }, [currentUserTag, serverClockOffsetMs]);

  useEffect(() => {
    if (!room?.linkedMatchId) {
      return undefined;
    }

    openLinkedMatchInRunning(room);

    const timer = setInterval(() => {
      openLinkedMatchInRunning(room);
    }, 500);

    return () => clearInterval(timer);
  }, [
    openLinkedMatchInRunning,
    room,
    room?.linkedMatchId,
    room?.linkedMatchSlotStartAt,
    room?.linkedMatchStatus,
    room?.mode,
    room?.roomId,
    room?.slotStartAt,
    room?.state,
    serverClockOffsetMs,
  ]);

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
  const isInvitedOnly = roomUxModel.invite.isInvitedOnly;
  const isReady = roomUxModel.readyAction.state === 'ready';
  const linkedMatchRemainingSeconds = room?.linkedMatchSlotStartAt
    ? getMatchStartRemainingSeconds(room.linkedMatchSlotStartAt, Date.now() + serverClockOffsetMs)
    : null;
  const partyRunFlow = buildPartyRunFlowSnapshot({
    room,
    isCountdownReady: currentParticipant?.isCountdownReady,
    remainingSeconds: linkedMatchRemainingSeconds,
  });
  const partyRunStartPhase = partyRunFlow.phase;
  const showPartyRunLoadingBanner = partyRunFlow.shouldShowLoading;
  const showPartyRunCountdownBanner = Boolean(
    partyRunFlow.shouldShowCountdown
    && linkedMatchRemainingSeconds !== null,
  );

  useEffect(() => {
    if (!room?.roomId || !partyRunFlow.canAcknowledgeCountdownReady) {
      if (!partyRunFlow.hasLinkedMatch || partyRunFlow.phase !== 'arming') {
        countdownReadyRoomAckRef.current = null;
      }
      return;
    }

    const ackKey = `${room.roomId}:${room.linkedMatchId}:${currentUserTag}`;
    if (countdownReadyRoomAckRef.current === ackKey) {
      return;
    }

    countdownReadyRoomAckRef.current = ackKey;
    void acknowledgeRunningMatchRoomCountdown({ roomId: room.roomId })
      .then((payload) => {
        if (!shouldAcceptServerSnapshot(latestRoomServerNowMsRef, payload.serverNow)) {
          return;
        }

        syncServerClock(payload.serverNow);
        commitRoom(payload.room);
        setError(null);
      })
      .catch((roomError) => {
        countdownReadyRoomAckRef.current = null;
        setError(getApiErrorMessage(roomError, '파티런 카운트다운 준비를 맞추지 못했어.'));
      });
  }, [
    commitRoom,
    currentUserTag,
    latestRoomServerNowMsRef,
    partyRunFlow.canAcknowledgeCountdownReady,
    partyRunFlow.hasLinkedMatch,
    partyRunFlow.phase,
    room?.linkedMatchId,
    room?.roomId,
    setError,
    syncServerClock,
  ]);

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
    room,
    error,
    loading,
    saving,
    meridiem: settings.meridiem,
    setMeridiem: settings.setMeridiem,
    hourIndex: settings.hourIndex,
    setHourIndex: settings.setHourIndex,
    minuteIndex: settings.minuteIndex,
    setMinuteIndex: settings.setMinuteIndex,
    selectedFriendIds: settings.selectedFriendIds,
    setSelectedFriendIds: settings.setSelectedFriendIds,
    customDistanceText: settings.customDistanceText,
    setCustomDistanceText: settings.setCustomDistanceText,
    friendOptions,
    roomUxModel,
    isInvitedOnly,
    hasInviteDraftChanges: settings.hasInviteDraftChanges,
    scheduledStartAt: settings.scheduledStartAt,
    linkedMatchRemainingSeconds,
    partyRunStartPhase,
    showPartyRunLoadingBanner,
    showPartyRunCountdownBanner,
    saveRoomSettings: settings.saveRoomSettings,
    roomExitState: startActions.roomExitState,
    handleToggleReady: startActions.handleToggleReady,
    handleStart: startActions.handleStart,
    handleLeave: startActions.handleLeave,
    handleAcceptInvite: inviteActions.handleAcceptInvite,
    handleDeclineInvite: inviteActions.handleDeclineInvite,
    handleSendFriendInvites: inviteActions.handleSendFriendInvites,
    handleCopyCode: inviteActions.handleCopyCode,
    handleInviteFriends: inviteActions.handleInviteFriends,
    handleApplyCustomDistance: settings.handleApplyCustomDistance,
  };
}
