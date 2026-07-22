// PURE model for the 페이스메이커 solo-run voice coach: the user sets target
// pace / distance / time plus a feedback cadence in the 대기방, and during the
// run the coach speaks a comparison every N minutes ("목표보다 15초 느려요" 등).
// No React, no I/O — the runtime hook (useSoloCoachVoice) feeds it tracking
// snapshots and speaks whatever it returns.

export type SoloCoachConfig = {
  // Seconds per km, e.g. 6'00" = 360. null → pace coaching off.
  targetPaceSecPerKm: number | null;
  // null → no distance goal.
  goalDistanceKm: number | null;
  // null → no time goal.
  goalTimeMinutes: number | null;
  // Feedback cadence.
  intervalMinutes: number;
  // What the periodic announcement includes.
  announcePace: boolean;
  announceElapsed: boolean;
  announceDistance: boolean;
};

export const SOLO_COACH_INTERVAL_CHOICES = [1, 2, 3, 5] as const;

// Under this distance the average pace is GPS noise, not a pace — skip coaching.
const MIN_DISTANCE_FOR_PACE_KM = 0.15;
// Within ±10s/km of target counts as on-pace.
const PACE_TOLERANCE_SEC = 10;

export function formatPaceSpoken(secPerKm: number): string {
  const total = Math.max(0, Math.round(secPerKm));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return seconds > 0 ? `${minutes}분 ${seconds}초` : `${minutes}분`;
}

function formatDurationSpoken(totalSeconds: number): string {
  const total = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  }
  return `${minutes}분`;
}

function formatDistanceSpoken(distanceKm: number): string {
  const rounded = Math.round(distanceKm * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}킬로미터` : `${rounded.toFixed(1)}킬로미터`;
}

export type SoloCoachSnapshot = {
  elapsedSeconds: number;
  distanceKm: number;
};

// The periodic announcement. Empty string → nothing worth saying this window.
export function buildSoloCoachAnnouncement(
  config: SoloCoachConfig,
  snapshot: SoloCoachSnapshot,
): string {
  const parts: string[] = [];

  if (config.announcePace && config.targetPaceSecPerKm && snapshot.distanceKm >= MIN_DISTANCE_FOR_PACE_KM) {
    const avgPaceSecPerKm = snapshot.elapsedSeconds / snapshot.distanceKm;
    const diff = Math.round(avgPaceSecPerKm - config.targetPaceSecPerKm);

    if (diff > PACE_TOLERANCE_SEC) {
      parts.push(`평균 페이스 ${formatPaceSpoken(avgPaceSecPerKm)}. 목표보다 ${diff}초 느려요. 조금만 속도를 올려봐요!`);
    } else if (diff < -PACE_TOLERANCE_SEC) {
      parts.push(`평균 페이스 ${formatPaceSpoken(avgPaceSecPerKm)}. 목표보다 ${Math.abs(diff)}초 빨라요. 오버페이스 조심하세요.`);
    } else {
      parts.push(`평균 페이스 ${formatPaceSpoken(avgPaceSecPerKm)}. 목표 페이스를 잘 지키고 있어요!`);
    }
  }

  if (config.announceElapsed) {
    let elapsedPart = `경과 시간 ${formatDurationSpoken(snapshot.elapsedSeconds)}.`;

    if (config.goalTimeMinutes) {
      const remainingSeconds = config.goalTimeMinutes * 60 - snapshot.elapsedSeconds;
      if (remainingSeconds > 0) {
        elapsedPart += ` 목표 시간까지 ${formatDurationSpoken(remainingSeconds)} 남았어요.`;
      } else {
        elapsedPart += ' 목표 시간을 지났어요.';
      }
    }

    parts.push(elapsedPart);
  }

  if (config.announceDistance) {
    let distancePart = `현재 ${formatDistanceSpoken(snapshot.distanceKm)}.`;

    if (config.goalDistanceKm) {
      const remainingKm = config.goalDistanceKm - snapshot.distanceKm;
      if (remainingKm > 0.05) {
        distancePart += ` 목표까지 ${formatDistanceSpoken(remainingKm)} 남았어요.`;
      }
    }

    parts.push(distancePart);
  }

  return parts.join(' ');
}

// One-time goal celebrations, separate from the periodic cadence.
export function buildDistanceGoalReachedAnnouncement(goalDistanceKm: number): string {
  return `목표 거리 ${formatDistanceSpoken(goalDistanceKm)} 달성! 수고했어요.`;
}

export function buildTimeGoalReachedAnnouncement(goalTimeMinutes: number): string {
  return `목표 시간 ${formatDurationSpoken(goalTimeMinutes * 60)}이 됐어요.`;
}

// Announced once at run start so the runner knows the coach is on.
export function buildCoachStartAnnouncement(config: SoloCoachConfig): string {
  const parts: string[] = ['페이스메이커를 시작해요.'];

  if (config.targetPaceSecPerKm) {
    parts.push(`목표 페이스 ${formatPaceSpoken(config.targetPaceSecPerKm)}.`);
  }
  if (config.goalDistanceKm) {
    parts.push(`목표 거리 ${formatDistanceSpoken(config.goalDistanceKm)}.`);
  }
  if (config.goalTimeMinutes) {
    parts.push(`목표 시간 ${formatDurationSpoken(config.goalTimeMinutes * 60)}.`);
  }
  parts.push(`${config.intervalMinutes}분마다 알려드릴게요.`);

  return parts.join(' ');
}
