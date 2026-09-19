// 크루대전 월간 시즌 점수·봉인 (오너 승인 스펙 v1 + 심판 필수 수정, 2026-09-18).
//
// 시즌 S = [YYYY-MM-01 0시 KST, 다음 달 1일 0시 KST). 끝나고 1시간 뒤 봉인한다(오너 2026-09-18,
// 처음엔 48시간). 결과 알림은 그날 아침 9시.
// 핵심 불변식 '화면 1위 = 우승': 라이브 순위표와 봉인이 같은 순수 함수
// buildCrewSeasonStandings 하나를 같은 반올림 순서로 쓴다. 봉인된 시즌은 원장 스냅샷만
// 보여 주고 절대 다시 계산하지 않는다 — 그라운드는 정산 뒤에도 순위를 store.runs에서 다시
// 계산해 트로피 주인과 화면 1위가 어긋날 수 있는데, 그 함정을 되풀이하지 않는다.
//
// 점수 = 인당 km = roundDistanceKm(T / N) (오너 2026-09-19: '보정 인당' 공식이 무슨 소리인지 모르겠다
// → 크루 총거리 ÷ 인원으로 단순화. 소수 크루가 유리해지는 건 감수하고, 나중에 순위 최소 인원을
// 10명으로 올려 조정한다).
//  - T: 시즌 멤버 기여 합, N: 시즌 멤버 수, R: 기여 > 0인 시즌 멤버 수.
//  - P(직전 시즌 봉인 avgKm, 없으면 30)는 더 이상 점수에 안 들어간다. 시즌 응답의 priorKm으로만
//    남긴다 — 옛 앱 번들의 설명 카드가 읽는 필드라 계약에서 빼지 않는다.
//  - 화면 표기는 '인당 66.25km'.
//
// 기여 인정: isCrewCountableRun(앱 GPS·매치·가져온 기록, 손으로 적은 기록·차량 판정 제외) +
// isRunCountable(endedAt이 멤버십 창 안, 서버 createdAt이 창+1h 안) → 같은 사람의 시간이 겹친
// 기록은 가장 긴 것 하나 → roundDistanceKm 고정 순서 누적(하루 상한 없음 — 오너 2026-09-18).
// 9/30 23:50에 시작해 10/1 00:20에 끝난 러닝은 크루에선 10월, '이번 달 거리'에선 9월이다 —
// 설계상 의도이고 테스트로 고정한다.
//
// 비용: store.runs를 한 번만 훑는다(userId → 멤버십 창 Map). 결과는 store 객체 단위 WeakMap
// 메모 — 한 요청 안에서 홈·내 크루·멤버 행이 같은 순위를 여러 번 읽는다.

import { isVehicleFlaggedRun } from '../competitiveRuns.mjs';
import { roundDistanceKm } from '../distancePrecision.mjs';
import { nextMonthKey, resolveKstMonthKey } from '../monthlyRankingStars.mjs';
import { appendUserNotification } from '../userNotifications.mjs';
import {
  DAY_MS,
  isRunCountable,
  resolveRunEndedMs,
} from '../competitionWindow.mjs';
import {
  CREW_AWARD_TOP_LIMIT,
  CREW_COUNTABLE_SOURCE_TYPES,
  CREW_DEFAULT_PRIOR_KM,
  CREW_FIRST_SEASON_KEY,
  CREW_MIN_CHAMPION_RUNNERS,
  CREW_MIN_RANKED_MEMBERS,
  CREW_NEW_MEMBER_MIN_MS,
  CREW_PRESEASON_LAST_KEY,
  CREW_RESULT_NOTIFY_DELAY_MS,
  CREW_SEASON_RULE_VERSION,
  CREW_SEASON_SEAL_DELAY_MS,
} from './crewConstants.mjs';

const SEASON_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

// store 객체 → Map(`${seasonKey}|${nowMs}` → standings). 멤버십·원장이 바뀌면 invalidate.
const standingsMemoByStore = new WeakMap();

export function invalidateCrewSeasonMemo(store) {
  if (store && typeof store === 'object') {
    standingsMemoByStore.delete(store);
  }
}

