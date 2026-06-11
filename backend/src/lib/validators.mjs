import { parsePaceToMinutes } from '../points.mjs';
import { addressCatalog } from '../addressCatalog.mjs';
import { isPhoneVerificationPurpose, isValidKoreanMobilePhoneNumber, normalizePhoneNumber } from '../phoneVerification.mjs';
import { ApiError } from '../response/httpResponse.mjs';
import { normalizeOptionalString } from './adminNormalizers.mjs';
import { validateMatchSlotStartAt } from './matchSlotValidation.mjs';

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{3,19}$/;

export function validateRequiredString(value, message) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, message);
  }

  return value.trim();
}

export function validateUsername(value) {
  const username = validateRequiredString(value, '아이디를 입력해주세요.').toLowerCase();

  if (!USERNAME_PATTERN.test(username)) {
    throw new ApiError(400, '아이디는 4~20자의 영문 소문자, 숫자, -, _만 사용할 수 있어요.');
  }

  return username;
}

export function validateNewPassword(value) {
  const password = validateRequiredString(value, '비밀번호를 입력해주세요.');

  if (password.length < 8) {
    throw new ApiError(400, '비밀번호는 8자 이상으로 입력해주세요.');
  }

  if (/\s/.test(password)) {
    throw new ApiError(400, '비밀번호에는 공백을 넣을 수 없어요.');
  }

  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new ApiError(400, '비밀번호에는 영문과 숫자를 모두 포함해주세요.');
  }

  return password;
}

export function validatePhoneVerificationPurpose(value) {
  const purpose = validateRequiredString(value, '휴대폰 인증 목적을 확인할 수 없어요.');

  if (!isPhoneVerificationPurpose(purpose)) {
    throw new ApiError(400, '지원하지 않는 휴대폰 인증 목적이에요.');
  }

  return purpose;
}

export function validatePhoneNumber(value) {
  const normalizedPhone = normalizePhoneNumber(validateRequiredString(value, '휴대폰 번호를 입력해주세요.'));

  if (!isValidKoreanMobilePhoneNumber(normalizedPhone)) {
    throw new ApiError(400, '휴대폰 번호를 정확히 입력해주세요.');
  }

  return normalizedPhone;
}

export function validatePhoneVerificationCode(value) {
  const code = validateRequiredString(value, '인증번호를 입력해주세요.').replace(/\D/g, '');

  if (!/^\d{6}$/.test(code)) {
    throw new ApiError(400, '인증번호 6자리를 입력해주세요.');
  }

  return code;
}

export function validateBoolean(value, message) {
  if (typeof value !== 'boolean') {
    throw new ApiError(400, message);
  }

  return value;
}

export function resolveRegionSelection(rawProvinceName, rawCityName, rawDistrictName) {
  const provinceName = validateRequiredString(rawProvinceName, '시/도를 선택해줘.');
  const cityName = normalizeOptionalString(rawCityName);
  const districtName = validateRequiredString(rawDistrictName, '최종 지역을 선택해줘.');
  const province = addressCatalog.find((entry) => entry.name === provinceName);

  if (!province) {
    throw new ApiError(400, '시/도 선택이 올바르지 않아.');
  }

  const secondaryOptions = province.children ?? [];
  const directDistrict = secondaryOptions.find((entry) => entry.type === 'district' && entry.name === districtName);

  if (directDistrict) {
    if (cityName) {
      throw new ApiError(400, '이 지역은 시/군 선택이 필요하지 않아.');
    }

    return {
      provinceName,
      cityName: '',
      districtName: directDistrict.name,
    };
  }

  const city = secondaryOptions.find((entry) => entry.type === 'city' && entry.name === cityName);

  if (!city) {
    throw new ApiError(400, '시/군 선택이 올바르지 않아.');
  }

  const districtOptions = city.children ?? [];

  if (districtOptions.length === 0) {
    if (districtName !== city.name) {
      throw new ApiError(400, '최종 지역 선택이 올바르지 않아.');
    }

    return {
      provinceName,
      cityName: city.name,
      districtName: city.name,
    };
  }

  const district = districtOptions.find((entry) => entry.name === districtName);

  if (!district) {
    throw new ApiError(400, '최종 지역 선택이 올바르지 않아.');
  }

  return {
    provinceName,
    cityName: city.name,
    districtName: district.name,
  };
}

export function validateDateOnly(value, message) {
  const date = validateRequiredString(value, message);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, '날짜는 YYYY-MM-DD 형식으로 입력해줘.');
  }

  const today = new Date().toISOString().slice(0, 10);

  if (date > today) {
    throw new ApiError(400, '미래 날짜의 기록은 아직 추가할 수 없어.');
  }

  return date;
}

export function validateDistanceKm(value, message) {
  const distanceKm = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    throw new ApiError(400, message);
  }

  if (distanceKm > 200) {
    throw new ApiError(400, '거리는 200km 이하로 입력해줘.');
  }

  return Number(distanceKm.toFixed(1));
}

