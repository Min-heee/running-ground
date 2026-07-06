// The competitive pre-flight: ONE guard that every competitive entry point awaits BEFORE its
// existing action — 매칭찾기 (duel + group request/rematch) and 파티런 (room create, invite accept
// from both surfaces, join-by-code, deep-link join). Solo runs stay intentionally ungated.
//
// Sequenced policy (decision logic is pure and unit-tested in competitivePreflightModel.ts +
// competitiveMotionGateModel.ts; this file only sequences the reads/requests and owns every Alert
// so all entry points show identical copy):
//   1. LOCATION (BLOCKING) — foreground first, then background "항상 허용": a match measures with
//      GPS while the screen is off, so it literally cannot be scored without always-location.
//      Play policy requires a prominent disclosure BEFORE any background-location request, so the
//      disclosure alert always precedes requestBackgroundLocation().
//   2. MOTION (BLOCKING) — anti-cheat V1 (cadence is the cycling-detection signal), unchanged.
//   3. BATTERY (Android-only, BLOCKING) — battery optimization can suspend screen-off measurement
//      (#191: the OS killed the FG-service task while optimization was active); a match where one
//      phone's distance can freeze is not a fair match, so the exemption is required to enter.
//      The OS exemption dialog is fire-and-forget, so the first press fires it and blocks
//      silently; a grant makes the next press pass, otherwise the next press shows the settings
//      alert. iOS / old binaries (control unavailable) pass — nothing to check.
//   4. NOTIFICATIONS (SOFT) — one request per app session when askable; denial never blocks.
//
// Fast path: when everything is already granted this is three parallel permission reads plus two
// sync battery reads — zero dialogs. It runs on EVERY competitive press, so it must stay cheap.
// useLocationTracking's slot-start request stays untouched as the last-resort backstop.

import { Alert, Linking } from 'react-native';
import {
  isBatteryControlAvailable,
  readBatteryExempt,
  readLocationGate,
  readMotionGate,
  readNotificationGate,
  requestBackgroundLocation,
  requestBatteryExemption,
  requestForegroundLocation,
  requestMotion,
  requestNotifications,
} from '@/features/auth/onboarding/onboardingPermissions';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import {
  resolveCompetitiveMotionGate,
  shouldRequestCompetitiveMotionPermission,
  type CompetitiveMotionGateReading,
  type CompetitiveMotionGateReason,
  type CompetitiveMotionGateResult,
} from './competitiveMotionGateModel';
import {
  combineCompetitivePreflight,
  resolveCompetitiveBatteryGate,
  resolveCompetitiveLocationGate,
  shouldRequestCompetitiveNotifications,
  type CompetitiveBatteryGateResult,
  type CompetitiveLocationGateReading,
  type CompetitiveLocationGateResult,
  type CompetitivePreflightBlock,
} from './competitivePreflightModel';

// --- step 1: location (blocking) -----------------------------------------------------------------

const BACKGROUND_LOCATION_ALERT_TITLE = '위치 항상 허용이 필요해요';

