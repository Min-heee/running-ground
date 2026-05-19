import { normalizeOptionalString } from './adminNormalizers.mjs';
import { ApiError } from '../response/httpResponse.mjs';
import {
  validateBoolean,
  validateDateOnly,
  validateDateTime,
  validateDistanceKm,
  validateNonNegativeInteger,
  validateOptionalDateTime,
  validateOptionalInventoryCount,
  validatePace,
  validatePositiveInteger,
  validateRequiredString,
} from './validators.mjs';

export function normalizeAdminMarketItemInput(body) {
  return {
    title: validateRequiredString(body.title, '상품 이름을 입력해줘.'),
    category: validateRequiredString(body.category, '카테고리를 입력해줘.'),
    description: validateRequiredString(body.description, '상품 설명을 입력해줘.'),
    costPoints: validatePositiveInteger(body.costPoints, '필요 포인트는 1 이상으로 입력해줘.'),
    partnerName: normalizeOptionalString(body.partnerName) || undefined,
    repeatable: validateBoolean(body.repeatable, '반복 교환 여부가 올바르지 않아.'),
    isActive: validateBoolean(body.isActive, '활성 상태가 올바르지 않아.'),
    inventoryCount: validateOptionalInventoryCount(body.inventoryCount),
  };
}

export function normalizeAdminOfflineRaceEventInput(body) {
  const startsAt = validateDateTime(body.startsAt, '출발 일시를 입력해줘.');
  const registrationClosesAt = validateDateTime(body.registrationClosesAt, '접수 마감 일시를 입력해줘.');

  if (new Date(registrationClosesAt).getTime() >= new Date(startsAt).getTime()) {
    throw new ApiError(400, '접수 마감은 출발 시간보다 이전이어야 해.');
  }

  return {
    title: validateRequiredString(body.title, '레이스 이름을 입력해줘.'),
    subtitle: validateRequiredString(body.subtitle, '레이스 한 줄 설명을 입력해줘.'),
    distanceKm: validateDistanceKm(body.distanceKm, '레이스 거리를 입력해줘.'),
    startsAt,
    registrationClosesAt,
    participationMode: validateRequiredString(body.participationMode, '운영 방식을 입력해줘.'),
    proofMethod: validateRequiredString(body.proofMethod, '기록 인증 방식을 입력해줘.'),
    runWindowMinutes: validatePositiveInteger(body.runWindowMinutes, '진행 시간은 1분 이상으로 입력해줘.'),
    hostLabel: validateRequiredString(body.hostLabel, '운영 주체를 입력해줘.'),
    capacity: validatePositiveInteger(body.capacity, '정원은 1명 이상으로 입력해줘.'),
    entryFeePoints: validateNonNegativeInteger(body.entryFeePoints, '참가 포인트는 0 이상으로 입력해줘.'),
    operationNote: validateRequiredString(body.operationNote, '운영 안내를 입력해줘.'),
  };
}

export function normalizeAdminNoticeInput(body) {
  return {
    title: validateRequiredString(body.title, '공지 제목을 입력해줘.'),
    message: validateRequiredString(body.message, '공지 내용을 입력해줘.'),
    priority: validateNonNegativeInteger(body.priority, '공지 우선순위는 0 이상의 정수로 입력해줘.'),
    isActive: validateBoolean(body.isActive, '공지 활성 상태가 올바르지 않아.'),
  };
}

export function normalizeImportedRun(sourceType, rawRun) {
  const sourceLabel = normalizeOptionalString(rawRun.sourceLabel);
  const startedAt = validateOptionalDateTime(rawRun.startedAt, '연동 기록 시작 시각 형식이 올바르지 않아.');
  const endedAt = validateOptionalDateTime(rawRun.endedAt, '연동 기록 종료 시각 형식이 올바르지 않아.');
  const durationSeconds = rawRun.durationSeconds === null || typeof rawRun.durationSeconds === 'undefined' || rawRun.durationSeconds === ''
    ? undefined
    : validatePositiveInteger(rawRun.durationSeconds, '연동 기록 시간은 1초 이상이어야 해.');

  if (startedAt && endedAt && new Date(endedAt).getTime() <= new Date(startedAt).getTime()) {
    throw new ApiError(400, '연동 기록 종료 시각은 시작 시각보다 뒤여야 해.');
  }

  return {
    sourceType,
    externalId: normalizeOptionalString(rawRun.externalId),
    ...(sourceLabel
      ? {
          sourceLabel:
            sourceLabel === 'Nike Run Club'
              ? 'NRC'
              : sourceLabel === 'New Balance' || sourceLabel === 'My NB'
                ? 'MyNB'
                : sourceLabel,
        }
      : {}),
    date: validateDateOnly(rawRun.date, '연동 기록 날짜를 입력해줘.'),
    distanceKm: validateDistanceKm(rawRun.distanceKm, '연동 기록 거리를 입력해줘.'),
    pace: validatePace(rawRun.pace, '연동 기록 페이스를 입력해줘.'),
    ...(typeof durationSeconds === 'number' ? { durationSeconds } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(endedAt ? { endedAt } : {}),
  };
}
