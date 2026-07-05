import { getBackgroundSyncDiagnostics } from '@/features/runs/tracking/background/backgroundSyncDiagnostics';

// Device-only "finish approaching — turn your screen on" reminder. A single DATE-scheduled
// local notification fired ~1 min before the runner reaches the finish line, so a screen-off
// runner turns the screen on in time for the distance + finish to be captured accurately. The
// OS delivers DATE-scheduled notifications even while the JS thread is suspended (locked iOS).
// Plus the at-crossing 완주 CELEBRATION notification (hands-free finish, Stage 2) fired by the
// background flush / final-status delivery the moment 'finished' is first computed.
//
// Modeled on src/lib/liveMatchGapNotifications.ts + src/lib/matchNotifications.ts. Ships over
// OTA — expo-notifications is already compiled into the native binary.
//
// react-native is required LAZILY (same idiom as pendingFinishStore's expo-secure-store) so this
// module — now statically imported by the CI-tested background flush — keeps loading under the
// plain node test runner, where 'react-native' cannot resolve.

function getPlatformOS(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require('react-native') as { Platform: { OS: string } };
    return Platform.OS;
  } catch {
    return 'unknown';
  }
}

const FINISH_REMINDER_KIND = 'runningground-finish-approach';
const FINISH_REMINDER_CHANNEL_ID = 'runningground-finish-approach';

// Hands-free finish (Stage 2) — the at-crossing 완주 CELEBRATION. Its own kind AND its own Android
// channel at DEFAULT importance (no heads-up, no vibration, no sound): unlike the reminders above
// it requires NO action from the runner — it only tells a screen-off runner the crossing was
// captured and the record is being saved.
const FINISH_CELEBRATION_KIND = 'runningground-finish-celebration';
const FINISH_CELEBRATION_CHANNEL_ID = 'runningground-finish-celebration';

export const FINISH_CELEBRATION_BODY = '완주 기록이 저장되고 있어요. 결과는 앱에서 확인하세요.';

// LEGACY (removed goal-ETA alarm) — the kind is KEPT ONLY so the cancel sweep below can garbage-
// collect a stale goal-ETA notification that a run started on PRE-OTA code left DATE-scheduled in
// the OS queue (OS-scheduled notifications survive app restarts/updates). No code schedules this
// kind anymore; drop the kind from the sweep after ≥1 OTA generation.
const GOAL_ETA_REMINDER_KIND = 'runningground-finish-goal-eta';

export const FINISH_REMINDER_TITLE = '🏁 결승선이 곧이에요!';
export const FINISH_REMINDER_BODY = '화면을 켜두면 완주 시간이 정확하게 기록돼요.';

type NotificationsModule = Awaited<ReturnType<typeof importNotifications>>;

async function importNotifications() {
  try {
    return await import('expo-notifications');
  } catch {
    // Older binaries may predate the native notification module.
    return null;
  }
}

async function configureAndroidFinishReminderChannel(Notifications: NotificationsModule) {
  if (
    !Notifications
    || getPlatformOS() !== 'android'
    || typeof Notifications.setNotificationChannelAsync !== 'function'
  ) {
    return;
  }

  await Notifications.setNotificationChannelAsync(FINISH_REMINDER_CHANNEL_ID, {
    name: '완주 임박 알림',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  }).catch(() => undefined);
}

// Permission is already requested at onboarding; never re-request here. Returns false (no-op)
// when the native module is absent or permission is not granted.
async function hasFinishReminderPermission(Notifications: NotificationsModule): Promise<boolean> {
  if (!Notifications) {
    return false;
  }

  const currentPermission = await Notifications.getPermissionsAsync().catch(() => null);
  return Boolean(currentPermission?.granted);
}

// Cancel every pending notification of the given kinds. Only our own kinds are ever passed, so
// this never touches the match-reminder or live-gap notifications.
async function cancelReminderNotificationsOfKinds(
  Notifications: NotificationsModule,
  kinds: readonly string[],
): Promise<void> {
  if (!Notifications) {
    return;
  }

  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(
    scheduled
      .filter((notification) => kinds.includes(String(notification.content.data?.kind)))
      .map((notification) =>
        Notifications.cancelScheduledNotificationAsync(notification.identifier).catch(() => undefined)),
  );
}

// (Re)schedule a one-shot reminder of `kind` `inSeconds` from now, REPLACING any previously
// scheduled reminder of the SAME kind (the other kind's schedule is untouched). Returns true when
// a notification was scheduled.
async function scheduleReminderNotification(
  kind: string,
  title: string,
  body: string,
  inSeconds: number,
): Promise<boolean> {
  const Notifications = await importNotifications();

  if (!Notifications) {
    return false;
  }

  await configureAndroidFinishReminderChannel(Notifications);

  if (!(await hasFinishReminderPermission(Notifications))) {
    return false;
  }

  // Replace any pending reminder of this kind before re-arming so only the latest ETA is queued.
  await cancelReminderNotificationsOfKinds(Notifications, [kind]);

  const fireAtMs = Date.now() + Math.max(0, inSeconds) * 1000;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
      data: { kind },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(fireAtMs),
      channelId: getPlatformOS() === 'android' ? FINISH_REMINDER_CHANNEL_ID : undefined,
    },
  }).catch(() => undefined);

  return true;
}

// Present a reminder of `kind` immediately (already within its buffer). Android routes through the
// custom channel via a short TIME_INTERVAL trigger; iOS delivers immediately (null trigger).
async function presentReminderNotificationNow(kind: string, title: string, body: string): Promise<void> {
  const Notifications = await importNotifications();

  if (!Notifications) {
    return;
  }

  await configureAndroidFinishReminderChannel(Notifications);

  if (!(await hasFinishReminderPermission(Notifications))) {
    return;
  }

  const trigger = getPlatformOS() === 'android'
    ? {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
        repeats: false,
        channelId: FINISH_REMINDER_CHANNEL_ID,
      }
    : null;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
      data: { kind },
    },
    trigger,
  }).catch(() => undefined);
}

