import { useEffect } from 'react';
import { Platform } from 'react-native';
import { rgPerfMark } from '@/utils/rgPerfTrace';

function buildNotificationTraceDetail(data: unknown) {
  const payload = typeof data === 'object' && data !== null
    ? data as Record<string, unknown>
    : {};
  const roomId = typeof payload.roomId === 'string' ? payload.roomId : null;
  const matchId = typeof payload.matchId === 'string' ? payload.matchId : null;
  const kind = typeof payload.kind === 'string' ? payload.kind : null;
  const inviteToken = typeof payload.inviteToken === 'string' ? payload.inviteToken : null;

  return {
    hasInviteToken: Boolean(inviteToken),
    inviteTokenLength: inviteToken?.length ?? null,
    kind,
    matchId,
    roomId,
  };
}

export function useConfigureNotificationHandler() {
  useEffect(() => {
    let receivedSubscription: { remove: () => void } | null = null;
    let responseSubscription: { remove: () => void } | null = null;
    let cancelled = false;

    void import('expo-notifications')
      .then((Notifications) => {
        if (cancelled) {
          return;
        }

        if (Platform.OS !== 'ios') {
          Notifications.setNotificationHandler({
            handleNotification: async () => ({
              shouldShowBanner: true,
              shouldShowList: true,
              shouldPlaySound: true,
              shouldSetBadge: false,
            }),
          });
        }

        receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
          rgPerfMark('push notification received', buildNotificationTraceDetail(notification.request.content.data));
        });
        responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
          rgPerfMark('notification tap open room', buildNotificationTraceDetail(response.notification.request.content.data));
        });
      })
      .catch(() => {
        // Older binaries may not have the native notification module yet.
      });

    return () => {
      cancelled = true;
      receivedSubscription?.remove();
      responseSubscription?.remove();
    };
  }, []);
}
