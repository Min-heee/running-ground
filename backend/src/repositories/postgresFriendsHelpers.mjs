export const LIVE_RUN_SHARE_METADATA_KEY = 'live_run_shares';
export const LIVE_RUN_SHARE_STALE_MS = 2 * 60 * 1000;

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

export function normalizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeLiveShareStatus(value) {
  return value === 'running' || value === 'paused' ? value : 'idle';
}

export function normalizeLiveShareLabel(value) {
  return normalizeOptionalString(value).slice(0, 80);
}
