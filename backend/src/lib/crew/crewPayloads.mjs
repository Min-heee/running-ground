// 크루대전 응답 조립 — 모양은 클라이언트 src/lib/api/types/crew.ts 계약과 정확히 같아야 한다
// (필드명·null 여부·단위 km). 봉인된 시즌은 원장 스냅샷만 돌려준다(재계산 금지).
//
// 사라진 유저(탈퇴)는 findUserById가 404를 던지므로 usersById Map + '알 수 없음' 폴백을 쓴다.

import { ApiError } from '../../response/httpResponse.mjs';
import { roundDistanceKm } from '../distancePrecision.mjs';
import { DAY_MS, kstDayStartMs } from '../competitionWindow.mjs';
import {
  CREW_FIRST_SEASON_KEY,
  CREW_FIRST_STAR_SEASON_KEY,
  CREW_HOME_TOP_LIMIT,
  CREW_NEW_MEMBER_MIN_MS,
  CREW_SEARCH_LIMIT,
  throwCrewError,
} from './crewConstants.mjs';
import {
  findActiveCrewMembership,
  findCrew,
  findOpenCrewByInviteCode,
  findPendingCrewJoinRequest,
  getCrewJoinsLeftThisMonth,
  isCrewOpen,
  listActiveCrewMembers,
  normalizeCrewNameKey,
  requireCrewCaptain,
  requireOpenCrew,
} from './crewMembership.mjs';
import { listPendingCrewJoinRequests, resolveCrewJoinRequestBlocker } from './crewRequests.mjs';
import {
  buildCrewSeasonStandings,
  buildCrewStarCounts,
  findCrewSeasonAward,
  isCrewPreseason,
  isValidCrewSeasonKey,
  previousCrewSeasonKey,
  resolveCrewCountsFromMs,
  resolveCrewSeasonBounds,
  resolveCrewSeasonPriorKm,
  resolveCurrentCrewSeasonKey,
} from './crewSeason.mjs';

const UNKNOWN_USER_NAME = '알 수 없음';

function createContext(store, user, now) {
  const myMembership = user ? findActiveCrewMembership(store, user.id) : null;
  return {
    now,
    nowMs: now.getTime(),
    user,
    usersById: new Map((store.users ?? []).map((entry) => [entry.id, entry])),
    starCounts: buildCrewStarCounts(store),
    myMembership,
    myCrewId: myMembership?.crewId ?? null,
  };
}

function resolveUserName(ctx, userId) {
  return ctx.usersById.get(userId)?.name ?? UNKNOWN_USER_NAME;
}

export function buildCrewSeasonLabel(seasonKey) {
  const month = Number(seasonKey.slice(5, 7));
  return isCrewPreseason(seasonKey) ? `${month}월 프리시즌` : `${month}월 시즌`;
}

export function buildCrewSeasonInfo(store, seasonKey, now = new Date()) {
  const nowMs = now.getTime();
  const { startMs, endMs, sealMs } = resolveCrewSeasonBounds(seasonKey);
  const award = findCrewSeasonAward(store, seasonKey);
  let status = 'tallying';

  if (award) {
    status = 'sealed';
  } else if (nowMs < endMs) {
    status = 'live';
  }

  return {
    seasonKey,
    label: buildCrewSeasonLabel(seasonKey),
    isPreseason: isCrewPreseason(seasonKey),
    // 프리시즌이 여러 달이라 '프리시즌 = 첫 시즌'도, '별은 다음 달부터'도 성립하지 않는다 — 앱이
    // 짐작하지 않게 서버가 둘 다 말해 준다.
    isFirstSeason: seasonKey === CREW_FIRST_SEASON_KEY,
    firstStarSeasonKey: CREW_FIRST_STAR_SEASON_KEY,
    startsAt: new Date(startMs).toISOString(),
    endsAt: new Date(endMs).toISOString(),
    sealsAt: new Date(sealMs).toISOString(),
    // 오늘(KST)부터 시즌 끝까지 남은 달력 날짜 수 — 9/18이면 13일, 말일이면 1일.
    daysLeft: status === 'live' ? Math.max(0, Math.round((endMs - kstDayStartMs(nowMs)) / DAY_MS)) : 0,
    priorKm: award ? award.priorKm : resolveCrewSeasonPriorKm(store, seasonKey, nowMs),
    status,
  };
}

