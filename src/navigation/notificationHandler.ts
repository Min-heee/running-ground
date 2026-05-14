import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { fetchUpcomingRunningMatches } from '@/services/matchService';
import {
  buildMatchReminderRouteTarget,
  buildNotificationTraceDetail,
  findRecoveredMatchById,
  isMatchReminderMissingRoomId,
  isMatchReminderNotification,
  shouldSkipDuplicateMatchReminderNotification,
  type NotificationTraceDetail,
  type MatchReminderNotificationPhase,
} from '@/navigation/matchReminderNotificationRouting';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';

async function recoverMatchReminderByMatchId(
  detail: NotificationTraceDetail,
  source: MatchReminderNotificationPhase,
) {
  if (!detail.matchId) {
    return null;
  }

  rgPerfMark('push notification missing roomId fallback by matchId', {
    kind: detail.kind,
    matchId: detail.matchId,
    source,
  });

  const endTrace = rgPerfMeasureStart('push notification recovery match fetch', {
    matchId: detail.matchId,
    source,
  });

  try {
    const payload = await fetchUpcomingRunningMatches();
    const match = findRecoveredMatchById(payload.items, detail.matchId);
    endTrace({
      found: Boolean(match),
      roomId: match?.roomId ?? null,
      success: true,
    });
    return match;
  } catch {
    endTrace({
      found: false,
      success: false,
    });
    return null;
  }
}

function shouldSkipNotification(detail: NotificationTraceDetail, phase: MatchReminderNotificationPhase) {
  if (!shouldSkipDuplicateMatchReminderNotification(detail, phase)) {
    return false;
  }

  rgPerfMark('push notification skipped duplicate', {
    kind: detail.kind,
    matchId: detail.matchId,
    phase,
    roomId: detail.roomId,
  });

  return true;
}

async function handleMatchReminderTap(detail: NotificationTraceDetail) {
  if (!isMatchReminderNotification(detail)) {
    return;
  }

  if (shouldSkipNotification(detail, 'tap')) {
    return;
  }

  const recoveredMatch = isMatchReminderMissingRoomId(detail)
    ? await recoverMatchReminderByMatchId(detail, 'tap')
    : null;

  if (isMatchReminderMissingRoomId(detail) && !recoveredMatch) {
    return;
  }

  const routeTarget = buildMatchReminderRouteTarget(detail, recoveredMatch);
  if (!routeTarget) {
    return;
  }

  router.push(routeTarget);
}

function handleMatchReminderReceived(detail: NotificationTraceDetail) {
  if (!isMatchReminderNotification(detail)) {
    rgPerfMark('push notification received', detail);
    return;
  }

  if (shouldSkipNotification(detail, 'received')) {
    return;
  }

  rgPerfMark('push notification received', detail);

  if (isMatchReminderMissingRoomId(detail)) {
    void recoverMatchReminderByMatchId(detail, 'received');
  }
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
          handleMatchReminderReceived(buildNotificationTraceDetail(notification.request.content.data));
        });
        responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
          const detail = buildNotificationTraceDetail(response.notification.request.content.data);
          rgPerfMark('notification tap open room', detail);
          void handleMatchReminderTap(detail);
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
