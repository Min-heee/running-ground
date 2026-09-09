// 케이던스 워치독 — 순수 판정 코어(cadenceWatchdogModel) 주변의 **부작용 없는 조각들**:
// 틱 조립, 이벤트별 안내 문구, 실격 시 취할 액션 결정. 훅(useCadenceWatchdog)은 이 파일이
// 만든 값을 Alert/TTS/알림/기권 커맨드로 흘려보내기만 한다. React·RN 의존이 없어 node
// 테스트로 문구와 분기를 고정할 수 있다.

import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { PedometerSensorState } from '@/features/runs/hooks/useRunTracking';
import type { BackgroundTrackingStatus } from '@/features/runs/tracking/background';
import {
  DEFAULT_CADENCE_WATCHDOG_CONFIG,
  paceLabelToSpeedMps,
  type CadenceWatchdogEvent,
  type CadenceWatchdogTick,
} from './cadenceWatchdogModel';

export type CadenceWatchdogTickSource = {
  nowMs: number;
  // AppState.currentState — 'active'만 포그라운드로 친다.
  appState: string | null | undefined;
  sensor: Pick<PedometerSensorState, 'active'>;
  // 백그라운드 스냅샷 상태 + 스무딩된 현재 페이스 라벨('5:30/km', 스테일이면 '--:--/km').
  trackingStatus: BackgroundTrackingStatus;
  currentPace: string | null | undefined;
  // 신선한 원시 GPS 픽스 속도(m/s) — 트래커가 픽스를 거부해 페이스가 비어도 차량 이동은
  // 이 값으로 보인다. 신선하지 않으면 null(그때만 페이스에서 읽는다).
  rawFixSpeedMps?: number | null;
  // 라이브 지표 프레임의 누적 걸음(센서 미관측이면 null).
  totalSteps: number | null | undefined;
};

export function buildCadenceWatchdogTick(source: CadenceWatchdogTickSource): CadenceWatchdogTick {
  const rawSpeed = typeof source.rawFixSpeedMps === 'number' && Number.isFinite(source.rawFixSpeedMps)
    ? source.rawFixSpeedMps
    : null;

  return {
    nowMs: source.nowMs,
    appActive: source.appState === 'active',
    sensorReady: source.sensor.active,
    trackingRunning: source.trackingStatus === 'running',
    speedMps: rawSpeed ?? paceLabelToSpeedMps(source.currentPace),
    totalSteps: typeof source.totalSteps === 'number' && Number.isFinite(source.totalSteps)
      ? source.totalSteps
      : null,
  };
}

// ── 문구 (오너 확정 2026-09-09) ─────────────────────────────────────────────────────
// 경고는 행동 가능해야 한다(적대검증): 폰을 유모차·거치대에 둔 정직한 러너가 다음 창에서
// 깨끗한 케이던스를 낼 수 있게 "몸에 지니라"는 힌트를 함께 준다.
export const CADENCE_WARNING_BODY = '케이던스가 잡히지 않아요. 폰을 몸에 지니거나 손에 들어주세요 — 달리는 중이 아니면 부정 러닝으로 실격 처리돼요.';
export const CADENCE_DISQUALIFY_TITLE = '부정 러닝 판정';
export const CADENCE_DISQUALIFY_SOLO_BODY = '달리기 속도로 이동했지만 케이던스가 두 번 연속 감지되지 않았어요. 부정 러닝으로 판정돼 이 기록은 저장되지 않아요.';
export const CADENCE_DISQUALIFY_MATCH_BODY = '달리기 속도로 이동했지만 케이던스가 두 번 연속 감지되지 않았어요. 부정 러닝으로 판정돼 이 대결은 실격패로 처리돼요.';
export const CADENCE_DISQUALIFY_SOLO_SPEECH = '부정 러닝으로 판정됐어요. 이 기록은 저장되지 않아요.';
export const CADENCE_DISQUALIFY_MATCH_SPEECH = '부정 러닝으로 판정돼 실격패 처리돼요.';

export function buildCadenceWarningTitle(
  strike: number,
  strikesToDisqualify = DEFAULT_CADENCE_WATCHDOG_CONFIG.strikesToDisqualify,
): string {
  return `케이던스 경고 (${strike}/${strikesToDisqualify})`;
}

// 실격 액션: 매치(공식 매칭·파티런 모두 matchMode가 duel/group)면 실격 기권, 그 외(솔로·
// 경찰과 도둑런)는 정지 + 기록 폐기. 'room'은 출발 전 로비라 실격 이벤트 자체가 나지 않지만
// 방어적으로 폐기로 흘린다.
export type CadenceDisqualifyAction =
  | { kind: 'forfeit'; source: 'duel' | 'group' }
  | { kind: 'discard' };

export function resolveCadenceDisqualifyAction(matchMode: RunMatchMode): CadenceDisqualifyAction {
  if (matchMode === 'duel' || matchMode === 'group') {
    return { kind: 'forfeit', source: matchMode };
  }

  return { kind: 'discard' };
}

export type CadenceWatchdogPresentation = {
  title: string;
  body: string;
  speech: string;
};

// 이벤트 → 화면/음성 문구. 경고는 같은 문장을 Alert·알림·음성에 그대로 쓴다(오너 확정 카피).
export function buildCadenceWatchdogPresentation(
  event: NonNullable<CadenceWatchdogEvent>,
  action: CadenceDisqualifyAction,
): CadenceWatchdogPresentation {
  if (event.type === 'warning') {
    return {
      title: buildCadenceWarningTitle(event.strike),
      body: CADENCE_WARNING_BODY,
      speech: CADENCE_WARNING_BODY,
    };
  }

  return action.kind === 'forfeit'
    ? {
        title: CADENCE_DISQUALIFY_TITLE,
        body: CADENCE_DISQUALIFY_MATCH_BODY,
        speech: CADENCE_DISQUALIFY_MATCH_SPEECH,
      }
    : {
        title: CADENCE_DISQUALIFY_TITLE,
        body: CADENCE_DISQUALIFY_SOLO_BODY,
        speech: CADENCE_DISQUALIFY_SOLO_SPEECH,
      };
}
