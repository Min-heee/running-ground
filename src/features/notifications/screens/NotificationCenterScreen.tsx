import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';

import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { AnnouncementList } from '@/features/notifications/components/AnnouncementList';
import { InboxList } from '@/features/notifications/components/InboxList';
import {
  NOTIFICATION_CENTER_TABS,
  normalizeInitialTab,
  resolveNotificationHref,
  type NotificationCenterTab,
} from '@/features/notifications/utils/notificationCenter';
import {
  fetchActiveNotices,
  deleteInbox,
  fetchInbox,
  getApiErrorMessage,
  markInboxRead,
  type InboxNotification,
} from '@/services';
import { setAppIconBadge } from '@/lib/push/appBadge';
import type { AppNotice } from '@/domain';

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

  // 안 읽은 수가 바뀔 때마다 앱 아이콘 배지(카카오톡식 숫자)도 함께 맞춘다.
  const applyUnreadCount = useCallback((count: number) => {
    setUnreadCount(count);
    void setAppIconBadge(count);
  }, []);

  const loadNotices = useCallback(() => {
    setNoticesLoading(true);
    setNoticesError(null);

    fetchActiveNotices()
      .then((payload) => setNotices(payload.items))
      .catch((error) => setNoticesError(getApiErrorMessage(error, '공지사항을 불러오지 못했어요.')))
      .finally(() => setNoticesLoading(false));
  }, []);

  const loadInbox = useCallback(() => {
    setInboxLoading(true);
    setInboxError(null);

    fetchInbox()
      .then((payload) => {
        setInboxItems(payload.items);
        applyUnreadCount(payload.unreadCount);
      })
      .catch((error) => setInboxError(getApiErrorMessage(error, '알림을 불러오지 못했어요.')))
      .finally(() => setInboxLoading(false));
  }, [applyUnreadCount]);

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
        applyUnreadCount(payload.unreadCount);
      })
      .catch((error) => setInboxError(getApiErrorMessage(error, '알림 삭제에 실패했어요.')));
  }, [applyUnreadCount]);

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
              applyUnreadCount(payload.unreadCount);
            })
            .catch((error) => setInboxError(getApiErrorMessage(error, '알림 삭제에 실패했어요.')));
        },
      },
    ]);
  }, [applyUnreadCount]);

  const handleMarkAllRead = useCallback(() => {
    markInboxRead()
      .then((payload) => {
        const readAt = new Date().toISOString();
        setInboxItems((currentItems) => currentItems.map((item) => (
          item.readAt ? item : { ...item, readAt }
        )));
        applyUnreadCount(payload.unreadCount);
      })
      .catch((error) => setInboxError(getApiErrorMessage(error, '알림 읽음 처리에 실패했어요.')));
  }, [applyUnreadCount]);

  const handlePressNotification = useCallback((item: InboxNotification) => {
    markInboxRead([item.id])
      .then((payload) => {
        const readAt = new Date().toISOString();
        setInboxItems((currentItems) => currentItems.map((currentItem) => (
          currentItem.id === item.id ? { ...currentItem, readAt: currentItem.readAt ?? readAt } : currentItem
        )));
        applyUnreadCount(payload.unreadCount);

        const href = resolveNotificationHref(item);
        if (href) {
          router.push(href);
        }
      })
      .catch((error) => setInboxError(getApiErrorMessage(error, '알림 읽음 처리에 실패했어요.')));
  }, [applyUnreadCount]);

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
