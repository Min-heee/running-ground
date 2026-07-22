// 나와의 대결 (ghost race) announcement model — PURE. The runtime hook feeds it
// live snapshots plus the selected GhostRecord and speaks the returned text.

import { formatPaceSpoken } from '@/features/runs/soloCoach/soloCoachModel';
import { interpolateGhostDistanceM, type GhostRecord } from './ghostTrackCodec';

export type GhostRaceConfig = {
  ghost: GhostRecord;
  intervalMinutes: number;
  // 간격 비교 (핵심), 페이스 비교, 경과 시간, 거리 진행.
  announceGap: boolean;
  announcePace: boolean;
  announceElapsed: boolean;
  announceDistance: boolean;
};

// Within ±10m counts as neck-and-neck.
const GAP_TOLERANCE_M = 10;

function formatDurationSpoken(totalSeconds: number): string {
  const total = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes > 0 && seconds > 0) {
    return `${minutes}분 ${seconds}초`;
  }
  if (minutes > 0) {
    return `${minutes}분`;
  }
  return `${seconds}초`;
}

function formatDistanceSpoken(distanceKm: number): string {
  const rounded = Math.round(distanceKm * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}킬로미터` : `${rounded.toFixed(1)}킬로미터`;
}

export function buildGhostStartAnnouncement(config: GhostRaceConfig): string {
  const { ghost } = config;
  const avgPaceSecPerKm = ghost.distanceM > 0 ? ghost.durationSec / (ghost.distanceM / 1000) : 0;
  const parts = [
    '자신과의 대결을 시작해요.',
    `상대는 ${formatDistanceSpoken(ghost.distanceM / 1000)}를 ${formatDurationSpoken(ghost.durationSec)}에 달린 과거의 나예요.`,
  ];

  if (avgPaceSecPerKm > 0) {
    parts.push(`평균 페이스 ${formatPaceSpoken(avgPaceSecPerKm)}.`);
  }
  parts.push(`${config.intervalMinutes}분마다 알려드릴게요.`);

  return parts.join(' ');
}

export type GhostRaceSnapshot = {
  elapsedSeconds: number;
  distanceKm: number;
  // Start of the CURRENT feedback window (the previous announcement point) —
  // lets the pace comparison speak the SEGMENT pace both runners actually ran
  // during this window, not a whole-run average. Omitted → window starts at 0.
  windowStartElapsedSec?: number;
  windowStartDistanceKm?: number;
};

// Minimum my-progress in a window before a segment pace is trustworthy.
const MIN_WINDOW_DISTANCE_KM = 0.05;

export function buildGhostRaceAnnouncement(
  config: GhostRaceConfig,
  snapshot: GhostRaceSnapshot,
): string {
  const parts: string[] = [];

  if (config.announceGap) {
    const ghostDistanceM = interpolateGhostDistanceM(config.ghost, snapshot.elapsedSeconds);
    const gapM = Math.round(snapshot.distanceKm * 1000 - ghostDistanceM);

    if (gapM > GAP_TOLERANCE_M) {
      parts.push(`과거의 나보다 ${gapM}미터 앞서고 있어요!`);
    } else if (gapM < -GAP_TOLERANCE_M) {
      parts.push(`과거의 나보다 ${Math.abs(gapM)}미터 뒤처져 있어요. 따라잡아 봐요!`);
    } else {
      parts.push('과거의 나와 나란히 달리고 있어요.');
    }
  }

  if (config.announcePace) {
    const windowStartSec = snapshot.windowStartElapsedSec ?? 0;
    const windowStartKm = snapshot.windowStartDistanceKm ?? 0;
    const windowSec = snapshot.elapsedSeconds - windowStartSec;
    const myWindowKm = snapshot.distanceKm - windowStartKm;
    const ghostWindowM = interpolateGhostDistanceM(config.ghost, snapshot.elapsedSeconds)
      - interpolateGhostDistanceM(config.ghost, windowStartSec);

    // Both segment paces must be real: enough of my movement AND the ghost
    // still moving (a finished ghost has no current pace — gap/finish cover it).
    if (windowSec > 0 && myWindowKm >= MIN_WINDOW_DISTANCE_KM && ghostWindowM > 1) {
      const myPace = formatPaceSpoken(windowSec / myWindowKm);
      const ghostPace = formatPaceSpoken(windowSec / (ghostWindowM / 1000));
      parts.push(`지금 내 페이스 ${myPace}. 과거의 나는 ${ghostPace}로 달리는 중이에요.`);
    }
  }

  if (config.announceElapsed) {
    parts.push(`경과 시간 ${formatDurationSpoken(snapshot.elapsedSeconds)}.`);
  }

  if (config.announceDistance) {
    const remainingKm = config.ghost.distanceM / 1000 - snapshot.distanceKm;
    let distancePart = `현재 ${formatDistanceSpoken(snapshot.distanceKm)}.`;
    if (remainingKm > 0.05) {
      distancePart += ` 결승선까지 ${formatDistanceSpoken(remainingKm)} 남았어요.`;
    }
    parts.push(distancePart);
  }

  return parts.join(' ');
}

// Spoken ONCE when the runner crosses the ghost's final distance — the race
// verdict: my elapsed vs the ghost's recorded duration.
export function buildGhostFinishAnnouncement(config: GhostRaceConfig, myElapsedSeconds: number): string {
  const diffSec = Math.round(config.ghost.durationSec - myElapsedSeconds);

  if (diffSec > 0) {
    return `결승선 도착! 과거의 나를 ${formatDurationSpoken(diffSec)} 차이로 이겼어요!`;
  }

  if (diffSec < 0) {
    return `결승선 도착! 과거 기록보다 ${formatDurationSpoken(Math.abs(diffSec))} 늦었어요. 다음엔 꼭 이겨봐요!`;
  }

  return '결승선 도착! 과거의 나와 완전히 같은 기록이에요!';
}

// Spoken ONCE if the ghost finishes first (its duration passes while I am
// still short of its distance).
export function buildGhostFinishedFirstAnnouncement(): string {
  return '과거의 내가 방금 결승선을 통과했어요. 끝까지 완주해 봐요!';
}
