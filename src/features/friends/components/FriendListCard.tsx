import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Card } from '@/components/Card';
import type { FriendLeaderboardResponse } from '@/lib/api/types';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type FriendRankItem = FriendLeaderboardResponse['ranks'][number];

type FriendListCardProps = {
  friends: FriendRankItem[];
  expandedLiveFriendId: string | null;
  creatingPartyRunFriendId: string | null;
  onToggleLiveFriend: (friendId: string) => void;
  onOpenFriend: (friendId: string) => void;
  onStartPartyRun: (friendId: string) => void;
};

type FriendListRowProps = {
  friend: FriendRankItem;
  expanded: boolean;
  isCreatingPartyRun: boolean;
  onToggleLiveFriend: (friendId: string) => void;
  onOpenFriend: (friendId: string) => void;
  onStartPartyRun: (friendId: string) => void;
};

const FriendListRow = memo(function FriendListRow({
  friend,
  expanded,
  isCreatingPartyRun,
  onToggleLiveFriend,
  onOpenFriend,
  onStartPartyRun,
}: FriendListRowProps) {
  const handleOpen = useCallback(() => {
    onOpenFriend(friend.id);
  }, [friend.id, onOpenFriend]);
  const handleToggleLiveFriend = useCallback(() => {
    onToggleLiveFriend(friend.id);
  }, [friend.id, onToggleLiveFriend]);
  const handleStartPartyRun = useCallback(() => {
    onStartPartyRun(friend.id);
  }, [friend.id, onStartPartyRun]);

  return (
    <View style={styles.friendItem}>
      <View style={styles.compareRow}>
        <Pressable style={styles.friendPrimaryAction} onPress={handleOpen}>
          <View style={styles.requestMeta}>
            <View style={styles.friendRowHeader}>
              {friend.isRunningNow ? <View style={styles.friendLiveDot} /> : null}
              <Text style={styles.requestName}>{friend.name}</Text>
              {friend.statusMessage ? (
                <Text style={styles.statusMessage} numberOfLines={1}>
                  {friend.statusMessage}
                </Text>
              ) : null}
              {friend.isRunningNow ? (
                <Text style={styles.friendLiveLabel}>위치 공유 중</Text>
              ) : null}
            </View>
          </View>
        </Pressable>

        <View style={styles.friendRowActions}>
          {friend.isRunningNow && friend.liveLocationLabel ? (
            <Pressable
              style={[
                styles.locationButton,
                expanded ? styles.locationButtonActive : null,
              ]}
              onPress={handleToggleLiveFriend}
            >
              <View style={styles.locationButtonDot} />
              <Text
                style={[
                  styles.locationButtonText,
                  expanded ? styles.locationButtonTextActive : null,
                ]}
              >
                {expanded ? '닫기' : '위치'}
              </Text>
            </Pressable>
          ) : null}

          {/* 이 친구와 파티런 1대1 — 방을 만들고 초대 알림까지 한 번에. */}
          <Pressable
            style={[styles.partyRunButton, isCreatingPartyRun ? styles.partyRunButtonBusy : null]}
            onPress={handleStartPartyRun}
            disabled={isCreatingPartyRun}
            accessibilityRole="button"
            accessibilityLabel={`${friend.name}님과 파티런 1대1`}
            hitSlop={6}
          >
            <MaterialCommunityIcons name="run" size={20} color={colors.white} />
          </Pressable>
        </View>
      </View>

      {expanded && friend.liveLocationLabel ? (
        <View style={styles.liveLocationPanel}>
          <View style={styles.liveLocationHeader}>
            <View style={styles.liveLocationDot} />
            <Text style={styles.liveLocationTitle}>{friend.name}님이 지금 뛰는 곳</Text>
          </View>
          <Text style={styles.liveLocationText}>{friend.liveLocationLabel}</Text>
        </View>
      ) : null}
    </View>
  );
});

export function FriendListCard({
  friends,
  expandedLiveFriendId,
  creatingPartyRunFriendId,
  onToggleLiveFriend,
  onOpenFriend,
  onStartPartyRun,
}: FriendListCardProps) {
  return (
    <Card>
      <Text style={styles.sectionTitle}>친구</Text>
      {friends.map((friend) => (
        <FriendListRow
          key={friend.id}
          friend={friend}
          expanded={expandedLiveFriendId === friend.id}
          isCreatingPartyRun={creatingPartyRunFriendId === friend.id}
          onToggleLiveFriend={onToggleLiveFriend}
          onOpenFriend={onOpenFriend}
          onStartPartyRun={onStartPartyRun}
        />
      ))}
      {friends.length === 0 ? <Text style={styles.emptyText}>아직 비교할 친구 기록이 없어요.</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
  compareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
  },
  partyRunButton: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
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
  friendLiveDot: {
    width: 9,
    height: 9,
    borderRadius: radii.pill,
    backgroundColor: colors.success,
    shadowColor: colors.success,
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  friendLiveLabel: {
    color: colors.successText,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    includeFontPadding: false,
  },
  requestName: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.s12,
    paddingVertical: 9,
    backgroundColor: colors.surface,
  },
  locationButtonActive: {
    borderColor: colors.successCardBorder,
    backgroundColor: colors.successCard,
  },
  locationButtonDot: {
    width: 7,
    height: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.success,
  },
  locationButtonText: {
    color: colors.textStrongMuted,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    includeFontPadding: false,
  },
  locationButtonTextActive: {
    color: colors.successText,
  },
  liveLocationPanel: {
    marginBottom: spacing.s14,
    marginTop: -2,
    marginLeft: spacing.xxs,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.indigoBorder,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s12,
    gap: spacing.md,
  },
  liveLocationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxl,
  },
  liveLocationDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.success,
  },
  liveLocationTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    includeFontPadding: false,
  },
  liveLocationText: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  emptyText: {
    color: colors.textSecondary,
    marginTop: spacing.s10,
  },
});