// (Re)schedule the one-shot ~300m approach reminder `inSeconds` from now, REPLACING any previously
// scheduled approach reminder for this run. Returns true when a notification was scheduled.
export async function scheduleFinishApproachReminder(inSeconds: number): Promise<boolean> {
  return scheduleReminderNotification(
    FINISH_REMINDER_KIND,
    FINISH_REMINDER_TITLE,
    FINISH_REMINDER_BODY,
    inSeconds,
  );
}

// Present the approach reminder immediately (already within the buffer).
export async function presentFinishApproachReminderNow(): Promise<void> {
  return presentReminderNotificationNow(FINISH_REMINDER_KIND, FINISH_REMINDER_TITLE, FINISH_REMINDER_BODY);
}

// ---------------------------------------------------------------------------------------------
// Hands-free finish (Stage 2) — at-crossing celebration notification.
// ---------------------------------------------------------------------------------------------

// DEFAULT-importance channel: shows in the tray/lock screen without heads-up, vibration or sound —
// the celebration requires NO action (the finish is already frozen + delivering on its own).
async function configureAndroidFinishCelebrationChannel(Notifications: NotificationsModule) {
  if (
    !Notifications
    || getPlatformOS() !== 'android'
    || typeof Notifications.setNotificationChannelAsync !== 'function'
  ) {
    return;
  }

  await Notifications.setNotificationChannelAsync(FINISH_CELEBRATION_CHANNEL_ID, {
    name: '완주 축하 알림',
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  }).catch(() => undefined);
}

function formatCelebrationKm(distanceKm: number): string {
  const safeKm = Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : 0;
  return safeKm.toFixed(2);
}

function formatCelebrationMmSs(elapsedSeconds: number): string {
  const safeSeconds = Number.isFinite(elapsedSeconds) ? Math.max(0, Math.round(elapsedSeconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function buildFinishCelebrationTitle(distanceKm: number, elapsedSeconds: number): string {
  return `🎉 ${formatCelebrationKm(distanceKm)}km 완주! ${formatCelebrationMmSs(elapsedSeconds)}`;
}

// Present the at-crossing celebration immediately. Gated INTERNALLY on the app being backgrounded:
// a foreground crossing already shows the result UI, so the notification would be pure noise there
// (this also makes the notificationHandler foreground-presentation question moot). Same
// present-now idiom as the reminders above; permission was requested at onboarding — never here.
export async function presentFinishCelebrationNow(distanceKm: number, elapsedSeconds: number): Promise<void> {
  if (!getBackgroundSyncDiagnostics().isAppBackground) {
    return;
  }

  const Notifications = await importNotifications();

  if (!Notifications) {
    return;
  }

  await configureAndroidFinishCelebrationChannel(Notifications);

  if (!(await hasFinishReminderPermission(Notifications))) {
    return;
  }

  const trigger = getPlatformOS() === 'android'
    ? {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
        repeats: false,
        channelId: FINISH_CELEBRATION_CHANNEL_ID,
      }
    : null;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: buildFinishCelebrationTitle(distanceKm, elapsedSeconds),
      body: FINISH_CELEBRATION_BODY,
      data: { kind: FINISH_CELEBRATION_KIND },
    },
    trigger,
  }).catch(() => undefined);
}

// Fire-once dedupe. The celebration call sites (the background flush's finished payload and the
// match-end final-status delivery) all re-run on every retry/re-send tick; this process-lifetime
// set (bounded — a handful of matchIds per app session, never cleared in production) collapses
// them to ONE notification per match. The set is marked SYNCHRONOUSLY before any async work so
// two same-tick callers can never both fire.
const celebratedMatchIds = new Set<string>();

type FinishCelebrationPresenter = (distanceKm: number, elapsedSeconds: number) => Promise<void> | void;

let finishCelebrationPresenterOverrideForTest: FinishCelebrationPresenter | null = null;

export function presentFinishCelebrationOnce(
  matchId: string,
  distanceKm: number,
  elapsedSeconds: number,
): Promise<void> {
  if (!matchId || celebratedMatchIds.has(matchId)) {
    return Promise.resolve();
  }
  celebratedMatchIds.add(matchId);

  const presenter = finishCelebrationPresenterOverrideForTest ?? presentFinishCelebrationNow;
  // Best-effort: the celebration must never throw into (or slow down) a finish-delivery path.
  return Promise.resolve()
    .then(() => presenter(distanceKm, elapsedSeconds))
    .catch(() => undefined);
}

// Test-only: observe/replace the presenter (expo-notifications is absent under node) and reset the
// fire-once set between tests.
export function __setFinishCelebrationPresenterForTest(presenter: FinishCelebrationPresenter | null) {
  finishCelebrationPresenterOverrideForTest = presenter;
}

export function __resetFinishCelebrationForTest() {
  celebratedMatchIds.clear();
}

// Cancel every pending finish reminder — the ~300m approach one plus any stale legacy goal-ETA
// one — on run end / finish / forfeit / unmount, so neither can fire after the run is over.
// Cancels only our own kinds, so it never touches the match-reminder or live-gap notifications.
export async function cancelFinishApproachReminder(): Promise<void> {
  const Notifications = await importNotifications();

  if (!Notifications) {
    return;
  }

  await cancelReminderNotificationsOfKinds(Notifications, [
    FINISH_REMINDER_KIND,
    GOAL_ETA_REMINDER_KIND, // legacy GC only
  ]);
}
