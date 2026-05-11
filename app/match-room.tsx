import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { type Href, router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { PartyRunParticipantListCard } from '@/features/runs/components/PartyRunParticipantListCard';
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
  formatMatchCountdown,
  getMatchStartRemainingSeconds,
  shouldAutoOpenMatchArena,
  shouldShowMatchStartOverlay,
} from '@/lib/matchCountdown';
import { getCurrentUserProfile } from '@/lib/session';

const ITEM_HEIGHT = 48;
const VISIBLE_WHEEL_ROWS = 5;
const WHEEL_PADDING = ITEM_HEIGHT * 2;
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => index);
const DISTANCE_OPTIONS = [3, 5, 7, 10, 15, 21.1, 42.2];
const SERVER_CLOCK_OFFSET_APPLY_THRESHOLD_MS = 3000;
const SERVER_CLOCK_OFFSET_JITTER_TOLERANCE_MS = 750;
const SERVER_CLOCK_OFFSET_SMOOTHING_FACTOR = 0.25;

function parseServerNowMs(serverNow?: string) {
  const parsedMs = serverNow ? new Date(serverNow).getTime() : NaN;
  return Number.isFinite(parsedMs) ? parsedMs : null;
}

function resolveStableServerClockOffset(currentOffsetMs: number, nextOffsetMs: number) {
  if (Math.abs(nextOffsetMs) < SERVER_CLOCK_OFFSET_APPLY_THRESHOLD_MS) {
    return 0;
  }

  if (currentOffsetMs === 0) {
    return nextOffsetMs;
  }

  const offsetDeltaMs = nextOffsetMs - currentOffsetMs;
  if (Math.abs(offsetDeltaMs) < SERVER_CLOCK_OFFSET_JITTER_TOLERANCE_MS) {
    return currentOffsetMs;
  }

  return Math.round(currentOffsetMs + offsetDeltaMs * SERVER_CLOCK_OFFSET_SMOOTHING_FACTOR);
}

function shouldAcceptServerSnapshot(latestServerNowMsRef: { current: number }, serverNow?: string) {
  const serverNowMs = parseServerNowMs(serverNow);
  if (serverNowMs === null) {
    return true;
  }

  if (serverNowMs < latestServerNowMsRef.current) {
    return false;
  }

  latestServerNowMsRef.current = serverNowMs;
  return true;
}

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

function formatRoomDateLabel(value: string) {
  const date = new Date(value);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  const hour = date.getHours();
  const minute = `${date.getMinutes()}`.padStart(2, '0');

  return `${month}.${day} (${weekday}) ${hour}:${minute}`;
}

function formatHourMinutePace(pace: string) {
  return pace === '--:--/km' ? '페이스 준비 중' : pace;
}

function to12HourParts(value: string) {
  const date = new Date(value);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const meridiem = hours >= 12 ? '오후' : '오전';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;

  return { meridiem, hour12, minute: minutes };
}

