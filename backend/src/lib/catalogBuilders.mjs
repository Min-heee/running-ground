import { addressCatalog } from '../addressCatalog.mjs';
import { buildNoticeEntry, normalizeOptionalString } from './adminNormalizers.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function buildRegionCatalog() {
  return {
    regions: clone(addressCatalog),
  };
}

export function buildActiveNotices(store) {
  ensureNoticeStore(store);

  return {
    items: [...store.notices]
      .filter((notice) => notice.isActive !== false)
      .sort((left, right) => {
        if (right.priority !== left.priority) {
          return right.priority - left.priority;
        }

        return normalizeOptionalString(right.updatedAt).localeCompare(normalizeOptionalString(left.updatedAt));
      })
      .map((notice) => buildNoticeEntry(notice)),
  };
}

export function ensureNoticeStore(store) {
  if (!Array.isArray(store.notices)) {
    store.notices = [];
  }

  for (const notice of store.notices) {
    if (typeof notice.priority !== 'number' || !Number.isFinite(notice.priority)) {
      notice.priority = 0;
    }

    if (typeof notice.isActive !== 'boolean') {
      notice.isActive = true;
    }
  }
}

export function buildAdminNotices(store) {
  ensureNoticeStore(store);

  return {
    items: [...store.notices]
      .sort((left, right) => {
        if (right.priority !== left.priority) {
          return right.priority - left.priority;
        }

        return normalizeOptionalString(right.updatedAt).localeCompare(normalizeOptionalString(left.updatedAt));
      })
      .map((notice) => buildNoticeEntry(notice)),
  };
}