export function previousCrewSeasonKey(seasonKey) {
  let [year, month] = seasonKey.split('-').map(Number);
  month -= 1;

  if (month < 1) {
    month = 12;
    year -= 1;
  }

  return `${year}-${String(month).padStart(2, '0')}`;
}

export function isValidCrewSeasonKey(seasonKey) {
  return typeof seasonKey === 'string'
    && SEASON_KEY_PATTERN.test(seasonKey)
    && seasonKey >= CREW_FIRST_SEASON_KEY;
}

// 'YYYY-MM'은 사전순이 곧 시간순이라 문자열 범위 비교로 충분하다.
export function isCrewPreseason(seasonKey) {
  return seasonKey >= CREW_FIRST_SEASON_KEY && seasonKey <= CREW_PRESEASON_LAST_KEY;
}

// 크루 기여로 세는 기록인가 — 출처 허용 목록(CREW_COUNTABLE_SOURCE_TYPES) 또는 매치 기록, 단 차량
// 판정은 무엇이든 뺀다. 그라운드·랭킹의 isCompetitiveRun(앱 GPS만)보다 넓다(오너 2026-09-18).
export function isCrewCountableRun(run) {
  if (!run || typeof run !== 'object' || isVehicleFlaggedRun(run)) {
    return false;
  }

  if (run.matchResult) {
    return true;
  }

  const sourceType = typeof run.sourceType === 'string' ? run.sourceType.trim() : '';
  if (!CREW_COUNTABLE_SOURCE_TYPES.has(sourceType)) {
    return false;
  }

  // 가져온 기록은 끝난 시각(endedAt)이 있어야 한다 (적대 리뷰 2026-09-18): 없으면
  // resolveRunEndedMs가 동기화 시각(createdAt)으로 폴백해 가입 전 기록을 창 안으로 끌고 오고,
  // [startedAt, 동기화] 구간이 그사이 진짜 기록을 겹침 정리로 지운다. 앱 기록은 옛 기록의
  // createdAt 폴백을 그대로 둔다(저장 시각 ≈ 끝난 시각).
  return sourceType === 'runningground' || Number.isFinite(Date.parse(run.endedAt ?? ''));
}

// 멤버십 행의 기록 인정 시작. 프리시즌 달에 들어온 사람은 들어온 순간부터 (오너 2026-09-18:
// '가입 다음 날 말고 가입한 날 바로') — 새 행은 countsFrom 자체가 가입 시각이지만, 그 전에
// '다음 날 0시'로 저장된 행도 같은 규칙으로 읽는다(데이터를 고치지 않고 판정식 한 곳에서).
export function resolveCrewCountsFromMs(row) {
  const joinedMs = Date.parse(row?.joinedAt ?? '');
  const countsFromMs = Date.parse(row?.countsFrom ?? '');

  if (Number.isFinite(joinedMs) && isCrewPreseason(resolveKstMonthKey(new Date(joinedMs)))) {
    return Number.isFinite(countsFromMs) ? Math.min(joinedMs, countsFromMs) : joinedMs;
  }

  return Number.isFinite(countsFromMs) ? countsFromMs : Number.POSITIVE_INFINITY;
}

// 지금 진행 중인 시즌 — 첫 시즌 이전 시각(테스트 시계)이면 첫 시즌을 돌려준다.
export function resolveCurrentCrewSeasonKey(now = new Date()) {
  const monthKey = resolveKstMonthKey(now);
  return monthKey < CREW_FIRST_SEASON_KEY ? CREW_FIRST_SEASON_KEY : monthKey;
}

// 시즌 경계는 전부 +09:00 문자열로 만든다 — 드롭릿은 UTC라 로컬 달력을 쓰면 00~09시 KST에
// 하루가 밀린다.
export function resolveCrewSeasonBounds(seasonKey) {
  const startMs = Date.parse(`${seasonKey}-01T00:00:00+09:00`);
  const endMs = Date.parse(`${nextMonthKey(seasonKey)}-01T00:00:00+09:00`);
  return { startMs, endMs, sealMs: endMs + CREW_SEASON_SEAL_DELAY_MS };
}

