// 친구 라이브 러닝 공유 코어 (오너 2026-07-31: 친구 카드 ON/OFF + 실시간 지도 + 응원 메시지).
//
// json 저장소(store.liveRunShares 배열)와 postgres 저장소(app_metadata 키드 객체)가 같은
// '엔트리' 모양을 쓰므로, 엔트리를 만들고/응원을 쌓고/비우는 로직은 여기 한 곳에만 둔다 —
// 두 저장소가 각자 로직을 들고 있으면 반드시 갈라진다(postgres 매퍼 함정의 교훈).
//
// 엔트리 확장: { userId?, enabled, status, locationLabel?, updatedAt,
//   latitude?, longitude?, distanceKm?, paceLabel?, startedAt?, allowCheers?,
//   cheers: [{id, fromUserId, fromName, message, atMs}], cheerSenderLog: {senderId: lastAtMs} }
//
// 응원 전달은 하트비트 드레인 방식이다: 러너 앱이 25초마다 치는 라이브 공유 하트비트의
// 응답에 pending 응원을 실어 보내고 저장소에서 비운다. 푸시가 아니라 폴링인 이유 —
// 러닝 중엔 백그라운드 위치 태스크가 JS를 계속 깨워 하트비트가 화면 꺼짐에도 확실히
// 돌지만, 원격 푸시의 백그라운드 JS 실행은 OS가 보장하지 않는다.

export const CHEER_MESSAGE_MAX_LENGTH = 60;
// 같은 사람이 같은 러너에게 다시 보내기까지의 최소 간격.
export const CHEER_SENDER_MIN_INTERVAL_MS = 15_000;
// 러너가 아직 안 받아간 응원 보관 상한 — 넘치면 새 응원을 거절한다 (blob을 계속 불리지 않게).
export const CHEER_PENDING_MAX = 20;
// 이 시간 안에 하트비트가 없으면 러닝이 끝났거나 앱이 죽은 것 — 친구에게 OFF로 보인다.
// (friendsRepository의 LIVE_RUN_SHARE_STALE_MS와 같은 값을 쓰는 별도 정의 — 순수 모듈이라
// 저장소 파일을 import하지 않는다.)
export const LIVE_RUN_SHARE_FRESH_MS = 2 * 60 * 1000;

// 이 시간보다 오래된 엔트리는 '죽은 러닝'의 잔재다 — 앱 강제종료/배터리 사망으로
// enabled:false가 끝내 안 온 경우. 다음 러닝이 이걸 이어받으면 며칠 전 응원이 새 러닝
// 시작에 음성으로 재생되고, startedAt이 이어져 '달린 지 23시간째'가 된다(적대 검증 발견).
export function isLiveShareEntryFresh(entry, nowMs) {
  const updatedAtMs = Date.parse(entry?.updatedAt ?? '');
  return Number.isFinite(updatedAtMs) && nowMs - updatedAtMs <= LIVE_RUN_SHARE_FRESH_MS;
}

function normalizeCoordinate(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(6)) : null;
}

function normalizeDistanceKm(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Number(value.toFixed(2))
    : null;
}

function normalizePaceLabel(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 16) : null;
}

// 하트비트 한 번이 만들어내는 다음 엔트리. enabled=false거나 러닝이 끝났으면 null(엔트리 제거).
// previousEntry에서 이어받는 것: startedAt(러닝 시작 시각), cheers/cheerSenderLog(아직 안
// 받아간 응원과 발신자 로그 — 드레인은 drainPendingCheers가 따로 한다).
export function buildNextLiveShareEntry({
  previousEntry = null,
  enabled,
  status,
  locationLabel = '',
  latitude = null,
  longitude = null,
  distanceKm = null,
  paceLabel = null,
  allowCheers = true,
  nowIso,
}) {
  if (!enabled || (status !== 'running' && status !== 'paused')) {
    return null;
  }

  const normalizedLatitude = normalizeCoordinate(latitude);
  const normalizedLongitude = normalizeCoordinate(longitude);
  const hasPosition = normalizedLatitude !== null && normalizedLongitude !== null;
  const previousHasPosition = typeof previousEntry?.latitude === 'number' && typeof previousEntry?.longitude === 'number';

  return {
    enabled: true,
    status,
    ...(typeof locationLabel === 'string' && locationLabel.trim()
      ? { locationLabel: locationLabel.trim().slice(0, 80) }
      : {}),
    updatedAt: nowIso(),
    // 좌표 없는 하트비트(상태 전환 등)는 마지막 좌표를 유지한다 — 지도가 깜빡이면 안 된다.
    ...(hasPosition
      ? { latitude: normalizedLatitude, longitude: normalizedLongitude }
      : (previousHasPosition
        ? { latitude: previousEntry.latitude, longitude: previousEntry.longitude }
        : {})),
    ...(normalizeDistanceKm(distanceKm) !== null
      ? { distanceKm: normalizeDistanceKm(distanceKm) }
      : (typeof previousEntry?.distanceKm === 'number' ? { distanceKm: previousEntry.distanceKm } : {})),
    ...(normalizePaceLabel(paceLabel)
      ? { paceLabel: normalizePaceLabel(paceLabel) }
      : (typeof previousEntry?.paceLabel === 'string' ? { paceLabel: previousEntry.paceLabel } : {})),
    startedAt: typeof previousEntry?.startedAt === 'string' ? previousEntry.startedAt : nowIso(),
    allowCheers: allowCheers !== false,
    cheers: Array.isArray(previousEntry?.cheers) ? previousEntry.cheers : [],
    cheerSenderLog: previousEntry?.cheerSenderLog && typeof previousEntry.cheerSenderLog === 'object'
      ? previousEntry.cheerSenderLog
      : {},
  };
}

