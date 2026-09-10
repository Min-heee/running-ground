// 케이던스 워치독 — 순수 판정 코어 (오너 2026-09-09).
//
// 문제: 시속 30km대로 움직인 차량 러닝. 서버 속도 규칙은 저장 후에야 잡고,
// 오늘의 랭킹 등 표시면은 그 판정을 무시했다. 오너 규칙: 달리기 속도로 이동하는데
// 케이던스가 안 찍히면 1차 경고, 2차면 부정 러닝 — 매치는 실격패(포인트 0), 솔로는
// 정지+기록 삭제.
//
// 안전 원칙 (프로덕션 실측 2026-09-09): 안드로이드는 expo-sensors가 앱이 백그라운드로
// 가면 걸음 센서를 해제하고(onHostPause → stopObserving) 복귀 때 기준점을 다시 잡는다 —
// 화면 꺼진 갤럭시 런은 케이던스가 통째로 사라진다(민병희 매치 6런 중 5런 null). 그래서
// 이 워치독은 **앱이 포그라운드이고 센서가 살아 있는 동안의 '달리기 속도 이동 시간'만**
// 창에 누적한다. 백그라운드·JS 수면·센서 부재·일시정지·걷기 속도 구간은 누적하지 않고,
// 포그라운드 복귀 직후엔 유예(센서 재등록·배칭 지연)를 둔다. 억울한 실격 0건이 정확한
// 적발보다 우선이다 — 화면 끈 차량 이동은 서버 속도 규칙이 계속 담당한다.
//
// 창 판정: 달리기 속도 이동이 windowMovingSeconds만큼 쌓이면 그 창의 spm = 걸음/분.
// spm < minCadenceSpm → 스트라이크. 깨끗한 창은 스트라이크를 하나 되돌린다(잡음 관용) —
// 연속 두 창이 더러워야 실격이므로, 창을 번갈아 속이는 건 사실상 달리는 것과 같다.

export type CadenceWatchdogConfig = {
  windowMovingSeconds: number;
  runningSpeedFloorMps: number;
  minCadenceSpm: number;
  // 사람이 달릴 때 한 걸음이 갈 수 있는 최대 거리(m). 이걸 넘으면 '걸음은 찍히는데 그 걸음으로
  // 갈 수 없는 거리'다 — 자전거·킥보드 서명 (오너 실측 2026-09-10: 4:00/km에서 80spm = 보폭 3.1m).
  maxRunningStrideMeters: number;
  resumeGraceMs: number;
  maxTickGapMs: number;
  strikesToDisqualify: number;
};

// 서버 runIntegrity RUNNING_SPEED_FLOOR_MPS(2.4 = 약 6:57/km)와 같은 바닥: 그보다 느리면
// 걷기와 구분이 안 되므로 케이던스로 아무것도 증명하지 않는다.
// minCadenceSpm은 **근제로 대역**(적대검증 2026-09-09): 오너 규칙은 "케이던스가 안 찍히면"
// 이지, "적게 찍히면"이 아니다. 45spm이 찍히는 폰은 케이던스를 찍고 있는 것이다 — 유모차
// 컵홀더·거치대·손에 든 폰처럼 몸 접촉이 약한 정직한 러너를 50spm 문턱은 잡아버렸다.
// 차량/자전거 거치는 진동으로도 0~15spm 안이라 20이면 차량 서명은 그대로 걸린다.
// maxRunningStrideMeters (오너 확정 2026-09-10): 실측 자전거 주행이 75~81spm으로 20spm 문턱을
// 그대로 통과했다(4:00/km · 80spm → 보폭 3.1m). 사람의 달리기 보폭은 0.8~1.8m이고, 3:00/km를
// 180spm으로 뛰는 최상급도 1.85m다. 2.2m는 그 위 여유선이라 진짜 러너는 절대 못 넘는다.
// 다만 걸음을 절반 이하로 세는 폰(유모차·거치대)도 이 선을 넘는다 — 그래서 이 판정은
// **실격이 아니라 집계 제외**다. 실격은 예전 그대로 근제로(minCadenceSpm) 대역에서만 난다.
export const DEFAULT_CADENCE_WATCHDOG_CONFIG: CadenceWatchdogConfig = {
  windowMovingSeconds: 90,
  runningSpeedFloorMps: 2.4,
  minCadenceSpm: 20,
  maxRunningStrideMeters: 2.2,
  resumeGraceMs: 15_000,
  maxTickGapMs: 5_000,
  strikesToDisqualify: 2,
};

