import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import type { FriendRequest } from '@/domain';
import type { FriendLeaderboardResponse, MyProfileResponse } from '@/lib/api/types';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  fetchFriendLeaderboard,
  fetchMyProfile,
  getApiErrorMessage,
  rejectFriendRequest,
} from '@/services';

export function useFriendsScreen() {
  const [leaderboard, setLeaderboard] = useState<FriendLeaderboardResponse | null>(null);
  const [profile, setProfile] = useState<MyProfileResponse | null>(null);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [expandedLiveFriendId, setExpandedLiveFriendId] = useState<string | null>(null);

  const syncFriends = useCallback(async () => {
    const [leaderboardData, profileData] = await Promise.all([fetchFriendLeaderboard(), fetchMyProfile()]);

    setLeaderboard(leaderboardData);
    setProfile(profileData);
    setRequests(leaderboardData.requests);
    setExpandedLiveFriendId((current) => {
      if (!current) {
        return null;
      }

      const visibleLiveFriend = leaderboardData.ranks.find(
        (friend) => friend.id === current && friend.isRunningNow && friend.liveLocationLabel,
      );

      return visibleLiveFriend ? current : null;
    });
  }, []);

  const loadFriends = useCallback(() => {
    setLoading(true);
    setError(null);

    syncFriends()
      .catch((loadError) => setError(getApiErrorMessage(loadError, '친구 정보를 불러오지 못했어.')))
      .finally(() => setLoading(false));
  }, [syncFriends]);

  useFocusEffect(useCallback(() => {
    void loadFriends();

    const refreshInterval = setInterval(() => {
      void syncFriends().catch(() => undefined);
    }, 20000);

    return () => clearInterval(refreshInterval);
  }, [loadFriends, syncFriends]));

  const pending = useMemo(() => requests.filter((request) => request.status === 'pending'), [requests]);
  const received = useMemo(() => requests.filter((request) => request.status === 'received'), [requests]);
  const compareTargets = useMemo(() => {
    if (!leaderboard || !profile) {
      return [];
    }

    return leaderboard.ranks.filter((runner) => runner.tag !== profile.publicTag);
  }, [leaderboard, profile]);

  const runRequestAction = useCallback(async (
    requestId: string,
    action: (requestId: string) => Promise<unknown>,
    fallbackMessage: string,
  ) => {
    setActionError(null);
    setRequestActionId(requestId);

    try {
      await action(requestId);
      await syncFriends();
    } catch (requestError) {
      setActionError(getApiErrorMessage(requestError, fallbackMessage));
    } finally {
      setRequestActionId(null);
    }
  }, [syncFriends]);

  const handleAccept = useCallback((requestId: string) => runRequestAction(
    requestId,
    acceptFriendRequest,
    '친구 요청 수락에 실패했어.',
  ), [runRequestAction]);

  const handleReject = useCallback((requestId: string) => runRequestAction(
    requestId,
    rejectFriendRequest,
    '친구 요청 거절에 실패했어.',
  ), [runRequestAction]);

  const handleCancel = useCallback((requestId: string) => runRequestAction(
    requestId,
    cancelFriendRequest,
    '보낸 친구 요청 취소에 실패했어.',
  ), [runRequestAction]);

  const handleCopyTag = useCallback(async () => {
    if (!profile?.publicTag) {
      return;
    }

    try {
      await Clipboard.setStringAsync(profile.publicTag);
      setCopyMessage('내 태그를 복사했어.');
    } catch {
      setCopyMessage('태그 복사에 실패했어.');
    }
  }, [profile?.publicTag]);

  return {
    actionError,
    compareTargets,
    copyMessage,
    error,
    expandedLiveFriendId,
    handleAccept,
    handleCancel,
    handleCopyTag,
    handleReject,
    leaderboard,
    loadFriends,
    loading,
    pending,
    profile,
    received,
    requestActionId,
    setExpandedLiveFriendId,
  };
}
