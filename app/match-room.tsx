import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { PartyRunParticipantListCard } from '@/features/runs/components/PartyRunParticipantListCard';
import {
  MATCH_ROOM_DISTANCE_OPTIONS,
  MATCH_ROOM_HOUR_OPTIONS,
  MATCH_ROOM_MINUTE_OPTIONS,
  buildScheduledStartAt,
  formatRoomDateLabel,
  useMatchRoomLobby,
} from '@/features/runs/hooks/useMatchRoomLobby';
import {
  formatMatchCountdown,
} from '@/lib/matchCountdown';

const ITEM_HEIGHT = 48;
const VISIBLE_WHEEL_ROWS = 5;
const WHEEL_PADDING = ITEM_HEIGHT * 2;

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
  const {
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
    pendingInvitees,
    isInvitedOnly,
    hasInviteDraftChanges,
    isReady,
    allGuestsReady,
    scheduledStartAt,
    linkedMatchRemainingSeconds,
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
  } = useMatchRoomLobby();

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
            {showPartyRunLoadingBanner ? (
              <View style={styles.countdownBanner}>
                <Text style={styles.countdownBannerTitle}>로딩중...</Text>
                <Text style={styles.countdownBannerText}>
                  대결 화면을 맞추는 중이에요. 잠시 뒤 모든 참가자에게 같은 카운트다운이 보여요.
                </Text>
              </View>
            ) : null}
            {showPartyRunCountdownBanner && linkedMatchRemainingSeconds ? (
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
                  {MATCH_ROOM_DISTANCE_OPTIONS.map((distanceKm) => {
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
                            slotStartAt: buildScheduledStartAt(nextMeridiem, MATCH_ROOM_HOUR_OPTIONS[hourIndex] ?? 12, MATCH_ROOM_MINUTE_OPTIONS[minuteIndex] ?? 0),
                          });
                        }}
                        width={96}
                      />
                      <WheelColumn
                        options={MATCH_ROOM_HOUR_OPTIONS}
                        selectedIndex={hourIndex}
                        onChange={(index) => {
                          setHourIndex(index);
                          void saveRoomSettings({
                            startMode: 'scheduled',
                            slotStartAt: buildScheduledStartAt(meridiem, MATCH_ROOM_HOUR_OPTIONS[index] ?? 12, MATCH_ROOM_MINUTE_OPTIONS[minuteIndex] ?? 0),
                          });
                        }}
                        width={84}
                      />
                      <WheelColumn
                        options={MATCH_ROOM_MINUTE_OPTIONS}
                        selectedIndex={minuteIndex}
                        onChange={(index) => {
                          setMinuteIndex(index);
                          void saveRoomSettings({
                            startMode: 'scheduled',
                            slotStartAt: buildScheduledStartAt(meridiem, MATCH_ROOM_HOUR_OPTIONS[hourIndex] ?? 12, MATCH_ROOM_MINUTE_OPTIONS[index] ?? 0),
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
