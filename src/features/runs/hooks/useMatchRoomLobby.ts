import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { type Href, router } from 'expo-router';
import {
  fetchFriendLeaderboard,
  fetchRunningMatchRoom,
  joinRunningMatchRoom,
  leaveRunningMatchRoom,
  startRunningMatchRoom,
  updateRunningMatchRoom,
  updateRunningMatchRoomReady,
} from '@/lib/api/services';
import type {
  FriendLeaderboardResponse,
  RunningMatchRoom,
  RunningMatchRoomInvitee,
  RunningMatchRoomStartMode,
} from '@/lib/api/types';
import {
  buildPartyRunFlowSnapshot,
} from '@/features/runs/matchStateMachine';
import {
  buildMatchRoomUxModel,
  buildPendingMatchRoomInvitees,
} from '@/features/runs/matchRoomFlow';
import {
  parseServerNowMs,
  resolveStableServerClockOffset,
  shouldAcceptServerSnapshot,
} from '@/features/runs/serverClockSync';
import { getMatchStartRemainingSeconds } from '@/lib/matchCountdown';
import { getCurrentUserProfile } from '@/lib/session';

export const MATCH_ROOM_HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
export const MATCH_ROOM_MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => index);
export const MATCH_ROOM_DISTANCE_OPTIONS = [3, 5, 7, 10, 15, 21.1, 42.2];

function buildRoomRenderKey(room: RunningMatchRoom | null) {
  if (!room) {
    return 'empty';
  }

  return [
    room.roomId,
    room.state,
    room.startMode,
    room.distanceKm,
    room.slotStartAt,
    room.maxParticipants,
    room.canStart ? 'can-start' : 'cannot-start',
    room.linkedMatchId ?? 'no-match',
    room.linkedMatchStatus ?? 'no-status',
    room.linkedMatchSlotStartAt ?? 'no-linked-slot',
    room.joined === false ? 'invited-only' : 'joined',
    room.invitedFriendIds.join('|'),
    room.invitedFriends?.map((friend) => [friend.userId, friend.name, friend.status].join(':')).join('|') ?? 'no-invites',
    room.participants.map((participant) => [
      participant.userId,
      participant.isReady ? 'ready' : 'waiting',
      participant.isCountdownReady ? 'loaded' : 'loading',
    ].join(':')).join('|'),
  ].join('::');
}

function areSameIdSet(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const leftSet = new Set(left);
  return right.every((id) => leftSet.has(id));
}

export function formatRoomDateLabel(value: string) {
  const date = new Date(value);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  const hour = date.getHours();
  const minute = `${date.getMinutes()}`.padStart(2, '0');

  return `${month}.${day} (${weekday}) ${hour}:${minute}`;
}

function to12HourParts(value: string) {
  const date = new Date(value);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const meridiem = hours >= 12 ? '오후' : '오전';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;

  return { meridiem, hour12, minute: minutes };
}

export function buildScheduledStartAt(meridiem: '오전' | '오후', hour12: number, minute: number) {
  const now = new Date();
  const candidate = new Date(now);
  const hour24 = meridiem === '오전'
    ? (hour12 === 12 ? 0 : hour12)
    : (hour12 === 12 ? 12 : hour12 + 12);
  candidate.setSeconds(0, 0);
  candidate.setHours(hour24, minute, 0, 0);

  while (candidate.getTime() <= Date.now() + 30 * 60 * 1000) {
    candidate.setDate(candidate.getDate() + 1);
  }

  return candidate.toISOString();
}

type UpdateRoomSettingsInput = Partial<{
  distanceKm: number;
  startMode: RunningMatchRoomStartMode;
  slotStartAt: string;
  maxParticipants: number;
  invitedFriendIds: string[];
}>;