function buildCrewSummary(store, crew, ctx) {
  return {
    id: crew.id,
    name: crew.name,
    stars: ctx.starCounts.get(crew.id) ?? 0,
    memberCount: listActiveCrewMembers(store, crew.id).length,
    captainName: resolveUserName(ctx, crew.captainUserId),
  };
}

function toStandingRow(row, ctx) {
  return {
    crewId: row.crewId,
    name: row.name,
    stars: ctx.starCounts.get(row.crewId) ?? 0,
    rank: row.rank,
    score: row.score,
    totalKm: row.totalKm,
    seasonMemberCount: row.seasonMemberCount,
    runnerCount: row.runnerCount,
    unrankedReason: row.unrankedReason,
    isMine: row.crewId === ctx.myCrewId,
  };
}

// 보드에 아직 없는 크루(이론상 없음 — 열린 크루는 모두 현재 시즌 보드에 오른다)의 방어 행.
function buildEmptyStandingRow(crew, standings, ctx) {
  return {
    crewId: crew.id,
    name: crew.name,
    stars: ctx.starCounts.get(crew.id) ?? 0,
    rank: null,
    score: roundDistanceKm(standings.priorKm),
    totalKm: 0,
    seasonMemberCount: 0,
    runnerCount: 0,
    unrankedReason: 'too_few_members',
    isMine: crew.id === ctx.myCrewId,
  };
}

function buildCrewStandingRow(crew, standings, ctx) {
  const row = standings.rowByCrewId.get(crew.id);
  return row ? toStandingRow(row, ctx) : buildEmptyStandingRow(crew, standings, ctx);
}

// 멤버 행의 countedFrom — 이 사람이 인원수(N)에 들어가는 시각. 이미 들어가 있으면 null.
// 이번 시즌 안에 7일을 못 채우는 신입은 다음 시즌 시작(=기존 멤버로 1일부터 인정)이다.
// 값은 순위 계산(buildCrewSeasonStandings)이 7일 규칙과 같은 재료로 낸 것을 그대로 쓴다 —
// 여기서 countsFrom + 7일로 따로 풀면 나갔다 다시 들어온 사람의 날짜가 실제보다 늦게 찍힌다.
function resolveCountedFromIso(row, stat, standings) {
  if (stat?.isSeasonMember) {
    return null;
  }

  if (Number.isFinite(stat?.countedFromMs)) {
    return new Date(Math.min(stat.countedFromMs, standings.endMs)).toISOString();
  }

  // 순위 계산에 구간이 없는 사람 — 인정 시작이 시즌 끝 이후(말일 가입)라 이번 시즌 창이 비었다.
  const countsFromMs = resolveCrewCountsFromMs(row);
  const fromMs = Math.max(Number.isFinite(countsFromMs) ? countsFromMs : standings.startMs, standings.startMs);

  if (standings.isPreseason) {
    return new Date(Math.min(fromMs, standings.endMs)).toISOString();
  }

  const enteringMs = fromMs + CREW_NEW_MEMBER_MIN_MS;
  return new Date(enteringMs <= standings.endMs ? enteringMs : standings.endMs).toISOString();
}

function resolveCountsFromIso(row) {
  const countsFromMs = resolveCrewCountsFromMs(row);
  return Number.isFinite(countsFromMs) ? new Date(countsFromMs).toISOString() : row.countsFrom;
}