export function findCrewSeasonAward(store, seasonKey) {
  return (store.crewSeasonAwards ?? []).find((award) => award?.seasonKey === seasonKey) ?? null;
}

// 고정 P: 직전 시즌 봉인 원장의 avgKm. 원장이 없거나(첫 시즌) avgKm가 0 이하(아무 크루도
// 안 뛴 달)면 기본값 30 — 0을 그대로 쓰면 작은 크루가 0 쪽으로 눌려 크기 보정이 뒤집힌다.
//
// 직전 시즌이 끝났는데 아직 봉인 전(시즌 첫 1시간)이면 봉인이 할 계산을 지금 그대로 한다
// (적대 리뷰 2026-09-18): 원장이 없다고 30을 쓰면 1일 1시 봉인 순간 P가 30 → avgKm로 뛰어
// 아무도 안 뛰었는데 모든 점수가 바뀌고, 크기가 다른 크루끼리 순위가 뒤집힌다. 끝난 시즌의
// 순위는 늦게 올라온 기록(창+1h) 말고는 변하지 않으니 이 값은 봉인 값으로 이어진다.
export function resolveCrewSeasonPriorKm(store, seasonKey, nowMs = Date.now()) {
  const previousKey = previousCrewSeasonKey(seasonKey);
  const previous = findCrewSeasonAward(store, previousKey);
  let avgKm = Number(previous?.avgKm);

  if (!previous && isValidCrewSeasonKey(previousKey) && nowMs >= resolveCrewSeasonBounds(previousKey).endMs) {
    // 재귀는 첫 시즌에서 멈춘다(그 앞 키는 유효하지 않다). 같은 nowMs라 standings 메모를 탄다.
    avgKm = buildCrewSeasonStandings(store, previousKey, nowMs).avgKm;
  }

  return Number.isFinite(avgKm) && avgKm > 0 ? avgKm : CREW_DEFAULT_PRIOR_KM;
}

// 인당 km. 시즌 멤버가 없으면 0 (순위 밖 행에도 점수 칸이 있다).
export function computeCrewScore(totalKm, memberCount) {
  return memberCount > 0 ? roundDistanceKm(totalKm / memberCount) : 0;
}

function resolveRunStartMs(run, endedMs) {
  const startedMs = Date.parse(run.startedAt ?? '');
  if (Number.isFinite(startedMs) && startedMs <= endedMs) {
    return startedMs;
  }
  const durationSeconds = Number(run.durationSeconds);
  return Number.isFinite(durationSeconds) && durationSeconds > 0 ? endedMs - durationSeconds * 1000 : endedMs;
}

// [startedAt, endedAt]가 조금이라도 겹치면 같은 시간대의 기록이다(이중 저장·startedAt만 바꾼
// 재저장). 끝과 시작이 딱 맞닿는 연속 러닝은 겹침이 아니다.
function runsOverlap(left, right) {
  if (left.startMs === right.startMs && left.endMs === right.endMs) {
    return true;
  }
  return Math.max(left.startMs, right.startMs) < Math.min(left.endMs, right.endMs);
}

// 같은 사람의 겹치는 기록 → 가장 긴 것 하나(같으면 먼저 저장된 것). 긴 것부터 욕심껏 고른다.
function dedupeOverlappingRuns(candidates) {
  const ordered = [...candidates].sort((left, right) => (
    right.km - left.km
    || left.createdMs - right.createdMs
    || String(left.id).localeCompare(String(right.id))
  ));
  const kept = [];

  for (const candidate of ordered) {
    if (!kept.some((entry) => runsOverlap(entry, candidate))) {
      kept.push(candidate);
    }
  }

  return kept;
}

// 멤버 기여 = 인정 기록 합(하루 상한 없음 — 오너 2026-09-18). 순서 고정: endedAt 오름차순(같으면
// id) — 라이브 보드와 봉인이 같은 반올림 순서를 밟아야 '화면 1위 = 우승'이 지켜진다.
function sumContributionKm(runs) {
  const ordered = [...runs].sort((left, right) => left.endMs - right.endMs
    || String(left.id).localeCompare(String(right.id)));
  let totalKm = 0;

  for (const run of ordered) {
    totalKm = roundDistanceKm(totalKm + run.km);
  }
  return totalKm;
}

