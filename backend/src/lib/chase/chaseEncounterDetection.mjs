// 경찰과 도둑런 스침 판정 — 두 러너의 타임스탬프 경로를 겹쳐 소급 판정하는 순수 모듈.
// 저장소/부수효과 없음. 아이폰 화면 꺼짐으로 라이브 업로드가 끊겨도 완주 후 경로에는
// 전 구간이 남으므로, 여기서 잡는 판정이 단일 진실이다.
//
// 판정 규칙 (오너 확정 2026-07-27):
//  - 마주침(meet): 25m 이내 + 진행 방향차 100° 이상 → 양쪽 다 득점
//  - 따라잡기(catch): 방향차 60° 이하 + 트랙축 기준 앞뒤가 -5m → +5m로 역전 → 잡은 쪽만 득점
//  - 나란히 달리기(역전 없음), 직각 교차(60~100°)는 무득점
//  - 정지 파밍(1.0m/s 미만), 자전거 속도(6.5m/s 초과), 경기장 밖, GPS 공백 구간은 제외
//  - 같은 쌍은 15분 쿨다운 (호수 반대 방향 순환런은 바퀴마다 만나므로 상한 역할)

import {
  CHASE_ARENA_BOUNDARY_MARGIN_M,
  CHASE_CATCH_MAX_ANGLE_DEG,
  CHASE_ENCOUNTER_DISTANCE_M,
  CHASE_EPISODE_GAP_MS,
  CHASE_HEADING_WINDOW_MS,
  CHASE_MAX_HUMAN_SPEED_MPS,
  CHASE_MAX_INTERP_GAP_MS,
  CHASE_MEET_MAX_EPISODE_MS,
  CHASE_MEET_MIN_ANGLE_DEG,
  CHASE_MIN_MOVING_SPEED_MPS,
  CHASE_OVERTAKE_LOOKAROUND_MS,
  CHASE_OVERTAKE_MARGIN_M,
  CHASE_PAIR_COOLDOWN_MS,
  CHASE_SAMPLE_STEP_MS,
} from './chaseConstants.mjs';
import {
  angleBetweenDegrees,
  distanceBetweenMeters,
  isInsideArena,
  localOffsetMeters,
  vectorLength,
} from './chaseGeo.mjs';

function normalizeTrack(route) {
  if (!Array.isArray(route)) {
    return [];
  }

  const points = [];

  for (const point of route) {
    const latitude = Number(point?.latitude);
    const longitude = Number(point?.longitude);
    const tMs = Date.parse(point?.timestamp ?? '');

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(tMs)) {
      continue;
    }

    points.push({ tMs, latitude, longitude });
  }

  points.sort((left, right) => left.tMs - right.tMs);
  return points;
}

// t 시점 보간 위치. 범위 밖이거나 감싼 두 실측점 사이 간격이 30초를 넘으면(GPS 공백)
// 위치를 지어내지 않고 null — 공백 구간에서 유령 스침이 생기는 걸 막는다.
function positionAt(track, tMs) {
  if (track.length === 0 || tMs < track[0].tMs || tMs > track[track.length - 1].tMs) {
    return null;
  }

  let low = 0;
  let high = track.length - 1;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);

    if (track[mid].tMs <= tMs) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  const before = track[low];

  if (before.tMs === tMs || low === track.length - 1) {
    return { latitude: before.latitude, longitude: before.longitude };
  }

  const after = track[low + 1];

  if (after.tMs - before.tMs > CHASE_MAX_INTERP_GAP_MS) {
    return null;
  }

  const ratio = (tMs - before.tMs) / (after.tMs - before.tMs);
  return {
    latitude: before.latitude + (after.latitude - before.latitude) * ratio,
    longitude: before.longitude + (after.longitude - before.longitude) * ratio,
  };
}

// t 시점 진행 방향/속도 — ±10초 변위 벡터. 어느 한쪽이 공백이면 null.
function velocityAt(track, tMs, origin) {
  const from = positionAt(track, tMs - CHASE_HEADING_WINDOW_MS);
  const to = positionAt(track, tMs + CHASE_HEADING_WINDOW_MS);

  if (!from || !to) {
    return null;
  }

  const fromOffset = localOffsetMeters(origin, from);
  const toOffset = localOffsetMeters(origin, to);
  const vector = { x: toOffset.x - fromOffset.x, y: toOffset.y - fromOffset.y };
  const seconds = (CHASE_HEADING_WINDOW_MS * 2) / 1_000;

  return { vector, speedMps: vectorLength(vector) / seconds };
}

// 트랙축(axis) 기준 A가 B보다 몇 m 앞에 있는지. 위치를 모르면 null.
function relativeProjectionMeters(trackA, trackB, tMs, origin, axisUnit) {
  const positionA = positionAt(trackA, tMs);
  const positionB = positionAt(trackB, tMs);

  if (!positionA || !positionB) {
    return null;
  }

  const offsetA = localOffsetMeters(origin, positionA);
  const offsetB = localOffsetMeters(origin, positionB);
  return (offsetA.x - offsetB.x) * axisUnit.x + (offsetA.y - offsetB.y) * axisUnit.y;
}

