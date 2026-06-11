import { useCallback, useEffect, useMemo, useState } from 'react';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { HomeNoticeCard } from '@/features/home/components/HomeNoticeCard';
import {
  fetchActiveNotices,
  deleteInbox,
  fetchInbox,
  getApiErrorMessage,
  markInboxRead,
  type InboxNotification,
  type InboxNotificationType,
} from '@/services';
import type { AppNotice } from '@/domain';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type NotificationCenterTab = 'announcements' | 'notifications';

const NOTIFICATION_CENTER_TABS = [
  { key: 'announcements', label: '공지사항' },
  { key: 'notifications', label: '알림' },
] as const;

function normalizeInitialTab(tab?: string | string[]): NotificationCenterTab {
  const value = Array.isArray(tab) ? tab[0] : tab;
  return value === 'notifications' ? 'notifications' : 'announcements';
}

function formatRelativeTime(createdAt: string) {
  const createdMs = Date.parse(createdAt);

  if (!Number.isFinite(createdMs)) {
    return '';
  }

  const diffMinutes = Math.max(0, Math.floor((Date.now() - createdMs) / 60_000));

  if (diffMinutes < 1) {
    return '방금 전';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}분 전`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}시간 전`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}일 전`;
}

function getNotificationTypeLabel(type: InboxNotificationType) {
  switch (type) {
    case 'match_invite':
      return '초대';
    case 'match_result':
      return '결과';
    case 'friend_request':
      return '친구 요청';
    case 'friend_accepted':
      return '친구 수락';
    case 'rank_change':
      return '랭크';
    default:
      return '알림';
  }
}

function resolveNotificationHref(notification: InboxNotification): Href | null {
  const data = notification.data;

  if (!data) {
    return null;
  }

  if (typeof data.roomId === 'string' && data.roomId.trim()) {
    return '/match-room';
  }

  if (typeof data.matchId === 'string' && data.matchId.trim()) {
    return {
      pathname: '/(tabs)/running',
      params: {
        focusMatchId: data.matchId,
        focusMatchMode: data.mode === 'group' ? 'group' : 'duel',
        forceMatchArena: '1',
        focusMatchNonce: String(Date.now()),
      },
    };
  }

  if (typeof data.friendUserId === 'string' && data.friendUserId.trim()) {
    return {
      pathname: '/friend-detail',
      params: { friendId: data.friendUserId },
    };
  }

  return null;
}

function NotificationTypeIcon({ type, unread }: { type: InboxNotificationType; unread: boolean }) {
  const iconColor = unread ? colors.brand : colors.textSecondary;

  if (type === 'match_invite') {
    return <MaterialCommunityIcons name="bullhorn-outline" size={fontSizes.title} color={iconColor} />;
  }

  const iconName = type === 'match_result'
    ? 'flag'
    : type === 'friend_request'
      ? 'user-plus'
      : type === 'friend_accepted'
        ? 'user-check'
        : 'trending-up';

  return <Feather name={iconName} size={fontSizes.title} color={iconColor} />;
}

function AnnouncementList({
  error,
  loading,
  notices,
}: {
  error: string | null;
  loading: boolean;
  notices: AppNotice[];
}) {
  if (loading) {
    return <ActivityIndicator size="large" color={colors.brand} />;
  }

  if (error) {
    return <Text style={styles.errorText}>{error}</Text>;
  }

  if (!notices.length) {
    return (
      <Card style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>새 공지사항이 없어요.</Text>
        <Text style={styles.emptyText}>중요한 운영 소식이 생기면 이곳에 모아둘게요.</Text>
      </Card>
    );
  }

  return (
    <>
      {notices.map((notice) => (
        <HomeNoticeCard key={notice.id} notice={notice} />
      ))}
    </>
  );
}

function InboxList({
  error,
  items,
  loading,
  onDeleteAll,
  onDeleteItem,
  onMarkAllRead,
  onPressItem,
  unreadCount,
}: {
  error: string | null;
  items: InboxNotification[];
  loading: boolean;
  onDeleteAll: () => void;
  onDeleteItem: (item: InboxNotification) => void;
  onMarkAllRead: () => void;
  onPressItem: (item: InboxNotification) => void;
  unreadCount: number;
}) {
  if (loading) {
    return <ActivityIndicator size="large" color={colors.brand} />;
  }

  if (error) {
    return <Text style={styles.errorText}>{error}</Text>;
  }

  return (
    <Card style={styles.inboxCard}>
      <View style={styles.inboxHeader}>
        <View>
          <Text style={styles.sectionTitle}>내 알림</Text>
          <Text style={styles.sectionHint}>읽지 않은 알림 {unreadCount}개</Text>
        </View>
        <View style={styles.inboxHeaderActions}>
          {unreadCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={onMarkAllRead}
              style={styles.markAllButton}
            >
              <Text style={styles.markAllButtonText}>모두 읽음</Text>
            </Pressable>
          ) : null}
          {items.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={onDeleteAll}
              style={styles.markAllButton}
            >
              <Text style={styles.deleteAllButtonText}>모두 삭제</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {items.length ? (
        items.map((item) => (
          <NotificationRow key={item.id} item={item} onDelete={onDeleteItem} onPress={onPressItem} />
        ))
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>새 알림이 없어요.</Text>
          <Text style={styles.emptyText}>초대, 대결 결과, 친구 소식이 생기면 여기에서 볼 수 있어요.</Text>
        </View>
      )}
    </Card>
  );
}

function NotificationRow({
  item,
  onDelete,
  onPress,
}: {
  item: InboxNotification;
  onDelete: (item: InboxNotification) => void;
  onPress: (item: InboxNotification) => void;
}) {
  const unread = item.readAt === null;
  const relativeTime = formatRelativeTime(item.createdAt);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(item)}
      style={[styles.notificationRow, unread ? styles.notificationRowUnread : null]}
    >
      <View style={[styles.notificationIconWrap, unread ? styles.notificationIconWrapUnread : null]}>
        <NotificationTypeIcon type={item.type} unread={unread} />
      </View>
      <View style={styles.notificationCopy}>
        <View style={styles.notificationMetaRow}>
          <Text style={styles.notificationType}>{getNotificationTypeLabel(item.type)}</Text>
          {relativeTime ? <Text style={styles.notificationTime}>{relativeTime}</Text> : null}
        </View>
        <Text style={styles.notificationTitle}>{item.title}</Text>
        <Text style={styles.notificationBody}>{item.body}</Text>
      </View>
      {unread ? <View style={styles.unreadDot} /> : null}
      <Pressable
        accessibilityLabel="알림 삭제"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => onDelete(item)}
        style={styles.notificationDeleteButton}
      >
        <Feather name="x" size={fontSizes.md} color={colors.textSecondary} />
      </Pressable>
    </Pressable>
  );
}

export default function NotificationCenterScreen() {
  const { tab } = useLocalSearchParams<{ tab?: NotificationCenterTab }>();
  const [activeTab, setActiveTab] = useState<NotificationCenterTab>(() => normalizeInitialTab(tab));
  const [notices, setNotices] = useState<AppNotice[]>([]);
  const [noticesLoading, setNoticesLoading] = useState(false);
  const [noticesError, setNoticesError] = useState<string | null>(null);
  const [inboxItems, setInboxItems] = useState<InboxNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(normalizeInitialTab(tab));
  }, [tab]);

  const loadNotices = useCallback(() => {
    setNoticesLoading(true);
    setNoticesError(null);

    fetchActiveNotices()
      .then((payload) => setNotices(payload.items))
      .catch((error) => setNoticesError(getApiErrorMessage(error, '공지사항을 불러오지 못했어.')))
      .finally(() => setNoticesLoading(false));
  }, []);

  const loadInbox = useCallback(() => {
    setInboxLoading(true);
    setInboxError(null);

    fetchInbox()
      .then((payload) => {
        setInboxItems(payload.items);
        setUnreadCount(payload.unreadCount);
      })
      .catch((error) => setInboxError(getApiErrorMessage(error, '알림을 불러오지 못했어.')))
      .finally(() => setInboxLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === 'announcements') {
      loadNotices();
      return;
    }

    loadInbox();
  }, [activeTab, loadInbox, loadNotices]);

  const handleDeleteItem = useCallback((item: InboxNotification) => {
    deleteInbox([item.id])
      .then((payload) => {
        setInboxItems((currentItems) => currentItems.filter((current) => current.id !== item.id));
        setUnreadCount(payload.unreadCount);
      })
      .catch((error) => setInboxError(getApiErrorMessage(error, '알림 삭제에 실패했어.')));
  }, []);

  const handleDeleteAll = useCallback(() => {
    Alert.alert('알림 모두 삭제', '받은 알림을 모두 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '모두 삭제',
        style: 'destructive',
        onPress: () => {
          deleteInbox()
            .then((payload) => {
              setInboxItems([]);
              setUnreadCount(payload.unreadCount);
            })
            .catch((error) => setInboxError(getApiErrorMessage(error, '알림 삭제에 실패했어.')));
        },
      },
    ]);
  }, []);

  const handleMarkAllRead = useCallback(() => {
    markInboxRead()
      .then((payload) => {
        const readAt = new Date().toISOString();
        setInboxItems((currentItems) => currentItems.map((item) => (
          item.readAt ? item : { ...item, readAt }
        )));
        setUnreadCount(payload.unreadCount);
      })
      .catch((error) => setInboxError(getApiErrorMessage(error, '알림 읽음 처리에 실패했어.')));
  }, []);

  const handlePressNotification = useCallback((item: InboxNotification) => {
    markInboxRead([item.id])
      .then((payload) => {
        const readAt = new Date().toISOString();
        setInboxItems((currentItems) => currentItems.map((currentItem) => (
          currentItem.id === item.id ? { ...currentItem, readAt: currentItem.readAt ?? readAt } : currentItem
        )));
        setUnreadCount(payload.unreadCount);

        const href = resolveNotificationHref(item);
        if (href) {
          router.push(href);
        }
      })
      .catch((error) => setInboxError(getApiErrorMessage(error, '알림 읽음 처리에 실패했어.')));
  }, []);

  const headerSubtitle = useMemo(
    () => activeTab === 'announcements'
      ? '운영 공지와 점검 소식을 확인해요.'
      : '초대, 친구, 대결 결과를 한곳에 모았어요.',
    [activeTab],
  );

  return (
    <Screen scrollToTopKey={activeTab}>
      <AuthHeader
        title="알림센터"
        subtitle={headerSubtitle}
        showBack
        backHref="/(tabs)/home"
      />

      <SegmentedTabs
        options={NOTIFICATION_CENTER_TABS}
        value={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'announcements' ? (
        <AnnouncementList
          error={noticesError}
          loading={noticesLoading}
          notices={notices}
        />
      ) : (
        <InboxList
          error={inboxError}
          items={inboxItems}
          loading={inboxLoading}
          onDeleteAll={handleDeleteAll}
          onDeleteItem={handleDeleteItem}
          onMarkAllRead={handleMarkAllRead}
          onPressItem={handlePressNotification}
          unreadCount={unreadCount}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
  },
  emptyCard: {
    gap: spacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.s20,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  emptyText: {
    color: colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
  },
  inboxCard: {
    gap: spacing.s14,
  },
  inboxHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.s12,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  sectionHint: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  markAllButton: {
    backgroundColor: colors.brandWash,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
  },
  markAllButtonText: {
    color: colors.brandStrong,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  inboxHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  deleteAllButtonText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  notificationDeleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: spacing.xs,
  },
  notificationRow: {
    alignItems: 'flex-start',
    borderColor: colors.borderSoft,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.s12,
    padding: spacing.s12,
  },
  notificationRowUnread: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brandSoftBorder,
  },
  notificationIconWrap: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.pill,
    height: spacing.s16 * 2,
    justifyContent: 'center',
    width: spacing.s16 * 2,
  },
  notificationIconWrapUnread: {
    backgroundColor: colors.brandWash,
  },
  notificationCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  notificationMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  notificationType: {
    color: colors.brand,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  notificationTime: {
    color: colors.textTertiary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  notificationTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.extraBold,
  },
  notificationBody: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  unreadDot: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    height: spacing.xxl,
    marginTop: spacing.xs,
    width: spacing.xxl,
  },
});
