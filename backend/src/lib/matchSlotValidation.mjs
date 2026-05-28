import { ApiError } from '../response/httpResponse.mjs';
import {
  MATCH_BOOKING_WINDOW_DAYS,
} from './matchConstants.mjs';
import { isMatchSlotClosed } from './matchScheduleHelpers.mjs';

export function validateMatchSlotStartAt(slotStartAt, now = new Date()) {
  const slotStart = new Date(slotStartAt);

  if (Number.isNaN(slotStart.getTime())) {
    throw new ApiError(400, '매칭 시작 시간이 올바르지 않아.');
  }

  if (slotStart.getMinutes() !== 0 || slotStart.getSeconds() !== 0 || slotStart.getMilliseconds() !== 0) {
    throw new ApiError(400, '매칭 시간은 1시간 단위로만 선택할 수 있어.');
  }

  const maxSelectableAt = new Date(now.getTime() + MATCH_BOOKING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  if (slotStart.getTime() > maxSelectableAt.getTime()) {
    throw new ApiError(400, '매칭은 오늘부터 1주일 안의 시간대까지만 예약할 수 있어.');
  }

  if (isMatchSlotClosed(slotStartAt, now)) {
    throw new ApiError(400, '이 시간대는 출발 30분 전이 지나서 더 이상 선택할 수 없어.');
  }

  return slotStart.toISOString();
}

function validateRequiredString(value, message) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, message);
  }

  return value.trim();
}

export function validateMatchSlotInput(value) {
  return validateMatchSlotStartAt(
    validateRequiredString(value, '매칭 시간대를 선택해줘.'),
  );
}

export function parseLenientMatchSlotInput(value) {
  const slotStartAt = validateRequiredString(value, '매칭 시간대를 선택해줘.');
  const slotStart = new Date(slotStartAt);

  if (Number.isNaN(slotStart.getTime())) {
    throw new ApiError(400, '매칭 시작 시간이 올바르지 않아.');
  }

  return slotStart.toISOString();
}