// pending 응원을 꺼내고 엔트리를 비운다. 반환: { cheers, entry(비워진) }.
export function drainPendingCheers(entry) {
  if (!entry || !Array.isArray(entry.cheers) || entry.cheers.length === 0) {
    return { cheers: [], entry };
  }

  return {
    cheers: entry.cheers.map((cheer) => ({
      id: cheer.id,
      fromName: cheer.fromName,
      message: cheer.message,
    })),
    entry: { ...entry, cheers: [] },
  };
}

// 응원 추가 시도. 성공: { ok: true, entry } / 실패: { ok: false, statusCode, message }.
export function addCheerToEntry(entry, {
  cheerId,
  fromUserId,
  fromName,
  message,
  nowMs,
}) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';

  if (!trimmedMessage) {
    return { ok: false, statusCode: 400, message: '응원 메시지를 입력해주세요.' };
  }

  if (trimmedMessage.length > CHEER_MESSAGE_MAX_LENGTH) {
    return { ok: false, statusCode: 400, message: `응원 메시지는 ${CHEER_MESSAGE_MAX_LENGTH}자까지 보낼 수 있어요.` };
  }

  if (!entry || entry.enabled !== true || entry.status !== 'running') {
    return { ok: false, statusCode: 409, message: '지금은 달리고 있지 않아요.' };
  }

  const updatedAtMs = Date.parse(entry.updatedAt ?? '');

  if (!Number.isFinite(updatedAtMs) || nowMs - updatedAtMs > LIVE_RUN_SHARE_FRESH_MS) {
    return { ok: false, statusCode: 409, message: '지금은 달리고 있지 않아요.' };
  }

  if (entry.allowCheers === false) {
    return { ok: false, statusCode: 403, message: '응원 메시지를 받지 않는 친구예요.' };
  }

  const senderLog = entry.cheerSenderLog && typeof entry.cheerSenderLog === 'object' ? entry.cheerSenderLog : {};
  const lastSentAtMs = Number(senderLog[fromUserId]);

  if (Number.isFinite(lastSentAtMs) && nowMs - lastSentAtMs < CHEER_SENDER_MIN_INTERVAL_MS) {
    return { ok: false, statusCode: 429, message: '응원은 잠시 후에 다시 보낼 수 있어요.' };
  }

  const pending = Array.isArray(entry.cheers) ? entry.cheers : [];

  if (pending.length >= CHEER_PENDING_MAX) {
    return { ok: false, statusCode: 429, message: '응원이 가득 찼어요. 잠시 후 다시 보내주세요.' };
  }

  return {
    ok: true,
    entry: {
      ...entry,
      cheers: [...pending, {
        id: cheerId,
        fromUserId,
        fromName: String(fromName ?? '').slice(0, 30),
        message: trimmedMessage,
        atMs: nowMs,
      }],
      cheerSenderLog: { ...senderLog, [fromUserId]: nowMs },
    },
  };
}

// 친구가 보는 라이브 러닝 페이로드. 안 뛰는 중이면 { isRunningNow: false }만.
export function buildFriendLiveRunPayload(entry, friendName, nowMs) {
  const updatedAtMs = Date.parse(entry?.updatedAt ?? '');
  const isRunningNow = Boolean(
    entry
    && entry.enabled === true
    && entry.status === 'running'
    && Number.isFinite(updatedAtMs)
    && nowMs - updatedAtMs <= LIVE_RUN_SHARE_FRESH_MS,
  );

  if (!isRunningNow) {
    return { isRunningNow: false, name: friendName };
  }

  return {
    isRunningNow: true,
    name: friendName,
    ...(typeof entry.latitude === 'number' && typeof entry.longitude === 'number'
      ? { latitude: entry.latitude, longitude: entry.longitude }
      : {}),
    ...(typeof entry.distanceKm === 'number' ? { distanceKm: entry.distanceKm } : {}),
    ...(typeof entry.paceLabel === 'string' ? { paceLabel: entry.paceLabel } : {}),
    ...(typeof entry.locationLabel === 'string' ? { locationLabel: entry.locationLabel } : {}),
    ...(typeof entry.startedAt === 'string' ? { startedAt: entry.startedAt } : {}),
    updatedAt: entry.updatedAt,
    allowCheers: entry.allowCheers !== false,
  };
}