export function validateRunningMatchProgressDistanceKm(value, message) {
  const distanceKm = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    throw new ApiError(400, message);
  }

  if (distanceKm > 200) {
    throw new ApiError(400, '거리는 200km 이하로 입력해줘.');
  }

  return Number(distanceKm.toFixed(3));
}

export function validateDuelMatchDistanceKm(value) {
  const rawDistanceKm = typeof value === 'number' ? value : Number(value);
  const distanceKm = validateDistanceKm(value, '매칭할 거리를 입력해줘.');

  if (rawDistanceKm < 0.5 || rawDistanceKm > 42.195) {
    throw new ApiError(400, '매칭 거리는 0.5km 이상 42.195km 이하로 선택해줘.');
  }

  return Math.min(42.195, distanceKm);
}

export function validateMatchSlotInput(value) {
  return validateMatchSlotStartAt(
    validateRequiredString(value, '매칭 시간대를 선택해줘.'),
  );
}

export function validateMatchMode(value) {
  const mode = validateRequiredString(value, '매칭 모드를 선택해줘.');

  if (mode !== 'duel' && mode !== 'group') {
    throw new ApiError(400, '매칭 모드 값이 올바르지 않아.');
  }

  return mode;
}

export function validateMatchRoomStartMode(value) {
  const startMode = validateRequiredString(value, '방 시작 방식을 선택해줘.');

  if (startMode !== 'scheduled' && startMode !== 'host') {
    throw new ApiError(400, '방 시작 방식 값이 올바르지 않아.');
  }

  return startMode;
}

export function validateOptionalUserIdArray(value, message) {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new ApiError(400, message);
  }

  return value.map((userId) => validateRequiredString(userId, message));
}

export function validatePace(value, message) {
  const pace = validateRequiredString(value, message);

  if (parsePaceToMinutes(pace) === null) {
    throw new ApiError(400, '페이스는 00:00/km 형식으로 입력해줘.');
  }

  return pace;
}

export function validatePositiveInteger(value, message) {
  const numberValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new ApiError(400, message);
  }

  return numberValue;
}

export function validateNonNegativeInteger(value, message) {
  const numberValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new ApiError(400, message);
  }

  return numberValue;
}

export function validateOptionalMetricNumber(value, {
  message,
  minimum = 0,
  maximum = Number.POSITIVE_INFINITY,
  digits = 1,
} = {}) {
  if (value === null || typeof value === 'undefined' || value === '') {
    return undefined;
  }

  const numberValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(numberValue) || numberValue < minimum || numberValue > maximum) {
    throw new ApiError(400, message);
  }

  return Number(numberValue.toFixed(digits));
}

export function validateTrackedRoute(rawRoute) {
  if (!Array.isArray(rawRoute) || rawRoute.length < 2) {
    throw new ApiError(400, '러닝 경로는 최소 2개 이상의 위치 좌표가 필요해.');
  }

  if (rawRoute.length > 5000) {
    throw new ApiError(400, '러닝 경로 좌표가 너무 많아. 5000개 이하로 줄여줘.');
  }

  return rawRoute.map((point, index) => {
    if (!point || typeof point !== 'object') {
      throw new ApiError(400, `러닝 경로 ${index + 1}번째 좌표가 올바르지 않아.`);
    }

    const latitude = typeof point.latitude === 'number' ? point.latitude : Number(point.latitude);
    const longitude = typeof point.longitude === 'number' ? point.longitude : Number(point.longitude);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new ApiError(400, `러닝 경로 ${index + 1}번째 위도가 올바르지 않아.`);
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new ApiError(400, `러닝 경로 ${index + 1}번째 경도가 올바르지 않아.`);
    }

    const timestamp = validateRequiredString(point.timestamp, `러닝 경로 ${index + 1}번째 시각이 비어 있어.`);
    const parsedTimestamp = new Date(timestamp);

    if (Number.isNaN(parsedTimestamp.getTime())) {
      throw new ApiError(400, `러닝 경로 ${index + 1}번째 시각 형식이 올바르지 않아.`);
    }

    const altitude = validateOptionalMetricNumber(point.altitude, {
      message: `러닝 경로 ${index + 1}번째 고도 값이 올바르지 않아.`,
      minimum: -1000,
      maximum: 10000,
      digits: 1,
    });

    return {
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6)),
      ...(typeof altitude === 'number' ? { altitude } : {}),
      timestamp: parsedTimestamp.toISOString(),
    };
  });
}

