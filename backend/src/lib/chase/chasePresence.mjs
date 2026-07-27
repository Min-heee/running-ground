// 경기장 점유(정원) 관리 — 파티런 방(matchRoom)과 같은 결: store 배열 + 요청 시 lazy prune.
// 입장 슬롯은 러닝 시작 직전에 잡고(POST /api/chase/join), 러닝 업로드 정산 때 조기 반납,
// 아니면 TTL(3시간)로 자연 소멸한다. "30/100" 표시는 미만료 슬롯 수.

import { ApiError } from '../../response/httpResponse.mjs';
import { CHASE_ARENAS, findChaseArena, isActiveChaseArena } from './chaseArenas.mjs';
import {
  CHASE_POSITION_GEOFENCE_MARGIN_M,
  CHASE_POSITION_SLOT_TTL_MS,
  CHASE_POSITION_STALE_MS,
  CHASE_PRESENCE_TTL_MS,
} from './chaseConstants.mjs';
import { distanceBetweenMeters } from './chaseGeo.mjs';

export function ensureChasePresence(store) {
  if (!Array.isArray(store.chasePresence)) {
    store.chasePresence = [];
  }

  return store.chasePresence;
}

export function pruneChasePresence(store, nowMs = Date.now()) {
  const entries = ensureChasePresence(store);
  const alive = entries.filter((entry) => Date.parse(entry.expiresAt ?? '') > nowMs);

  if (alive.length !== entries.length) {
    store.chasePresence = alive;
  }

  return store.chasePresence;
}

function countArenaPresence(entries, arenaId, nowMs) {
  return entries.filter(
    (entry) => entry.arenaId === arenaId && Date.parse(entry.expiresAt ?? '') > nowMs,
  ).length;
}

// GET /api/chase/arenas 응답 — 카탈로그 + 실시간 점유 수. 읽기 전용(loadStore)이라
// prune 없이 미만료만 센다.
export function buildChaseArenaListPayload(store, now = new Date()) {
  const entries = ensureChasePresence(store);
  const nowMs = now.getTime();

  return {
    arenas: CHASE_ARENAS.map((arena) => ({
      id: arena.id,
      name: arena.name,
      regionLabel: arena.regionLabel,
      latitude: arena.latitude,
      longitude: arena.longitude,
      radiusM: arena.radiusM,
      capacity: arena.capacity,
      // 하트비트 자가회복 슬롯이 정원을 스칠 수 있어 표시용으로 클램프.
      currentCount: Math.min(arena.capacity, countArenaPresence(entries, arena.id, nowMs)),
    })),
  };
}

export function joinChaseArenaPresence(store, user, arenaId, now = new Date()) {
  const arena = findChaseArena(arenaId);

  if (!arena || !isActiveChaseArena(arena.id)) {
    throw new ApiError(404, '해당 경기장을 찾을 수 없어요.');
  }

  const nowMs = now.getTime();
  const entries = pruneChasePresence(store, nowMs);
  const othersInArena = entries.filter(
    (entry) => entry.arenaId === arena.id && entry.userId !== user.id,
  ).length;

  if (othersInArena >= arena.capacity) {
    throw new ApiError(400, `${arena.name}은(는) 지금 정원이 가득 찼어요. 잠시 후 다시 시도해주세요.`);
  }

  // 한 사람은 한 경기장만 — 기존 슬롯(같은 경기장 포함)은 새 슬롯으로 교체(입장 갱신).
  store.chasePresence = [
    ...entries.filter((entry) => entry.userId !== user.id),
    {
      userId: user.id,
      arenaId: arena.id,
      joinedAt: now.toISOString(),
      expiresAt: new Date(nowMs + CHASE_PRESENCE_TTL_MS).toISOString(),
    },
  ];

  return {
    arenaId: arena.id,
    arenaName: arena.name,
    // 라이브 지도가 쓸 지오펜스 — 클라는 이 응답값을 러닝 컨텍스트에 잠근다 (서버 단일 소스).
    latitude: arena.latitude,
    longitude: arena.longitude,
    radiusM: arena.radiusM,
    capacity: arena.capacity,
    currentCount: othersInArena + 1,
  };
}

