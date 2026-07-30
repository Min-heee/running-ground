import { memo } from 'react';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

import type { InboxNotificationType } from '@/services';
import { colors, fontSizes } from '@/theme/tokens';

type NotificationTypeIconProps = {
  type: InboxNotificationType;
  unread: boolean;
};

export const NotificationTypeIcon = memo(function NotificationTypeIcon({ type, unread }: NotificationTypeIconProps) {
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
        : type === 'inquiry_reply'
          ? 'message-circle'
          : type === 'chase_settlement'
            ? 'target'
            : 'trending-up';

  return <Feather name={iconName} size={fontSizes.title} color={iconColor} />;
});
