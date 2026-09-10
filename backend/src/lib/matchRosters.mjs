import {
  MATCH_ROSTER_LEGACY_GRACE_MS,
  MATCH_ROSTER_MAX_ENTRIES,
  MATCH_ROSTER_RETENTION_MS,
} from './matchConstants.mjs';

// DURABLE MATCH ROSTER — the server-built participant list of a match, kept AFTER the live
// session is pruned.
//
// 왜 필요한가: matchResult.matchId는 검증되지 않는 클라 입력이다(validators는 trim만 한다).
// 세션은 완주 후 MATCH_SESSION_ALL_DONE_RETENTION_MS(10분)만 남으므로, 그 뒤에 도착한 저장은
// 세션 없는 분기로 떨어져 "이 matchId로 기록을 올린 사람들"을 참가자로 취급했다. 그건 로스터가
// 아니라 인터넷이 주장하는 명단이다 — 제3자가 남의 matchId로 기록 하나만 올려도 진짜 참가자의
// 승리를 패배로 영구히 덮을 수 있었다(확정 판정이라 never-downgrade 가드가 복구까지 막는다).
//
// 이 컬렉션은 그 구멍을 닫는 유일한 서버 진실이다. 저장 위치가 스토어 블롭인 이유:
//   - 스토어 전체가 드라이버 무관하게 단일 JSON 블롭이다(postgres도 app_store 한 행). 최상위
//     컬렉션 하나면 json·postgres 양쪽이 같은 코드로 내구화된다 — DDL도 마이그레이션도 없다.
//   - 사이드 테이블(run_routes 방식)은 읽기가 async인데 resolver는 동기 mutator 안에서 돈다
//     (양쪽 어댑터가 async mutator를 명시적으로 throw한다). 구조적으로 불가능하다.
//   - vanishedMatchTombstones는 프로세스 메모리라 재시작에 소멸한다 — 7일짜리 창을 못 버틴다.
//
// ensureMatchRosters는 ensureMatchSessions와 같은 지연 초기화 패턴이다. postgres 어댑터는
// json 스토어의 마이그레이션 목록을 돌리지 않으므로, 이 패턴이어야 두 드라이버가 동일하게 동작한다.
export function ensureMatchRosters(store) {
  if (!Array.isArray(store.matchRosters)) {
    store.matchRosters = [];
  }

  return store.matchRosters;
}

// 로스터 장치가 언제부터 돌기 시작했는지의 단일 기준점. "로스터가 없다"는 사실은 시간에 따라
// 뜻이 달라지고(§MATCH_ROSTER_LEGACY_GRACE_MS), 그 판단의 기준이 이 값이다.
//
// 매치 생성이 아니라 pruneMatchRosters(= 모든 쓰기 요청)에서 찍는다 — 배포 후 매치가 한 건도
// 안 열려도 epoch는 정상적으로 성숙해야 하기 때문이다.
export function ensureMatchRosterEpoch(store, now = new Date()) {
  if (typeof store.matchRosterEpochAt !== 'string' || !store.matchRosterEpochAt) {
    store.matchRosterEpochAt = now.toISOString();
  }

  return store.matchRosterEpochAt;
}

// epoch가 유예를 넘겼는가 = "이제 로스터 없는 matchId는 정당할 수 없다"고 말해도 되는가.
// 아직 안 찍혔으면 false(= legacy 보존) — 안전한 쪽이 아니라 계약을 지키는 쪽으로 기운다.
// 이 구간은 배포 직후 최대 7일이고, 그 뒤 스스로 닫힌다.
export function isMatchRosterEpochMature(store, now = new Date()) {
  const epochAtMs = typeof store?.matchRosterEpochAt === 'string'
    ? Date.parse(store.matchRosterEpochAt)
    : Number.NaN;

  if (!Number.isFinite(epochAtMs)) {
    return false;
  }

  return now.getTime() - epochAtMs >= MATCH_ROSTER_LEGACY_GRACE_MS;
}

