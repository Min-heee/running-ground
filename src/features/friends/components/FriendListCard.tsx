import { memo, useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ListRenderItem } from 'react-native';

import { Card } from '@/components/Card';
import type { FriendLeaderboardResponse } from '@/lib/api/types';
import { colors } from '@/theme/tokens';

type FriendRankItem = FriendLeaderboardResponse['ranks'][number];

type FriendListCardProps = {
  friends: FriendRankItem[];
  expandedLiveFriendId: string | null;
  onToggleLiveFriend: (friendId: string) => void;
  onOpenFriend: (friendId: string) => void;
};

type FriendListRowProps = {
  friend: FriendRankItem;
  expanded: boolean;
  onToggleLiveFriend: (friendId: string) => void;
  onOpenFriend: (friendId: string) => void;
};

const FriendListRow = memo(function FriendListRow({
  friend,
  expanded,
  onToggleLiveFriend,
  onOpenFriend,
}: FriendListRowProps) {
  const handleOpen = useCallback(() => {
    onOpenFriend(friend.id);
  }, [friend.id, onOpenFriend]);
  const handleToggleLiveFriend = useCallback(() => {
    onToggleLiveFriend(friend.id);
  }, [friend.id, onToggleLiveFriend]);

  return (
    <View style={styles.friendItem}>
      <View style={styles.compareRow}>
        <Pressable style={styles.friendPrimaryAction} onPress={handleOpen}>
          <View style={styles.requestMeta}>
            <View style={styles.friendRowHeader}>
              {friend.isRunningNow ? <View style={styles.friendLiveDot} /> : null}
              <Text style={styles.requestName}>{friend.name}</Text>
              {friend.isRunningNow ? (
                <Text style={styles.friendLiveLabel}>위치 공유 중</Text>
              ) : null}
            </View>
            <Text style={styles.requestDetail}>{friend.tag}</Text>
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

          <Pressable style={styles.friendDetailButton} onPress={handleOpen}>
            <Text style={styles.compareLink}>보기</Text>
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
  onToggleLiveFriend,
  onOpenFriend,
}: FriendListCardProps) {
  const keyExtractor = useCallback((friend: FriendRankItem) => friend.id, []);
  const renderFriend = useCallback<ListRenderItem<FriendRankItem>>(({ item }) => (
    <FriendListRow
      friend={item}
      expanded={expandedLiveFriendId === item.id}
      onToggleLiveFriend={onToggleLiveFriend}
      onOpenFriend={onOpenFriend}
    />
  ), [expandedLiveFriendId, onOpenFriend, onToggleLiveFriend]);

  return (
    <Card>
      <Text style={styles.sectionTitle}>친구 목록</Text>
      <FlatList
        data={friends}
        keyExtractor={keyExtractor}
        renderItem={renderFriend}
        scrollEnabled={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
      />
      {friends.length === 0 ? <Text style={styles.emptyText}>아직 비교할 친구 기록이 없어.</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  compareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    gap: 12,
  },
  friendItem: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  friendPrimaryAction: {
    flex: 1,
  },
  friendRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
  },
  requestMeta: {
    flex: 1,
    gap: 2,
  },
  friendRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  friendLiveDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: colors.success,
    shadowColor: colors.success,
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  friendLiveLabel: {
    color: colors.successText,
    fontSize: 12,
    fontWeight: '700',
    includeFontPadding: false,
  },
  requestName: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  requestDetail: {
    color: colors.textSecondary,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: colors.white,
  },
  locationButtonActive: {
    borderColor: colors.successCardBorder,
    backgroundColor: colors.successCard,
  },
  locationButtonDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: colors.success,
  },
  locationButtonText: {
    color: colors.textStrongMuted,
    fontSize: 12,
    fontWeight: '700',
    includeFontPadding: false,
  },
  locationButtonTextActive: {
    color: colors.successText,
  },
  friendDetailButton: {
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  compareLink: {
    color: colors.brand,
    fontWeight: '800',
  },
  liveLocationPanel: {
    marginBottom: 14,
    marginTop: -2,
    marginLeft: 2,
    borderRadius: 16,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.indigoBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 5,
  },
  liveLocationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveLocationDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.success,
  },
  liveLocationTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    includeFontPadding: false,
  },
  liveLocationText: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  emptyText: {
    color: colors.textSecondary,
    marginTop: 10,
  },
});
