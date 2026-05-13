import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '@/components/Screen';
import { FriendsRanking } from '@/features/friends/FriendsRanking';
import { FriendListCard } from '@/features/friends/components/FriendListCard';
import { FriendRequestsCard } from '@/features/friends/components/FriendRequestsCard';
import { FriendTagCard } from '@/features/friends/components/FriendTagCard';
import { acceptFriendRequest, cancelFriendRequest, fetchFriendLeaderboard, fetchMyProfile, rejectFriendRequest } from '@/services';
import { FriendLeaderboardResponse, MyProfileResponse } from '@/lib/api/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { FriendRequest } from '@/domain';

export default function FriendsScreen() {
  const { scrollToTop } = useLocalSearchParams<{ scrollToTop?: string }>();
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
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '친구 정보를 불러오지 못했어.'))
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

  const handleAccept = async (requestId: string) => {
    setActionError(null);
    setRequestActionId(requestId);

    try {
      await acceptFriendRequest(requestId);
      await syncFriends();
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : '친구 요청 수락에 실패했어.');
    } finally {
      setRequestActionId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setActionError(null);
    setRequestActionId(requestId);

    try {
      await rejectFriendRequest(requestId);
      await syncFriends();
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : '친구 요청 거절에 실패했어.');
    } finally {
      setRequestActionId(null);
    }
  };

  const handleCancel = async (requestId: string) => {
    setActionError(null);
    setRequestActionId(requestId);

    try {
      await cancelFriendRequest(requestId);
      await syncFriends();
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : '보낸 친구 요청 취소에 실패했어.');
    } finally {
      setRequestActionId(null);
    }
  };

  const handleCopyTag = async () => {
    if (!profile?.publicTag) {
      return;
    }

    try {
      await Clipboard.setStringAsync(profile.publicTag);
      setCopyMessage('내 태그를 복사했어.');
    } catch {
      setCopyMessage('태그 복사에 실패했어.');
    }
  };

  return (
    <Screen scrollToTopKey={scrollToTop}>
      <View style={styles.headerWrap}>
        <PageHeader title="친구 랭킹" />
      </View>

      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
      {error ? (
        <Card>
          <Text style={styles.errorTitle}>친구 정보를 아직 못 불러왔어</Text>
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton label="다시 불러오기" onPress={loadFriends} />
        </Card>
      ) : null}

      {leaderboard && profile ? (
        <>
          <FriendsRanking ranks={leaderboard.ranks} highlightTag={profile.publicTag} />

          <Pressable style={styles.addButton} onPress={() => router.push('/add-friend')}>
            <Text style={styles.addButtonText}>친구 추가하기</Text>
          </Pressable>

          <FriendTagCard
            profile={profile}
            copyMessage={copyMessage}
            onCopyTag={() => {
              void handleCopyTag();
            }}
          />

          <FriendRequestsCard
            received={received}
            pending={pending}
            actionError={actionError}
            requestActionId={requestActionId}
            onReject={(requestId) => {
              void handleReject(requestId);
            }}
            onAccept={(requestId) => {
              void handleAccept(requestId);
            }}
            onCancel={(requestId) => {
              void handleCancel(requestId);
            }}
          />

          <FriendListCard
            friends={compareTargets}
            expandedLiveFriendId={expandedLiveFriendId}
            onToggleLiveFriend={(friendId) => {
              setExpandedLiveFriendId((current) => (current === friendId ? null : friendId));
            }}
            onOpenFriend={(friendId) => router.push({ pathname: '/friend-detail', params: { friendId } })}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: { gap: 12 },
  addButton: {
    backgroundColor: '#6D5EF7',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  errorTitle: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 18,
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
    lineHeight: 20,
  },
});
