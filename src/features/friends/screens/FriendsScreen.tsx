import { useState } from 'react';
import { Alert, StyleSheet, Text, View, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BrandLoadingView } from '@/components/BrandLoadingView';
import { Screen } from '@/components/Screen';
import { FriendsRanking } from '@/features/friends/FriendsRanking';
import { FriendListCard } from '@/features/friends/components/FriendListCard';
import { FriendRequestsCard } from '@/features/friends/components/FriendRequestsCard';
import { useFriendsScreen } from '@/features/friends/hooks/useFriendsScreen';
import { createRunningMatchRoom, getApiErrorMessage } from '@/services';
import { TabHeader } from '@/components/ui/TabHeader';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useTabWarmupTrace } from '@/utils/useTabWarmupTrace';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export default function FriendsScreen() {
  useTabWarmupTrace('friends');
  const { scrollToTop } = useLocalSearchParams<{ scrollToTop?: string }>();
  const {
    actionError,
    compareTargets,
    error,
    expandedLiveFriendId,
    handleAccept,
    handleCancel,
    handleReject,
    leaderboard,
    loadFriends,
    loading,
    pending,
    profile,
    received,
    requestActionId,
    setExpandedLiveFriendId,
  } = useFriendsScreen();
  // 친구 행의 러너 버튼 → 그 친구를 초대한 파티런 1대1 방을 바로 만든다. 거리(기본 5km)는
  // 방장 대기실에서 조정 가능. 이미 참여 중인 방/매칭이 있으면 서버가 막고 메시지를 준다.
  const [creatingPartyRunFriendId, setCreatingPartyRunFriendId] = useState<string | null>(null);

  const handleStartPartyRun = (friendId: string) => {
    if (creatingPartyRunFriendId) {
      return;
    }

    setCreatingPartyRunFriendId(friendId);
    void (async () => {
      try {
        await createRunningMatchRoom({
          mode: 'duel',
          distanceKm: 5,
          startMode: 'host',
          invitedFriendIds: [friendId],
        });
        router.push('/match-room');
      } catch (createError) {
        Alert.alert('파티런 방 만들기 실패', getApiErrorMessage(createError, '방을 만들지 못했어요.'));
      } finally {
        setCreatingPartyRunFriendId(null);
      }
    })();
  };

  if (loading) {
    return <BrandLoadingView />;
  }

  return (
    <Screen scrollToTopKey={scrollToTop}>
      <View style={styles.headerWrap}>
        <TabHeader title="친구" />
      </View>

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

          {/* 친구 카드와 요청 상태 카드를 양옆으로 (오너 2026-07-29). */}
          <View style={styles.cardDuoRow}>
            <View style={styles.cardDuoItem}>
              <FriendListCard
                friends={compareTargets}
                expandedLiveFriendId={expandedLiveFriendId}
                creatingPartyRunFriendId={creatingPartyRunFriendId}
                onToggleLiveFriend={(friendId) => {
                  setExpandedLiveFriendId((current) => (current === friendId ? null : friendId));
                }}
                onOpenFriend={(friendId) => router.push({ pathname: '/friend-detail', params: { friendId } })}
                onStartPartyRun={handleStartPartyRun}
              />
            </View>
            <View style={styles.cardDuoItem}>
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
            </View>
          </View>

          <Pressable style={styles.addButton} onPress={() => router.push('/add-friend')}>
            <Text style={styles.addButtonText}>친구 추가</Text>
          </Pressable>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: { gap: 12 },
  cardDuoRow: {
    flexDirection: 'row',
    gap: spacing.s10,
    alignItems: 'stretch',
  },
  cardDuoItem: {
    flex: 1,
  },
  addButton: {
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    paddingVertical: spacing.s14,
    alignItems: 'center',
  },
  addButtonText: {
    color: colors.white,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.rank,
  },
  errorTitle: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.title,
  },
  errorText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
    lineHeight: 20,
  },
});