function parseMs(iso, fallback) {
  const ms = Date.parse(iso ?? '');
  return Number.isFinite(ms) ? ms : fallback;
}

function compareRankedRows(left, right) {
  return right.score - left.score
    || right.totalKm - left.totalKm
    || right.seasonMemberCount - left.seasonMemberCount
    || right.runnerCount - left.runnerCount
    || String(left.createdAt).localeCompare(String(right.createdAt))
    || String(left.crewId).localeCompare(String(right.crewId));
}

function compareUnrankedRows(left, right) {
  return right.activeMemberCount - left.activeMemberCount
    || right.totalKm - left.totalKm
    || String(left.createdAt).localeCompare(String(right.createdAt))
    || String(left.crewId).localeCompare(String(right.crewId));
}

// 시즌 순위의 유일한 계산 — 라이브 보드와 봉인이 모두 이 함수를 쓴다.
// 반환 rows: 순위권(정렬·공동 순위) 다음 순위 밖(인원순). memberStats: `${crewId}|${userId}` →
// { contributionKm, isSeasonMember, countedFromMs } — 시즌 멤버가 아니어도 기여는 추적하고,
// 활성 신입이 인원수에 들어가는 시각(화면의 '10/9 합류')도 여기서 한 번에 낸다.
export function buildCrewSeasonStandings(store, seasonKey, nowMs = Date.now()) {
  const memoKey = `${seasonKey}|${nowMs}`;
  const cached = standingsMemoByStore.get(store)?.get(memoKey);
  if (cached) {
    return cached;
  }

  const { startMs, endMs, sealMs } = resolveCrewSeasonBounds(seasonKey);
  const isPreseason = isCrewPreseason(seasonKey);
  const priorKm = resolveCrewSeasonPriorKm(store, seasonKey, nowMs);
  const userIds = new Set((store.users ?? []).map((user) => user.id));

  // 시즌 끝에 살아 있던 크루만 보드에 오른다(시즌 중에 닫힌 크루는 경쟁하지 않는다). 집계 중
  // (끝~봉인) 사이에 닫힌 크루는 시즌 끝엔 살아 있었으므로 그대로 남는다.
  const crewById = new Map();
  for (const crew of store.crews ?? []) {
    const createdMs = parseMs(crew.createdAt, Number.NEGATIVE_INFINITY);
    const closedMs = parseMs(crew.closedAt, Number.POSITIVE_INFINITY);
    if (createdMs < endMs && closedMs > endMs) {
      crewById.set(crew.id, crew);
    }
  }

  // (크루, 사람)별 멤버십 그룹 — 같은 크루를 나갔다 다시 들어온 사람은 창이 여러 개다.
  const groupsByKey = new Map();
  const windowsByUserId = new Map();
  const activeMemberCountByCrewId = new Map();

  for (const row of store.crewMembers ?? []) {
    if (!crewById.has(row.crewId) || !userIds.has(row.userId)) {
      continue;
    }

    const leftMs = parseMs(row.leftAt, Number.POSITIVE_INFINITY);
    if (leftMs === Number.POSITIVE_INFINITY) {
      activeMemberCountByCrewId.set(row.crewId, (activeMemberCountByCrewId.get(row.crewId) ?? 0) + 1);
    }

    const countsFromMs = resolveCrewCountsFromMs(row);
    const fromMs = Math.max(countsFromMs, startMs);
    const toMs = Math.min(leftMs, endMs);
    if (!(toMs > fromMs)) {
      continue; // 이 시즌과 겹치는 인정 구간이 없다.
    }

    const groupKey = `${row.crewId}|${row.userId}`;
    let group = groupsByKey.get(groupKey);
    if (!group) {
      group = { crewId: row.crewId, userId: row.userId, windows: [], runs: [], contributionKm: 0 };
      groupsByKey.set(groupKey, group);
    }
    const window = { fromMs, toMs, countsFromMs, leftMs, group };
    group.windows.push(window);

    const userWindows = windowsByUserId.get(row.userId) ?? [];
    userWindows.push(window);
    windowsByUserId.set(row.userId, userWindows);
  }

  // store.runs 한 번 훑기 — 창이 있는 사람의 인정 기록만 후보로. 늦은 저장 유예는 봉인 유예와
  // 같은 1시간이라 봉인이 언제 돌든 스냅샷이 같다.
  //
  // 달 경계를 넘는 같은 러닝의 두 사본 (적대 리뷰 2026-09-18): 가져온 기록을 세면서 앱 기록 +
  // 워치/헬스 사본이 달 끝 자정을 사이에 두고 하나는 지난달, 하나는 이번 달에 끝날 수 있다. 시즌
  // 안의 겹침 정리는 그 둘을 못 만난다. 그래서 지난 시즌 마지막 하루에 끝난 기록을 모아 두고, 그와
  // 시간이 겹치는 이번 시즌 후보를 뺀다 — 앞 시즌이 그 러닝을 가진다. 앞 시즌은 뒤를 보지 않으므로
  // 봉인 스냅샷은 안 바뀐다.
  const previousTailByUserId = new Map();
  const candidatesByUserId = new Map();
  for (const run of store.runs ?? []) {
    const windows = windowsByUserId.get(run?.userId);
    if (!windows || !isCrewCountableRun(run)) {
      continue;
    }

    const tailEndedMs = resolveRunEndedMs(run);
    if (tailEndedMs >= startMs - DAY_MS && tailEndedMs < startMs) {
      const tail = previousTailByUserId.get(run.userId) ?? [];
      tail.push({ startMs: resolveRunStartMs(run, tailEndedMs), endMs: tailEndedMs });
      previousTailByUserId.set(run.userId, tail);
      continue;
    }

    const window = windows.find((entry) => (
      isRunCountable(run, entry.fromMs, entry.toMs, CREW_SEASON_SEAL_DELAY_MS)
    ));
    if (!window) {
      continue;
    }

    const endedMs = resolveRunEndedMs(run);
    const candidates = candidatesByUserId.get(run.userId) ?? [];
    candidates.push({
      id: run.id,
      group: window.group,
      startMs: resolveRunStartMs(run, endedMs),
      endMs: endedMs,
      km: roundDistanceKm(Math.max(0, Number(run.distanceKm) || 0)),
      createdMs: parseMs(run.createdAt, Number.POSITIVE_INFINITY),
    });
    candidatesByUserId.set(run.userId, candidates);
  }

  for (const [userId, candidates] of candidatesByUserId) {
    const previousTail = previousTailByUserId.get(userId) ?? [];
    const ownCandidates = previousTail.length > 0
      ? candidates.filter((candidate) => !previousTail.some((tail) => runsOverlap(tail, candidate)))
      : candidates;
    for (const kept of dedupeOverlappingRuns(ownCandidates)) {
      kept.group.runs.push(kept);
    }
  }

  const statsByCrewId = new Map();
  const memberStats = new Map();
  const orderedGroups = [...groupsByKey.values()].sort((left, right) => (
    String(left.crewId).localeCompare(String(right.crewId))
    || String(left.userId).localeCompare(String(right.userId))
  ));

  for (const group of orderedGroups) {
    group.contributionKm = sumContributionKm(group.runs);

    // 시즌 멤버 판정 (7일 규칙). 프리시즌은 규칙을 끈다 — 인정이 시작된 사람은 모두 멤버(가입한
    // 그 순간부터: 방금 들어온 요청의 응답에서도 바로 멤버로 보이게 >=).
    let isSeasonMember;
    if (isPreseason) {
      isSeasonMember = group.windows.some((window) => Math.min(window.toMs, nowMs) >= window.fromMs);
    } else {
      const isVeteran = group.windows.some((window) => window.countsFromMs <= startMs
        && window.leftMs >= startMs + CREW_NEW_MEMBER_MIN_MS);
      const clippedMs = group.windows.reduce(
        (sum, window) => sum + Math.max(0, Math.min(window.toMs, nowMs) - window.fromMs),
        0,
      );
      isSeasonMember = isVeteran || clippedMs >= CREW_NEW_MEMBER_MIN_MS;
    }

    // 아직 멤버가 아닌 활성 멤버가 인원수(N)에 들어가는 시각 — 화면의 '10/9 합류'와 같은 값.
    // 7일 규칙과 같은 재료로 푼다(적대 리뷰 2026-09-18): 이번 시즌 같은 크루에서 앞서 쌓은
    // 구간(나갔다 다시 들어온 사람)을 빼고 남은 시간을 지금 열린 구간 시작에 더한다. 열린 구간이
    // 이미 시작됐든(지금부터 남은 시간) 아직이든(내일 0시부터) 식이 같다. 프리시즌은 인정 시작이 곧 합류.
    let countedFromMs = null;
    const openWindow = isSeasonMember
      ? null
      : group.windows.find((window) => window.leftMs === Number.POSITIVE_INFINITY) ?? null;
    if (openWindow) {
      const accruedBeforeMs = group.windows.reduce((sum, window) => (
        window === openWindow ? sum : sum + Math.max(0, Math.min(window.toMs, nowMs) - window.fromMs)
      ), 0);
      countedFromMs = isPreseason
        ? openWindow.fromMs
        : openWindow.fromMs + Math.max(0, CREW_NEW_MEMBER_MIN_MS - accruedBeforeMs);
    }

    // 이번 시즌 안에(집계 끝 전까지) 합류할 활성 신입 — 'newcomers_pending' 사유 판정용.
    const isPendingNewcomer = countedFromMs !== null && countedFromMs <= endMs;

    memberStats.set(`${group.crewId}|${group.userId}`, {
      contributionKm: group.contributionKm,
      isSeasonMember,
      countedFromMs,
    });

    const stats = statsByCrewId.get(group.crewId)
      ?? { totalKm: 0, memberCount: 0, runnerCount: 0, pendingCount: 0, memberUserIds: [] };
    if (isSeasonMember) {
      stats.totalKm = roundDistanceKm(stats.totalKm + group.contributionKm);
      stats.memberCount += 1;
      stats.memberUserIds.push(group.userId);
      if (group.contributionKm > 0) {
        stats.runnerCount += 1;
      }
    } else if (isPendingNewcomer) {
      stats.pendingCount += 1;
    }
    statsByCrewId.set(group.crewId, stats);
  }

  let sumTotalKm = 0;
  let sumMemberCount = 0;
  const ranked = [];
  const unranked = [];
  const orderedCrews = [...crewById.values()].sort((left, right) => String(left.id).localeCompare(String(right.id)));

  for (const crew of orderedCrews) {
    const stats = statsByCrewId.get(crew.id)
      ?? { totalKm: 0, memberCount: 0, runnerCount: 0, pendingCount: 0, memberUserIds: [] };

    if (stats.memberCount >= 1) {
      sumTotalKm = roundDistanceKm(sumTotalKm + stats.totalKm);
      sumMemberCount += stats.memberCount;
    }

    let unrankedReason = null;
    if (stats.memberCount < CREW_MIN_RANKED_MEMBERS) {
      unrankedReason = stats.memberCount + stats.pendingCount >= CREW_MIN_RANKED_MEMBERS
        ? 'newcomers_pending'
        : 'too_few_members';
    } else if (!(stats.totalKm > 0)) {
      unrankedReason = 'no_distance';
    }

    const row = {
      crewId: crew.id,
      name: crew.name,
      createdAt: crew.createdAt,
      closedAt: crew.closedAt ?? null,
      score: computeCrewScore(stats.totalKm, stats.memberCount),
      totalKm: stats.totalKm,
      seasonMemberCount: stats.memberCount,
      runnerCount: stats.runnerCount,
      pendingMemberCount: stats.pendingCount,
      activeMemberCount: activeMemberCountByCrewId.get(crew.id) ?? 0,
      memberUserIds: stats.memberUserIds,
      rank: null,
      unrankedReason,
    };

    (unrankedReason ? unranked : ranked).push(row);
  }

  ranked.sort(compareRankedRows);
  // 공동 순위: 1 + (점수, 총거리, 인원)에서 엄격히 앞선 크루 수.
  ranked.forEach((row, index) => {
    const previous = ranked[index - 1];
    row.rank = previous
      && previous.score === row.score
      && previous.totalKm === row.totalKm
      && previous.seasonMemberCount === row.seasonMemberCount
      ? previous.rank
      : index + 1;
  });
  unranked.sort(compareUnrankedRows);

  const rows = [...ranked, ...unranked];
  const standings = {
    seasonKey,
    isPreseason,
    startMs,
    endMs,
    sealMs,
    priorKm,
    avgKm: sumMemberCount > 0 ? roundDistanceKm(sumTotalKm / sumMemberCount) : 0,
    rankedCount: ranked.length,
    rows,
    rowByCrewId: new Map(rows.map((row) => [row.crewId, row])),
    memberStats,
  };

  // 메모는 끝에서 다시 읽는다 — 위의 고정 P 계산이 직전 시즌 순위를 먼저 메모해 두었을 수 있다.
  let memo = standingsMemoByStore.get(store);
  if (!memo) {
    memo = new Map();
    standingsMemoByStore.set(store, memo);
  }
  memo.set(memoKey, standings);
  return standings;
}