function buildCrewMemberRows(store, crew, standings, ctx) {
  return listActiveCrewMembers(store, crew.id)
    .map((row) => {
      const stat = standings.memberStats.get(`${crew.id}|${row.userId}`);
      return {
        userId: row.userId,
        name: resolveUserName(ctx, row.userId),
        role: crew.captainUserId === row.userId ? 'captain' : 'member',
        contributionKm: stat?.contributionKm ?? 0,
        // 저장된 값이 아니라 판정식이 쓰는 인정 시작 — 프리시즌 즉시 합류 전에 '내일 0시'로 저장된
        // 행도 화면에 '9/19 합류'가 남지 않는다.
        countsFrom: resolveCountsFromIso(row),
        countedFrom: resolveCountedFromIso(row, stat, standings),
        isMe: row.userId === ctx.user?.id,
        joinedAt: row.joinedAt,
      };
    })
    .sort((left, right) => right.contributionKm - left.contributionKm
      || String(left.joinedAt).localeCompare(String(right.joinedAt)))
    .map(({ joinedAt, ...memberRow }) => memberRow);
}

function buildLastSeason(store, seasonKey) {
  const previousKey = previousCrewSeasonKey(seasonKey);

  if (!isValidCrewSeasonKey(previousKey)) {
    return null;
  }

  const award = findCrewSeasonAward(store, previousKey);
  if (!award) {
    return null;
  }

  return {
    seasonKey: previousKey,
    label: buildCrewSeasonLabel(previousKey),
    champions: (award.champions ?? []).map((champion) => ({ crewId: champion.crewId, name: champion.name })),
  };
}

function buildMyPendingRequest(store, ctx) {
  const request = ctx.user ? findPendingCrewJoinRequest(store, ctx.user.id, ctx.nowMs) : null;

  if (!request) {
    return null;
  }

  return {
    requestId: request.id,
    crewId: request.crewId,
    crewName: findCrew(store, request.crewId)?.name ?? UNKNOWN_USER_NAME,
    createdAt: request.createdAt,
  };
}

export function buildCrewHomePayload(store, user, now = new Date()) {
  const ctx = createContext(store, user, now);
  const seasonKey = resolveCurrentCrewSeasonKey(now);
  const standings = buildCrewSeasonStandings(store, seasonKey, ctx.nowMs);
  const myCrewEntity = ctx.myCrewId ? findCrew(store, ctx.myCrewId) : null;
  let myCrew = null;

  if (myCrewEntity && isCrewOpen(myCrewEntity)) {
    const role = myCrewEntity.captainUserId === user.id ? 'captain' : 'member';
    myCrew = {
      crew: buildCrewSummary(store, myCrewEntity, ctx),
      inviteCode: myCrewEntity.inviteCode,
      role,
      standing: buildCrewStandingRow(myCrewEntity, standings, ctx),
      members: buildCrewMemberRows(store, myCrewEntity, standings, ctx),
      pendingRequestCount: role === 'captain'
        ? listPendingCrewJoinRequests(store, myCrewEntity.id, ctx.nowMs).length
        : 0,
    };
  }

  return {
    season: buildCrewSeasonInfo(store, seasonKey, now),
    myCrew,
    top: standings.rows
      .filter((row) => row.rank !== null)
      .slice(0, CREW_HOME_TOP_LIMIT)
      .map((row) => toStandingRow(row, ctx)),
    rankedCrewCount: standings.rankedCount,
    lastSeason: buildLastSeason(store, seasonKey),
    myPendingRequest: buildMyPendingRequest(store, ctx),
    joinsLeftThisMonth: getCrewJoinsLeftThisMonth(store, user.id, now),
  };
}

