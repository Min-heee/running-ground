// Anti-cheat V1: the competitive motion-permission gate, wired to the real Pedometer APIs.
//
// Every path that enters a COMPETITIVE mode — 매칭찾기 (duel + group matchmaking request) and 파티런
// (room create, invite accept, invite-code/deep-link join) — awaits this gate BEFORE the existing
// action. Solo runs are intentionally ungated. The decision logic itself is pure and unit-tested
// in competitiveMotionGateModel.ts; this file only sequences the reads/request and owns the ONE
// shared Alert so every entry point shows identical copy.

import { Alert, Linking } from 'react-native';
import {
  readMotionGate,
  requestMotion,
} from '@/features/auth/onboarding/onboardingPermissions';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import {
  resolveCompetitiveMotionGate,
  shouldRequestCompetitiveMotionPermission,
  type CompetitiveMotionGateReason,
  type CompetitiveMotionGateResult,
} from './competitiveMotionGateModel';

export async function ensureCompetitiveMotionPermission(): Promise<CompetitiveMotionGateResult> {
  const reading = await readMotionGate();
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

const COMPETITIVE_MOTION_ALERT_TITLE = '신체활동 권한이 필요해요';

// Single owner of the gate copy — every competitive entry point funnels through here so the
// explanation stays honest and identical everywhere.
export function showCompetitiveMotionPermissionAlert(reason: CompetitiveMotionGateReason): void {
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
    [
      { style: 'cancel', text: '취소' },
      {
        onPress: () => {
          void Linking.openSettings().catch(() => {});
        },
        text: '설정 열기',
      },
    ],
  );
}

// One-call guard for entry points: resolves the gate, surfaces the shared Alert on failure, and
// leaves a perf mark so blocked entries are visible in traces. `source` names the entry point.
export async function ensureCompetitiveMotionPermissionOrAlert(source: string): Promise<boolean> {
  const gate = await ensureCompetitiveMotionPermission();
  if (gate.ok) {
    return true;
  }

  rgPerfMark('competitive motion gate blocked', {
    reason: gate.reason,
    source,
  });
  showCompetitiveMotionPermissionAlert(gate.reason);
  return false;
}