// 별 개수 — 원장이 유일한 근원(카운터 없음, 매 읽기마다 파생).
export function buildCrewStarCounts(store) {
  const stars = new Map();

  for (const award of store.crewSeasonAwards ?? []) {
    for (const champion of award?.champions ?? []) {
      stars.set(champion.crewId, (stars.get(champion.crewId) ?? 0) + 1);
    }
  }

  return stars;
}

// 봉인 대상: 유예(1h)까지 지난 완료 시즌 — (now − 유예)가 속한 KST 달 이전의 모든 시즌.
function resolveSealableCrewSeasonKeys(now) {
  const limitKey = resolveKstMonthKey(new Date(now.getTime() - CREW_SEASON_SEAL_DELAY_MS));
  const keys = [];

  for (let key = CREW_FIRST_SEASON_KEY; key < limitKey; key = nextMonthKey(key)) {
    keys.push(key);
  }

  return keys;
}

export function hasUnsealedCrewSeason(store, now = new Date()) {
  const sealedKeys = new Set((store.crewSeasonAwards ?? []).map((award) => award?.seasonKey));
  return resolveSealableCrewSeasonKeys(now).some((seasonKey) => !sealedKeys.has(seasonKey));
}

function formatSeasonMonthLabel(seasonKey) {
  return `${Number(seasonKey.slice(5, 7))}월`;
}

