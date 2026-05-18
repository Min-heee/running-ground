import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type FriendLeaderboardResponse,
  type RunningMatchRoom,
} from '@/lib/api/types';
import {
  isMatchRoomDeleted,
  subscribeMatchRoomDeletedTombstone,
} from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import {
  getMatchRoom,
  setMatchRoom as setMatchRoomStore,
  useMatchRoomStore,
} from '@/features/runs/state/matchRoomStore';
import {
  createMatchArenaDiagnosticsThrottle,
  reportComponentMountDiagnostics,
} from '@/utils/matchArenaDiagnostics';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';

export type RoomStartMode = 'scheduled' | 'host';

export function shouldClearPartyRunRoomForDeletedTombstone({
  deletedRoomId,
  matchRoom,
}: {
  deletedRoomId?: string | null;
  matchRoom: RunningMatchRoom | null;
}) {
  return Boolean(
    deletedRoomId
    && matchRoom?.roomId
    && matchRoom.roomId === deletedRoomId
    && isMatchRoomDeleted(deletedRoomId)
  );
}

function buildRoomRenderKey(room: RunningMatchRoom | null) {
  if (!room) {
    return 'empty';
  }

  const participantKey = room.participants.map((participant) => [
    participant.userId,
    participant.isHost ? 'host' : 'guest',
    participant.isReady ? 'ready' : 'waiting',
    participant.isCountdownReady ? 'loaded' : 'loading',
    participant.liveStatus ?? 'no-live-status',
    participant.liveDistanceKm ?? 'no-live-distance',
    participant.liveElapsedSeconds ?? 'no-live-elapsed',
    participant.livePace ?? 'no-live-pace',
    participant.liveUpdatedAt ?? 'no-live-updated',
    participant.finishedAt ?? 'no-finished',
    participant.officialReady ? 'official-ready' : 'official-waiting',
    participant.officialDistanceKm ?? 'no-official-distance',
    participant.officialElapsedSeconds ?? 'no-official-elapsed',
    participant.officialAveragePace ?? 'no-official-pace',
    participant.officialRank ?? 'no-official-rank',
    participant.officialGapAheadKm ?? 'no-official-gap-ahead',
    participant.officialGapLeaderKm ?? 'no-official-gap-leader',
    participant.officialComparedAt ?? 'no-official-compared',
  ].join(':')).join('|');

  return [
    room.roomId,
    room.hostUserId,
    room.isHost ? 'host' : 'guest',
    room.state,
    room.startMode,
    room.distanceKm,
    room.slotStartAt,
    room.maxParticipants,
    room.canStart ? 'can-start' : 'cannot-start',
    room.linkedMatchId ?? 'no-match',
    room.linkedMatchStatus ?? 'no-status',
    room.linkedMatchSlotStartAt ?? 'no-linked-slot',
    participantKey,
  ].join('::');
}

type UsePartyRunRoomInput = {
  currentUserId: string;
  syncedNowMs: number;
  staleMatchedMatchMs: number;
  staleActiveMatchMs: number;
};