// 상한 초과분은 가장 오래된 것부터 버린다(항목이 생성 시각 순으로 append되므로 앞이 가장 오래된
// 것). 축출은 안전한 방향으로만 degrade한다 — 로스터를 잃은 매치는 epoch 성숙 후 PENDING이 된다.
function enforceMatchRosterCap(rosters) {
  const overflow = rosters.length - MATCH_ROSTER_MAX_ENTRIES;

  if (overflow > 0) {
    rosters.splice(0, overflow);
    return overflow;
  }

  return 0;
}

// 세션 생성 시점의 참가자 명단을 박제한다. createMatchSession 하나가 모든 생성 경로
// (매칭 듀얼/그룹, 파티룸 2곳, 테스트 매치)의 길목이므로 여기 한 번이면 전부 덮인다.
//
// distanceKm(= 매치 목표 거리)도 같이 박제한다: 완주 판정의 목표 거리 소스인
// matchResult.comparedDistanceKm은 화면 꺼짐 정지로 낮게 얼어붙는 것이 실사고로 확인된 값이라
// (2026-08-09 프로덕션, duel-match-e545bceb: 6km 러닝에 3.06 박제) 판정 기준으로 쓸 수 없다.
// 세션 생성 시점의 목표 거리는 달리기가 시작되기도 전에 서버가 정한 값이라 얼지도, 위조되지도 않는다.
export function recordMatchRoster(store, session, now = new Date()) {
  const rosters = ensureMatchRosters(store);
  const matchId = typeof session?.id === 'string' ? session.id.trim() : '';

  if (!matchId) {
    return null;
  }

  const participantIds = [...new Set(
    (Array.isArray(session.participants) ? session.participants : [])
      .map((participant) => participant?.userId)
      .filter((userId) => typeof userId === 'string' && userId),
  )];

  if (!participantIds.length) {
    return null;
  }

  const entry = {
    id: matchId,
    mode: session.mode === 'group' ? 'group' : 'duel',
    ...(Number.isFinite(session.distanceKm) && session.distanceKm > 0
      ? { distanceKm: session.distanceKm }
      : {}),
    participantIds,
    createdAt: now.toISOString(),
  };

  rosters.push(entry);
  enforceMatchRosterCap(rosters);

  return entry;
}

// 그룹 지각 합류(출발 전) 반영. 명단은 UNION으로만 자란다 — 참가자를 지우는 경로는 없고,
// 잘못 빼는 쪽이 잘못 넣는 쪽보다 훨씬 위험하다(정당한 참가자를 판정에서 배제하면 그 대결은
// 영영 PENDING이 된다).
export function amendMatchRoster(store, matchId, userId) {
  if (typeof matchId !== 'string' || !matchId || typeof userId !== 'string' || !userId) {
    return false;
  }

  const entry = ensureMatchRosters(store).find((roster) => roster?.id === matchId);

  if (!entry || !Array.isArray(entry.participantIds) || entry.participantIds.includes(userId)) {
    return false;
  }

  entry.participantIds.push(userId);
  return true;
}

// 예약에서 빠진 사람은 내구 로스터에서도 빠진다 — 세션이 사라진 뒤 그룹 순위는 로스터를
// 기준으로 '아직 안 낸 사람'을 기다리므로, 안 빼면 그 판정이 영원히 PENDING이 된다
// (적대 검증 2026-09-10). 완주/기권으로 끝난 사람은 이 경로를 타지 않는다.
export function removeFromMatchRoster(store, matchId, userId) {
  if (typeof matchId !== 'string' || !matchId || typeof userId !== 'string' || !userId) {
    return false;
  }

  const entry = ensureMatchRosters(store).find((roster) => roster?.id === matchId);

  if (!entry || !Array.isArray(entry.participantIds) || !entry.participantIds.includes(userId)) {
    return false;
  }

  entry.participantIds = entry.participantIds.filter((participantId) => participantId !== userId);
  return true;
}

