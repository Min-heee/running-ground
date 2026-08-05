// iOS 저장 시 걸음 수 복원 (오너 2026-08-06, 파티런 케이던스 '--' 사고):
// watchStepCount 라이브 스트림은 백그라운드/절전 구간에서 이벤트가 끊길 수 있지만,
// iOS 모션 코프로세서는 걸음을 하드웨어에 항상 기록한다 — 저장 직전 러닝 구간을
// getStepCountAsync 로 재조회해 라이브 누적보다 크면 그 값을 쓴다. 케이던스 의미
// (전 구간 평균, 안티치트 텔레메트리 포함)는 그대로 두고 걸음 수만 복원하는 방식.
// 안드로이드는 이 API 미지원 — 기존 워치 카운트 그대로.
//
// RN 무의존 모듈: expo-sensors 는 iOS 경로에서만 동적 import (node 테스트 러너 호환).

type StepQueryResult = { steps?: number } | null | undefined;

async function queryPedometerStepCount(start: Date, end: Date): Promise<StepQueryResult> {
  const { Pedometer } = await import('expo-sensors');
  return Pedometer.getStepCountAsync(start, end);
}

const QUERY_TIMEOUT_MS = 2000;

export async function resolveSaveTotalSteps({
  watchedTotalSteps,
  startIso,
  endIso,
  platformOs,
  queryStepCount = queryPedometerStepCount,
  nowMs = Date.now(),
}: {
  watchedTotalSteps: number;
  startIso: string | null | undefined;
  endIso?: string | null;
  platformOs: string;
  queryStepCount?: (start: Date, end: Date) => Promise<StepQueryResult>;
  nowMs?: number;
}): Promise<number> {
  const watched = Number.isFinite(watchedTotalSteps) && watchedTotalSteps > 0
    ? Math.round(watchedTotalSteps)
    : 0;

  if (platformOs !== 'ios' || !startIso) {
    return watched;
  }

  const startMs = new Date(startIso).getTime();
  if (!Number.isFinite(startMs)) {
    return watched;
  }
  const endMsCandidate = endIso ? new Date(endIso).getTime() : Number.NaN;
  const endMs = Number.isFinite(endMsCandidate) ? endMsCandidate : nowMs;
  if (endMs <= startMs) {
    return watched;
  }

  try {
    // 저장을 잡아두지 않도록 2초 상한 — 코프로세서 조회는 보통 수십 ms 다.
    const result = await Promise.race<StepQueryResult>([
      queryStepCount(new Date(startMs), new Date(endMs)),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), QUERY_TIMEOUT_MS)),
    ]);
    const queriedSteps = Number(result?.steps);

    if (Number.isFinite(queriedSteps) && queriedSteps > watched) {
      return Math.round(queriedSteps);
    }
  } catch {
    // 조회 실패(권한 회수·시뮬레이터 등)는 조용히 라이브 카운트 유지.
  }

  return watched;
}