export function usePartyRunRoom({
  currentUserId,
  syncedNowMs,
  staleMatchedMatchMs,
  staleActiveMatchMs,
}: UsePartyRunRoomInput) {
  const matchRoomRenderKeyRef = useRef<string | null>(null);
  const diagnosticsInstanceIdRef = useRef(`party-run-room-${Math.random().toString(36).slice(2, 8)}`);
  const diagnosticsThrottleRef = useRef(createMatchArenaDiagnosticsThrottle());
  const hasReportedDiagnosticsMountRef = useRef(false);
  const matchRoom = useMatchRoomStore();
  const setMatchRoom = setMatchRoomStore;
  const [roomMatchMode, setRoomMatchMode] = useState<'duel' | 'group'>('duel');
  const [roomStartMode, setRoomStartMode] = useState<RoomStartMode>('host');
  const [roomMaxParticipants, setRoomMaxParticipants] = useState('10');
  const [roomInviteTokenInput, setRoomInviteTokenInput] = useState('');
  const [selectedRoomFriendIds, setSelectedRoomFriendIds] = useState<string[]>([]);
  const [friendLeaderboard, setFriendLeaderboard] = useState<FriendLeaderboardResponse | null>(null);
  const [isLoadingMatchRoom, setIsLoadingMatchRoom] = useState(false);
  const [isCreatingMatchRoom, setIsCreatingMatchRoom] = useState(false);
  const [isJoiningMatchRoom, setIsJoiningMatchRoom] = useState(false);
  const [isUpdatingMatchRoom, setIsUpdatingMatchRoom] = useState(false);
  const [isStartingMatchRoom, setIsStartingMatchRoom] = useState(false);
  const [isLeavingMatchRoom, setIsLeavingMatchRoom] = useState(false);

  const commitMatchRoom = (nextRoom: RunningMatchRoom | null) => {
    const committedRoom = isMatchRoomDeleted(nextRoom?.roomId) ? null : nextRoom;
    if (nextRoom?.roomId && !committedRoom) {
      rgPerfMark('room hydrate skipped deleted room', {
        roomId: nextRoom.roomId,
        source: 'party run room commit',
        state: nextRoom.state,
      });
    }

    const nextKey = buildRoomRenderKey(committedRoom);
    if (matchRoomRenderKeyRef.current === nextKey) {
      return;
    }

    matchRoomRenderKeyRef.current = nextKey;
    setMatchRoomStore(committedRoom);
  };

  useEffect(() => subscribeMatchRoomDeletedTombstone(({ roomId, source }) => {
    const currentRoom = getMatchRoom();
    if (!shouldClearPartyRunRoomForDeletedTombstone({
      deletedRoomId: roomId,
      matchRoom: currentRoom,
    })) {
      return;
    }

    matchRoomRenderKeyRef.current = buildRoomRenderKey(null);
    setSelectedRoomFriendIds([]);
    rgPerfMark('local active room hint cleared deleted room', {
      roomId,
      source: 'party run room tombstone subscriber',
      tombstoneSource: source,
    });
    rgPerfMark('room delete local state fully cleared', {
      roomId,
      source: 'party run room tombstone subscriber',
      tombstoneSource: source,
    });
    setMatchRoomStore(null);
  }), []);

  const visibleMatchRoom = useMemo(() => {
    if (!matchRoom) {
      return null;
    }

    const referenceStartAt = matchRoom.linkedMatchSlotStartAt ?? matchRoom.slotStartAt;
    const referenceStartMs = new Date(referenceStartAt).getTime();

    if (!Number.isFinite(referenceStartMs)) {
      return matchRoom;
    }

    const elapsedMs = syncedNowMs - referenceStartMs;
    const shouldUseActiveTtl = Boolean(
      matchRoom.linkedMatchId
      || matchRoom.state === 'countdown'
      || matchRoom.state === 'active'
      || matchRoom.linkedMatchStatus === 'active',
    );
    const staleThresholdMs = shouldUseActiveTtl
      ? staleActiveMatchMs
      : staleMatchedMatchMs;

    return elapsedMs > staleThresholdMs ? null : matchRoom;
  }, [matchRoom, staleActiveMatchMs, staleMatchedMatchMs, syncedNowMs]);

  useEffect(() => {
    const mountPhase = hasReportedDiagnosticsMountRef.current ? 'update' : 'mount';
    hasReportedDiagnosticsMountRef.current = true;
    reportComponentMountDiagnostics({
      componentName: 'usePartyRunRoom',
      instanceId: diagnosticsInstanceIdRef.current,
      mountPhase,
      payload: {
        hasMatchRoom: matchRoom !== null,
        roomId: matchRoom?.roomId ?? null,
        roomState: matchRoom?.state ?? null,
        startMode: matchRoom?.startMode ?? null,
        linkedMatchId: matchRoom?.linkedMatchId ?? null,
        linkedMatchStatus: matchRoom?.linkedMatchStatus ?? null,
        participantCount: matchRoom?.participants.length ?? 0,
        inviteeCount: matchRoom?.invitedFriendIds.length ?? 0,
        isHost: matchRoom?.isHost ?? null,
        hasVisibleMatchRoom: visibleMatchRoom !== null,
        visibleRoomId: visibleMatchRoom?.roomId ?? null,
      },
    }, diagnosticsThrottleRef.current);
  }, [
    matchRoom,
    visibleMatchRoom,
  ]);

  useEffect(() => {
    if (matchRoom && !visibleMatchRoom) {
      const endStaleCleanupTrace = rgPerfMeasureStart('stale room cleanup', {
        roomId: matchRoom.roomId,
        source: 'party run room visible ttl',
      });
      commitMatchRoom(null);
      endStaleCleanupTrace({ success: true });
    }
  }, [matchRoom, visibleMatchRoom]);

  const currentRoomParticipant = matchRoom?.participants.find((participant) => (
    participant.userId === currentUserId || participant.tag === currentUserId
  )) ?? null;

  const roomFriendOptions = useMemo(() => {
    const excludedIds = new Set<string>([currentUserId]);

    if (matchRoom?.hostUserId) {
      excludedIds.add(matchRoom.hostUserId);
    }

    matchRoom?.participants.forEach((participant) => {
      excludedIds.add(participant.userId);
      if (participant.tag) {
        excludedIds.add(participant.tag);
      }
    });

    return (friendLeaderboard?.ranks ?? [])
      .filter((friend) => !excludedIds.has(friend.id) && (!friend.tag || !excludedIds.has(friend.tag)))
      .slice(0, 12);
  }, [currentUserId, friendLeaderboard?.ranks, matchRoom?.hostUserId, matchRoom?.participants]);

  return {
    matchRoom,
    setMatchRoom,
    commitMatchRoom,
    visibleMatchRoom,
    currentRoomParticipant,
    roomFriendOptions,
    roomMatchMode,
    setRoomMatchMode,
    roomStartMode,
    setRoomStartMode,
    roomMaxParticipants,
    setRoomMaxParticipants,
    roomInviteTokenInput,
    setRoomInviteTokenInput,
    selectedRoomFriendIds,
    setSelectedRoomFriendIds,
    friendLeaderboard,
    setFriendLeaderboard,
    isLoadingMatchRoom,
    setIsLoadingMatchRoom,
    isCreatingMatchRoom,
    setIsCreatingMatchRoom,
    isJoiningMatchRoom,
    setIsJoiningMatchRoom,
    isUpdatingMatchRoom,
    setIsUpdatingMatchRoom,
    isStartingMatchRoom,
    setIsStartingMatchRoom,
    isLeavingMatchRoom,
    setIsLeavingMatchRoom,
  };
}
