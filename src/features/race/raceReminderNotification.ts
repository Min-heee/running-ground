// 레이스 시작 10분 전 로컬 알림. 신청 시 기기에 DATE 예약 — OS가 배달하므로 서버 스케줄러도,
// 그 시각의 JS 생존도 필요 없다 (finishApproachNotification과 같은 설계). 신청 취소 시 해제.
// expo-notifications는 이미 네이티브에 컴파일돼 있어 OTA로 안전하게 탄다.
//
// react-native/expo 모듈은 LAZY require — 노드 테스트 러너에서 이 모듈을 import하는 순수 모델
// 테스트가 깨지지 않게 하는 저장소 관용구.

import { resolveRaceReminderSchedule, type RaceReminderKey } from '@/features/race/raceHubModel';

const RACE_REMINDER_CHANNEL_ID = 'runningground-race-reminder';

// 오너 2026-08-13: 폰이 꺼져 있어도 OS가 배달하는 사전 안내 4연발 — 대기실 오픈(24시간 전),
// 10분, 5분(폰 켜기), 1분(앱 켠 채 대기). 신청/허브 로드 때 멱등 재예약, 취소 시 전부 해제.
const RACE_REMINDER_KEYS: RaceReminderKey[] = ['lobby-open', 't-10m', 't-5m', 't-1m'];

function buildReminderCopy(key: RaceReminderKey, title: string): { title: string; body: string } {
  switch (key) {
    case 'lobby-open':
      return { title: `🏁 ${title} 대기실이 열렸어요`, body: '레이스 탭에서 대기실에 미리 들어와 준비해 보세요.' };
    case 't-10m':
      return { title: `🏁 ${title} 곧 출발!`, body: '10분 뒤 출발이에요. 앱을 열고 출발선에 서 주세요.' };
    case 't-5m':
      return { title: `${title} 5분 전이에요`, body: '핸드폰을 켜고 러닝스페이스 앱을 열어 주세요.' };
    default:
      return { title: `${title} 1분 전!`, body: '앱을 켠 채로 기다려 주세요 — 곧 자동으로 출발해요.' };
  }
}

function buildIdentifier(eventId: string, key: RaceReminderKey): string {
  return `runningground-race-reminder:${eventId}:${key}`;
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
  const schedule = resolveRaceReminderSchedule(input.startsAt, Date.now());

  if (schedule.length === 0) {
    return false;
  }

  const notifications = await importNotifications();

  if (!notifications) {
    return false;
  }

  try {
    await ensureAndroidChannel(notifications);
    // 재신청/중복 예약 대비 — 같은 이벤트의 기존 예약(구버전 단일 포함)을 먼저 지운다.
    await notifications.cancelScheduledNotificationAsync(`runningground-race-reminder:${input.eventId}`).catch(() => undefined);
    for (const key of RACE_REMINDER_KEYS) {
      await notifications.cancelScheduledNotificationAsync(buildIdentifier(input.eventId, key)).catch(() => undefined);
    }

    for (const entry of schedule) {
      const copy = buildReminderCopy(entry.key, input.title);
      await notifications.scheduleNotificationAsync({
        identifier: buildIdentifier(input.eventId, entry.key),
        content: {
          title: copy.title,
          body: copy.body,
          ...({ channelId: RACE_REMINDER_CHANNEL_ID } as object),
        },
        trigger: { date: new Date(entry.atMs) } as never,
      });
    }
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

  await notifications.cancelScheduledNotificationAsync(`runningground-race-reminder:${eventId}`).catch(() => undefined);
  for (const key of RACE_REMINDER_KEYS) {
    await notifications.cancelScheduledNotificationAsync(buildIdentifier(eventId, key)).catch(() => undefined);
  }
}
