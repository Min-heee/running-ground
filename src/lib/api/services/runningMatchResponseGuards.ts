import { ApiError } from '@/services/apiError';
import type { RunningMatchStatusResponse } from '../types';

export const INVALID_MATCH_STATUS_RESPONSE_MESSAGE = '매칭 상태를 불러오지 못했습니다. 다시 시도해주세요.';

type MatchStatusGuardOptions = {
  action: string;
  expectedMatchId?: string | null;
  requireMatchId?: boolean;
  userMessage?: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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

export function ensureRunningMatchStatusResponse(
  payload: RunningMatchStatusResponse,
  options: MatchStatusGuardOptions,
): RunningMatchStatusResponse {
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

  return payload;
}
