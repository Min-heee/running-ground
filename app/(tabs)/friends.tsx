import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '@/components/Screen';
import { FriendsRanking } from '@/features/friends/FriendsRanking';
import { acceptFriendRequest, cancelFriendRequest, fetchFriendLeaderboard, fetchMyProfile, rejectFriendRequest } from '@/lib/api/services';
import { FriendLeaderboardResponse, MyProfileResponse } from '@/lib/api/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { FriendRequest } from '@/domain/types';

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

  const syncFriends = async () => {
    const [leaderboardData, profileData] = await Promise.all([fetchFriendLeaderboard(), fetchMyProfile()]);

    setLeaderboard(leaderboardData);
    setProfile(profileData);
    setRequests(leaderboardData.requests);
  };

  const loadFriends = () => {
    setLoading(true);
    setError(null);

    syncFriends()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '친구 정보를 불러오지 못했어.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadFriends();
  }, []);

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

          <Card style={styles.tagCard}>
            <View style={styles.tagHeaderRow}>
              <View style={styles.tagCopy}>
                <Text style={styles.tagTitle}>내 태그</Text>
                <Text style={styles.tagValue}>{profile.publicTag}</Text>
              </View>
              <Pressable style={styles.copyButton} onPress={handleCopyTag}>
                <Text style={styles.copyButtonText}>복사</Text>
              </Pressable>
            </View>
            <Text style={styles.tagDescription}>친구 추가 화면에서 이 태그로 바로 검색할 수 있어.</Text>
            {copyMessage ? <Text style={styles.copyMessage}>{copyMessage}</Text> : null}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>친구 요청 상태</Text>
            {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
            {received.map((request) => (
              <View key={request.id} style={styles.requestRow}>
                <View style={styles.requestMeta}>
                  <Text style={styles.requestName}>{request.name}</Text>
                  <Text style={styles.requestDetail}>{request.tag} · 나에게 친구 요청 보냄</Text>
                </View>
                <View style={styles.requestActions}>
                  <Pressable
                    style={[styles.ghostButton, requestActionId === request.id && styles.disabledButton]}
                    onPress={() => handleReject(request.id)}
                    disabled={requestActionId === request.id}
                  >
                    <Text style={styles.ghostButtonText}>거절</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.acceptButton, requestActionId === request.id && styles.disabledButton]}
                    onPress={() => handleAccept(request.id)}
                    disabled={requestActionId === request.id}
                  >
                    <Text style={styles.acceptButtonText}>{requestActionId === request.id ? '처리중' : '수락'}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            {pending.map((request) => (
              <View key={request.id} style={styles.requestRow}>
                <View style={styles.requestMeta}>
                  <Text style={styles.requestName}>{request.name}</Text>
                  <Text style={styles.requestDetail}>{request.tag} · 수락 대기중</Text>
                </View>
                <View style={styles.requestActions}>
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>대기중</Text>
                  </View>
                  <Pressable
                    style={[styles.ghostButton, requestActionId === request.id && styles.disabledButton]}
                    onPress={() => handleCancel(request.id)}
                    disabled={requestActionId === request.id}
                  >
                    <Text style={styles.ghostButtonText}>{requestActionId === request.id ? '취소중' : '취소'}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            {received.length === 0 && pending.length === 0 ? (
              <Text style={styles.emptyText}>처리할 친구 요청이 없어.</Text>
            ) : null}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>친구 목록</Text>
            {compareTargets.map((friend) => (
              <Pressable
                key={friend.id}
                style={styles.compareRow}
                onPress={() => router.push({ pathname: '/friend-detail', params: { friendId: friend.id } })}
              >
                <View style={styles.requestMeta}>
                  <View style={styles.friendRowHeader}>
                    <Text style={styles.requestName}>{friend.name}</Text>
                    {friend.isRunningNow ? (
                      <View style={styles.liveBadge}>
                        <View style={styles.liveDot} />
                        <Text style={styles.liveBadgeText}>러닝 중</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.requestDetail}>{friend.tag}</Text>
                </View>
                <Text style={styles.compareLink}>보기</Text>
              </Pressable>
            ))}
            {compareTargets.length === 0 ? <Text style={styles.emptyText}>아직 비교할 친구 기록이 없어.</Text> : null}
          </Card>
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
  tagCard: {
    gap: 10,
  },
  tagHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  tagCopy: {
    flex: 1,
    gap: 4,
  },
  tagTitle: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  tagValue: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '900',
    includeFontPadding: false,
  },
  tagDescription: {
    color: '#475467',
    lineHeight: 20,
  },
  copyButton: {
    backgroundColor: '#111827',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  copyButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    includeFontPadding: false,
  },
  copyMessage: {
    color: '#067647',
    fontWeight: '700',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  requestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECF0',
  },
  compareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECF0',
  },
  requestMeta: {
    flex: 1,
    gap: 2,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  friendRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  requestName: {
    color: '#111827',
    fontWeight: '700',
  },
  requestDetail: {
    color: '#667085',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF3',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#12B76A',
  },
  liveBadgeText: {
    color: '#067647',
    fontSize: 12,
    fontWeight: '800',
    includeFontPadding: false,
  },
  acceptButton: {
    backgroundColor: '#6D5EF7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  ghostButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#D0D5DD',
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  ghostButtonText: {
    color: '#344054',
    fontWeight: '800',
  },
  pendingBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pendingBadgeText: {
    color: '#4F46E5',
    fontWeight: '800',
  },
  compareLink: {
    color: '#6D5EF7',
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.6,
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
  emptyText: {
    color: '#667085',
    marginTop: 10,
  },
});
