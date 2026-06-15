import { useMatchRoomLobbyActions } from '@/features/runs/hooks/matchRoomLobby/useMatchRoomLobbyActions';
import { useMatchRoomLobbyEffects } from '@/features/runs/hooks/matchRoomLobby/useMatchRoomLobbyEffects';
import { useMatchRoomLobbyState } from '@/features/runs/hooks/matchRoomLobby/useMatchRoomLobbyState';
import { useMatchRoomLobbyViewModel } from '@/features/runs/hooks/matchRoomLobby/useMatchRoomLobbyViewModel';

export function useMatchRoomLobby() {
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
    loadRoom,
    pauseRoomPolling,
    syncServerClock,
    saving,
    setSaving,
    settings,
  } = useMatchRoomLobbyState();
  const viewModel = useMatchRoomLobbyViewModel({
    currentUserTag,
    friendLeaderboard,
    room,
    serverClockOffsetMs,
  });

  useMatchRoomLobbyEffects({
    commitRoom,
    currentUserTag,
    latestRoomServerNowMsRef,
    loadRoom,
    partyRunFlow: viewModel.partyRunFlow,
    pauseRoomPolling,
    room,
    serverClockOffsetMs,
    setError,
    syncServerClock,
  });

  const actions = useMatchRoomLobbyActions({
    commitRoom,
    isReady: viewModel.isReady,
    latestRoomServerNowMsRef,
    pauseRoomPolling,
    room,
    roomUxModel: viewModel.roomUxModel,
    setError,
    setSaving,
    settings,
    syncServerClock,
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
    friendOptions: viewModel.friendOptions,
    roomUxModel: viewModel.roomUxModel,
    isInvitedOnly: viewModel.isInvitedOnly,
    hasInviteDraftChanges: settings.hasInviteDraftChanges,
    scheduledStartAt: settings.scheduledStartAt,
    linkedMatchRemainingSeconds: viewModel.linkedMatchRemainingSeconds,
    partyRunStartPhase: viewModel.partyRunStartPhase,
    showPartyRunLoadingBanner: viewModel.showPartyRunLoadingBanner,
    showPartyRunCountdownBanner: viewModel.showPartyRunCountdownBanner,
    saveRoomSettings: settings.saveRoomSettings,
    roomExitState: actions.roomExitState,
    handleToggleReady: actions.handleToggleReady,
    handleStart: actions.handleStart,
    handleLeave: actions.handleLeave,
    handleAcceptInvite: actions.handleAcceptInvite,
    handleDeclineInvite: actions.handleDeclineInvite,
    handleSendFriendInvites: actions.handleSendFriendInvites,
    handleCopyCode: actions.handleCopyCode,
    handleInviteFriends: actions.handleInviteFriends,
    handleApplyCustomDistance: settings.handleApplyCustomDistance,
  };
}
