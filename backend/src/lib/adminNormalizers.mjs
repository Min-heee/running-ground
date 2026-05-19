export function normalizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeRewardRedemptionStatus(value) {
  const normalizedValue = normalizeOptionalString(value);
  return normalizedValue === 'fulfilled' || normalizedValue === 'cancelled' ? normalizedValue : 'requested';
}

export function isActiveRewardRedemption(entry) {
  return normalizeRewardRedemptionStatus(entry?.status) !== 'cancelled';
}

export function buildUserRegionKey(user) {
  return [
    normalizeOptionalString(user.provinceName),
    normalizeOptionalString(user.cityName),
    normalizeOptionalString(user.districtName),
  ].filter(Boolean).join(' > ');
}

export function buildNoticeEntry(notice) {
  return {
    id: notice.id,
    title: notice.title,
    message: notice.message,
    priority: notice.priority,
    isActive: notice.isActive !== false,
    createdAt: notice.createdAt,
    updatedAt: notice.updatedAt,
  };
}
