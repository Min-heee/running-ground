import { memo, useCallback, useEffect, useMemo, useState } from 'react';
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
import { LiveGapPushCard } from '@/features/runs/components/matchSetupCards/LiveGapPushCard';
import { useMatchRoomLobby } from '@/features/runs/hooks/useMatchRoomLobby';
import { colors, fontSizes, fontWeights, radii } from '@/theme/tokens';

const LOADING_ESCAPE_DELAY_MS = 7_000;

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
  const [showLoadingEscape, setShowLoadingEscape] = useState(false);
  const isRoomExiting = roomExitState !== 'idle';
  const roomExitLabel = useMemo(
    () => (roomExitState === 'deleting' ? '방 삭제 중...' : '방 나가기 중...'),
    [roomExitState],
  );
  const leaveButtonLabel = useMemo(
    () => (isRoomExiting ? roomExitLabel : (saving ? '반영 중...' : (room?.isHost ? '방 삭제' : '방 나가기'))),
    [isRoomExiting, room?.isHost, roomExitLabel, saving],
  );
  const handleBack = useCallback(() => {
    router.back();
  }, []);
  const handleReturnToRunning = useCallback(() => {
    router.replace('/(tabs)/running');
  }, []);
  const handleInviteFriendsPress = useCallback(() => {
    void handleInviteFriends();
  }, [handleInviteFriends]);
  const handleCopyCodePress = useCallback(() => {
    void handleCopyCode();
  }, [handleCopyCode]);
  const handleAcceptInvitePress = useCallback(() => {
    void handleAcceptInvite();
  }, [handleAcceptInvite]);
  const handleDeclineInvitePress = useCallback(() => {
    void handleDeclineInvite();
  }, [handleDeclineInvite]);
  const handleToggleReadyPress = useCallback(() => {
    void handleToggleReady();
  }, [handleToggleReady]);
  const handleStartPress = useCallback(() => {
    void handleStart();
  }, [handleStart]);
  const handleDistanceChange = useCallback((distanceKm: number) => {
    void saveRoomSettings({ distanceKm });
  }, [saveRoomSettings]);
  const handleApplyCustomDistancePress = useCallback(() => {
    void handleApplyCustomDistance();
  }, [handleApplyCustomDistance]);
  const handleSaveStartMode = useCallback((input: Parameters<typeof saveRoomSettings>[0]) => {
    void saveRoomSettings(input);
  }, [saveRoomSettings]);
  const handleSendFriendInvitesPress = useCallback(() => {
    void handleSendFriendInvites();
  }, [handleSendFriendInvites]);
  const handleLeavePress = useCallback(() => {
    void handleLeave();
  }, [handleLeave]);

  useEffect(() => {
    if (!loading) {
      setShowLoadingEscape(false);
      return undefined;
    }

    const timer = setTimeout(() => {
      setShowLoadingEscape(true);
    }, LOADING_ESCAPE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [loading]);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <BackButton onPress={handleBack} />
      </View>
      <Text style={styles.pageTitle}>대기실</Text>

      {loading ? (
        <LoadingRoomCard
          showReturnAction={showLoadingEscape}
          onReturnToRunning={handleReturnToRunning}
        />
      ) : null}

      {!loading && !room ? <EmptyRoomCard onReturnToRunning={handleReturnToRunning} /> : null}

      {room ? (
        <>
          <MatchRoomSummaryCard
            room={room}
            isInvitedOnly={isInvitedOnly}
            showLoadingBanner={showPartyRunLoadingBanner}
	            showCountdownBanner={showPartyRunCountdownBanner}
	            linkedMatchRemainingSeconds={linkedMatchRemainingSeconds}
	            onInviteFriends={handleInviteFriendsPress}
	            onCopyCode={handleCopyCodePress}
	          />

          {isInvitedOnly ? (
            <MatchRoomInviteActionCard
              invite={roomUxModel.invite}
	              saving={saving}
	              error={error}
	              onAcceptInvite={handleAcceptInvitePress}
	              onDeclineInvite={handleDeclineInvitePress}
	            />
          ) : (
            <>
              <PartyRunParticipantListCard
	                room={room}
	                uxModel={roomUxModel}
	                saving={saving}
	                onToggleReady={handleToggleReadyPress}
	                onStart={handleStartPress}
	              />

              <LiveGapPushCard mode={room.mode} />

              {room.isHost && !room.linkedMatchId ? (
                <>
                  <MatchRoomDistanceSettingsCard
	                    distanceKm={room.distanceKm}
	                    customDistanceText={customDistanceText}
	                    saving={saving}
	                    onDistanceChange={handleDistanceChange}
	                    onCustomDistanceTextChange={setCustomDistanceText}
	                    onApplyCustomDistance={handleApplyCustomDistancePress}
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
	                    onSaveStartMode={handleSaveStartMode}
	                  />

                  <MatchRoomFriendInviteCard
                    mode={room.mode}
                    maxParticipants={room.maxParticipants}
                    friendOptions={friendOptions}
                    selectedFriendIds={selectedFriendIds}
	                    saving={saving}
	                    hasInviteDraftChanges={hasInviteDraftChanges}
	                    onSelectedFriendIdsChange={setSelectedFriendIds}
	                    onSendFriendInvites={handleSendFriendInvitesPress}
	                  />
                </>
              ) : null}

              {error ? (
                <Card>
                  <Text style={styles.errorText}>{error}</Text>
                </Card>
              ) : null}

              <SecondaryButton
	                label={leaveButtonLabel}
	                onPress={handleLeavePress}
	                disabled={saving || isRoomExiting}
	              />
            </>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const BackButton = memo(function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.backButton} onPress={onPress}>
      <Text style={styles.backText}>←</Text>
    </Pressable>
  );
});

const LoadingRoomCard = memo(function LoadingRoomCard({
  showReturnAction,
  onReturnToRunning,
}: {
  showReturnAction: boolean;
  onReturnToRunning: () => void;
}) {
  return (
    <Card>
      <Text style={styles.helperText}>대기실을 불러오는 중이에요...</Text>
      {showReturnAction ? (
        <>
          <Text style={styles.helperText}>오래 걸리면 러닝 탭으로 돌아가서 이어갈 수 있어요.</Text>
          <PrimaryButton label="러닝 탭으로 돌아가기" onPress={onReturnToRunning} />
        </>
      ) : null}
    </Card>
  );
});

const EmptyRoomCard = memo(function EmptyRoomCard({
  onReturnToRunning,
}: {
  onReturnToRunning: () => void;
}) {
  return (
    <Card>
      <Text style={styles.emptyTitle}>열린 방이 없어요</Text>
      <Text style={styles.helperText}>러닝 탭에서 방을 만들거나 초대 코드로 입장하면 여기서 바로 이어갈 수 있어요.</Text>
      <PrimaryButton label="러닝 탭으로 돌아가기" onPress={onReturnToRunning} />
    </Card>
  );
});

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    color: colors.brand,
    fontWeight: fontWeights.black,
    fontSize: fontSizes.summaryValue,
    lineHeight: 24,
  },
  pageTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.black,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 20,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  errorText: {
    color: colors.dangerBright,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
});
