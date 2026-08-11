// 레이스 시작 10분 전 로컬 알림. 신청 시 기기에 DATE 예약 — OS가 배달하므로 서버 스케줄러도,
// 그 시각의 JS 생존도 필요 없다 (finishApproachNotification과 같은 설계). 신청 취소 시 해제.
// expo-notifications는 이미 네이티브에 컴파일돼 있어 OTA로 안전하게 탄다.
//
// react-native/expo 모듈은 LAZY require — 노드 테스트 러너에서 이 모듈을 import하는 순수 모델
// 테스트가 깨지지 않게 하는 저장소 관용구.

import { resolveRaceReminderAtMs } from '@/features/race/raceHubModel';

const RACE_REMINDER_CHANNEL_ID = 'runningground-race-reminder';

function buildIdentifier(eventId: string): string {
  return `runningground-race-reminder:${eventId}`;
}

async function importNotifications() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as typeof import('expo-notifications');
  } catch {
    return null;
  }
}

async function ensureAndroidChannel(notifications: NonNullable<Awaited<ReturnType<typeof importNotifications>>>) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require('react-native') as { Platform: { OS: string } };
    if (Platform.OS !== 'android') {
      return;
    }

    await notifications.setNotificationChannelAsync(RACE_REMINDER_CHANNEL_ID, {
      name: '레이스 시작 알림',
      importance: notifications.AndroidImportance.HIGH,
    });
  } catch {
    // 채널 실패는 예약을 막지 않는다 — 기본 채널로 배달된다.
  }
}

export async function scheduleRaceReminder(input: {
  eventId: string;
  title: string;
  startsAt: string;
}): Promise<boolean> {
  const reminderAtMs = resolveRaceReminderAtMs(input.startsAt, Date.now());

  if (reminderAtMs === null) {
    return false;
  }

  const notifications = await importNotifications();

  if (!notifications) {
    return false;
  }

  try {
    await ensureAndroidChannel(notifications);
    // 재신청/중복 예약 대비 — 같은 이벤트의 기존 예약을 먼저 지운다.
    await notifications.cancelScheduledNotificationAsync(buildIdentifier(input.eventId)).catch(() => undefined);
    await notifications.scheduleNotificationAsync({
      identifier: buildIdentifier(input.eventId),
      content: {
        title: `🏁 ${input.title} 곧 출발!`,
        body: '10분 뒤 출발이에요. 앱을 열고 출발선에 서 주세요.',
        ...({ channelId: RACE_REMINDER_CHANNEL_ID } as object),
      },
      trigger: { date: new Date(reminderAtMs) } as never,
    });
    return true;
  } catch {
    // 알림 권한 거부 등 — 신청 자체는 성공이므로 조용히 넘어간다.
    return false;
  }
}

export async function cancelRaceReminder(eventId: string): Promise<void> {
  const notifications = await importNotifications();

  if (!notifications) {
    return;
  }

  await notifications.cancelScheduledNotificationAsync(buildIdentifier(eventId)).catch(() => undefined);
}
