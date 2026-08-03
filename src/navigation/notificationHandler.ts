import { useEffect } from 'react';
import { router } from 'expo-router';
import { fetchUpcomingRunningMatches } from '@/services/matchService';
import {
  buildMatchReminderRouteTarget,
  buildMatchResultRouteTarget,
  buildNotificationTraceDetail,
  findRecoveredMatchById,
  isMatchReminderMissingRoomId,
  isMatchReminderNotification,
  isMatchResultNotification,
  shouldSkipDuplicateMatchReminderNotification,
  shouldSkipDuplicateMatchResultNotification,
  type NotificationTraceDetail,
  type MatchReminderNotificationPhase,
} from '@/navigation/matchReminderNotificationRouting';
import { resolveUserNotificationPushHref } from '@/navigation/userNotificationPushRouting';
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

// A confirmed-result push must open the dedicated match-result screen and RETURN —
// it must never fall through to the live-arena / forceMatchArena reminder path.
// Returns true when the tap was a result notification (handled or skipped).
function handleMatchResultTap(detail: NotificationTraceDetail) {
  if (!isMatchResultNotification(detail)) {
    return false;
  }

  if (shouldSkipDuplicateMatchResultNotification(detail, 'tap')) {
    return true;
  }

  const routeTarget = buildMatchResultRouteTarget(detail);
  if (!routeTarget) {
    return true;
  }

  rgPerfMark('notification tap open match result', {
    matchId: detail.matchId,
    mode: detail.mode,
    type: detail.type,
  });
  router.push(routeTarget);
  return true;
}

async function handleMatchReminderTap(detail: NotificationTraceDetail) {
  if (handleMatchResultTap(detail)) {
    return;
  }

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

        // Show foreground banners on both platforms. Live-match gap notifications are
        // meant to surface even while the runner has the arena open ("항상 띄움"); iOS
        // suppresses foreground notifications unless a handler opts in.
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });

        receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
          handleMatchReminderReceived(buildNotificationTraceDetail(notification.request.content.data));
        });
        responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data;

          // 서버발 알림 푸시(공지/친구/대결 결과 등, data.type 체계) → 알림센터로.
          // 매치 리마인더 로컬 알림(data.kind 체계)은 아래 기존 라우팅이 처리한다.
          const userNotificationHref = resolveUserNotificationPushHref(data);
          if (userNotificationHref) {
            rgPerfMark('notification tap open center', { type: (data as { type?: string })?.type });
            router.push(userNotificationHref);
            return;
          }

          const detail = buildNotificationTraceDetail(data);
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