function buildCrewSeasonAward(store, seasonKey, now) {
  const standings = buildCrewSeasonStandings(store, seasonKey, now.getTime());
  const rankedRows = standings.rows.filter((row) => row.rank !== null);

  // 우승(프리시즌 제외): 1위 + 뛴 멤버 3명 이상 + 시즌 끝에 살아 있던 크루. 동률은 공동 우승.
  const champions = standings.isPreseason
    ? []
    : rankedRows
      .filter((row) => row.rank === 1
        && row.runnerCount >= CREW_MIN_CHAMPION_RUNNERS
        && !(row.closedAt && Date.parse(row.closedAt) <= standings.endMs))
      .map((row) => ({
        crewId: row.crewId,
        name: row.name,
        score: row.score,
        totalKm: row.totalKm,
        memberCount: row.seasonMemberCount,
        runnerCount: row.runnerCount,
        // 개인 '챔피언 크루 멤버' 뱃지를 나중에 만들 때 쓰는 스냅샷.
        memberUserIds: [...row.memberUserIds],
      }));

  return {
    award: {
      seasonKey,
      sealedAt: now.toISOString(),
      ruleVersion: CREW_SEASON_RULE_VERSION,
      isPreseason: standings.isPreseason,
      priorKm: standings.priorKm,
      avgKm: standings.avgKm,
      rankedCount: standings.rankedCount,
      champions,
      top: rankedRows.slice(0, CREW_AWARD_TOP_LIMIT).map((row) => ({
        crewId: row.crewId,
        name: row.name,
        rank: row.rank,
        score: row.score,
        totalKm: row.totalKm,
        memberCount: row.seasonMemberCount,
        // 봉인 시즌 화면(CrewStandingRow.runnerCount)을 스냅샷만으로 그리기 위한 필드.
        runnerCount: row.runnerCount,
      })),
    },
    rankedRows,
  };
}

