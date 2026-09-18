import { memo, useCallback } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Card } from '@/components/Card';
import type { FriendLeaderboardResponse } from '@/lib/api/types';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type FriendRankItem = FriendLeaderboardResponse['ranks'][number];

type FriendListCardProps = {
  friends: FriendRankItem[];
  creatingPartyRunFriendId: string | null;
  receivedRequestCount: number;
  onOpenFriend: (friendId: string) => void;
  onStartPartyRun: (friendId: string) => void;
  onOpenRequests: () => void;
};

type FriendListRowProps = {
  friend: FriendRankItem;
  isCreatingPartyRun: boolean;
  onOpenFriend: (friendId: string) => void;
  onStartPartyRun: (friendId: string) => void;
};

const FriendListRow = memo(function FriendListRow({
  friend,
  isCreatingPartyRun,
  onOpenFriend,
  onStartPartyRun,
}: FriendListRowProps) {
  const handleOpen = useCallback(() => {
    onOpenFriend(friend.id);
  }, [friend.id, onOpenFriend]);
  const handleStartPartyRun = useCallback(() => {
    onStartPartyRun(friend.id);
  }, [friend.id, onStartPartyRun]);
  const handleOpenLiveRun = useCallback(() => {
    router.push({ pathname: '/friend-live', params: { friendId: friend.id, friendName: friend.name } } as never);
  }, [friend.id, friend.name]);

  return (
    <View style={styles.friendItem}>
      <View style={styles.compareRow}>
        <Pressable style={styles.friendPrimaryAction} onPress={handleOpen}>
          <View style={styles.requestMeta}>
            <View style={styles.friendRowHeader}>
              {/* '달리는 중'은 오른쪽 초록 원 하나가 말한다 (오너 2026-09-18 '친구 정돈') —
                  이름 앞 점과 '위치 공유 중' 글자까지 셋이 같은 말을 하고 있었다. */}
              <Text style={styles.requestName}>{friend.name}</Text>
              {friend.rankTier ? <Text style={styles.metaChip}>{friend.rankTier}</Text> : null}
              {/* 지역 = 시/도 + 시·군·구 (서버가 우리 지역 체계 2단계로 만들어 보낸 라벨).
                  구버전 서버 응답에는 regionLabel이 없어 districtName으로 폴백. */}
              {friend.regionLabel ?? friend.districtName ? (
                <Text style={styles.metaText} numberOfLines={1}>
                  {friend.regionLabel ?? friend.districtName}
                </Text>
              ) : null}
              {friend.statusMessage ? (
                <Text style={styles.statusMessage} numberOfLines={1}>
                  {friend.statusMessage}
                </Text>
              ) : null}
            </View>
          </View>
        </Pressable>

        <View style={styles.friendRowActions}>
          {/* 이 친구와 파티런 1대1 — 방을 만들고 초대 알림까지 한 번에. */}
          <Pressable
            style={[styles.partyRunButton, isCreatingPartyRun ? styles.partyRunButtonBusy : null]}
            onPress={handleStartPartyRun}
            disabled={isCreatingPartyRun}
            accessibilityRole="button"
            accessibilityLabel={`${friend.name}님과 파티런 1대1`}
            hitSlop={6}
          >
            <MaterialCommunityIcons name="run" size={16} color={colors.white} />
          </Pressable>

          {/* 라이브 러닝 (오너 2026-07-31): 색이 곧 상태 — 켜져 있으면(달리는 중) 초록,
              아니면 회색. 켜져 있을 때 누르면 실시간 지도 + 응원 화면으로. */}
          <Pressable
            style={[styles.liveButton, friend.isRunningNow ? styles.liveButtonOn : styles.liveButtonOff]}
            onPress={friend.isRunningNow ? handleOpenLiveRun : undefined}
            disabled={!friend.isRunningNow}
            accessibilityRole="button"
            accessibilityLabel={friend.isRunningNow ? `${friend.name}님의 라이브 러닝 보기` : `${friend.name}님은 지금 달리지 않아요`}
            hitSlop={6}
          >
            <MaterialCommunityIcons
              name="map-marker-radius"
              size={16}
              color={friend.isRunningNow ? colors.successOnFill : colors.textTertiary}
            />
          </Pressable>
        </View>
      </View>

    </View>
  );
});

export function FriendListCard({
  friends,
  creatingPartyRunFriendId,
  receivedRequestCount,
  onOpenFriend,
  onStartPartyRun,
  onOpenRequests,
}: FriendListCardProps) {
  return (
    <Card>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.sectionTitle}>친구</Text>
        {/* 요청 처리(수락/거절/취소)는 별도 화면으로 — 받은 요청이 있으면 개수 배지. */}
        <Pressable style={styles.requestsButton} onPress={onOpenRequests} accessibilityRole="button">
          <Text style={styles.requestsButtonText}>친구 요청 상태</Text>
          {receivedRequestCount > 0 ? (
            <View style={styles.requestsBadge}>
              <Text style={styles.requestsBadgeText}>{receivedRequestCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      {friends.map((friend) => (
        <FriendListRow
          key={friend.id}
          friend={friend}
          isCreatingPartyRun={creatingPartyRunFriendId === friend.id}
          onOpenFriend={onOpenFriend}
          onStartPartyRun={onStartPartyRun}
        />
      ))}
      {friends.length === 0 ? <Text style={styles.emptyText}>아직 비교할 친구 기록이 없어요.</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  requestsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.brandWash,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.md,
  },
  requestsButtonText: {
    color: colors.brandStrong,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  requestsBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  requestsBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: fontWeights.extraBold,
  },
  sectionTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
  compareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.s12,
    gap: spacing.s12,
  },
  friendItem: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  friendPrimaryAction: {
    flex: 1,
  },
  statusMessage: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    flexShrink: 1,
    lineHeight: 20,
    includeFontPadding: false,
  },
  metaChip: {
    color: colors.brandStrong,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    backgroundColor: colors.brandWash,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s10,
    paddingVertical: 2,
    overflow: 'hidden',
    includeFontPadding: false,
  },
  metaText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    flexShrink: 1,
    lineHeight: 20,
    includeFontPadding: false,
  },
  // 오너 2026-07-31: 러닝 신청 버튼을 조금 줄이고, 같은 크기의 라이브 버튼과 나란히.
  partyRunButton: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  liveButton: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ON = 달리는 중 (초록), OFF = 회색.
  liveButtonOn: {
    backgroundColor: colors.successStrong,
  },
  liveButtonOff: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  partyRunButtonBusy: {
    opacity: 0.5,
  },
  friendRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxl,
    alignSelf: 'center',
  },
  requestMeta: {
    flex: 1,
    gap: spacing.xxs,
  },
  friendRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxl,
    flexWrap: 'wrap',
  },
  requestName: {
    color: colors.textPrimary,
    // 오너 2026-07-29: 친구 이름을 한 급 키운다 (행의 앵커).
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.extraBold,
    lineHeight: 20,
    includeFontPadding: false,
  },
  emptyText: {
    color: colors.textSecondary,
    marginTop: spacing.s10,
  },
});
