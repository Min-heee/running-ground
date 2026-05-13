import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { MatchRoomDistanceSettingsCard } from '@/features/runs/components/matchRoom/MatchRoomDistanceSettingsCard';
import { MatchRoomFriendInviteCard } from '@/features/runs/components/matchRoom/MatchRoomFriendInviteCard';
import { MatchRoomInviteActionCard } from '@/features/runs/components/matchRoom/MatchRoomInviteActionCard';
import { MatchRoomStartModeCard } from '@/features/runs/components/matchRoom/MatchRoomStartModeCard';
import { MatchRoomSummaryCard } from '@/features/runs/components/matchRoom/MatchRoomSummaryCard';
import { PartyRunParticipantListCard } from '@/features/runs/components/PartyRunParticipantListCard';
import { useMatchRoomLobby } from '@/features/runs/hooks/useMatchRoomLobby';

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
    roomUxModel,
    isInvitedOnly,
    hasInviteDraftChanges,
    scheduledStartAt,
    linkedMatchRemainingSeconds,
    showPartyRunLoadingBanner,
    showPartyRunCountdownBanner,
    roomExitState,
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
  const isRoomExiting = roomExitState !== 'idle';
  const roomExitLabel = roomExitState === 'deleting' ? '방 삭제 중...' : '방 나가기 중...';

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
          <MatchRoomSummaryCard
            room={room}
            isInvitedOnly={isInvitedOnly}
            showLoadingBanner={showPartyRunLoadingBanner}
            showCountdownBanner={showPartyRunCountdownBanner}
            linkedMatchRemainingSeconds={linkedMatchRemainingSeconds}
            onInviteFriends={() => { void handleInviteFriends(); }}
            onCopyCode={() => { void handleCopyCode(); }}
          />

          {isInvitedOnly ? (
            <MatchRoomInviteActionCard
              invite={roomUxModel.invite}
              saving={saving}
              error={error}
              onAcceptInvite={() => { void handleAcceptInvite(); }}
              onDeclineInvite={() => { void handleDeclineInvite(); }}
            />
          ) : (
            <>
              <PartyRunParticipantListCard
                room={room}
                uxModel={roomUxModel}
                saving={saving}
                onToggleReady={() => { void handleToggleReady(); }}
                onStart={() => { void handleStart(); }}
              />

              {room.isHost && !room.linkedMatchId ? (
                <>
                  <MatchRoomDistanceSettingsCard
                    distanceKm={room.distanceKm}
                    customDistanceText={customDistanceText}
                    saving={saving}
                    onDistanceChange={(distanceKm) => { void saveRoomSettings({ distanceKm }); }}
                    onCustomDistanceTextChange={setCustomDistanceText}
                    onApplyCustomDistance={() => { void handleApplyCustomDistance(); }}
                  />

                  <MatchRoomStartModeCard
                    startMode={room.startMode}
                    saving={saving}
                    meridiem={meridiem}
                    hourIndex={hourIndex}
                    minuteIndex={minuteIndex}
                    scheduledStartAt={scheduledStartAt}
                    onMeridiemChange={setMeridiem}
                    onHourIndexChange={setHourIndex}
                    onMinuteIndexChange={setMinuteIndex}
                    onSaveStartMode={(input) => { void saveRoomSettings(input); }}
                  />

                  <MatchRoomFriendInviteCard
                    mode={room.mode}
                    maxParticipants={room.maxParticipants}
                    friendOptions={friendOptions}
                    selectedFriendIds={selectedFriendIds}
                    saving={saving}
                    hasInviteDraftChanges={hasInviteDraftChanges}
                    onSelectedFriendIdsChange={setSelectedFriendIds}
                    onSendFriendInvites={() => { void handleSendFriendInvites(); }}
                  />
                </>
              ) : null}

              {error ? (
                <Card>
                  <Text style={styles.errorText}>{error}</Text>
                </Card>
              ) : null}

              <SecondaryButton
                label={isRoomExiting ? roomExitLabel : (saving ? '반영 중...' : (room.isHost ? '방 삭제' : '방 나가기'))}
                onPress={() => { void handleLeave(); }}
                disabled={saving || isRoomExiting}
              />
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