// 결과 알림 받을 사람 — 봉인 순간의 시즌 멤버를 원장에 잠깐 적어 둔다(알림은 아침 9시). 그
// 사이에 크루를 나가거나 바뀌어도 '그 시즌을 함께 뛴 사람'에게 간다. 보내고 나면 지운다 —
// 크루 수 × 멤버 수라 원장에 영구히 두기엔 크다.
function buildPendingResultNotices(rankedRows) {
  return rankedRows.map((row) => ({
    crewId: row.crewId,
    name: row.name,
    rank: row.rank,
    userIds: [...row.memberUserIds],
  }));
}

function notifyCrewSeasonResult(store, award, notices, now) {
  const monthLabel = formatSeasonMonthLabel(award.seasonKey);
  const championIds = new Set(award.champions.map((champion) => champion.crewId));
  const userIds = new Set((store.users ?? []).map((user) => user.id));
  const nowIso = now.toISOString();

  for (const notice of notices) {
    const body = championIds.has(notice.crewId)
      ? `${monthLabel} 크루대전 우승: ${notice.name} ★`
      : `${monthLabel} 크루대전 결과: ${notice.name} ${notice.rank}위 / ${award.rankedCount}크루`;

    for (const userId of notice.userIds) {
      // 봉인과 아침 9시 사이에 탈퇴한 사람은 건너뛴다.
      if (!userIds.has(userId)) {
        continue;
      }
      appendUserNotification(store, {
        userId,
        type: 'crew_season_result',
        title: '크루대전 결과',
        body,
        data: { seasonKey: award.seasonKey, crewId: notice.crewId },
        nowIso: () => nowIso,
      });
    }
  }
}

