import { ApiError } from '@/services/apiError';
import type { RunDetailResponse } from '../types';

export const INVALID_RUN_RESPONSE_MESSAGE = '러닝 기록을 불러오지 못했습니다. 다시 시도해주세요.';
export const INVALID_RUN_SAVE_RESPONSE_MESSAGE = '러닝 기록 저장에 실패했습니다. 다시 시도해주세요.';

export type RunningRunResponseErrorCode = 'invalid_run_response';

type RunResponseGuardOptions = {
  action: string;
  userMessage?: string;
};

type InvalidRunResponseReason =
  | 'missingPayload'
  | 'missingRun'
  | 'missingRunId'
  | 'missingDate'
  | 'missingDistanceKm'
  | 'missingPace'
  | 'missingSource'
  | 'missingWeeklyDistanceKm'
  | 'missingEstimatedMinutes'
  | 'missingEarnedPoint'
  | 'missingPointBreakdown'
  | 'missingPointBreakdownTotal';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function buildInvalidRunResponseError(
  payload: unknown,
  invalidReason: InvalidRunResponseReason,
  options: RunResponseGuardOptions,
) {
  return new ApiError(
    'request',
    `Invalid running run response for ${options.action}: ${invalidReason}`,
    {
      details: {
        action: options.action,
        code: 'invalid_run_response' satisfies RunningRunResponseErrorCode,
        invalidReason,
        payload,
      },
      userMessage: options.userMessage ?? INVALID_RUN_RESPONSE_MESSAGE,
    },
  );
}

export function ensureRunDetailResponse(
  payload: RunDetailResponse,
  options: RunResponseGuardOptions,
): RunDetailResponse {
  if (!isRecord(payload)) {
    throw buildInvalidRunResponseError(payload, 'missingPayload', options);
  }

  if (!payload.run) {
    throw buildInvalidRunResponseError(payload, 'missingRun', options);
  }

  if (!isNonEmptyString(payload.run.id)) {
    throw buildInvalidRunResponseError(payload, 'missingRunId', options);
  }

  if (!isNonEmptyString(payload.run.date)) {
    throw buildInvalidRunResponseError(payload, 'missingDate', options);
  }

  if (!Number.isFinite(payload.run.distanceKm)) {
    throw buildInvalidRunResponseError(payload, 'missingDistanceKm', options);
  }

  if (!isNonEmptyString(payload.run.pace)) {
    throw buildInvalidRunResponseError(payload, 'missingPace', options);
  }

  if (!isNonEmptyString(payload.run.source)) {
    throw buildInvalidRunResponseError(payload, 'missingSource', options);
  }

  if (!Number.isFinite(payload.weeklyDistanceKm)) {
    throw buildInvalidRunResponseError(payload, 'missingWeeklyDistanceKm', options);
  }

  if (!Number.isFinite(payload.estimatedMinutes)) {
    throw buildInvalidRunResponseError(payload, 'missingEstimatedMinutes', options);
  }

  if (!Number.isFinite(payload.earnedPoint)) {
    throw buildInvalidRunResponseError(payload, 'missingEarnedPoint', options);
  }

  if (!payload.pointBreakdown) {
    throw buildInvalidRunResponseError(payload, 'missingPointBreakdown', options);
  }

  if (!Number.isFinite(payload.pointBreakdown.totalPoints)) {
    throw buildInvalidRunResponseError(payload, 'missingPointBreakdownTotal', options);
  }

  return payload;
}

export function ensureRunSaveResponse(
  payload: RunDetailResponse,
  options: Omit<RunResponseGuardOptions, 'userMessage'> & { userMessage?: string },
): RunDetailResponse {
  return ensureRunDetailResponse(payload, {
    ...options,
    userMessage: options.userMessage ?? INVALID_RUN_SAVE_RESPONSE_MESSAGE,
  });
}
