import { buildMatchSlotDateLabel, formatDuelSlotLabel } from './dateTimeFormatting.mjs';
import { MATCH_PACE_BAND_OFFSET_MINUTES } from './matchConstants.mjs';

export function formatPaceMinutesLabel(paceMinutes) {
  const totalSeconds = Math.max(0, Math.round(paceMinutes * 60));
  const minutesPart = Math.floor(totalSeconds / 60);
  const secondsPart = String(totalSeconds % 60).padStart(2, '0');
  return `${minutesPart}:${secondsPart}/km`;
}

export function buildPaceBandLabel(paceMinutes) {
  const lowerPaceMinutes = Math.max(0, paceMinutes - MATCH_PACE_BAND_OFFSET_MINUTES);
  const upperPaceMinutes = paceMinutes + MATCH_PACE_BAND_OFFSET_MINUTES;
  return `${formatPaceMinutesLabel(lowerPaceMinutes)} ~ ${formatPaceMinutesLabel(upperPaceMinutes)}`;
}

export function buildLevelLabel(distanceLevel) {
  return `Lv.${distanceLevel}`;
}

export function buildProgressAveragePaceLabel(distanceKm, elapsedSeconds) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return '--:--/km';
  }

  return formatPaceMinutesLabel(elapsedSeconds / distanceKm / 60);
}

export function buildSingleMatchLockMessage(mode, slotStartAt, state = 'waiting') {
  const modeLabel = mode === 'duel' ? '1대1 대결' : '그룹 대결';
  const slotSummary = `${buildMatchSlotDateLabel(slotStartAt)} ${formatDuelSlotLabel(slotStartAt)}`;

  if (state === 'active') {
    return `이미 진행 중인 ${modeLabel}이 있어요. ${slotSummary} 매치를 먼저 끝내야 새 매칭을 신청할 수 있어요.`;
  }

  if (state === 'matched') {
    return `이미 예약된 ${modeLabel}이 있어요. ${slotSummary} 매치를 먼저 취소하거나 끝내야 다른 매칭을 신청할 수 있어요.`;
  }

  return `이미 신청한 ${modeLabel}이 있어요. ${slotSummary} 매치를 먼저 취소하거나 끝내야 다른 매칭을 신청할 수 있어요.`;
}

export function buildLiveRunShareLockMessage() {
  return '이미 진행 중인 러닝 공유가 있어요. 현재 러닝을 먼저 끝내야 새 매칭을 신청할 수 있어요.';
}
