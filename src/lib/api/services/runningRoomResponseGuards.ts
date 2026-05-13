import { ApiError, isApiError } from '@/services/apiError';
import type { RunningMatchRoomResponse } from '../types';

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

export function ensureJoinedRunningMatchRoomResponse(payload: RunningMatchRoomResponse): RunningMatchRoomResponse {
  if (payload.success && payload.room?.roomId) {
    return payload;
  }

  throw new ApiError(
    'request',
    '참여할 방 정보를 확인하지 못했어. 초대 코드가 잘못됐거나 방이 삭제됐을 수 있어.',
    {
      details: payload,
      userMessage: '참여할 방 정보를 확인하지 못했어. 초대 코드가 잘못됐거나 방이 삭제됐을 수 있어.',
    },
  );
}
