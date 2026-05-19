export function formatTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function formatDuelSlotLabel(slotStartAt) {
  const slotStart = new Date(slotStartAt);

  if (Number.isNaN(slotStart.getTime())) {
    return '시간대 미정';
  }

  const startHours = String(slotStart.getHours()).padStart(2, '0');
  const startMinutes = String(slotStart.getMinutes()).padStart(2, '0');
  return `${startHours}:${startMinutes}`;
}

export function buildMatchSlotDateLabel(slotStartAt) {
  const slotStart = new Date(slotStartAt);

  if (Number.isNaN(slotStart.getTime())) {
    return '날짜 미정';
  }

  return slotStart.toLocaleDateString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
}

export function buildExpirySnapshot(expiresAt, now = new Date()) {
  const expiresAtMs = new Date(expiresAt).getTime();

  if (!Number.isFinite(expiresAtMs)) {
    return {};
  }

  return {
    expiresAt,
    expiresInSeconds: Math.max(0, Math.ceil((expiresAtMs - now.getTime()) / 1000)),
  };
}
