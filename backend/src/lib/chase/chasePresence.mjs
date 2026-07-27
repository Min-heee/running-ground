// 경기장 점유(정원) 관리 — 파티런 방(matchRoom)과 같은 결: store 배열 + 요청 시 lazy prune.
// 입장 슬롯은 러닝 시작 직전에 잡고(POST /api/chase/join), 러닝 업로드 정산 때 조기 반납,
// 아니면 TTL(3시간)로 자연 소멸한다. "30/100" 표시는 미만료 슬롯 수.

import { ApiError } from '../../response/httpResponse.mjs';
import { CHASE_ARENAS, findChaseArena } from './chaseArenas.mjs';
import { CHASE_PRESENCE_TTL_MS } from './chaseConstants.mjs';

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
      currentCount: countArenaPresence(entries, arena.id, nowMs),
    })),
  };
}

export function joinChaseArenaPresence(store, user, arenaId, now = new Date()) {
  const arena = findChaseArena(arenaId);

  if (!arena) {
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
    capacity: arena.capacity,
    currentCount: othersInArena + 1,
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
