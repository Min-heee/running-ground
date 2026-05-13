import { memo, useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ListRenderItem } from 'react-native';

import { Card } from '@/components/Card';
import type { FriendLeaderboardResponse } from '@/lib/api/types';

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
    color: '#111827',
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
    borderBottomColor: '#EAECF0',
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
    backgroundColor: '#12B76A',
    shadowColor: '#12B76A',
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  friendLiveLabel: {
    color: '#067647',
    fontSize: 12,
    fontWeight: '700',
    includeFontPadding: false,
  },
  requestName: {
    color: '#111827',
    fontWeight: '700',
  },
  requestDetail: {
    color: '#667085',
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#FFFFFF',
  },
  locationButtonActive: {
    borderColor: '#ABEFC6',
    backgroundColor: '#ECFDF3',
  },
  locationButtonDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#12B76A',
  },
  locationButtonText: {
    color: '#344054',
    fontSize: 12,
    fontWeight: '700',
    includeFontPadding: false,
  },
  locationButtonTextActive: {
    color: '#067647',
  },
  friendDetailButton: {
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  compareLink: {
    color: '#6D5EF7',
    fontWeight: '800',
  },
  liveLocationPanel: {
    marginBottom: 14,
    marginTop: -2,
    marginLeft: 2,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    backgroundColor: '#12B76A',
  },
  liveLocationTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
    includeFontPadding: false,
  },
  liveLocationText: {
    color: '#475467',
    lineHeight: 20,
  },
  emptyText: {
    color: '#667085',
    marginTop: 10,
  },
});