function evaluateEpisode({ episode, trackA, trackB, arena }) {
  const best = episode.samples.reduce((closest, sample) =>
    sample.distanceM < closest.distanceM ? sample : closest,
  );
  const origin = { latitude: arena.latitude, longitude: arena.longitude };
  const velocityA = velocityAt(trackA, best.tMs, origin);
  const velocityB = velocityAt(trackB, best.tMs, origin);

  if (!velocityA || !velocityB) {
    return null;
  }

  const speeds = [velocityA.speedMps, velocityB.speedMps];

  if (speeds.some((speed) => speed < CHASE_MIN_MOVING_SPEED_MPS || speed > CHASE_MAX_HUMAN_SPEED_MPS)) {
    return null;
  }

  const angle = angleBetweenDegrees(velocityA.vector, velocityB.vector);

  if (angle === null) {
    return null;
  }

  if (angle >= CHASE_MEET_MIN_ANGLE_DEG) {
    // 마주침은 '지나쳐 가는' 짧은 근접이어야 한다 — 오래 붙어 있는 에피소드에서 방향
    // 벡터만 노이즈로 벌어진 경우(물가 나란히 러닝)를 마주침으로 오판하지 않는다.
    const episodeDurationMs =
      episode.samples[episode.samples.length - 1].tMs - episode.samples[0].tMs;

    if (episodeDurationMs > CHASE_MEET_MAX_EPISODE_MS) {
      return null;
    }

    return { type: 'meet', catcher: null, atMs: best.tMs, distanceM: best.distanceM };
  }

  if (angle > CHASE_CATCH_MAX_ANGLE_DEG) {
    return null;
  }

  // 같은 방향: 두 속도의 평균 방향을 트랙축으로 놓고 앞뒤 역전을 확인한다.
  const axis = {
    x: velocityA.vector.x + velocityB.vector.x,
    y: velocityA.vector.y + velocityB.vector.y,
  };
  const axisLength = vectorLength(axis);

  if (axisLength <= 0) {
    return null;
  }

  const axisUnit = { x: axis.x / axisLength, y: axis.y / axisLength };
  const firstMs = episode.samples[0].tMs;
  const lastMs = episode.samples[episode.samples.length - 1].tMs;
  const before =
    relativeProjectionMeters(trackA, trackB, firstMs - CHASE_OVERTAKE_LOOKAROUND_MS, origin, axisUnit) ??
    relativeProjectionMeters(trackA, trackB, firstMs, origin, axisUnit);
  const after =
    relativeProjectionMeters(trackA, trackB, lastMs + CHASE_OVERTAKE_LOOKAROUND_MS, origin, axisUnit) ??
    relativeProjectionMeters(trackA, trackB, lastMs, origin, axisUnit);

  if (before === null || after === null) {
    return null;
  }

  if (before <= -CHASE_OVERTAKE_MARGIN_M && after >= CHASE_OVERTAKE_MARGIN_M) {
    return { type: 'catch', catcher: 'A', atMs: best.tMs, distanceM: best.distanceM };
  }

  if (before >= CHASE_OVERTAKE_MARGIN_M && after <= -CHASE_OVERTAKE_MARGIN_M) {
    return { type: 'catch', catcher: 'B', atMs: best.tMs, distanceM: best.distanceM };
  }

  return null;
}

// routeA/routeB: [{latitude, longitude, timestamp}] (러닝 저장 경로 그대로).
// 반환: [{ type: 'meet'|'catch', catcher: 'A'|'B'|null, atIso, distanceM }] 시간순.
export function detectChaseEncounters({ routeA, routeB, arena }) {
  const trackA = normalizeTrack(routeA);
  const trackB = normalizeTrack(routeB);

  if (trackA.length < 2 || trackB.length < 2 || !arena) {
    return [];
  }

  const startMs = Math.max(trackA[0].tMs, trackB[0].tMs);
  const endMs = Math.min(trackA[trackA.length - 1].tMs, trackB[trackB.length - 1].tMs);

  if (endMs - startMs < CHASE_SAMPLE_STEP_MS) {
    return [];
  }

  const events = [];
  let episode = null;
  let lastScoredAtMs = -Infinity;

  const closeEpisode = () => {
    if (!episode) {
      return;
    }

    const currentEpisode = episode;
    episode = null;

    if (currentEpisode.samples[0].tMs - lastScoredAtMs < CHASE_PAIR_COOLDOWN_MS) {
      return;
    }

    const event = evaluateEpisode({ episode: currentEpisode, trackA, trackB, arena });

    if (event) {
      events.push(event);
      lastScoredAtMs = event.atMs;
    }
  };

  for (let tMs = startMs; tMs <= endMs; tMs += CHASE_SAMPLE_STEP_MS) {
    const positionA = positionAt(trackA, tMs);
    const positionB = positionAt(trackB, tMs);
    const bothVisible =
      positionA &&
      positionB &&
      isInsideArena(positionA, arena, CHASE_ARENA_BOUNDARY_MARGIN_M) &&
      isInsideArena(positionB, arena, CHASE_ARENA_BOUNDARY_MARGIN_M);

    if (!bothVisible) {
      closeEpisode();
      continue;
    }

    const distanceM = distanceBetweenMeters(positionA, positionB);

    if (distanceM <= CHASE_ENCOUNTER_DISTANCE_M) {
      if (!episode) {
        episode = { samples: [] };
      }

      episode.samples.push({ tMs, distanceM });
    } else if (episode && tMs - episode.samples[episode.samples.length - 1].tMs > CHASE_EPISODE_GAP_MS) {
      closeEpisode();
    }
  }

  closeEpisode();

  return events.map((event) => ({
    type: event.type,
    catcher: event.catcher,
    atIso: new Date(event.atMs).toISOString(),
    distanceM: Math.round(event.distanceM),
  }));
}
