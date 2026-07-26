// 러닝 시간 도출 — durationSeconds가 없는 기록(예전 수동 추가 등)은 페이스 ×
// 거리로 계산한다. 페이스 = 시간/거리의 등식이므로 추정이 아니라 계산이다.
// (홈 '내 러닝 기록' 시간 0:00 버그의 표시측 치유 — 서버도 이제 저장 시점에
// 같은 규칙으로 채우지만, 이미 저장된 기록은 이 폴백이 담당한다.)

type RunDurationSource = {
  durationSeconds?: number | null;
  pace?: string;
  distanceKm?: number;
};

export function parsePaceSecondsPerKm(pace: string | undefined): number | null {
  const match = /^(\d{1,3}):(\d{2})\/km$/.exec((pace ?? '').trim());

  if (!match) {
    return null;
  }

  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return seconds > 0 ? seconds : null;
}

export function resolveRunDurationSeconds(run: RunDurationSource): number | null {
  if (typeof run.durationSeconds === 'number' && Number.isFinite(run.durationSeconds) && run.durationSeconds > 0) {
    return Math.round(run.durationSeconds);
  }

  const paceSeconds = parsePaceSecondsPerKm(run.pace);
  const distanceKm = typeof run.distanceKm === 'number' && Number.isFinite(run.distanceKm) && run.distanceKm > 0
    ? run.distanceKm
    : null;

  if (paceSeconds === null || distanceKm === null) {
    return null;
  }

  return Math.round(paceSeconds * distanceKm);
}
