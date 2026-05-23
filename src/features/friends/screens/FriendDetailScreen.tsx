import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';
import {
  type FriendActivityRun,
  formatFriendActivityRefreshTime,
  useFriendDetail,
} from '@/features/friends/hooks/useFriendDetail';

const FriendActivityRunRow = memo(function FriendActivityRunRow({
  run,
  friendId,
}: {
  run: FriendActivityRun;
  friendId: string;
}) {
  return (
    <Link
      href={{ pathname: '/run-detail', params: { runId: run.id, friendId } }}
      asChild
    >
      <Pressable style={styles.recordRow}>
        <View style={styles.recordMeta}>
          <Text style={styles.recordDate}>{run.date}</Text>
          <Text style={styles.recordDetail}>{run.distanceKm}km · 페이스 {run.pace}</Text>
        </View>
        <Text style={styles.recordLink}>보기</Text>
      </Pressable>
    </Link>
  );
});

export default function FriendDetailScreen() {
  const { friendId } = useLocalSearchParams<{ friendId?: string }>();
  const { activity, activityRuns, error, lastRefreshedAt, loading } = useFriendDetail(friendId);
  const activeFriendId = activity?.friend.id ?? '';

  return (
    <Screen>
      {loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}
      {error ? <Text>{error}</Text> : null}

      {activity ? (
        <>
          <AuthHeader
            title="친구 활동"
            subtitle={activity.friend.isRunningNow
              ? `${activity.friend.name} 님이 지금 달리는 중이라 최근 기록과 실시간 위치 공유 상태를 함께 볼 수 있어요.`
              : `${activity.friend.name}가 최근에 뛴 기록과 이번 달 누적 거리를 볼 수 있어.`}
            showBack
            backHref="/(tabs)/friends"
          />

          <Card style={styles.heroCard}>
            <Text style={styles.heroLabel}>친구 프로필</Text>
            <Text style={styles.heroTitle}>{activity.friend.name}</Text>
            <Text style={styles.heroTag}>{activity.friend.tag}</Text>
          </Card>

          {activity.friend.isRunningNow ? (
            <Card style={styles.liveCard}>
              <View style={styles.liveHeader}>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveBadgeText}>러닝 중</Text>
                </View>
                <Text style={styles.liveRefreshText}>{formatFriendActivityRefreshTime(lastRefreshedAt)}</Text>
              </View>
              <Text style={styles.liveLocation}>{activity.friend.liveLocationLabel ?? '현재 위치 근처'}</Text>
              <Text style={styles.liveHint}>
                정확한 좌표 대신 동네 단위로만 보여드리고, 이 화면은 20초마다 자동으로 새로고침돼요.
              </Text>
            </Card>
          ) : null}

          <View style={styles.summaryRow}>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>이번 달 총 거리</Text>
              <Text style={styles.summaryValue}>{activity.monthlyDistanceKm}km</Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>이번 달 포인트</Text>
              <Text style={styles.summaryValue}>{activity.monthlyPoints}P</Text>
            </Card>
          </View>

          <Card>
            <Text style={styles.sectionTitle}>최근 러닝 기록</Text>
            {activityRuns.map((run) => (
              <FriendActivityRunRow key={run.id} run={run} friendId={activeFriendId} />
            ))}
          </Card>

          <SecondaryButton label="친구 화면으로 돌아가기" onPress={() => router.replace('/(tabs)/friends')} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.textPrimary,
    gap: spacing.xxl,
  },
  heroLabel: {
    color: colors.brandLighter,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  heroTitle: {
    color: colors.white,
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.extraBold,
  },
  heroTag: {
    color: colors.textTertiary,
    fontWeight: fontWeights.bold,
  },
  liveCard: {
    backgroundColor: colors.successCard,
    gap: spacing.s10,
  },
  liveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.successSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.lg,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.success,
  },
  liveBadgeText: {
    color: colors.successText,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    includeFontPadding: false,
  },
  liveRefreshText: {
    color: colors.successStrong,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    includeFontPadding: false,
  },
  liveLocation: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: fontWeights.extraBold,
    includeFontPadding: false,
  },
  liveHint: {
    color: colors.successStrong,
    lineHeight: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  summaryCard: {
    flex: 1,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontWeight: fontWeights.bold,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: fontWeights.extraBold,
  },
  sectionTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
  recordRow: {
    paddingVertical: spacing.s12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  recordMeta: {
    gap: spacing.xxs,
    flex: 1,
  },
  recordDate: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  recordDetail: {
    color: colors.textSecondary,
  },
  recordLink: {
    color: colors.brand,
    fontWeight: fontWeights.extraBold,
  },
});
