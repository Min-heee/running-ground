import { ApiError, isApiError } from '@/services/apiError';
import type {
  JoinedRunningMatchRoomResponse,
  RunningMatchRoom,
  RunningMatchRoomCleanupResponse,
  RunningMatchRoomErrorCode,
  RunningMatchRoomResponse,
} from '../types';

export const MISSING_JOINED_ROOM_MESSAGE = '방 정보를 불러오지 못했습니다. 다시 시도해주세요.';
export const INVALID_ROOM_RESPONSE_MESSAGE = '방 정보를 불러오지 못했습니다. 다시 시도해주세요.';
export const INVALID_CLEANUP_RESPONSE_MESSAGE = '이전 방 상태를 확인하지 못했습니다. 다시 시도해주세요.';

export function shouldFallbackToLocalRunningRoomApi(error: unknown) {
  if (isApiError(error)) {
    if (error.kind === 'request' && error.status === 404) {
      const message = `${error.message} ${error.userMessage}`.trim();

      return message.includes('요청한 API를 찾을 수 없어')
        || message.includes('공개 터널 또는 프록시 응답 오류');
    }

    return false;
  }

  return error instanceof Error
    && (
      error.message.includes('요청한 API를 찾을 수 없어')
      || error.message.includes('공개 터널 또는 프록시 응답 오류')
  );
}

type RoomResponseGuardOptions = {
  action: string;
  requireInviteToken?: boolean;
  requireRoom?: boolean;
  userMessage?: string;
};

type InvalidRoomResponseReason =
  | 'missingRoom'
  | 'missingRoomId'
  | 'missingInviteToken'
  | 'missingInviteLink'
  | 'missingMode'
  | 'missingState'
  | 'missingStartMode'
  | 'missingHostUserId'
  | 'missingHostName'
  | 'missingParticipants'
  | 'missingDistanceKm'
  | 'missingSlotStartAt'
  | 'missingRequiredRoom'
  | 'failedResponse';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function getInvalidRoomReason(room: RunningMatchRoom | null | undefined, {
  requireInviteToken = true,
}: Pick<RoomResponseGuardOptions, 'requireInviteToken'> = {}): InvalidRoomResponseReason | null {
  if (!room) {
    return 'missingRoom';
  }

  if (!isNonEmptyString(room.roomId)) {
    return 'missingRoomId';
  }

  if (requireInviteToken && !isNonEmptyString(room.inviteToken)) {
    return 'missingInviteToken';
  }

  if (requireInviteToken && !isNonEmptyString(room.inviteLink)) {
    return 'missingInviteLink';
  }

  if (room.mode !== 'duel' && room.mode !== 'group') {
    return 'missingMode';
  }

  if (!['waiting', 'arming', 'countdown', 'active'].includes(room.state)) {
    return 'missingState';
  }

  if (room.startMode !== 'scheduled' && room.startMode !== 'host') {
    return 'missingStartMode';
  }

  if (!Number.isFinite(room.distanceKm)) {
    return 'missingDistanceKm';
  }

  if (!isNonEmptyString(room.slotStartAt)) {
    return 'missingSlotStartAt';
  }

  if (!isNonEmptyString(room.hostUserId)) {
    return 'missingHostUserId';
  }

  if (!isNonEmptyString(room.hostName)) {
    return 'missingHostName';
  }

  if (!Array.isArray(room.participants)) {
    return 'missingParticipants';
  }

  return null;
}

function buildInvalidRoomResponseError(
  payload: unknown,
  reason: InvalidRoomResponseReason,
  options: RoomResponseGuardOptions,
) {
  const userMessage = options.userMessage ?? INVALID_ROOM_RESPONSE_MESSAGE;

  return new ApiError(
    'request',
    `Invalid running match room response for ${options.action}: ${reason}`,
    {
      details: {
        code: 'invalid_room_response' satisfies RunningMatchRoomErrorCode,
        action: options.action,
        invalidReason: reason,
        payload,
      },
      userMessage,
    },
  );
}

export function ensureRunningMatchRoomResponse(
  payload: RunningMatchRoomResponse,
  options: RoomResponseGuardOptions,
): RunningMatchRoomResponse {
  if (!payload.success) {
    throw buildInvalidRoomResponseError(payload, 'failedResponse', options);
  }

  if (!payload.room) {
    if (options.requireRoom) {
      throw buildInvalidRoomResponseError(payload, 'missingRequiredRoom', options);
    }

    return payload;
  }

  const invalidReason = getInvalidRoomReason(payload.room, options);
  if (invalidReason) {
    throw buildInvalidRoomResponseError(payload, invalidReason, options);
  }

  return payload;
}

export function ensureJoinedRunningMatchRoomResponse(payload: RunningMatchRoomResponse): JoinedRunningMatchRoomResponse {
  const guardedPayload = ensureRunningMatchRoomResponse(payload, {
    action: 'join',
    requireRoom: true,
    userMessage: MISSING_JOINED_ROOM_MESSAGE,
  });

  if (guardedPayload.room) {
    return guardedPayload as JoinedRunningMatchRoomResponse;
  }

  throw buildInvalidRoomResponseError(payload, 'missingRoom', {
    action: 'join',
    requireRoom: true,
    userMessage: MISSING_JOINED_ROOM_MESSAGE,
  });
}

export function ensureRunningMatchRoomCleanupResponse(
  payload: RunningMatchRoomCleanupResponse,
): RunningMatchRoomCleanupResponse {
  if (!payload.success) {
    throw new ApiError(
      'request',
      'Invalid running match room cleanup response: failedResponse',
      {
        details: {
          code: 'invalid_room_response' satisfies RunningMatchRoomErrorCode,
          action: 'cleanup-stale',
          invalidReason: 'failedResponse',
          payload,
        },
        userMessage: INVALID_CLEANUP_RESPONSE_MESSAGE,
      },
    );
  }

  if (typeof payload.cleaned !== 'boolean' || !Array.isArray(payload.cleanedItems)) {
    throw new ApiError(
      'request',
      'Invalid running match room cleanup response: missingCleanupFields',
      {
        details: {
          code: 'invalid_room_response' satisfies RunningMatchRoomErrorCode,
          action: 'cleanup-stale',
          invalidReason: 'missingCleanupFields',
          payload,
        },
        userMessage: INVALID_CLEANUP_RESPONSE_MESSAGE,
      },
    );
  }

  if (payload.room) {
    ensureRunningMatchRoomResponse(
      {
        room: payload.room,
        serverNow: payload.serverNow,
        success: true,
      },
      {
        action: 'cleanup-stale',
        requireRoom: false,
        userMessage: INVALID_CLEANUP_RESPONSE_MESSAGE,
      },
    );
  }

  return payload;
}
