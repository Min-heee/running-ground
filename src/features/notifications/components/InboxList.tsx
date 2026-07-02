import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { NotificationRow } from '@/features/notifications/components/NotificationRow';
import type { InboxNotification } from '@/services';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type InboxListProps = {
  error: string | null;
  items: InboxNotification[];
  loading: boolean;
  onDeleteAll: () => void;
  onDeleteItem: (item: InboxNotification) => void;
  onMarkAllRead: () => void;
  onPressItem: (item: InboxNotification) => void;
  unreadCount: number;
};

export const InboxList = memo(function InboxList({
  error,
  items,
  loading,
  onDeleteAll,
  onDeleteItem,
  onMarkAllRead,
  onPressItem,
  unreadCount,
}: InboxListProps) {
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
});

const styles = StyleSheet.create({
  errorText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
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
});
