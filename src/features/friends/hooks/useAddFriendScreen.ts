import { useEffect, useMemo, useState } from 'react';
import type { FriendLeaderboardResponse, MyProfileResponse } from '@/lib/api/types';
import { createFriendRequest, fetchFriendLeaderboard, fetchMyProfile } from '@/services';

export function useAddFriendScreen() {
  const [friendTag, setFriendTag] = useState('');
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState(false);
  const [profile, setProfile] = useState<MyProfileResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<FriendLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchMyProfile(), fetchFriendLeaderboard()])
      .then(([profileData, leaderboardData]) => {
        setProfile(profileData);
        setLeaderboard(leaderboardData);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : '친구 추가 정보를 불러오지 못했어.');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = () => {
    if (!profile) {
      return;
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleAddFriend = async () => {
    if (!friendTag.trim()) {
      setError('친구 태그를 입력해줘.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await createFriendRequest(friendTag);
      setAdded(true);
      setFriendTag('');
      setTimeout(() => setAdded(false), 2000);

      const refreshedLeaderboard = await fetchFriendLeaderboard();
      setLeaderboard(refreshedLeaderboard);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '친구 요청 전송에 실패했어.');
    } finally {
      setSubmitting(false);
    }
  };

  const requestCounts = useMemo(() => ({
    pendingCount: leaderboard?.requests.filter((request) => request.status === 'pending').length ?? 0,
    receivedCount: leaderboard?.requests.filter((request) => request.status === 'received').length ?? 0,
  }), [leaderboard?.requests]);

  const handleFriendTagChange = (value: string) => setFriendTag(value.toUpperCase());

  return {
    added,
    copied,
    error,
    friendTag,
    handleAddFriend,
    handleCopy,
    handleFriendTagChange,
    loading,
    profile,
    requestCounts,
    submitting,
  };
}
