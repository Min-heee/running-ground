import type { RunningMatchStatusResponse } from '../../types';
import {
  MATCH_BACKGROUND_STALE_MS,
  MATCH_RUNNING_STALE_MS,
} from './matchScheduling';

export type MockMatchLiveStatus = 'ready' | 'running' | 'background' | 'paused' | 'disconnected' | 'forfeited' | 'finished';

export function resolveMockParticipantLiveStatus(
  participant: { liveStatus?: string; liveUpdatedAt?: string; finishedAt?: string },
  now = Date.now(),
): MockMatchLiveStatus {
  if (participant.finishedAt) {
    return 'finished';
  }

  const storedStatus: MockMatchLiveStatus = participant.liveStatus === 'running'
    || participant.liveStatus === 'background'
    || participant.liveStatus === 'paused'
    || participant.liveStatus === 'disconnected'
    || participant.liveStatus === 'forfeited'
    || participant.liveStatus === 'finished'
    || participant.liveStatus === 'ready'
    ? participant.liveStatus
    : 'ready';
  if (!participant.liveUpdatedAt || storedStatus === 'ready' || storedStatus === 'forfeited') {
    return storedStatus;
  }

  const liveUpdatedAtMs = new Date(participant.liveUpdatedAt).getTime();
  if (!Number.isFinite(liveUpdatedAtMs)) {
    return storedStatus;
  }

  const ageMs = now - liveUpdatedAtMs;
  if (storedStatus === 'running' && ageMs > MATCH_RUNNING_STALE_MS) {
    return 'disconnected';
  }

  if ((storedStatus === 'background' || storedStatus === 'paused') && ageMs > MATCH_BACKGROUND_STALE_MS) {
    return 'disconnected';
  }

  return storedStatus;
}

export function hydrateMockRunningMatchSessionStatuses(session: RunningMatchStatusResponse): RunningMatchStatusResponse {
  return {
    ...session,
    currentUserLiveStatus: session.currentUserLiveStatus
      ? resolveMockParticipantLiveStatus({
        liveStatus: session.currentUserLiveStatus,
        liveUpdatedAt: new Date().toISOString(),
      })
      : session.currentUserLiveStatus,
    ...(session.opponent ? {
      opponent: {
        ...session.opponent,
        liveStatus: resolveMockParticipantLiveStatus(session.opponent),
      },
    } : {}),
    ...(session.participants ? {
      participants: session.participants.map((participant) => ({
        ...participant,
        liveStatus: resolveMockParticipantLiveStatus(participant),
      })),
    } : {}),
  };
}
