import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { type Href, router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import {
  fetchFriendLeaderboard,
  fetchRunningMatchRoom,
  leaveRunningMatchRoom,
  startRunningMatchRoom,
  updateRunningMatchRoom,
  updateRunningMatchRoomReady,
} from '@/lib/api/services';
import type { FriendLeaderboardResponse, RunningMatchRoom, RunningMatchRoomStartMode } from '@/lib/api/types';
import { getCurrentUserProfile } from '@/lib/session';

const ITEM_HEIGHT = 48;
const VISIBLE_WHEEL_ROWS = 5;
const WHEEL_PADDING = ITEM_HEIGHT * 2;
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => index);
const DISTANCE_OPTIONS = [3, 5, 7, 10, 15, 21.1, 42.2];

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
  const currentUserId = currentUser?.publicTag ?? 'mock-current-user';
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

  const loadRoom = async () => {
    try {
      const payload = await fetchRunningMatchRoom();
      setRoom(payload.room);
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
    const intervalId = setInterval(() => {
      void loadRoom();
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!room?.linkedMatchSlotStartAt) {
      return;
    }

    if (room.state !== 'countdown' && room.state !== 'active') {
      return;
    }

    router.replace({
      pathname: '/(tabs)/running',
      params: {
        focusMatchMode: room.mode,
        focusMatchSlotStartAt: room.linkedMatchSlotStartAt,
        focusMatchNonce: `room-${Date.now()}`,
      },
    } as Href);
  }, [room?.linkedMatchSlotStartAt, room?.mode, room?.state]);

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

  const friendOptions = useMemo(
    () => (friendLeaderboard?.ranks ?? []).slice(0, 12),
    [friendLeaderboard],
  );
  const currentParticipant = room?.participants.find((participant) => participant.userId === currentUserId) ?? null;
  const isReady = Boolean(currentParticipant?.isReady);
  const allGuestsReady = room
    ? room.participants.filter((participant) => !participant.isHost).every((participant) => participant.isReady)
    : false;
  const scheduledStartAt = buildScheduledStartAt(meridiem, HOUR_OPTIONS[hourIndex] ?? 12, MINUTE_OPTIONS[minuteIndex] ?? 0);

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
      setRoom(payload.room);
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
      setRoom(payload.room);
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
      setRoom(payload.room);
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
            <View style={styles.actionGrid}>
              <SecondaryButton label="친구 초대" onPress={() => { void handleInviteFriends(); }} />
              <SecondaryButton label="방 코드 복사" onPress={() => { void handleCopyCode(); }} />
            </View>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>참가자 명단</Text>
            <View style={styles.participantList}>
              {room.participants.map((participant, index) => (
                <View key={`${participant.userId}-${index}`} style={styles.participantRow}>
                  <View style={styles.participantIdentity}>
                    <Text style={styles.participantName}>{participant.name}</Text>
                    {participant.isHost ? <Text style={styles.hostBadge}>방장</Text> : null}
                  </View>
                  <Text style={participant.isHost ? styles.hostStatusText : (participant.isReady ? styles.readyText : styles.pendingText)}>
                    {participant.isHost ? '시작 권한' : (participant.isReady ? '준비 완료' : '대기 중')}
                  </Text>
                </View>
              ))}
            </View>
            {!room.isHost ? (
              <PrimaryButton
                label={saving ? '반영 중...' : isReady ? '준비 취소' : '준비'}
                onPress={() => { void handleToggleReady(); }}
                disabled={saving}
              />
            ) : room.startMode === 'host' ? (
              <PrimaryButton
                label={saving ? '시작 준비 중...' : '시작'}
                onPress={() => { void handleStart(); }}
                disabled={saving || !room.canStart}
              />
            ) : (
              <Text style={styles.helperText}>예약 시간 30초 전에 카운트다운이 시작돼요.</Text>
            )}
            {room.isHost && room.startMode === 'host' && !room.canStart ? (
              <Text style={styles.helperText}>
                {allGuestsReady
                  ? `최소 ${room.minParticipants}명은 모여야 시작할 수 있어요.`
                  : '모든 참가자가 준비 완료해야 시작할 수 있어요.'}
              </Text>
            ) : null}
          </Card>

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
                              : [...selectedFriendIds, friend.id].slice(0, room.mode === 'duel' ? 1 : room.maxParticipants - 1);
                            setSelectedFriendIds(nextIds);
                            void saveRoomSettings({ invitedFriendIds: nextIds });
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
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
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
  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  participantList: {
    gap: 10,
  },
  participantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  participantIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  participantName: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  hostBadge: {
    color: '#6D5EF7',
    fontSize: 12,
    fontWeight: '800',
  },
  readyText: {
    color: '#1570EF',
    fontSize: 14,
    fontWeight: '800',
  },
  hostStatusText: {
    color: '#6D5EF7',
    fontSize: 14,
    fontWeight: '800',
  },
  pendingText: {
    color: '#667085',
    fontSize: 14,
    fontWeight: '700',
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