// Play prominent disclosure: shown BEFORE any background-location request, and awaited so the OS
// dialog/settings route only fires on an explicit 허용하러 가기. Back/outside dismissal counts as
// 취소.
function showBackgroundLocationDisclosure(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      BACKGROUND_LOCATION_ALERT_TITLE,
      '대결 중에는 화면을 꺼도 기록이 측정돼요. 그러려면 위치 권한을 "항상 허용"으로 설정해야 해요.',
      [
        { onPress: () => resolve(false), style: 'cancel', text: '취소' },
        { onPress: () => resolve(true), text: '허용하러 가기' },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

async function ensureCompetitiveLocationPermission(
  reading: CompetitiveLocationGateReading,
): Promise<CompetitiveLocationGateResult> {
  if (reading.foregroundGranted && reading.backgroundGranted) {
    return { ok: true };
  }

  let requestedForeground: boolean | undefined;
  if (!reading.foregroundGranted) {
    // Single OS dialog. requestForegroundLocation() no-ops to false on a hard-denied permission,
    // so this cannot double-prompt.
    requestedForeground = await requestForegroundLocation();
    if (!requestedForeground) {
      return resolveCompetitiveLocationGate({ ...reading, requestedForeground });
    }
  }

  if (reading.backgroundGranted) {
    // Foreground was the only gap and the dialog just granted it.
    return { ok: true };
  }

  const disclosureAccepted = await showBackgroundLocationDisclosure();
  if (!disclosureAccepted || !reading.backgroundCanAsk) {
    // Declined → silent block (the user just answered our alert). Accepted-but-OS-locked →
    // 'background-request-locked': requestBackgroundLocation() would silently no-op, so the block
    // handler honors the button by opening Settings directly instead of leaving a dead end.
    return resolveCompetitiveLocationGate({ ...reading, disclosureAccepted, requestedForeground });
  }

  // On Android 11+ this routes to the app's location settings page by OS design; on Android 10 it
  // is the "항상 허용" dialog; on iOS it can surface the one-time upgrade-to-Always dialog.
  const requestedBackground = await requestBackgroundLocation();
  if (requestedBackground) {
    return { ok: true };
  }

  // Fresh re-read after the attempt: settings-route / provisional grants can be under-reported by
  // the request result, and expo's background read is the "always"-equivalent check — anything
  // short of 항상 허용 stays not-granted, which is the bar screen-off match tracking demands.
  const fresh = await readLocationGate();
  return resolveCompetitiveLocationGate({
    ...reading,
    backgroundAfterRequest: fresh.backgroundGranted,
    disclosureAccepted,
    requestedBackground,
    requestedForeground,
  });
}

// --- step 2: motion (blocking) — logic unchanged from the a986104 gate ---------------------------

async function ensureCompetitiveMotionPermission(
  reading: CompetitiveMotionGateReading,
): Promise<CompetitiveMotionGateResult> {
  if (!shouldRequestCompetitiveMotionPermission(reading)) {
    return resolveCompetitiveMotionGate(reading);
  }

  // Fire the OS dialog once. requestMotion() already no-ops to false on a hard-denied or
  // unavailable pedometer, so this cannot double-prompt.
  const requestGranted = await requestMotion();
  if (requestGranted) {
    return { ok: true };
  }

  // Fresh read after the failed request (cheap — one getPermissionsAsync). It distinguishes a
  // dismissed dialog (still askable next press) from a deny the OS has locked, and also catches
  // a grant that requestMotion failed to report.
  const fresh = await readMotionGate();
  if (fresh.granted) {
    return { ok: true };
  }

  return resolveCompetitiveMotionGate({
    ...reading,
    canAskAfterRequest: fresh.available ? fresh.canAsk : false,
    requestGranted,
  });
}

// --- step 3: battery exemption (blocking on Android) ----------------------------------------------

// The OS exemption dialog is fire-and-forget (requestBatteryExemption launches it and reads the
// still-unanswered state back), so a blocking flow can't await the answer. Session flag drives the
// two-stage policy: first not-exempt press fires the dialog and blocks silently; later presses
// (user denied or dismissed) get the settings alert. A grant flips readBatteryExempt() and every
// later press passes without dialogs.
let batteryExemptionRequestedThisSession = false;

async function ensureCompetitiveBatteryExemption(): Promise<CompetitiveBatteryGateResult> {
  const gate = resolveCompetitiveBatteryGate({
    available: isBatteryControlAvailable(),
    exempt: readBatteryExempt(),
    requestedThisSession: batteryExemptionRequestedThisSession,
  });

  if (!gate.ok && gate.reason === 'battery-request-fired') {
    batteryExemptionRequestedThisSession = true;
    // Fires the Android OS exemption sheet (same native control the welcome tour uses). If the
    // OS applied it synchronously the return says so and entry can proceed this same press.
    const grantedImmediately = await requestBatteryExemption();
    if (grantedImmediately) {
      return { ok: true };
    }
  }

  return gate;
}

// --- step 4: notifications (soft, never blocks) ---------------------------------------------------

// One-shot session flag: the pre-flight runs on EVERY competitive press, so the soft ask fires at
// most once per app session instead of nagging every entry. Denial/dismissal is final for the
// session; a grant makes the flag irrelevant.
let notificationsRequestedThisSession = false;

async function runCompetitiveSoftSteps(notificationReading: {
  canAsk: boolean;
  granted: boolean;
}): Promise<void> {
  if (
    shouldRequestCompetitiveNotifications({
      ...notificationReading,
      requestedThisSession: notificationsRequestedThisSession,
    })
  ) {
    notificationsRequestedThisSession = true;
    // Best-effort: a deny just means celebration/alert pushes won't show. No settings-nag.
    await requestNotifications();
  }
}

// --- alerts: single copy source per blocking reason ----------------------------------------------

const COMPETITIVE_LOCATION_ALERT_TITLE = '위치 권한이 필요해요';
const COMPETITIVE_MOTION_ALERT_TITLE = '신체활동 권한이 필요해요';

function openSettings(): void {
  void Linking.openSettings().catch(() => {});
}

const SETTINGS_ALERT_BUTTONS = [
  { style: 'cancel' as const, text: '취소' },
  { onPress: openSettings, text: '설정 열기' },
];

// Copy unchanged from the a986104 motion gate — every competitive entry point funnels through
// here so the explanation stays honest and identical everywhere.
function showCompetitiveMotionPermissionAlert(reason: CompetitiveMotionGateReason): void {
  if (reason === 'unavailable') {
    Alert.alert(
      COMPETITIVE_MOTION_ALERT_TITLE,
      '이 기기는 걸음 센서를 지원하지 않아 매칭 대결과 파티런에 참가할 수 없어요. 혼자 달리기는 그대로 이용할 수 있어요.',
    );
    return;
  }

  Alert.alert(
    COMPETITIVE_MOTION_ALERT_TITLE,
    '대결 기록의 공정성을 위해 매칭 대결과 파티런은 걸음 측정(신체활동) 권한이 필요해요. 권한을 허용해야 참가할 수 있어요.',
    SETTINGS_ALERT_BUTTONS,
  );
}

function showCompetitivePreflightBlockedAlert(block: CompetitivePreflightBlock): void {
  if (block.kind === 'motion') {
    showCompetitiveMotionPermissionAlert(block.reason);
    return;
  }

  if (block.kind === 'battery') {
    if (block.reason === 'battery-request-fired') {
      // The OS exemption sheet is on screen right now — an alert would stack over it. A grant
      // makes the very next press pass.
      return;
    }
    Alert.alert(
      '배터리 설정이 필요해요',
      '배터리 최적화가 켜져 있으면 화면을 끈 동안 안드로이드가 측정을 멈출 수 있어요. 공정한 대결을 위해 이 앱의 배터리 사용을 "제한 없음"으로 바꿔야 참가할 수 있어요.',
      SETTINGS_ALERT_BUTTONS,
    );
    return;
  }

  switch (block.reason) {
    case 'background-declined':
      // The user just cancelled the disclosure alert we showed — a second alert would be a nag.
      // The next competitive press re-offers the disclosure.
      return;
    case 'background-request-locked':
      // 허용하러 가기 was pressed but the OS refuses to surface any request UI (hard-denied
      // earlier) — honor the button by going straight to Settings.
      openSettings();
      return;
    case 'foreground-denied':
      Alert.alert(
        COMPETITIVE_LOCATION_ALERT_TITLE,
        '대결 기록은 GPS로 측정돼요. 위치 권한을 허용해야 매칭 대결과 파티런에 참가할 수 있어요.',
        SETTINGS_ALERT_BUTTONS,
      );
      return;
    case 'background-denied':
      Alert.alert(
        BACKGROUND_LOCATION_ALERT_TITLE,
        '위치 권한이 "항상 허용"이 아니면 화면을 끈 동안 기록이 멈춰요. 설정에서 위치 권한을 "항상 허용"으로 바꿔주세요.',
        SETTINGS_ALERT_BUTTONS,
      );
      return;
  }
}

// --- the one public guard -------------------------------------------------------------------------

// Held across the WHOLE sequence (all reads + every dialog) so a double-tap — from the same or a
// different entry point — can't stack OS dialogs: the a986104 in-flight pattern, widened from the
// motion gate to the full pre-flight and centralized so all entry points get it for free (the
// per-call-site in-flight refs remain as an extra layer where they already existed).
let preflightInFlight = false;

// One-call guard for the competitive entry points: sequences location → motion → notifications →
// battery, surfaces the shared alert on a block, and leaves a perf mark so blocked entries are
// visible in traces. `source` names the entry point. Returns true when entry may proceed.
export async function ensureCompetitivePreflight(source: string): Promise<boolean> {
  if (preflightInFlight) {
    rgPerfMark('competitive preflight re-entry suppressed', { source });
    return false;
  }

  preflightInFlight = true;
  try {
    // Reads only — never prompts. Parallel so the every-press fast path stays one cheap round.
    const [locationReading, motionReading, notificationReading] = await Promise.all([
      readLocationGate(),
      readMotionGate(),
      readNotificationGate(),
    ]);

    const location = await ensureCompetitiveLocationPermission(locationReading);
    // Each later gate only runs once every earlier one passed — a blocked entry must never stack
    // a second dialog on top of the one the user is already answering.
    const motion = location.ok ? await ensureCompetitiveMotionPermission(motionReading) : null;
    const battery = location.ok && motion?.ok ? await ensureCompetitiveBatteryExemption() : null;

    const result = combineCompetitivePreflight({
      battery,
      location,
      motion,
      notificationsGranted: notificationReading.granted,
    });

    if (!result.ok) {
      rgPerfMark('competitive preflight blocked', {
        kind: result.block.kind,
        reason: result.block.reason,
        source,
      });
      showCompetitivePreflightBlockedAlert(result.block);
      return false;
    }

    await runCompetitiveSoftSteps(notificationReading);
    return true;
  } finally {
    preflightInFlight = false;
  }
}
