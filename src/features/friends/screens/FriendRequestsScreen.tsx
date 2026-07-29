// 친구 요청 상태 전용 화면 (오너 2026-07-29) — 친구 탭의 '친구 요청 상태' 버튼으로 진입.
// 데이터/액션은 친구 탭과 같은 훅(useFriendsScreen)을 그대로 쓴다.

import { StyleSheet, Text } from 'react-native';
import { BrandLoadingView } from '@/components/BrandLoadingView';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { FriendRequestsCard } from '@/features/friends/components/FriendRequestsCard';
import { useFriendsScreen } from '@/features/friends/hooks/useFriendsScreen';
import { colors, fontSizes, fontWeights } from '@/theme/tokens';

export default function FriendRequestsScreen() {
  const {
    actionError,
    error,
    handleAccept,
    handleCancel,
    handleReject,
    loadFriends,
    loading,
    pending,
    received,
    requestActionId,
  } = useFriendsScreen();

  if (loading) {
    return <BrandLoadingView />;
  }

  return (
    <Screen>
      <AuthHeader title="친구 요청 상태" showBack backHref="/(tabs)/friends" />

      {error ? (
        <Card>
          <Text style={styles.errorTitle}>요청 정보를 아직 못 불러왔어</Text>
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton label="다시 불러오기" onPress={loadFriends} />
        </Card>
      ) : (
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
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
