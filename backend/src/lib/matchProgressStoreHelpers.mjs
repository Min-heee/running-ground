import { MATCH_PROGRESS_MAX_SPEED_KM_PER_SECOND } from './matchConstants.mjs';

export function resolveServerBackedElapsedSeconds(session, participant, now = new Date()) {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) {
    return 0;
  }

  const sessionStartMs = new Date(session.startedAt ?? session.slotStartAt).getTime();
  if (Number.isFinite(sessionStartMs) && sessionStartMs <= nowMs) {
    return Math.floor((nowMs - sessionStartMs) / 1000);
  }

  const previousUpdatedAtMs = new Date(participant.liveUpdatedAt ?? '').getTime();
  const previousElapsedSeconds = Number.isInteger(participant.liveElapsedSeconds) && participant.liveElapsedSeconds >= 0
    ? participant.liveElapsedSeconds
    : 0;

  if (Number.isFinite(previousUpdatedAtMs) && previousUpdatedAtMs <= nowMs) {
    return previousElapsedSeconds + Math.floor((nowMs - previousUpdatedAtMs) / 1000);
  }

  return previousElapsedSeconds;
}

export function normalizeRunningMatchProgress(session, participant, { distanceKm, elapsedSeconds }, now = new Date()) {
  const previousDistanceKm = typeof participant.liveDistanceKm === 'number' && Number.isFinite(participant.liveDistanceKm)
    ? Math.max(0, participant.liveDistanceKm)
    : 0;
  const previousElapsedSeconds = Number.isInteger(participant.liveElapsedSeconds) && participant.liveElapsedSeconds >= 0
    ? participant.liveElapsedSeconds
    : 0;
  const inputElapsedSeconds = Number.isInteger(elapsedSeconds) && elapsedSeconds >= 0 ? elapsedSeconds : 0;
  const nextElapsedSeconds = Math.max(
    previousElapsedSeconds,
    inputElapsedSeconds,
    resolveServerBackedElapsedSeconds(session, participant, now),
  );
  const elapsedDeltaSeconds = Math.max(0, nextElapsedSeconds - previousElapsedSeconds);
  const cappedInputDistanceKm = Math.min(session.distanceKm, Math.max(0, distanceKm));
  const speedLimitedDistanceKm = elapsedDeltaSeconds > 0
    ? Math.min(
      cappedInputDistanceKm,
      previousDistanceKm + elapsedDeltaSeconds * MATCH_PROGRESS_MAX_SPEED_KM_PER_SECOND,
    )
    : previousDistanceKm;
  const nextDistanceKm = Math.max(previousDistanceKm, speedLimitedDistanceKm);

  return {
    distanceKm: Number(Math.min(session.distanceKm, nextDistanceKm).toFixed(3)),
    elapsedSeconds: nextElapsedSeconds,
  };
}
