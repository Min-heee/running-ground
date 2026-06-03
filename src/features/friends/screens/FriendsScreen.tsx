import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { FriendsRanking } from '@/features/friends/FriendsRanking';
import { FriendListCard } from '@/features/friends/components/FriendListCard';
import { FriendRequestsCard } from '@/features/friends/components/FriendRequestsCard';
import { FriendTagCard } from '@/features/friends/components/FriendTagCard';
import { useFriendsScreen } from '@/features/friends/hooks/useFriendsScreen';
import { PageHeader } from '@/components/ui/PageHeader';
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
  } = useFriendsScreen();

  return (
    <Screen scrollToTopKey={scrollToTop}>
      <View style={styles.headerWrap}>
        <PageHeader title="친구 랭킹" />
      </View>

      {loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}
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