export type CadenceWatchdogState = {
  windowMovingMs: number;
  windowSteps: number;
  // 창·전 구간에서 달리기 속도로 실제 이동한 거리(m) — 보폭 판정과 서버 백스톱의 재료.
  windowMovingMeters: number;
  auditMovingMeters: number;
  // 보폭이 사람 범위를 벗어난 창이 한 번이라도 있었다 — 래치. 실격시키지 않고 집계에서만 뺀다.
  suspectedNonRunning: boolean;
  lastTickAtMs: number | null;
  lastSteps: number | null;
  strikes: number;
  foregroundSinceMs: number | null;
  // 전 구간 원장 — 서버 cadenceAudit(백스톱)용: 포그라운드 달리기 속도 이동 시간과 그때의 걸음.
  auditMovingMs: number;
  auditSteps: number;
  disqualified: boolean;
  // 지금까지 낸 경고 수 — 스트라이크가 깨끗한 창으로 되돌아갔다 다시 쌓이면 경고 이벤트는
  // 또 나오지만, 훅은 첫 경고에만 Alert를 띄우고 이후엔 음성만 낸다(반복 팝업 방지).
  warningsIssued: number;
};

export type CadenceWatchdogTick = {
  nowMs: number;
  // AppState === 'active'
  appActive: boolean;
  // 페도미터 사용 가능 + 권한 허용 + 구독 살아 있음
  sensorReady: boolean;
  // 트래킹 status === 'running' (일시정지 아님)
  trackingRunning: boolean;
  // 스무딩된 현재 속도(m/s). 모르면 null(스테일 페이스 등) — 누적하지 않는다.
  speedMps: number | null;
  // JS가 관측한 누적 걸음. 안드로이드 복귀 시 기준점이 리셋돼 줄어들 수 있다.
  totalSteps: number | null;
};

export type CadenceWatchdogEvent =
  | { type: 'warning'; strike: number; windowSpm: number }
  | { type: 'disqualify'; strikes: number; windowSpm: number }
  // 걸음은 찍히는데 그 걸음으로 갈 수 없는 거리 — 자전거·킥보드. 달리기를 멈추지 않고,
  // 기록도 남기되 랭킹·포인트·별에서 빠진다 (오너 확정 2026-09-10). 런당 한 번만 난다.
  | { type: 'suspect'; windowSpm: number; strideMeters: number }
  | null;

export function createCadenceWatchdogState(): CadenceWatchdogState {
  return {
    windowMovingMs: 0,
    windowSteps: 0,
    windowMovingMeters: 0,
    auditMovingMeters: 0,
    suspectedNonRunning: false,
    lastTickAtMs: null,
    lastSteps: null,
    strikes: 0,
    foregroundSinceMs: null,
    auditMovingMs: 0,
    auditSteps: 0,
    disqualified: false,
    warningsIssued: 0,
  };
}

// 페이스 라벨("5:30/km") → m/s. 스테일 표기('--:--/km')나 비정상은 null.
export function paceLabelToSpeedMps(paceLabel: string | null | undefined): number | null {
  const match = /^(\d{1,3}):(\d{2})\/km$/.exec((paceLabel ?? '').trim());

  if (!match) {
    return null;
  }

  const secondsPerKm = Number(match[1]) * 60 + Number(match[2]);
  return secondsPerKm > 0 ? 1000 / secondsPerKm : null;
}

function resolveStepDelta(previous: number | null, current: number | null): number {
  if (current === null || previous === null) {
    return 0;
  }

  // 안드로이드 포그라운드 복귀 때 expo-sensors가 기준점을 다시 잡아 누적값이 줄어든다 —
  // 그 경우 현재값 자체가 새 기준점 이후 걸음이다.
  return current >= previous ? current - previous : current;
}