export function useMatchRoomLobby() {
  const currentUser = getCurrentUserProfile();
  const currentUserTag = currentUser?.publicTag ?? 'mock-current-user';
  const openedLinkedMatchKeyRef = useRef<string | null>(null);
  const latestRoomServerNowMsRef = useRef(0);
  const roomRenderKeyRef = useRef<string | null>(null);

  const [room, setRoom] = useState<RunningMatchRoom | null>(null);
  const [friendLeaderboard, setFriendLeaderboard] = useState<FriendLeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [meridiem, setMeridiem] = useState<'오전' | '오후'>('오전');
  const [hourIndex, setHourIndex] = useState(0);
  const [minuteIndex, setMinuteIndex] = useState(0);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [customDistanceText, setCustomDistanceText] = useState('5');
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);

  const syncServerClock = (serverNow?: string) => {
    const serverNowMs = parseServerNowMs(serverNow);
    if (serverNowMs === null) {
      return;
    }

    const nextOffsetMs = serverNowMs - Date.now();
    setServerClockOffsetMs((currentOffsetMs) => resolveStableServerClockOffset(currentOffsetMs, nextOffsetMs));
  };

  const commitRoom = (nextRoom: RunningMatchRoom | null) => {
    const nextKey = buildRoomRenderKey(nextRoom);
    if (roomRenderKeyRef.current === nextKey) {
      return;
    }

    roomRenderKeyRef.current = nextKey;
    setRoom(nextRoom);
  };

  const openLinkedMatchInRunning = (nextRoom: RunningMatchRoom) => {
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

    const shouldForceArena = flow.shouldOpenArena;

    router.replace({
      pathname: '/(tabs)/running',
      params: {
        focusMatchMode: nextRoom.mode,
        focusMatchId: nextRoom.linkedMatchId,
        focusMatchDistanceKm: String(nextRoom.linkedMatchDistanceKm ?? nextRoom.distanceKm),
        focusMatchSlotStartAt: nextRoom.linkedMatchSlotStartAt ?? nextRoom.slotStartAt,
        ...(shouldForceArena ? { forceMatchArena: '1' } : {}),
        focusMatchNonce: `room-${Date.now()}`,
      },
    } as Href);
  };

  const loadRoom = async () => {
    try {
      const payload = await fetchRunningMatchRoom();
      if (!shouldAcceptServerSnapshot(latestRoomServerNowMsRef, payload.serverNow)) {
        return null;
      }

      syncServerClock(payload.serverNow);
      commitRoom(payload.room);
      setError(null);
      return payload.room;
    } catch (roomError) {
      setError(roomError instanceof Error ? roomError.message : '대기실을 불러오지 못했어.');
      return null;
    }
  };

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      setLoading(true);
      const [nextRoom, friends] = await Promise.all([
        loadRoom(),
        fetchFriendLeaderboard().catch(() => null),
      ]);

      if (cancelled) {
        return;
      }

      if (friends) {
        setFriendLeaderboard(friends);
      }

      if (nextRoom) {
        const nextParts = to12HourParts(nextRoom.slotStartAt);
        setMeridiem(nextParts.meridiem as '오전' | '오후');
        setHourIndex(Math.max(0, MATCH_ROOM_HOUR_OPTIONS.findIndex((value) => value === nextParts.hour12)));
        setMinuteIndex(nextParts.minute);
        setSelectedFriendIds(nextRoom.invitedFriendIds);
        setCustomDistanceText(String(nextRoom.distanceKm));
      }

      setLoading(false);
    };

    void hydrate();
    const intervalMs = room?.linkedMatchId ? 750 : 1500;
    const intervalId = setInterval(() => {
      void loadRoom();
    }, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [room?.linkedMatchId]);

  const currentParticipant = room?.participants.find((participant) => (
    participant.userId === currentUserTag || participant.tag === currentUserTag
  )) ?? null;

  useEffect(() => {
    if (!room?.linkedMatchId) {
      return;
    }

    openLinkedMatchInRunning(room);
  }, [room?.linkedMatchId, room?.linkedMatchSlotStartAt, room?.linkedMatchStatus, room?.mode, room?.state, serverClockOffsetMs]);

  useEffect(() => {
    if (!room) {
      return;
    }

    const nextParts = to12HourParts(room.slotStartAt);
    setMeridiem(nextParts.meridiem as '오전' | '오후');
    setHourIndex(Math.max(0, MATCH_ROOM_HOUR_OPTIONS.findIndex((value) => value === nextParts.hour12)));
    setMinuteIndex(nextParts.minute);
    setSelectedFriendIds(room.invitedFriendIds);
    setCustomDistanceText(String(room.distanceKm));
  }, [room?.slotStartAt, room?.invitedFriendIds, room?.roomId]);

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
  const hasInviteDraftChanges = room ? !areSameIdSet(selectedFriendIds, room.invitedFriendIds) : false;
  const isReady = roomUxModel.readyAction.state === 'ready';
  const scheduledStartAt = buildScheduledStartAt(
    meridiem,
    MATCH_ROOM_HOUR_OPTIONS[hourIndex] ?? 12,
    MATCH_ROOM_MINUTE_OPTIONS[minuteIndex] ?? 0,
  );
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

  const saveRoomSettings = async (overrides: UpdateRoomSettingsInput = {}) => {
    if (!room || !room.isHost || room.linkedMatchId) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = await updateRunningMatchRoom({
        roomId: room.roomId,
        distanceKm: overrides.distanceKm ?? room.distanceKm,
        startMode: overrides.startMode ?? room.startMode,
        slotStartAt: overrides.startMode === 'host'
          ? undefined
          : overrides.slotStartAt ?? (room.startMode === 'scheduled' ? room.slotStartAt : scheduledStartAt),
        maxParticipants: room.mode === 'group'
          ? overrides.maxParticipants ?? room.maxParticipants
          : 2,
        invitedFriendIds: overrides.invitedFriendIds ?? selectedFriendIds,
      });
      if (!shouldAcceptServerSnapshot(latestRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow);
      commitRoom(payload.room);
    } catch (roomError) {
      setError(roomError instanceof Error ? roomError.message : '대기실 설정을 저장하지 못했어.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleReady = async () => {
    if (!room || !roomUxModel.readyAction.canToggle) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = await updateRunningMatchRoomReady({
        roomId: room.roomId,
        ready: !isReady,
      });
      if (!shouldAcceptServerSnapshot(latestRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow);
      commitRoom(payload.room);
    } catch (roomError) {
      setError(roomError instanceof Error ? roomError.message : '준비 상태를 바꾸지 못했어.');
    } finally {
      setSaving(false);
    }
  };

  const handleStart = async () => {
    if (!room || !roomUxModel.startAction.canStart) {
      if (roomUxModel.startAction.visible && roomUxModel.startAction.helperText) {
        setError(roomUxModel.startAction.helperText);
      }
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = await startRunningMatchRoom({ roomId: room.roomId });
      if (!shouldAcceptServerSnapshot(latestRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow);
      commitRoom(payload.room);
    } catch (roomError) {
      setError(roomError instanceof Error ? roomError.message : '방을 시작하지 못했어.');
    } finally {
      setSaving(false);
    }
  };

  const handleLeave = async () => {
    if (!room) {
      router.back();
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await leaveRunningMatchRoom({ roomId: room.roomId });
      router.back();
    } catch (roomError) {
      setError(roomError instanceof Error ? roomError.message : '방에서 나가지 못했어.');
    } finally {
      setSaving(false);
    }
  };

  const handleAcceptInvite = async () => {
    if (!room || !roomUxModel.invite.canAccept) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = await joinRunningMatchRoom({ inviteToken: room.inviteToken });
      if (!shouldAcceptServerSnapshot(latestRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow);
      commitRoom(payload.room);
    } catch (roomError) {
      setError(roomError instanceof Error ? roomError.message : '초대를 수락하지 못했어.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeclineInvite = async () => {
    if (!room || !roomUxModel.invite.canDecline) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = await leaveRunningMatchRoom({ roomId: room.roomId });
      if (!shouldAcceptServerSnapshot(latestRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow);
      commitRoom(payload.room);
      router.replace('/(tabs)/running');
    } catch (roomError) {
      setError(roomError instanceof Error ? roomError.message : '초대를 거절하지 못했어.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendFriendInvites = async () => {
    if (!room?.isHost || room.linkedMatchId) {
      return;
    }

    await saveRoomSettings({ invitedFriendIds: selectedFriendIds });
  };

  const handleCopyCode = async () => {
    if (!room) {
      return;
    }

    await Clipboard.setStringAsync(room.inviteToken);
    Alert.alert('복사 완료', `방 코드 ${room.inviteToken}를 복사했어요.`);
  };

  const handleInviteFriends = async () => {
    if (!room) {
      return;
    }

    try {
      await Share.share({
        message: `${room.mode === 'duel' ? '1대1 대결' : '그룹 대결'} 방에 같이 들어와요.\n초대 코드: ${room.inviteToken}\n링크: ${room.inviteLink}`,
      });
    } catch {
      Alert.alert('공유 실패', '지금은 친구 초대를 열지 못했어.');
    }
  };

  const handleApplyCustomDistance = async () => {
    if (!room?.isHost) {
      return;
    }

    const nextDistanceKm = Number.parseFloat(customDistanceText);
    if (!Number.isFinite(nextDistanceKm) || nextDistanceKm <= 0) {
      setError('거리 값을 다시 확인해줘. 1km 이상 숫자로 입력하면 돼.');
      return;
    }

    await saveRoomSettings({ distanceKm: Number(nextDistanceKm.toFixed(1)) });
  };

  return {
    room,
    error,
    loading,
    saving,
    meridiem,
    setMeridiem,
    hourIndex,
    setHourIndex,
    minuteIndex,
    setMinuteIndex,
    selectedFriendIds,
    setSelectedFriendIds,
    customDistanceText,
    setCustomDistanceText,
    friendOptions,
    roomUxModel,
    isInvitedOnly,
    hasInviteDraftChanges,
    scheduledStartAt,
    linkedMatchRemainingSeconds,
    partyRunStartPhase,
    showPartyRunLoadingBanner,
    showPartyRunCountdownBanner,
    saveRoomSettings,
    handleToggleReady,
    handleStart,
    handleLeave,
    handleAcceptInvite,
    handleDeclineInvite,
    handleSendFriendInvites,
    handleCopyCode,
    handleInviteFriends,
    handleApplyCustomDistance,
  };
}
