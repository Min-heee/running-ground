export type ManualRunValidationInput = {
  date: string;
  distanceKmText: string;
  pace: string;
};

export type ManualRunValidationResult =
  | {
    valid: true;
    value: {
      date: string;
      distanceKm: number;
      pace: string;
    };
  }
  | {
    valid: false;
    message: string;
  };

export function normalizeDistanceInput(value: string) {
  return value.replace(',', '.').trim();
}

export function validateManualRunInput(input: ManualRunValidationInput): ManualRunValidationResult {
  const date = input.date;
  const distanceKmText = normalizeDistanceInput(input.distanceKmText);
  const pace = input.pace.trim();
  const parsedDistanceKm = Number(distanceKmText);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      valid: false,
      message: '날짜는 YYYY-MM-DD 형식으로 입력해줘.',
    };
  }

  if (!Number.isFinite(parsedDistanceKm) || parsedDistanceKm <= 0) {
    return {
      valid: false,
      message: '거리는 0보다 큰 숫자로 입력해줘.',
    };
  }

  if (!/^\d{1,2}:\d{2}\/km$/i.test(pace)) {
    return {
      valid: false,
      message: '페이스는 00:00/km 형식으로 입력해줘.',
    };
  }

  return {
    valid: true,
    value: {
      date,
      distanceKm: parsedDistanceKm,
      pace,
    },
  };
}
