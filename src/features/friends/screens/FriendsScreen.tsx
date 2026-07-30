import { useState } from 'react';
import { Alert, StyleSheet, Text, View, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BrandLoadingView } from '@/components/BrandLoadingView';
import { Screen } from '@/components/Screen';
import { FriendsRanking } from '@/features/friends/FriendsRanking';
import { FriendListCard } from '@/features/friends/components/FriendListCard';
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
    compareTargets,
    error,
    expandedLiveFriendId,
    leaderboard,
    loadFriends,
    loading,
    profile,
    received,
    setExpandedLiveFriendId,
  } = useFriendsScreen();
  // 친구 행의 러너 버튼 → 그 친구를 초대한 파티런 1대1 방을 바로 만든다. 거리(기본 5km)는
  // 방장 대기실에서 조정 가능. 이미 참여 중인 방/매칭이 있으면 서버가 막고 메시지를 준다.
  const [creatingPartyRunFriendId, setCreatingPartyRunFriendId] = useState<string | null>(null);

  const handleStartPartyRun = (friendId: string) => {
    if (creatingPartyRunFriendId) {
      return;
    }

    const friendName = compareTargets.find((entry) => entry.id === friendId)?.name ?? '이 친구';

    // 방 생성은 초대 알림까지 나가는 되돌리기 번거로운 동작 — 확인 후에만 (오너 2026-07-31).
    Alert.alert(
      '파티런 신청',
      `${friendName}님에게 파티런 1대1을 신청할까요?`,
      [
        { text: '아니요', style: 'cancel' },
        {
          text: '예',
          onPress: () => {
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
          },
        },
      ],
    );
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

          <FriendListCard
            friends={compareTargets}
            expandedLiveFriendId={expandedLiveFriendId}
            creatingPartyRunFriendId={creatingPartyRunFriendId}
            receivedRequestCount={received.length}
            onToggleLiveFriend={(friendId) => {
              setExpandedLiveFriendId((current) => (current === friendId ? null : friendId));
            }}
            onOpenFriend={(friendId) => router.push({ pathname: '/friend-detail', params: { friendId } })}
            onStartPartyRun={handleStartPartyRun}
            onOpenRequests={() => router.push('/friend-requests')}
          />

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