export function advanceCadenceWatchdog(
  state: CadenceWatchdogState,
  tick: CadenceWatchdogTick,
  config: CadenceWatchdogConfig = DEFAULT_CADENCE_WATCHDOG_CONFIG,
): { state: CadenceWatchdogState; event: CadenceWatchdogEvent } {
  if (state.disqualified) {
    return { state, event: null };
  }

  if (!tick.appActive || !tick.sensorReady || !tick.trackingRunning) {
    // 연속성 절단: 다음 활성 틱은 기준점부터 다시 잡는다. 창 누적은 유지(신호등·잠깐의
    // 백그라운드가 증거를 지우지 않게), 단 포그라운드 유예는 다시 시작.
    return {
      state: {
        ...state,
        lastTickAtMs: null,
        lastSteps: null,
        foregroundSinceMs: tick.appActive ? state.foregroundSinceMs : null,
      },
      event: null,
    };
  }

  const foregroundSinceMs = state.foregroundSinceMs ?? tick.nowMs;

  if (tick.nowMs - foregroundSinceMs < config.resumeGraceMs) {
    // 유예: 센서 재등록·배칭이 따라붙을 시간. 기준점만 갱신하고 누적하지 않는다.
    return {
      state: { ...state, foregroundSinceMs, lastTickAtMs: tick.nowMs, lastSteps: tick.totalSteps },
      event: null,
    };
  }

  if (state.lastTickAtMs === null) {
    return {
      state: { ...state, foregroundSinceMs, lastTickAtMs: tick.nowMs, lastSteps: tick.totalSteps },
      event: null,
    };
  }

  const dtMs = tick.nowMs - state.lastTickAtMs;

  if (dtMs <= 0 || dtMs > config.maxTickGapMs) {
    // JS가 잠들었다 깬 틈(또는 시계 역행): 그 사이의 이동/걸음은 증거로 쓰지 않는다.
    return {
      state: { ...state, foregroundSinceMs, lastTickAtMs: tick.nowMs, lastSteps: tick.totalSteps },
      event: null,
    };
  }

  const stepDelta = resolveStepDelta(state.lastSteps, tick.totalSteps);
  const isRunningSpeed = tick.speedMps !== null && tick.speedMps >= config.runningSpeedFloorMps;
  let next: CadenceWatchdogState = {
    ...state,
    foregroundSinceMs,
    lastTickAtMs: tick.nowMs,
    lastSteps: tick.totalSteps,
  };

  if (!isRunningSpeed) {
    return { state: next, event: null };
  }

  const movedMeters = (tick.speedMps ?? 0) * (dtMs / 1000);
  next = {
    ...next,
    windowMovingMs: next.windowMovingMs + dtMs,
    windowSteps: next.windowSteps + stepDelta,
    windowMovingMeters: next.windowMovingMeters + movedMeters,
    auditMovingMs: next.auditMovingMs + dtMs,
    auditSteps: next.auditSteps + stepDelta,
    auditMovingMeters: next.auditMovingMeters + movedMeters,
  };

  if (next.windowMovingMs < config.windowMovingSeconds * 1000) {
    return { state: next, event: null };
  }

  const windowSpm = Math.round(next.windowSteps / (next.windowMovingMs / 60_000));
  const strideMeters = next.windowSteps > 0 ? next.windowMovingMeters / next.windowSteps : Number.POSITIVE_INFINITY;
  next = { ...next, windowMovingMs: 0, windowSteps: 0, windowMovingMeters: 0 };

  if (windowSpm >= config.minCadenceSpm) {
    // 걸음이 찍힌 창은 **언제나** 실격 스트라이크를 하나 되돌린다 — 보폭 판정이 붙기 전과
    // 바이트 단위로 같은 실격 거동이다. 보폭 때문에 스트라이크가 안 풀리면 '근제로 → 보폭 →
    // 근제로' 순서에서 예전엔 안 났을 실격이 난다(오너 방침: 실격 기준은 그대로).
    const decayed = { ...next, strikes: Math.max(0, next.strikes - 1) };

    // 그 걸음으로 갈 수 없는 거리를 갔다면 집계에서만 뺀다(래치, 런당 한 번만 알린다).
    if (strideMeters > config.maxRunningStrideMeters) {
      if (decayed.suspectedNonRunning) {
        return { state: decayed, event: null };
      }

      return {
        state: { ...decayed, suspectedNonRunning: true },
        event: { type: 'suspect', windowSpm, strideMeters: Math.round(strideMeters * 10) / 10 },
      };
    }

    return { state: decayed, event: null };
  }

  const strikes = next.strikes + 1;

  if (strikes >= config.strikesToDisqualify) {
    return { state: { ...next, strikes, disqualified: true }, event: { type: 'disqualify', strikes, windowSpm } };
  }

  return {
    state: { ...next, strikes, warningsIssued: next.warningsIssued + 1 },
    event: { type: 'warning', strike: strikes, windowSpm },
  };
}

// 서버로 보내는 감사 원장 — 포그라운드 달리기 속도 이동 동안의 걸음(백스톱 판정 재료).
export function buildCadenceAudit(state: CadenceWatchdogState, sensorAvailable: boolean) {
  return {
    sensorAvailable,
    foregroundMovingSeconds: Math.round(state.auditMovingMs / 1000),
    foregroundSteps: state.auditSteps,
    // 서버 백스톱이 보폭을 직접 다시 계산할 수 있게 — 클라 래치를 못 믿을 이유는 없지만
    // (자기 손해라 위조 유인이 없다) 원장만으로도 같은 결론이 나와야 한다.
    foregroundMovingMeters: Math.round(state.auditMovingMeters),
    suspectedNonRunning: state.suspectedNonRunning,
    strikes: state.strikes,
    disqualified: state.disqualified,
  };
}
