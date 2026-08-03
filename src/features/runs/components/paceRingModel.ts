// 러닝 중 페이스 링의 순수 계산 (오너 2026-08-02, 시안 A+D 확정).
//
// 링은 20칸 틱으로 평균 페이스 대비 현재 페이스를 보여준다: 평균과 같거나 빠르면 꽉 차고,
// 느려질수록 3초당 한 칸씩 빈다 (60초 이상 느리면 전부 빈다). 페이스가 아직 안 잡힌
// 워밍업 구간(--:--)은 0칸 + 안내 문구.

export const PACE_RING_TICK_COUNT = 20;
// 한 칸이 담당하는 페이스 갭(초) — 20칸 × 3초 = 60초 이상 느리면 링이 다 빈다.
export const PACE_RING_SECONDS_PER_TICK = 3;

export type PaceRingModel = {
  tickCount: number;
  filledTicks: number;
  statusLine: string;
};

// '06:24/km' → 384. 못 읽는 라벨(--:--/km, 빈 값)은 null.
export function parsePaceLabelSeconds(label: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(label ?? '').trim());

  if (!match) {
    return null;
  }

  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return seconds > 0 ? seconds : null;
}

// 갭 라벨 — 60초 넘으면 원시 초('540초')가 아니라 분/초로 읽어준다 (적대 리뷰 발견).
function formatPaceGap(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;

  if (minutes <= 0) {
    return `${seconds}초`;
  }

  return restSeconds > 0 ? `${minutes}분 ${restSeconds}초` : `${minutes}분`;
}

export function buildPaceRingModel(
  averagePaceLabel: string | null | undefined,
  currentPaceLabel: string | null | undefined,
): PaceRingModel {
  const averageSeconds = parsePaceLabelSeconds(averagePaceLabel);
  const currentSeconds = parsePaceLabelSeconds(currentPaceLabel);

  if (averageSeconds === null || currentSeconds === null) {
    return {
      tickCount: PACE_RING_TICK_COUNT,
      filledTicks: 0,
      // 현재 페이스는 이미 뜨는데 평균만 아직인 초반 구간 — '재는 중'이라고 하면 화면과
      // 모순돼 보인다 (적대 리뷰 발견). 상황에 맞는 문구로 가른다.
      statusLine: currentSeconds !== null
        ? '평균 페이스를 계산 중이에요'
        : '페이스를 재는 중이에요',
    };
  }

  const gapSeconds = currentSeconds - averageSeconds;

  if (gapSeconds <= 0) {
    return {
      tickCount: PACE_RING_TICK_COUNT,
      filledTicks: PACE_RING_TICK_COUNT,
      statusLine: gapSeconds === 0
        ? '평균 페이스 그대로예요'
        : `평균보다 ${formatPaceGap(Math.abs(gapSeconds))} 빨라요`,
    };
  }

  const emptyTicks = Math.min(PACE_RING_TICK_COUNT, Math.ceil(gapSeconds / PACE_RING_SECONDS_PER_TICK));

  return {
    tickCount: PACE_RING_TICK_COUNT,
    filledTicks: PACE_RING_TICK_COUNT - emptyTicks,
    statusLine: `평균보다 ${formatPaceGap(gapSeconds)} 느려요`,
  };
}

// 히어로 숫자에 쓸 거리 라벨 분해 — '4.91km' → { number: '4.91', unit: 'km' }.
export function splitDistanceLabel(distanceLabel: string): { number: string; unit: string } {
  const match = /^([\d.,]+)\s*(.*)$/.exec(String(distanceLabel ?? '').trim());

  if (!match || !match[1]) {
    return { number: distanceLabel, unit: '' };
  }

  return { number: match[1], unit: match[2] || 'km' };
}
