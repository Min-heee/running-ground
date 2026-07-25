import { formatKstDisplayTimestamp, formatKstTimeLabel } from './kstDate.mjs';

// 유저에게 보이는 모든 시각 문자열은 KST 고정 (한국 전용 서비스). 이전 구현은
// 서버 로컬 getHours()라 UTC 드롭릿에서 9시간 어긋났다 — 개발 Mac(KST)에서는
// 우연히 맞아 테스트가 통과하던 잠복 버그.

export function formatTimestamp(date = new Date()) {
  return formatKstDisplayTimestamp(date);
}

export function formatDuelSlotLabel(slotStartAt) {
  const slotStart = new Date(slotStartAt);

  if (Number.isNaN(slotStart.getTime())) {
    return '시간대 미정';
  }

  return formatKstTimeLabel(slotStart);
}

export function buildMatchSlotDateLabel(slotStartAt) {
  const slotStart = new Date(slotStartAt);

  if (Number.isNaN(slotStart.getTime())) {
    return '날짜 미정';
  }

  return slotStart.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
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