function buildScheduledStartAt(meridiem: '오전' | '오후', hour12: number, minute: number) {
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

function WheelColumn({
  options,
  selectedIndex,
  onChange,
  formatLabel = (value) => String(value),
  width,
}: {
  options: Array<string | number>;
  selectedIndex: number;
  onChange: (index: number) => void;
  formatLabel?: (value: string | number) => string;
  width: number;
}) {
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
    });
  }, [selectedIndex]);

  return (
    <View style={[styles.wheelColumnWrap, { width }]}>
      <View style={styles.wheelHighlight} />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: WHEEL_PADDING }}
        onMomentumScrollEnd={(event) => {
          const nextIndex = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
          onChange(Math.max(0, Math.min(options.length - 1, nextIndex)));
        }}
      >
        {options.map((option, index) => {
          const isSelected = index === selectedIndex;
          return (
            <Pressable
              key={`${option}-${index}`}
              style={styles.wheelItem}
              onPress={() => onChange(index)}
            >
              <Text style={[styles.wheelItemText, isSelected ? styles.wheelItemTextSelected : undefined]}>
                {formatLabel(option)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function MatchRoomScreen() {
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

    const remainingSeconds = getMatchStartRemainingSeconds(
      nextRoom.linkedMatchSlotStartAt ?? nextRoom.slotStartAt,
      Date.now() + serverClockOffsetMs,
    );
    const canOpenCountdown = nextRoom.state === 'active'
      || nextRoom.linkedMatchStatus === 'active'
      || shouldShowMatchStartOverlay(remainingSeconds);

    if (!canOpenCountdown) {
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

    const shouldForceArena = nextRoom.linkedMatchStatus === 'active' || shouldAutoOpenMatchArena(remainingSeconds);

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
        setHourIndex(Math.max(0, HOUR_OPTIONS.findIndex((value) => value === nextParts.hour12)));
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
    setHourIndex(Math.max(0, HOUR_OPTIONS.findIndex((value) => value === nextParts.hour12)));
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
  const pendingInvitees = useMemo<RunningMatchRoomInvitee[]>(() => {
    if (!room) {
      return [];
    }

    const joinedIds = new Set(room.participants.map((participant) => participant.userId));
    const serverInvitees = room.invitedFriends ?? [];
    const serverInviteeIds = new Set(serverInvitees.map((invitee) => invitee.userId));
    const fallbackInvitees = room.invitedFriendIds
      .filter((friendId) => !joinedIds.has(friendId) && !serverInviteeIds.has(friendId))
      .map((friendId) => {
        const friend = friendLeaderboard?.ranks.find((rank) => rank.id === friendId);

        return {
          userId: friendId,
          name: friend?.name ?? '초대한 친구',
          tag: friend?.tag,
          districtName: friend?.liveLocationLabel ?? '친구',
          averagePace: '페이스 준비 중',
          levelLabel: '',
          status: 'pending' as const,
        };
      });

    return [
      ...serverInvitees.filter((invitee) => !joinedIds.has(invitee.userId)),
      ...fallbackInvitees,
    ];
  }, [friendLeaderboard?.ranks, room]);
  const isInvitedOnly = Boolean(room && room.joined === false);
  const hasInviteDraftChanges = room ? !areSameIdSet(selectedFriendIds, room.invitedFriendIds) : false;
  const isReady = Boolean(currentParticipant?.isReady);
  const allGuestsReady = room
    ? room.participants.filter((participant) => !participant.isHost).every((participant) => participant.isReady)
    : false;
  const scheduledStartAt = buildScheduledStartAt(meridiem, HOUR_OPTIONS[hourIndex] ?? 12, MINUTE_OPTIONS[minuteIndex] ?? 0);
  const linkedMatchRemainingSeconds = room?.linkedMatchSlotStartAt
    ? getMatchStartRemainingSeconds(room.linkedMatchSlotStartAt, Date.now() + serverClockOffsetMs)
    : null;
  const saveRoomSettings = async (overrides: Partial<{
    distanceKm: number;
    startMode: RunningMatchRoomStartMode;
    slotStartAt: string;
    maxParticipants: number;
    invitedFriendIds: string[];
  }> = {}) => {
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
    if (!room || room.isHost) {
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
    if (!room?.isHost) {
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
    if (!room) {
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
    if (!room) {
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

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
      </View>
      <Text style={styles.pageTitle}>대기실</Text>
      {loading ? (
        <Card>
          <Text style={styles.helperText}>대기실을 불러오는 중이에요...</Text>
        </Card>
      ) : null}
      {!loading && !room ? (
        <Card>
          <Text style={styles.emptyTitle}>열린 방이 없어요</Text>
          <Text style={styles.helperText}>러닝 탭에서 방을 만들거나 초대 코드로 입장하면 여기서 바로 이어갈 수 있어요.</Text>
          <PrimaryButton label="러닝 탭으로 돌아가기" onPress={() => router.replace('/(tabs)/running')} />
        </Card>
      ) : null}
      {room ? (
        <>
          <Card style={styles.lobbyCard}>
            <View style={styles.roomTopRow}>
              <View>
                <Text style={styles.roomModeTitle}>{room.mode === 'duel' ? '1대1 대결' : '그룹 대결'}</Text>
                <Text style={styles.roomMeta}>{room.hostName}님 방 · {room.participants.length}/{room.maxParticipants}명</Text>
                <Text style={styles.roomMeta}>거리 · {room.distanceKm}km</Text>
                <Text style={styles.roomMeta}>시작 방식 · {room.startMode === 'host' ? '방장 시작' : `예약 시작 ${formatRoomDateLabel(room.slotStartAt)}`}</Text>
              </View>
              <View style={styles.codePill}>
                <Text style={styles.codePillText}>{room.inviteToken}</Text>
              </View>
            </View>
            {room.state === 'arming' ? (
              <View style={styles.countdownBanner}>
                <Text style={styles.countdownBannerTitle}>로딩중...</Text>
                <Text style={styles.countdownBannerText}>
                  대결 화면을 맞추는 중이에요. 잠시 뒤 모든 참가자에게 같은 카운트다운이 보여요.
                </Text>
              </View>
            ) : null}
            {room.state !== 'arming' && linkedMatchRemainingSeconds ? (
              <View style={styles.countdownBanner}>
                <Text style={styles.countdownBannerTitle}>시작까지 {formatMatchCountdown(linkedMatchRemainingSeconds)}</Text>
                <Text style={styles.countdownBannerText}>20초 전이 되면 자동으로 대결 화면으로 이동해요.</Text>
              </View>
            ) : null}
            {!isInvitedOnly ? (
              <View style={styles.actionGrid}>
                <SecondaryButton label="친구 초대" onPress={() => { void handleInviteFriends(); }} />
                <SecondaryButton label="방 코드 복사" onPress={() => { void handleCopyCode(); }} />
              </View>
            ) : null}
          </Card>

          {isInvitedOnly ? (
            <Card style={styles.inviteActionCard}>
              <Text style={styles.inviteActionTitle}>파티런 초대가 왔어요</Text>
              <Text style={styles.helperText}>
                수락하면 바로 이 대기실 참가자 명단에 들어가고, 거절하면 초대 카드가 사라져요.
              </Text>
              <View style={styles.inviteButtonRow}>
                <Pressable
                  style={[styles.declineInviteButton, saving ? styles.actionButtonDisabled : undefined]}
                  onPress={() => { void handleDeclineInvite(); }}
                  disabled={saving}
                >
                  <Text style={styles.declineInviteButtonText}>{saving ? '처리 중...' : '거절'}</Text>
                </Pressable>
                <Pressable
                  style={[styles.acceptInviteButton, saving ? styles.actionButtonDisabled : undefined]}
                  onPress={() => { void handleAcceptInvite(); }}
                  disabled={saving}
                >
                  <Text style={styles.acceptInviteButtonText}>{saving ? '처리 중...' : '수락'}</Text>
                </Pressable>
              </View>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </Card>
          ) : (
            <>
          <PartyRunParticipantListCard
            room={room}
            pendingInvitees={pendingInvitees}
            saving={saving}
            isReady={isReady}
            allGuestsReady={allGuestsReady}
            onToggleReady={() => { void handleToggleReady(); }}
            onStart={() => { void handleStart(); }}
          />

          {room.isHost && !room.linkedMatchId ? (
            <>
              <Card>
                <Text style={styles.sectionTitle}>거리 설정</Text>
                <View style={styles.distanceWrap}>
                  {DISTANCE_OPTIONS.map((distanceKm) => {
                    const isSelected = Math.abs(room.distanceKm - distanceKm) < 0.15;
                    return (
                      <Pressable
                        key={`room-distance-${distanceKm}`}
                        style={[styles.distanceChip, isSelected ? styles.distanceChipSelected : undefined]}
                        onPress={() => { void saveRoomSettings({ distanceKm }); }}
                        disabled={saving}
                      >
                        <Text style={[styles.distanceChipText, isSelected ? styles.distanceChipTextSelected : undefined]}>
                          {distanceKm}km
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.customDistanceRow}>
                  <TextInput
                    value={customDistanceText}
                    onChangeText={setCustomDistanceText}
                    onEndEditing={() => { void handleApplyCustomDistance(); }}
                    keyboardType="decimal-pad"
                    placeholder="직접 입력 예: 12.5"
                    placeholderTextColor="#98A2B3"
                    style={styles.distanceInput}
                  />
                  <SecondaryButton label="적용" onPress={() => { void handleApplyCustomDistance(); }} disabled={saving} />
                </View>
              </Card>

              <Card>
                <Text style={styles.sectionTitle}>시작 방식</Text>
                <View style={styles.modeRow}>
                  {([
                    { key: 'host' as const, label: '방장 시작' },
                    { key: 'scheduled' as const, label: '예약 시작' },
                  ]).map((option) => {
                    const isSelected = room.startMode === option.key;
                    return (
                      <Pressable
                        key={option.key}
                        style={[styles.modeChip, isSelected ? styles.modeChipSelected : undefined]}
                        onPress={() => { void saveRoomSettings({ startMode: option.key }); }}
                        disabled={saving}
                      >
                        <Text style={[styles.modeChipText, isSelected ? styles.modeChipTextSelected : undefined]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {room.startMode === 'scheduled' ? (
                  <View style={styles.scheduleBox}>
                    <Text style={styles.scheduleTitle}>시작할 시간을 선택해주세요</Text>
                    <View style={styles.wheelRow}>
                      <WheelColumn
                        options={['오전', '오후']}
                        selectedIndex={meridiem === '오전' ? 0 : 1}
                        onChange={(index) => {
                          const nextMeridiem = index === 0 ? '오전' : '오후';
                          setMeridiem(nextMeridiem);
                          void saveRoomSettings({
                            startMode: 'scheduled',
                            slotStartAt: buildScheduledStartAt(nextMeridiem, HOUR_OPTIONS[hourIndex] ?? 12, MINUTE_OPTIONS[minuteIndex] ?? 0),
                          });
                        }}
                        width={96}
                      />
                      <WheelColumn
                        options={HOUR_OPTIONS}
                        selectedIndex={hourIndex}
                        onChange={(index) => {
                          setHourIndex(index);
                          void saveRoomSettings({
                            startMode: 'scheduled',
                            slotStartAt: buildScheduledStartAt(meridiem, HOUR_OPTIONS[index] ?? 12, MINUTE_OPTIONS[minuteIndex] ?? 0),
                          });
                        }}
                        width={84}
                      />
                      <WheelColumn
                        options={MINUTE_OPTIONS}
                        selectedIndex={minuteIndex}
                        onChange={(index) => {
                          setMinuteIndex(index);
                          void saveRoomSettings({
                            startMode: 'scheduled',
                            slotStartAt: buildScheduledStartAt(meridiem, HOUR_OPTIONS[hourIndex] ?? 12, MINUTE_OPTIONS[index] ?? 0),
                          });
                        }}
                        width={84}
                        formatLabel={(value) => `${value}`.padStart(2, '0')}
                      />
                    </View>
                    <Text style={styles.helperText}>선택한 시간은 {formatRoomDateLabel(scheduledStartAt)} 기준으로 저장돼요.</Text>
                  </View>
                ) : null}
              </Card>

              <Card>
                <Text style={styles.sectionTitle}>친구 초대</Text>
                {friendOptions.length ? (
                  <View style={styles.friendWrap}>
                    {friendOptions.map((friend) => {
                      const isSelected = selectedFriendIds.includes(friend.id);
                      return (
                        <Pressable
                          key={friend.id}
                          style={[styles.friendChip, isSelected ? styles.friendChipSelected : undefined]}
                          onPress={() => {
                            const nextIds = isSelected
                              ? selectedFriendIds.filter((id) => id !== friend.id)
                              : room.mode === 'duel'
                                ? [friend.id]
                                : [...selectedFriendIds, friend.id].slice(0, room.maxParticipants - 1);
                            setSelectedFriendIds(nextIds);
                          }}
                          disabled={saving}
                        >
                          <Text style={[styles.friendChipText, isSelected ? styles.friendChipTextSelected : undefined]}>
                            {friend.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.helperText}>친구 목록이 아직 없으면 링크 공유로 초대하면 돼요.</Text>
                )}
                {friendOptions.length ? (
                  <View style={styles.inviteSubmitBox}>
                    <Text style={styles.helperText}>
                      친구 이름을 눌러 선택한 뒤 초대하기를 누르면 대기명단에 수락 대기중으로 표시돼요.
                    </Text>
                    <Pressable
                      style={[
                        styles.sendInviteButton,
                        (saving || !hasInviteDraftChanges) ? styles.actionButtonDisabled : undefined,
                      ]}
                      onPress={() => { void handleSendFriendInvites(); }}
                      disabled={saving || !hasInviteDraftChanges}
                    >
                      <Text style={styles.sendInviteButtonText}>
                        {saving ? '초대 반영 중...' : selectedFriendIds.length ? `${selectedFriendIds.length}명 초대하기` : '초대 비우기'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </Card>
            </>
          ) : null}

          {error ? (
            <Card>
              <Text style={styles.errorText}>{error}</Text>
            </Card>
          ) : null}

          <SecondaryButton label={saving ? '반영 중...' : (room.isHost ? '방 삭제' : '방 나가기')} onPress={() => { void handleLeave(); }} disabled={saving} />
            </>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    color: '#6D5EF7',
    fontWeight: '900',
    fontSize: 24,
    lineHeight: 24,
  },
  pageTitle: {
    color: '#111827',
    fontSize: 28,
    fontWeight: '900',
  },
  lobbyCard: {
    gap: 14,
  },
  roomTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  roomModeTitle: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '900',
  },
  roomMeta: {
    color: '#475467',
    fontSize: 14,
    fontWeight: '600',
  },
  codePill: {
    borderRadius: 999,
    backgroundColor: '#1E1B4B',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  codePillText: {
    color: '#E0E7FF',
    fontSize: 13,
    fontWeight: '800',
  },
  actionGrid: {
    gap: 10,
  },
  countdownBanner: {
    borderRadius: 18,
    backgroundColor: '#1E1B4B',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
  },
  countdownBannerTitle: {
    color: '#EEF2FF',
    fontSize: 18,
    fontWeight: '900',
  },
  countdownBannerText: {
    color: '#C7D2FE',
    fontSize: 13,
    fontWeight: '600',
  },
  inviteActionCard: {
    gap: 14,
  },
  inviteActionTitle: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '900',
  },
  inviteButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  acceptInviteButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#6D5EF7',
    paddingVertical: 15,
  },
  acceptInviteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  declineInviteButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#FFFFFF',
    paddingVertical: 15,
  },
  declineInviteButtonText: {
    color: '#344054',
    fontSize: 16,
    fontWeight: '900',
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  distanceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  customDistanceRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  distanceInput: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#111827',
    fontWeight: '700',
  },
  distanceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  distanceChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#EEF2FF',
  },
  distanceChipText: {
    color: '#344054',
    fontWeight: '700',
  },
  distanceChipTextSelected: {
    color: '#4338CA',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeChip: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    paddingVertical: 12,
  },
  modeChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#EEF2FF',
  },
  modeChipText: {
    color: '#344054',
    fontWeight: '700',
  },
  modeChipTextSelected: {
    color: '#4338CA',
  },
  scheduleBox: {
    gap: 12,
    marginTop: 12,
  },
  scheduleTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  wheelRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  wheelColumnWrap: {
    height: ITEM_HEIGHT * VISIBLE_WHEEL_ROWS,
    overflow: 'hidden',
    borderRadius: 22,
    backgroundColor: '#0F172A',
    position: 'relative',
  },
  wheelHighlight: {
    position: 'absolute',
    top: ITEM_HEIGHT * 2,
    left: 8,
    right: 8,
    height: ITEM_HEIGHT,
    borderRadius: 16,
    backgroundColor: 'rgba(109, 94, 247, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.4)',
    zIndex: 1,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemText: {
    color: '#98A2B3',
    fontSize: 18,
    fontWeight: '700',
  },
  wheelItemTextSelected: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  friendWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  friendChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  friendChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#EEF2FF',
  },
  friendChipText: {
    color: '#344054',
    fontWeight: '700',
  },
  friendChipTextSelected: {
    color: '#4338CA',
  },
  inviteSubmitBox: {
    gap: 10,
    marginTop: 14,
  },
  sendInviteButton: {
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#6D5EF7',
    paddingVertical: 15,
  },
  sendInviteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  helperText: {
    color: '#667085',
    fontSize: 14,
    lineHeight: 20,
  },
  emptyTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  errorText: {
    color: '#D92D20',
    fontSize: 14,
    fontWeight: '700',
  },
});
