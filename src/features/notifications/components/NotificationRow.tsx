import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NotificationTypeIcon } from '@/features/notifications/components/NotificationTypeIcon';
import { formatRelativeTime, getNotificationTypeLabel } from '@/features/notifications/utils/notificationCenter';
import type { InboxNotification } from '@/services';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type NotificationRowProps = {
  item: InboxNotification;
  onDelete: (item: InboxNotification) => void;
  onPress: (item: InboxNotification) => void;
};

// NOT memo()'d on purpose: the row renders formatRelativeTime(item.createdAt)
// — a "5분 전" label derived from the CURRENT time, not from props — so it must
// re-render with the screen to keep relative timestamps fresh.
export function NotificationRow({
  item,
  onDelete,
  onPress,
}: NotificationRowProps) {
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

const styles = StyleSheet.create({
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