export function validateRunMatchResult(rawMatchResult) {
  if (rawMatchResult === null || typeof rawMatchResult === 'undefined') {
    return undefined;
  }

  if (!rawMatchResult || typeof rawMatchResult !== 'object') {
    throw new ApiError(400, '매치 결과 형식이 올바르지 않아.');
  }

  const mode = validateMatchMode(rawMatchResult.mode);
  const title = validateRequiredString(rawMatchResult.title, '매치 결과 제목이 비어 있어.');
  const summary = validateRequiredString(rawMatchResult.summary, '매치 결과 요약이 비어 있어.');
  const badgeLabel = validateRequiredString(rawMatchResult.badgeLabel, '매치 결과 배지가 비어 있어.');
  const opponentName = normalizeOptionalString(rawMatchResult.opponentName);
  const resultTone = normalizeOptionalString(rawMatchResult.resultTone);
  const rank = typeof rawMatchResult.rank !== 'undefined' && rawMatchResult.rank !== null
    ? validatePositiveInteger(rawMatchResult.rank, '매치 순위 값이 올바르지 않아.')
    : undefined;
  const participantCount = typeof rawMatchResult.participantCount !== 'undefined' && rawMatchResult.participantCount !== null
    ? validatePositiveInteger(rawMatchResult.participantCount, '매치 참가 인원 값이 올바르지 않아.')
    : undefined;
  const gapKm = validateOptionalMetricNumber(rawMatchResult.gapKm, {
    message: '매치 거리 차이 값이 올바르지 않아.',
    minimum: 0,
    maximum: 200,
    digits: 2,
  });
  const comparedDistanceKm = validateOptionalMetricNumber(rawMatchResult.comparedDistanceKm, {
    message: '비교 거리 값이 올바르지 않아.',
    minimum: 0,
    maximum: 200,
    digits: 2,
  });

  if (resultTone && !['win', 'lose', 'draw'].includes(resultTone)) {
    throw new ApiError(400, '매치 결과 상태 값이 올바르지 않아.');
  }

  const myPaceLabel = normalizeOptionalString(rawMatchResult.myPaceLabel);
  const opponentPaceLabel = normalizeOptionalString(rawMatchResult.opponentPaceLabel);
  const validateOptionalDurationSeconds = (value, message) => {
    if (typeof value === 'undefined' || value === null) {
      return undefined;
    }

    const seconds = Number(value);

    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 24 * 60 * 60) {
      throw new ApiError(400, message);
    }

    return seconds;
  };
  const myDurationSeconds = validateOptionalDurationSeconds(rawMatchResult.myDurationSeconds, '내 기록 시간 값이 올바르지 않아.');
  const opponentDurationSeconds = validateOptionalDurationSeconds(rawMatchResult.opponentDurationSeconds, '상대 기록 시간 값이 올바르지 않아.');

  return {
    mode,
    title,
    summary,
    badgeLabel,
    ...(opponentName ? { opponentName } : {}),
    ...(resultTone ? { resultTone } : {}),
    ...(typeof rank === 'number' ? { rank } : {}),
    ...(typeof participantCount === 'number' ? { participantCount } : {}),
    ...(typeof gapKm === 'number' ? { gapKm } : {}),
    ...(typeof comparedDistanceKm === 'number' ? { comparedDistanceKm } : {}),
    ...(myPaceLabel ? { myPaceLabel } : {}),
    ...(typeof myDurationSeconds === 'number' ? { myDurationSeconds } : {}),
    ...(opponentPaceLabel ? { opponentPaceLabel } : {}),
    ...(typeof opponentDurationSeconds === 'number' ? { opponentDurationSeconds } : {}),
  };
}

export function validateRoutePreviewCoordinates(rawCoordinates) {
  if (!Array.isArray(rawCoordinates) || rawCoordinates.length < 2) {
    throw new ApiError(400, '추천 경로 좌표는 최소 2개 이상 필요해.');
  }

  if (rawCoordinates.length > 40) {
    throw new ApiError(400, '추천 경로 좌표가 너무 많아. 조금 줄여서 다시 시도해줘.');
  }

  return rawCoordinates.map((coordinate, index) => {
    if (!coordinate || typeof coordinate !== 'object') {
      throw new ApiError(400, `추천 경로 ${index + 1}번째 좌표가 올바르지 않아.`);
    }

    const latitude = typeof coordinate.latitude === 'number' ? coordinate.latitude : Number(coordinate.latitude);
    const longitude = typeof coordinate.longitude === 'number' ? coordinate.longitude : Number(coordinate.longitude);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new ApiError(400, `추천 경로 ${index + 1}번째 위도가 올바르지 않아.`);
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new ApiError(400, `추천 경로 ${index + 1}번째 경도가 올바르지 않아.`);
    }

    return {
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6)),
    };
  });
}

export function validateOptionalInventoryCount(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return validateNonNegativeInteger(value, '재고 수량은 0 이상의 정수로 입력해줘.');
}

export function validateDateTime(value, message) {
  const text = validateRequiredString(value, message);
  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, '일시는 올바른 날짜/시간 형식으로 입력해줘.');
  }

  return date.toISOString();
}

export function validateOptionalDateTime(value, message) {
  if (value === null || typeof value === 'undefined' || value === '') {
    return undefined;
  }

  return validateDateTime(value, message);
}

export function validateRewardRedemptionStatus(value) {
  const status = validateRequiredString(value, '교환 상태를 선택해줘.');

  if (!['requested', 'fulfilled', 'cancelled'].includes(status)) {
    throw new ApiError(400, '교환 상태 값이 올바르지 않아.');
  }

  return status;
}