// 봉인된 시즌의 결과 알림을 보낼 때가 됐으면(달 끝 + 9시간 = 1일 아침 9시 KST) 보낸다. 멱등:
// 보낸 원장은 pendingResultNotices를 지우고 resultsNotifiedAt을 남긴다. 서버가 아침까지 멈춰
// 있었다면 봉인과 같은 스윕에서 바로 보낸다.
function deliverDueCrewSeasonResults(store, now) {
  const nowMs = now.getTime();

  for (const award of store.crewSeasonAwards) {
    if (!Array.isArray(award?.pendingResultNotices)) {
      continue;
    }

    const { endMs } = resolveCrewSeasonBounds(award.seasonKey);
    if (nowMs < endMs + CREW_RESULT_NOTIFY_DELAY_MS) {
      continue;
    }

    notifyCrewSeasonResult(store, award, award.pendingResultNotices, now);
    delete award.pendingResultNotices;
    award.resultsNotifiedAt = now.toISOString();
  }
}

// 봉인 스윕 — 유예(1시간)가 지난 미봉인 시즌을 오래된 순서로 봉인하고, 때가 된 결과 알림을
// 보낸다. 멱등: seasonKey 유일성을 잠금(mutateStore) 안에서 다시 확인한다. 순서가 중요하다: 다음
// 시즌의 고정 P가 방금 봉인한 직전 시즌 avgKm에서 나온다(서버가 두 달 멈췄다 켜져도 같은 값).
export function sweepCrewSeasons(store, now = new Date()) {
  if (!Array.isArray(store.crewSeasonAwards)) {
    store.crewSeasonAwards = [];
  }

  const created = [];

  for (const seasonKey of resolveSealableCrewSeasonKeys(now)) {
    if (findCrewSeasonAward(store, seasonKey)) {
      continue;
    }

    const { award, rankedRows } = buildCrewSeasonAward(store, seasonKey, now);
    // 프리시즌: 원장엔 봉인하지만 별·결과 알림은 없다.
    if (!award.isPreseason && rankedRows.length > 0) {
      award.pendingResultNotices = buildPendingResultNotices(rankedRows);
    }
    store.crewSeasonAwards.push(award);
    invalidateCrewSeasonMemo(store);
    created.push(award);
  }

  deliverDueCrewSeasonResults(store, now);
  return created;
}
