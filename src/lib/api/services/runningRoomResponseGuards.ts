import { ApiError, isApiError } from '@/services/apiError';
import type { JoinedRunningMatchRoomResponse, RunningMatchRoomResponse } from '../types';

export const MISSING_JOINED_ROOM_MESSAGE = '방 정보를 불러오지 못했습니다. 다시 시도해주세요.';

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

export function ensureJoinedRunningMatchRoomResponse(payload: RunningMatchRoomResponse): JoinedRunningMatchRoomResponse {
  if (payload.success && payload.room?.roomId) {
    return payload as JoinedRunningMatchRoomResponse;
  }

  throw new ApiError(
    'request',
    MISSING_JOINED_ROOM_MESSAGE,
    {
      details: {
        ...payload,
        success: false,
        invalidReason: payload.room ? 'missingRoomId' : 'missingRoom',
      },
      userMessage: MISSING_JOINED_ROOM_MESSAGE,
    },
  );
}
