import { ApiError } from '@/services/apiError';
import type { RunningMatchStatusResponse } from '../types';

export const INVALID_MATCH_STATUS_RESPONSE_MESSAGE = '매칭 상태를 불러오지 못했습니다. 다시 시도해주세요.';
export const INVALID_MATCH_PROGRESS_RESPONSE_MESSAGE = '실시간 경쟁 상태를 업데이트하지 못했습니다. 다시 시도해주세요.';

type MatchStatusGuardOptions = {
  action: string;
  expectedMatchId?: string | null;
  requireMatchId?: boolean;
  userMessage?: string;
};

type MatchParticipantGuardResult = {
  index?: number;
  reason: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function buildInvalidMatchStatusError(
  payload: unknown,
  invalidReason: string,
  options: MatchStatusGuardOptions,
) {
  const userMessage = options.userMessage ?? INVALID_MATCH_STATUS_RESPONSE_MESSAGE;

  return new ApiError(
    'request',
    `Invalid running match status response for ${options.action}: ${invalidReason}`,
    {
      details: {
        action: options.action,
        code: 'invalid_match_status_response',
        expectedMatchId: options.expectedMatchId ?? null,
        invalidReason,
        payload,
      },
      userMessage,
    },
  );
}

function getInvalidParticipantReason(
  payload: RunningMatchStatusResponse,
): MatchParticipantGuardResult | null {
  if (payload.mode === 'duel' && payload.opponent) {
    if (!isNonEmptyString(payload.opponent.id)) {
      return { reason: 'missingOpponentUserId' };
    }

    if (!isNonEmptyString(payload.opponent.name)) {
      return { reason: 'missingOpponentName' };
    }
  }

  if (payload.mode === 'group' && payload.participants) {
    for (const [index, participant] of payload.participants.entries()) {
      if (!isNonEmptyString(participant.id)) {
        return { index, reason: 'missingParticipantUserId' };
      }

      if (!isNonEmptyString(participant.name)) {
        return { index, reason: 'missingParticipantName' };
      }
    }
  }

  return null;
}

export function ensureRunningMatchStatusResponse(
  payload: RunningMatchStatusResponse,
  options: MatchStatusGuardOptions,
): RunningMatchStatusResponse {
  if (!isRecord(payload)) {
    throw buildInvalidMatchStatusError(payload, 'missingPayload', options);
  }

  if (!payload.success) {
    throw buildInvalidMatchStatusError(payload, 'failedResponse', options);
  }

  const needsMatchId = Boolean(options.requireMatchId || options.expectedMatchId);

  if (needsMatchId && !isNonEmptyString(payload.matchId)) {
    throw buildInvalidMatchStatusError(payload, 'missingMatchId', options);
  }

  if (options.expectedMatchId && payload.matchId !== options.expectedMatchId) {
    throw buildInvalidMatchStatusError(payload, 'mismatchedMatchId', options);
  }

  if (payload.mode !== 'duel' && payload.mode !== 'group') {
    throw buildInvalidMatchStatusError(payload, 'missingMode', options);
  }

  if (!['idle', 'waiting', 'matched', 'active'].includes(payload.state)) {
    throw buildInvalidMatchStatusError(payload, 'missingState', options);
  }

  if (!Number.isFinite(payload.distanceKm)) {
    throw buildInvalidMatchStatusError(payload, 'missingDistanceKm', options);
  }

  if (!isNonEmptyString(payload.slotStartAt)) {
    throw buildInvalidMatchStatusError(payload, 'missingSlotStartAt', options);
  }

  const invalidParticipantReason = getInvalidParticipantReason(payload);
  if (invalidParticipantReason) {
    throw buildInvalidMatchStatusError(payload, invalidParticipantReason.reason, {
      ...options,
      action: invalidParticipantReason.index === undefined
        ? options.action
        : `${options.action}:participant:${invalidParticipantReason.index}`,
    });
  }

  return payload;
}

export function ensureRunningMatchProgressResponse(
  payload: RunningMatchStatusResponse,
  options: Omit<MatchStatusGuardOptions, 'requireMatchId' | 'userMessage'> & {
    userMessage?: string;
  },
): RunningMatchStatusResponse {
  return ensureRunningMatchStatusResponse(payload, {
    ...options,
    requireMatchId: true,
    userMessage: options.userMessage ?? INVALID_MATCH_PROGRESS_RESPONSE_MESSAGE,
  });
}