export function findMatchRoster(store, matchId) {
  if (typeof matchId !== 'string' || !matchId) {
    return null;
  }

  return ensureMatchRosters(store).find((roster) => roster?.id === matchId) ?? null;
}

export function isMatchRosterParticipant(roster, userId) {
  return Boolean(
    roster
    && Array.isArray(roster.participantIds)
    && typeof userId === 'string'
    && roster.participantIds.includes(userId),
  );
}

// 매치 목표 거리 — 로스터가 실제로 들고 있을 때만. 없으면 null을 돌려 호출자가 완주 판정을
// 아예 시도하지 않게 한다(추측한 목표로 판정하느니 기존 동작을 유지하는 쪽이 안전하다).
export function readMatchRosterGoalDistanceKm(roster) {
  return Number.isFinite(roster?.distanceKm) && roster.distanceKm > 0 ? roster.distanceKm : null;
}

// GC — pruneMatchSessions(= 모든 쓰기 요청)에서 돈다. 항목이 생성 시각 순으로 append되므로
// 만료분은 항상 배열 앞쪽 연속 구간이다 → prefix drop 한 번이면 끝나고, 대개 첫 항목이 아직
// 신선해서 즉시 break한다(사실상 O(1), 매 요청 전수 스캔 없음).
//
// createdAt이 파싱 불가한 항목은 버린다: 나이를 못 재는 항목은 영원히 안 지워지는 누수가 되고,
// 버렸을 때의 결과는 "로스터 없음" → epoch 성숙 후 PENDING(안전)이다.
export function pruneMatchRosters(store, now = new Date()) {
  const rosters = ensureMatchRosters(store);
  ensureMatchRosterEpoch(store, now);

  const cutoffMs = now.getTime() - MATCH_ROSTER_RETENTION_MS;
  let expiredCount = 0;

  while (expiredCount < rosters.length) {
    const createdAtMs = Date.parse(rosters[expiredCount]?.createdAt ?? '');

    if (Number.isFinite(createdAtMs) && createdAtMs > cutoffMs) {
      break;
    }

    expiredCount += 1;
  }

  if (expiredCount > 0) {
    rosters.splice(0, expiredCount);
  }

  const evictedCount = enforceMatchRosterCap(rosters);

  if (evictedCount > 0) {
    // 상한에 닿았다는 건 예상 규모를 넘었다는 뜻이다 — 조용히 잘라내면 "판정이 왜 PENDING이지"의
    // 원인을 못 찾는다. 쓰기마다 로그가 도배되지 않도록 흐름을 눌러서 남긴다.
    logRosterCapEviction(evictedCount, rosters.length, now);
  }

  return rosters;
}

const ROSTER_CAP_LOG_INTERVAL_MS = 5 * 60 * 1000;
let lastRosterCapLogAtMs = 0;

function logRosterCapEviction(evictedCount, remainingCount, now) {
  const nowMs = now.getTime();

  if (nowMs - lastRosterCapLogAtMs < ROSTER_CAP_LOG_INTERVAL_MS) {
    return;
  }

  lastRosterCapLogAtMs = nowMs;
  console.warn(
    `[match-roster] roster cap reached — evicted ${evictedCount} oldest entr${evictedCount === 1 ? 'y' : 'ies'} `
    + `(cap ${MATCH_ROSTER_MAX_ENTRIES}, now ${remainingCount}). 축출된 매치의 늦은 저장은 PENDING으로 남는다 — `
    + 'scripts/backfill-pending-match-results.mjs 로 처리하거나 MATCH_ROSTER_MAX_ENTRIES를 올려야 한다.',
  );
}

// 테스트 훅 — 위 로그 흐름 제어는 모듈 전역이라 케이스 사이에 초기화가 필요하다.
export function resetMatchRosterCapLogThrottle() {
  lastRosterCapLogAtMs = 0;
}
