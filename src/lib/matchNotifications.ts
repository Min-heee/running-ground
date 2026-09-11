import { Platform } from 'react-native';
import type { UpcomingRunningMatchItem } from '@/lib/api/types';
import { MATCH_REMINDER_OFFSETS_MINUTES } from '@/lib/matchNotificationOffsets';

export { MATCH_REMINDER_OFFSETS_MINUTES };

const MATCH_REMINDER_KIND = 'runningground-match-reminder';
const MATCH_REMINDER_CHANNEL_ID = 'runningground-match-reminders';

async function getNotificationsModule() {
  // DATE-trigger notifications are cross-platform; iOS schedules these the same as
  // Android (ensureMatchReminderPermissions requests iOS alert/sound permission too),
  // so we no longer short-circuit iOS here.
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

async function configureAndroidMatchReminderChannel(Notifications: Awaited<ReturnType<typeof getNotificationsModule>>) {
  if (!Notifications || Platform.OS !== 'android' || typeof Notifications.setNotificationChannelAsync !== 'function') {
    return;
  }

  await Notifications.setNotificationChannelAsync(MATCH_REMINDER_CHANNEL_ID, {
    name: '매치 알림',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function ensureMatchReminderPermissions() {
  const Notifications = await getNotificationsModule();

  if (!Notifications) {
    return false;
  }

  await configureAndroidMatchReminderChannel(Notifications);

  const currentPermission = await Notifications.getPermissionsAsync();
  if (currentPermission.granted) {
    return true;
  }

  const requestedPermission = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });

  return requestedPermission.granted;
}

function buildReminderTitle(match: UpcomingRunningMatchItem, minutesBefore: number) {
  const matchLabel = match.isPartyRun ? '파티런' : match.mode === 'duel' ? '1대1 대결' : '그룹 대결';

  if (minutesBefore <= 1) {
    return `${matchLabel} 곧 시작해요`;
  }

  return `${matchLabel} ${minutesBefore}분 전이에요`;
}

function buildReminderBody(match: UpcomingRunningMatchItem, minutesBefore: number) {
  // 오너 2026-08-13: 폰이 꺼진 채 슬롯을 맞으면 카운트다운이 무리다 — 5분 전엔 폰을 켜고
  // 앱을 열라고, 1분 전엔 앱을 켠 채 기다리라고 명시한다.
  const matchNoun = match.isPartyRun ? '파티런' : '대결';

  if (minutesBefore <= 1) {
    return `잠시 후 ${match.counterpartLabel}과 ${matchNoun}이 시작돼요. 앱을 켠 채로 기다려 주세요!`;
  }

  if (minutesBefore <= 5) {
    return `${minutesBefore}분 뒤 ${match.counterpartLabel}과 ${matchNoun}이 시작돼요. 핸드폰을 켜고 러닝그라운드 앱을 열어 주세요.`;
  }

  if (match.isPartyRun) {
    // summary는 이미 '파티런 · 9. 10. (목) 11:00 · 5.0km' 꼴 — 상대와 이어 붙이면 '파티런'이 두 번 찍힌다.
    return `${minutesBefore}분 뒤 ${match.counterpartLabel}과 파티런이 시작돼요 · ${match.slotLabel} · ${match.distanceKm.toFixed(1)}km`;
  }

  return `${minutesBefore}분 뒤 ${match.counterpartLabel}과 ${match.summary}가 시작돼요.`;
}

export async function syncScheduledMatchNotifications(matches: UpcomingRunningMatchItem[], enabled: boolean) {
  const Notifications = await getNotificationsModule();

  if (!Notifications) {
    return;
  }

  await configureAndroidMatchReminderChannel(Notifications);

  const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  const existingMatchNotifications = scheduledNotifications.filter((notification) => notification.content.data?.kind === MATCH_REMINDER_KIND);

  await Promise.all(
    existingMatchNotifications.map((notification) =>
      Notifications.cancelScheduledNotificationAsync(notification.identifier).catch(() => undefined)),
  );

  if (!enabled) {
    return;
  }

  const hasPermission = await ensureMatchReminderPermissions();
  if (!hasPermission) {
    return;
  }

  const now = Date.now();
  // 레이스 편성 세션 제외 (적대 검증 2026-08-13): 레이스는 자체 4연발(대기실 오픈·10/5/1분,
  // raceReminderNotification)이 슬롯의 주인이다 — 여기서 또 잡으면 5분/1분에 이중 알림이 울리고
  // '<이벤트명>과 대결이 시작돼요' 같은 어색한 카피가 나간다.
  const reservableMatches = matches.filter((match) => match.status === 'matched' && !match.raceEventId);

  for (const match of reservableMatches) {
    const slotStartAtMs = new Date(match.slotStartAt).getTime();

    if (!Number.isFinite(slotStartAtMs)) {
      continue;
    }

    for (const minutesBefore of MATCH_REMINDER_OFFSETS_MINUTES) {
      const triggerAtMs = slotStartAtMs - minutesBefore * 60 * 1000;

      if (triggerAtMs <= now + 5000) {
        continue;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: buildReminderTitle(match, minutesBefore),
          body: buildReminderBody(match, minutesBefore),
          sound: 'default',
          data: {
            kind: MATCH_REMINDER_KIND,
            matchId: match.matchId,
            mode: match.mode,
            roomId: match.roomId,
            slotStartAt: match.slotStartAt,
            minutesBefore,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(triggerAtMs),
          channelId: Platform.OS === 'android' ? MATCH_REMINDER_CHANNEL_ID : undefined,
        },
      }).catch(() => undefined);
    }
  }
}
