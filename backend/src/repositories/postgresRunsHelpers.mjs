export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function isSyncableSourceType(sourceType) {
  return sourceType !== 'manual';
}

export function inferSourceTypeFromLabel(label, sourceLabels) {
  const normalizedLabel = normalizeOptionalString(label).toLowerCase();

  if (normalizedLabel === 'nrc') {
    return 'nrc';
  }

  if (normalizedLabel === 'mynb' || normalizedLabel === 'my nb' || normalizedLabel === 'new balance') {
    return 'mynb';
  }

  return Object.entries(sourceLabels)
    .find(([, displayName]) => displayName.toLowerCase() === normalizedLabel)?.[0] ?? null;
}

export function getRunSourceType(run, sourceLabels) {
  return normalizeOptionalString(run.sourceType) || inferSourceTypeFromLabel(run.source, sourceLabels);
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function asNumber(value, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

export function toIsoString(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' && value) {
    return value;
  }

  return '';
}

export function toDateOnly(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'string' && value) {
    return value.slice(0, 10);
  }

  return '';
}

export function createNowIso() {
  return new Date().toISOString();
}

export function createDisplayTimestamp() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function isUniqueViolation(error, constraintName) {
  return error?.code === '23505' && (
    error.constraint === constraintName || String(error.message ?? '').includes(constraintName)
  );
}
