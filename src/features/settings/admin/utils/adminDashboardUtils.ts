import { Platform } from 'react-native';
import type {
  AdminMarketItem,
  AdminNotice,
  AdminOfflineRaceEvent,
  AdminRewardRedemption,
  AdminUserSummary,
} from '@/lib/api/types';
import type { MarketFormState, NoticeFormState, RaceFormState } from '@/features/settings/admin/types';

const ADMIN_TOKEN_STORAGE_KEY = 'runningground-admin-token';
const LEGACY_ADMIN_TOKEN_STORAGE_KEY = 'runnigapp-admin-token';

export function createEmptyMarketForm(): MarketFormState {
  return {
    title: '',
    category: '',
    description: '',
    costPoints: '',
    partnerName: '',
    repeatable: false,
    isActive: true,
    inventoryCount: '',
  };
}

export function createEmptyNoticeForm(): NoticeFormState {
  return {
    title: '',
    message: '',
    priority: '0',
    isActive: true,
  };
}

export function createEmptyRaceForm(): RaceFormState {
  return {
    title: '',
    subtitle: '',
    distanceKm: '',
    startsAt: '',
    registrationClosesAt: '',
    participationMode: '각자 러닝 후 기록 인증',
    proofMethod: '앱 연동 기록 또는 수동 인증',
    runWindowMinutes: '180',
    hostLabel: 'RunningGround',
    capacity: '80',
    entryFeePoints: '0',
    operationNote: '정해진 시간 안에 각자 출발하고 기록이 자동 집계돼요.',
  };
}

export function readStoredAdminToken() {
  if (Platform.OS !== 'web') {
    return '';
  }

  try {
    const currentValue = globalThis.localStorage?.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? '';

    if (currentValue) {
      return currentValue;
    }

    const legacyValue = globalThis.localStorage?.getItem(LEGACY_ADMIN_TOKEN_STORAGE_KEY) ?? '';

    if (legacyValue) {
      globalThis.localStorage?.setItem(ADMIN_TOKEN_STORAGE_KEY, legacyValue);
      globalThis.localStorage?.removeItem(LEGACY_ADMIN_TOKEN_STORAGE_KEY);
    }

    return legacyValue;
  } catch {
    return '';
  }
}

export function writeStoredAdminToken(adminToken: string) {
  if (Platform.OS !== 'web') {
    return;
  }

  try {
    globalThis.localStorage?.setItem(ADMIN_TOKEN_STORAGE_KEY, adminToken);
    globalThis.localStorage?.removeItem(LEGACY_ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage failures in private mode or restricted browsers.
  }
}

export function clearStoredAdminToken() {
  if (Platform.OS !== 'web') {
    return;
  }

  try {
    globalThis.localStorage?.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    globalThis.localStorage?.removeItem(LEGACY_ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage failures in restricted browsers.
  }
}

export function confirmAction(message: string) {
  if (typeof globalThis.confirm === 'function') {
    return globalThis.confirm(message);
  }

  return true;
}

export function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function toMarketForm(item: AdminMarketItem): MarketFormState {
  return {
    title: item.title,
    category: item.category,
    description: item.description,
    costPoints: String(item.costPoints),
    partnerName: item.partnerName ?? '',
    repeatable: item.repeatable,
    isActive: item.isActive,
    inventoryCount: item.inventoryCount === null ? '' : String(item.inventoryCount),
  };
}

export function toRaceForm(event: AdminOfflineRaceEvent): RaceFormState {
  return {
    title: event.title,
    subtitle: event.subtitle,
    distanceKm: String(event.distanceKm),
    startsAt: toDateTimeLocalValue(event.startsAt),
    registrationClosesAt: toDateTimeLocalValue(event.registrationClosesAt),
    participationMode: event.participationMode,
    proofMethod: event.proofMethod,
    runWindowMinutes: String(event.runWindowMinutes),
    hostLabel: event.hostLabel,
    capacity: String(event.capacity),
    entryFeePoints: String(event.entryFeePoints),
    operationNote: event.operationNote,
  };
}

export function toNoticeForm(notice: AdminNotice): NoticeFormState {
  return {
    title: notice.title,
    message: notice.message,
    priority: String(notice.priority),
    isActive: notice.isActive,
  };
}

export function buildRedemptionNoteDrafts(items: AdminRewardRedemption[]) {
  return items.reduce<Record<string, string>>((map, item) => {
    map[item.id] = item.adminNote ?? '';
    return map;
  }, {});
}

export function getRewardStatusLabel(status: AdminRewardRedemption['status']) {
  switch (status) {
    case 'fulfilled':
      return '처리 완료';
    case 'cancelled':
      return '취소';
    case 'requested':
    default:
      return '요청됨';
  }
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function matchesSearch(query: string, ...values: (string | number | undefined | null)[]) {
  if (!query) {
    return true;
  }

  return values.some((value) => String(value ?? '').toLowerCase().includes(query));
}

export function filterAdminNotices(items: AdminNotice[], queryValue: string, filter: 'all' | 'active' | 'inactive') {
  const query = normalizeSearchValue(queryValue);

  return items.filter((notice) => {
    if (filter === 'active' && !notice.isActive) {
      return false;
    }

    if (filter === 'inactive' && notice.isActive) {
      return false;
    }

    return matchesSearch(query, notice.title, notice.message, notice.priority);
  });
}

export function filterAdminUsers(items: AdminUserSummary[], queryValue: string) {
  const query = normalizeSearchValue(queryValue);

  return items.filter((user) => matchesSearch(
    query,
    user.name,
    user.username,
    user.publicTag,
    user.districtName,
    user.provinceName,
    user.cityName,
  ));
}

export function filterAdminMarketItems(items: AdminMarketItem[], queryValue: string, filter: 'all' | 'active' | 'inactive') {
  const query = normalizeSearchValue(queryValue);

  return items.filter((item) => {
    if (filter === 'active' && !item.isActive) {
      return false;
    }

    if (filter === 'inactive' && item.isActive) {
      return false;
    }

    return matchesSearch(query, item.title, item.category, item.partnerName, item.description);
  });
}

export function filterAdminRewardRedemptions(
  items: AdminRewardRedemption[],
  queryValue: string,
  filter: 'all' | 'requested' | 'fulfilled' | 'cancelled',
) {
  const query = normalizeSearchValue(queryValue);

  return items.filter((item) => {
    if (filter !== 'all' && item.status !== filter) {
      return false;
    }

    return matchesSearch(query, item.userName, item.userTag, item.itemTitle, item.costPoints, item.adminNote);
  });
}

export function filterAdminRaceEvents(items: AdminOfflineRaceEvent[], queryValue: string, filter: 'all' | 'active' | 'finished') {
  const query = normalizeSearchValue(queryValue);

  return items.filter((event) => {
    if (filter === 'active' && event.status === 'finished') {
      return false;
    }

    if (filter === 'finished' && event.status !== 'finished') {
      return false;
    }

    return matchesSearch(query, event.title, event.subtitle, event.hostLabel, event.participationMode, event.proofMethod);
  });
}
