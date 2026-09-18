import { StyleSheet, Text } from 'react-native';

import { BrandLoadingView } from '@/components/BrandLoadingView';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { FriendsRanking } from '@/features/friends/FriendsRanking';
import { useFriendsScreen } from '@/features/friends/hooks/useFriendsScreen';
import { colors, fontSizes, fontWeights } from '@/theme/tokens';

// 친구 순위표 전체 페이지 (오너 2026-09-18). 친구 탭 카드는 5명까지만 보여주고 '더보기'가
// 여기로 민다. 같은 카드를 limit 없이 그리므로 오늘/이번 주/이번 달 스위치·내 순위 요약도
// 탭과 똑같다. 뒤로가기는 밀어 올린 스택을 되돌려 친구 탭으로 간다(딥링크로 바로 들어와
// 되돌릴 곳이 없으면 backHref가 친구 탭을 연다). 데이터는 친구 탭과 같은 훅 — 20초마다
// 새로 고치는 것까지 같다.

export default function FriendRankingScreen() {
  const { error, leaderboard, loadFriends, loading, profile } = useFriendsScreen();

  if (loading) {
    return <BrandLoadingView />;
  }

  return (
    <Screen>
      <AuthHeader showBack backHref="/(tabs)/friends" />

      {error ? (
        <Card>
          <Text style={styles.errorTitle}>친구 순위를 아직 못 불러왔어</Text>
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton label="다시 불러오기" onPress={loadFriends} />
        </Card>
      ) : null}

      {leaderboard && profile ? (
        <FriendsRanking ranks={leaderboard.ranks} highlightTag={profile.publicTag} />
      ) : null}
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