// 러닝 중 위치 하트비트 — 슬롯을 업서트하며(러닝 도중 TTL 만료 자가 회복) 최신 위치를 심는다.
// 정원 검사는 하지 않는다: 이미 달리는 중인 러너를 위치 보고 때문에 쫓아내지 않는다.
//
// 프라이버시 게이트: 보고 좌표가 경기장 지오펜스(+여유) 안이어야만 받는다. 이게 없으면
// 아무 계정이나 집에서 POST 한 번으로 슬롯을 만들어 라이브 지도(다른 러너들의 실시간
// 좌표)를 훔쳐볼 수 있다 — 지오펜스 게이트로 "그 공원에 실제로 있는 사람"만 남는다.
export function updateChasePresencePosition(store, user, input, now = new Date()) {
  const arena = findChaseArena(input.arenaId);

  if (!arena) {
    throw new ApiError(404, '해당 경기장을 찾을 수 없어요.');
  }

  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new ApiError(400, '위치 좌표가 올바르지 않아요.');
  }

  const distanceFromCenter = distanceBetweenMeters(
    { latitude, longitude },
    { latitude: arena.latitude, longitude: arena.longitude },
  );

  if (distanceFromCenter > arena.radiusM + CHASE_POSITION_GEOFENCE_MARGIN_M) {
    throw new ApiError(403, '경기장 안에서만 위치를 공유할 수 있어요.');
  }

  // null/undefined는 "방향 없음"(정지) — Number(null)===0 강제변환으로 북쪽 화살표가
  // 되면 안 된다.
  const headingDeg = input.headingDeg == null || !Number.isFinite(Number(input.headingDeg))
    ? null
    : ((Number(input.headingDeg) % 360) + 360) % 360;
  const paceLabel = typeof input.paceLabel === 'string' && input.paceLabel.trim()
    ? input.paceLabel.trim().slice(0, 12)
    : null;
  const nowMs = now.getTime();
  const entries = pruneChasePresence(store, nowMs);
  const existing = entries.find((entry) => entry.userId === user.id && entry.arenaId === arena.id);
  const position = {
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    headingDeg: headingDeg === null ? null : Math.round(headingDeg),
    paceLabel,
    updatedAt: now.toISOString(),
  };

  if (existing) {
    existing.expiresAt = new Date(nowMs + CHASE_PRESENCE_TTL_MS).toISOString();
    existing.position = position;
  } else {
    // 새 슬롯 생성은 활성 경기장 + 짧은 TTL — dormant 경기장을 숨은 위치공유 채널로
    // 쓰는 것과, 저장 직후 늦게 도착한 하트비트가 만든 고스트 슬롯의 3시간 생존을 막는다.
    if (!isActiveChaseArena(arena.id)) {
      throw new ApiError(404, '해당 경기장을 찾을 수 없어요.');
    }

    store.chasePresence = [
      ...entries.filter((entry) => entry.userId !== user.id),
      {
        userId: user.id,
        arenaId: arena.id,
        joinedAt: now.toISOString(),
        expiresAt: new Date(nowMs + CHASE_POSITION_SLOT_TTL_MS).toISOString(),
        position,
      },
    ];
  }

  return { success: true };
}

// 라이브 지도 데이터 — 그 경기장에 슬롯을 쥔 러너만 볼 수 있다 (모르는 사람의 실시간
// 좌표를 앱 전체에 열지 않는다).
export function buildChaseLivePayload(store, user, arenaId, now = new Date()) {
  const arena = findChaseArena(arenaId);

  if (!arena) {
    throw new ApiError(404, '해당 경기장을 찾을 수 없어요.');
  }

  const nowMs = now.getTime();
  const entries = ensureChasePresence(store);
  const viewerEntry = entries.find(
    (entry) => entry.userId === user.id && entry.arenaId === arena.id
      && Date.parse(entry.expiresAt ?? '') > nowMs,
  );

  if (!viewerEntry) {
    throw new ApiError(403, '경기장에 입장한 러너만 라이브 지도를 볼 수 있어요.');
  }

  const usersById = new Map(store.users.map((entry) => [entry.id, entry]));
  const participants = [];

  for (const entry of entries) {
    if (entry.arenaId !== arena.id || Date.parse(entry.expiresAt ?? '') <= nowMs) {
      continue;
    }

    const position = entry.position;
    const updatedAtMs = Date.parse(position?.updatedAt ?? '');

    if (!position || !Number.isFinite(updatedAtMs) || nowMs - updatedAtMs > CHASE_POSITION_STALE_MS) {
      continue;
    }

    participants.push({
      userId: entry.userId,
      name: usersById.get(entry.userId)?.name ?? '러너',
      latitude: position.latitude,
      longitude: position.longitude,
      headingDeg: position.headingDeg ?? null,
      paceLabel: position.paceLabel ?? null,
      ageSeconds: Math.max(0, Math.round((nowMs - updatedAtMs) / 1_000)),
      isSelf: entry.userId === user.id,
    });
  }

  return {
    arenaId: arena.id,
    arenaName: arena.name,
    latitude: arena.latitude,
    longitude: arena.longitude,
    radiusM: arena.radiusM,
    participants,
  };
}

export function leaveChaseArenaPresence(store, user) {
  const entries = ensureChasePresence(store);
  const remaining = entries.filter((entry) => entry.userId !== user.id);
  const left = remaining.length !== entries.length;
  store.chasePresence = remaining;
  return { left };
}

// 러닝 업로드 정산 시 조기 반납 (mutator 내부에서 호출) — 정산된 러닝의 경기장 슬롯만.
// arenaId를 안 좁히면 오프라인 큐에 밀려 있던 옛 러닝의 업로드가 지금 달리는 중인 다른
// 경기장 슬롯을 지워버린다.
export function releaseChasePresenceForUser(store, userId, arenaId) {
  const entries = ensureChasePresence(store);
  store.chasePresence = entries.filter(
    (entry) => !(entry.userId === userId && (!arenaId || entry.arenaId === arenaId)),
  );
}