// 시즌 순위표. 봉인된 시즌은 원장 스냅샷(상위 10)만 — 봉인 뒤 기록이 바뀌어도 다시 계산하지 않는다.
export function buildCrewLeaguePayload(store, user, rawSeasonKey, now = new Date()) {
  const currentKey = resolveCurrentCrewSeasonKey(now);
  const seasonKey = typeof rawSeasonKey === 'string' && rawSeasonKey.trim() ? rawSeasonKey.trim() : currentKey;

  if (!isValidCrewSeasonKey(seasonKey) || seasonKey > currentKey) {
    throw new ApiError(404, '시즌을 찾을 수 없어요.', { code: 'not_found' });
  }

  const ctx = createContext(store, user, now);
  const season = buildCrewSeasonInfo(store, seasonKey, now);
  const award = findCrewSeasonAward(store, seasonKey);

  if (award) {
    return {
      season,
      sealed: true,
      ranked: (award.top ?? []).map((entry) => ({
        crewId: entry.crewId,
        name: entry.name,
        stars: ctx.starCounts.get(entry.crewId) ?? 0,
        rank: entry.rank,
        score: entry.score,
        totalKm: entry.totalKm,
        seasonMemberCount: entry.memberCount,
        runnerCount: entry.runnerCount ?? 0,
        unrankedReason: null,
        isMine: entry.crewId === ctx.myCrewId,
      })),
      unranked: [],
    };
  }

  const standings = buildCrewSeasonStandings(store, seasonKey, ctx.nowMs);
  return {
    season,
    sealed: false,
    ranked: standings.rows.filter((row) => row.rank !== null).map((row) => toStandingRow(row, ctx)),
    unranked: standings.rows.filter((row) => row.rank === null).map((row) => toStandingRow(row, ctx)),
  };
}

export function buildCrewDetailPayload(store, user, crewId, now = new Date()) {
  const crew = requireOpenCrew(store, crewId);
  const ctx = createContext(store, user, now);
  const standings = buildCrewSeasonStandings(store, resolveCurrentCrewSeasonKey(now), ctx.nowMs);
  const pending = findPendingCrewJoinRequest(store, user.id, ctx.nowMs);

  return {
    crew: buildCrewSummary(store, crew, ctx),
    standing: buildCrewStandingRow(crew, standings, ctx),
    members: buildCrewMemberRows(store, crew, standings, ctx),
    canRequest: resolveCrewJoinRequestBlocker(store, crew, user.id, now) === null,
    myRequestPending: pending?.crewId === crew.id,
  };
}

// 검색·둘러보기: 열린 크루 전부 공개. q는 이름 키(소문자·공백 제거) 부분 일치, 최대 20개.
// 순서는 늘 이번 시즌 순위표 순(순위권 → 순위 밖은 인원 많은 순).
export function buildCrewSearchPayload(store, user, rawQuery, now = new Date()) {
  const ctx = createContext(store, user, now);
  const standings = buildCrewSeasonStandings(store, resolveCurrentCrewSeasonKey(now), ctx.nowMs);
  const query = normalizeCrewNameKey(rawQuery);
  const crewById = new Map((store.crews ?? []).map((crew) => [crew.id, crew]));
  const crews = [];

  for (const row of standings.rows) {
    const crew = crewById.get(row.crewId);
    if (!isCrewOpen(crew) || (query && !String(crew.nameKey ?? '').includes(query))) {
      continue;
    }
    crews.push({ ...buildCrewSummary(store, crew, ctx), rank: row.rank });
    if (crews.length >= CREW_SEARCH_LIMIT) {
      break;
    }
  }

  return { crews };
}

export function buildCrewPreviewPayload(store, user, rawCode, now = new Date()) {
  const crew = findOpenCrewByInviteCode(store, rawCode);

  if (!crew) {
    throwCrewError('not_found');
  }

  const ctx = createContext(store, user, now);
  const standings = buildCrewSeasonStandings(store, resolveCurrentCrewSeasonKey(now), ctx.nowMs);
  return {
    crew: buildCrewSummary(store, crew, ctx),
    standing: buildCrewStandingRow(crew, standings, ctx),
  };
}

export function buildCrewRequestsPayload(store, user, crewId, now = new Date()) {
  const crew = requireCrewCaptain(store, crewId, user);
  const ctx = createContext(store, user, now);

  return {
    requests: listPendingCrewJoinRequests(store, crew.id, ctx.nowMs).map((request) => ({
      requestId: request.id,
      userId: request.userId,
      name: resolveUserName(ctx, request.userId),
      createdAt: request.createdAt,
    })),
  };
}
