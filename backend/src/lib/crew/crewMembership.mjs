// 크루 멤버십 도메인 (크루대전 v1, 오너 승인 2026-09-18).
//
// 저장 구조: JSON 블롭(store) 배열 네 개 — crews / crewMembers / crewJoinRequests /
// crewSeasonAwards. postgres 정규화 리포 미러는 두지 않는다(운영은 블롭 경로 하나).
// 여기에 버린 초대 코드 목록 crewRetiredInviteCodes(문자열 배열)가 처음 버릴 때 생긴다.
// 그라운드(runmadangChallenges)와 완전히 분리한다 — 옛 OTA 클라이언트가 크루 데이터를
// 개인 내기로 오인하지 않게.
//
// 멤버십은 '구간 행'이다: 나가도 행을 지우지 않고 leftAt만 찍는다. 시즌 기여 창
// W = [max(countsFrom, 시즌시작), min(leftAt, 시즌끝))을 판정하려면 과거 구간이 필요하다.
// 정리는 70일 뒤 prune — 봉인(시즌 끝+48h)보다 한참 뒤라 집계에 닿지 않는다.
//
// 가입의 유일한 길은 admitCrewMember 하나다: 코드 가입과 신청 승인이 같은 검사(이미 소속·
// 차단·정원·월 이동 횟수)를 같은 순서로 탄다 — 두 경로가 갈라지면 한쪽만 뚫린다.

import { randomInt } from 'node:crypto';

import { nextId } from '../idHelpers.mjs';
import { ApiError } from '../../response/httpResponse.mjs';
import { appendUserNotification } from '../userNotifications.mjs';
import { resolveKstMonthKey } from '../monthlyRankingStars.mjs';
import { nextKstMidnightMs } from '../competitionWindow.mjs';
import {
  CREW_CLOSED_RETENTION_MS,
  CREW_CREATE_COOLDOWN_MS,
  CREW_DECIDED_REQUEST_RETENTION_MS,
  CREW_INVITE_CODE_ALPHABET,
  CREW_INVITE_CODE_LENGTH,
  CREW_INVITE_CODE_PATTERN,
  CREW_JOIN_REQUEST_TTL_MS,
  CREW_JOINS_PER_MONTH,
  CREW_KICK_BAN_MS,
  CREW_MAX_MEMBERS,
  CREW_NAME_BLOCKLIST,
  CREW_NAME_MAX_LENGTH,
  CREW_NAME_MIN_LENGTH,
  CREW_NAME_PATTERN,
  CREW_REQUEST_CANCEL_COOLDOWN_MS,
  throwCrewError,
} from './crewConstants.mjs';
import { invalidateCrewSeasonMemo } from './crewSeason.mjs';

export function ensureCrewStore(store) {
  if (!Array.isArray(store.crews)) {
    store.crews = [];
  }
  if (!Array.isArray(store.crewMembers)) {
    store.crewMembers = [];
  }
  if (!Array.isArray(store.crewJoinRequests)) {
    store.crewJoinRequests = [];
  }
  if (!Array.isArray(store.crewSeasonAwards)) {
    store.crewSeasonAwards = [];
  }
  return store;
}

// 멤버십이 바뀌면 같은 store 객체에 붙은 시즌 순위 메모를 버린다 — 변경 요청은 바뀐 뒤의
// 순위표를 같은 객체로 다시 그려 돌려주기 때문이다.
function touchCrewStore(store) {
  invalidateCrewSeasonMemo(store);
}

// 이름 키: 소문자 + 공백 전부 제거. '새벽 러너스'와 '새벽러너스'는 같은 이름이다.
export function normalizeCrewNameKey(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, '');
}

// 운영자 이름 변경은 금칙어 검사를 건너뛴다(운영자가 직접 정한 이름) — 형식 검사는 같다.
export function validateCrewName(rawName, { skipBlocklist = false } = {}) {
  const name = typeof rawName === 'string' ? rawName.trim() : '';

  if (
    name.length < CREW_NAME_MIN_LENGTH
    || name.length > CREW_NAME_MAX_LENGTH
    || !CREW_NAME_PATTERN.test(name)
  ) {
    throwCrewError('invalid_name');
  }

  const nameKey = normalizeCrewNameKey(name);

  if (!skipBlocklist && CREW_NAME_BLOCKLIST.some((word) => nameKey.includes(word.toLowerCase()))) {
    throwCrewError('blocked_name');
  }

  return { name, nameKey };
}

// 초대 코드 입력 정규화 — 대문자·공백 제거 후 형식이 맞을 때만 코드로 본다.
export function normalizeCrewInviteCode(rawCode) {
  const code = String(rawCode ?? '').replace(/\s+/g, '').toUpperCase();
  return CREW_INVITE_CODE_PATTERN.test(code) ? code : null;
}

// 한 번이라도 쓰인 초대 코드 — 스펙: 코드는 '지금까지 있었던 모든 크루'에서 유일하다. 닫힌
// 크루·재발급으로 버린 코드가 새 크루에 다시 나가면 옛 공유 링크(/download?crew=)가 엉뚱한 크루로
// 들어간다 (적대 리뷰 2026-09-18: 재발급은 옛 코드를 덮어쓰고, 70일 정리는 닫힌 크루째 지워서
// 그 코드가 다시 뽑힐 수 있었다). 그래서 버리는 코드는 지우지 않는 목록으로 옮긴다. 코드 하나
// 9바이트 남짓이고, 재발급은 레이트 리밋이 묶는다.
function retireCrewInviteCode(store, code) {
  if (typeof code !== 'string' || !code) {
    return;
  }
  if (!Array.isArray(store.crewRetiredInviteCodes)) {
    store.crewRetiredInviteCodes = [];
  }
  if (!store.crewRetiredInviteCodes.includes(code)) {
    store.crewRetiredInviteCodes.push(code);
  }
}

export function collectUsedCrewInviteCodes(store) {
  return new Set([
    ...(store.crews ?? []).map((crew) => crew.inviteCode),
    ...(store.crewRetiredInviteCodes ?? []),
  ]);
}

// crypto 난수 6자리. 중복 검사는 '살아 있는 크루'가 아니라 지금까지 쓴 모든 코드를 본다.
function generateCrewInviteCode(store) {
  const usedCodes = collectUsedCrewInviteCodes(store);

  for (;;) {
    let code = '';

    for (let index = 0; index < CREW_INVITE_CODE_LENGTH; index += 1) {
      code += CREW_INVITE_CODE_ALPHABET[randomInt(CREW_INVITE_CODE_ALPHABET.length)];
    }

    if (!usedCodes.has(code)) {
      return code;
    }
  }
}

export function findCrew(store, crewId) {
  return (store.crews ?? []).find((crew) => crew.id === crewId) ?? null;
}

export function isCrewOpen(crew) {
  return Boolean(crew) && !crew.closedAt;
}

export function requireOpenCrew(store, crewId) {
  const crew = findCrew(store, crewId);

  if (!isCrewOpen(crew)) {
    throwCrewError('not_found');
  }

  return crew;
}

export function findOpenCrewByInviteCode(store, rawCode) {
  const code = normalizeCrewInviteCode(rawCode);

  if (!code) {
    return null;
  }

  return (store.crews ?? []).find((crew) => isCrewOpen(crew) && crew.inviteCode === code) ?? null;
}

export function listActiveCrewMembers(store, crewId) {
  return (store.crewMembers ?? []).filter((row) => row.crewId === crewId && !row.leftAt);
}

// 한 사람 = 한 크루: 활성(leftAt 없는) 행은 많아야 하나다.
export function findActiveCrewMembership(store, userId) {
  return (store.crewMembers ?? []).find((row) => row.userId === userId && !row.leftAt) ?? null;
}

// 이번 KST 달에 새로 들어간 횟수 — 멤버십 행이 생긴 횟수(만들기·코드 가입·승인 전부)다.
export function countCrewJoinsThisMonth(store, userId, now = new Date()) {
  const monthKey = resolveKstMonthKey(now);

  return (store.crewMembers ?? []).filter((row) => {
    if (row.userId !== userId) {
      return false;
    }
    const joinedMs = Date.parse(row.joinedAt ?? '');
    return Number.isFinite(joinedMs) && resolveKstMonthKey(new Date(joinedMs)) === monthKey;
  }).length;
}

export function getCrewJoinsLeftThisMonth(store, userId, now = new Date()) {
  return Math.max(0, CREW_JOINS_PER_MONTH - countCrewJoinsThisMonth(store, userId, now));
}

export function isUserBannedFromCrew(crew, userId, nowMs) {
  return (crew?.bans ?? []).some((ban) => ban.userId === userId && Date.parse(ban.until) > nowMs);
}

// 가입 신청 상태는 저장값 'pending' + 만료(7일)를 createdAt에서 도출한다 — 만료를 쓰는
// 별도 작업 없이 prune이 나중에 정리한다.
export function isCrewJoinRequestPending(request, nowMs) {
  if (request?.status !== 'pending') {
    return false;
  }
  const createdMs = Date.parse(request.createdAt ?? '');
  return Number.isFinite(createdMs) && nowMs - createdMs < CREW_JOIN_REQUEST_TTL_MS;
}

export function findPendingCrewJoinRequest(store, userId, nowMs) {
  return (store.crewJoinRequests ?? [])
    .find((request) => request.userId === userId && isCrewJoinRequestPending(request, nowMs)) ?? null;
}

// 어느 크루에든 들어가면(코드 가입·만들기) 기다리던 신청은 자동 취소된다 — 캡틴이 나중에
// 승인해도 already_in_crew로 무효가 될 신청을 남겨 두지 않는다.
export function cancelPendingCrewJoinRequestsForUser(store, userId, now, { exceptRequestId = null } = {}) {
  const nowMs = now.getTime();
  const nowIso = now.toISOString();

  for (const request of store.crewJoinRequests ?? []) {
    if (request.userId === userId && request.id !== exceptRequestId && isCrewJoinRequestPending(request, nowMs)) {
      request.status = 'cancelled';
      request.decidedAt = nowIso;
    }
  }
}

function voidPendingCrewJoinRequestsForCrew(store, crewId, now) {
  const nowMs = now.getTime();
  const nowIso = now.toISOString();

  for (const request of store.crewJoinRequests ?? []) {
    if (request.crewId === crewId && isCrewJoinRequestPending(request, nowMs)) {
      request.status = 'void';
      request.decidedAt = nowIso;
    }
  }
}

function pushMembershipRow(store, crew, userId, role, now) {
  const row = {
    id: nextId('crew-member'),
    crewId: crew.id,
    userId,
    role,
    joinedAt: now.toISOString(),
    // 다음 날 0시(KST)부터 인정 — 하루에 두 크루에서 동시에 인정받을 수 없다.
    countsFrom: new Date(nextKstMidnightMs(now.getTime())).toISOString(),
    leftAt: null,
    leftReason: null,
  };
  store.crewMembers.push(row);
  return row;
}

function notifyNewCaptain(store, crew, userId, now) {
  appendUserNotification(store, {
    userId,
    type: 'crew_captain',
    title: '크루 캡틴',
    body: `${crew.name}의 캡틴이 됐어요.`,
    data: { crewId: crew.id },
    nowIso: () => now.toISOString(),
  });
}

function closeCrew(store, crew, now) {
  crew.closedAt = now.toISOString();
  voidPendingCrewJoinRequestsForCrew(store, crew.id, now);
}

// 캡틴 자동 이양: 인정 시작(countsFrom)이 가장 이른 활성 멤버, 같으면 먼저 들어온 사람.
function pickCaptainSuccessor(activeRows) {
  return [...activeRows].sort((left, right) => (
    String(left.countsFrom).localeCompare(String(right.countsFrom))
    || String(left.joinedAt).localeCompare(String(right.joinedAt))
    || String(left.id).localeCompare(String(right.id))
  ))[0] ?? null;
}

// 멤버십 종료의 단일 경로 — 나가기·내보내기·계정 삭제·운영자 종료가 모두 여기를 지난다.
// 캡틴이 빠지면 자동 이양, 마지막 사람이 빠지면 크루 종료(이름도 바로 풀린다). 해체 버튼은
// 없다: 조용한 복구 경로가 크루를 지우는 사고를 막는다(matchRoom deleteRoom 교훈).
function endCrewMembership(store, crew, row, reason, now) {
  row.leftAt = now.toISOString();
  row.leftReason = reason;

  if (!crew || !isCrewOpen(crew)) {
    return;
  }

  const remaining = listActiveCrewMembers(store, crew.id);

  if (remaining.length === 0) {
    closeCrew(store, crew, now);
    return;
  }

  if (crew.captainUserId === row.userId) {
    const successor = pickCaptainSuccessor(remaining);
    successor.role = 'captain';
    crew.captainUserId = successor.userId;
    notifyNewCaptain(store, crew, successor.userId, now);
  }
}

// 가입의 단일 관문 (코드 가입 = 신청 승인). 검사 순서: 이미 소속 → 차단 → 정원 → 월 이동 횟수.
// 이미 '이 크루' 소속이면 멱등 성공(두 번 눌러도 같은 결과).
export function admitCrewMember(store, crew, userId, now = new Date(), { keepRequestId = null } = {}) {
  ensureCrewStore(store);
  const nowMs = now.getTime();
  const active = findActiveCrewMembership(store, userId);

  if (active) {
    if (active.crewId === crew.id) {
      return { row: active, alreadyMember: true };
    }
    throwCrewError('already_in_crew');
  }

  if (isUserBannedFromCrew(crew, userId, nowMs)) {
    throwCrewError('crew_banned');
  }

  if (listActiveCrewMembers(store, crew.id).length >= CREW_MAX_MEMBERS) {
    throwCrewError('crew_full');
  }

  if (getCrewJoinsLeftThisMonth(store, userId, now) <= 0) {
    throwCrewError('join_limit');
  }

  const row = pushMembershipRow(store, crew, userId, 'member', now);
  cancelPendingCrewJoinRequestsForUser(store, userId, now, { exceptRequestId: keepRequestId });
  touchCrewStore(store);
  return { row, alreadyMember: false };
}

export function createCrew(store, user, input, now = new Date()) {
  ensureCrewStore(store);
  const nowMs = now.getTime();
  const { name, nameKey } = validateCrewName(input?.name);

  if (findActiveCrewMembership(store, user.id)) {
    throwCrewError('already_in_crew');
  }

  const recentlyCreated = store.crews.some((crew) => {
    const createdMs = Date.parse(crew.createdAt ?? '');
    return crew.createdByUserId === user.id
      && Number.isFinite(createdMs)
      && nowMs - createdMs < CREW_CREATE_COOLDOWN_MS;
  });
  if (recentlyCreated) {
    throwCrewError('create_limit');
  }

  // 만들기도 '들어가기' 한 번으로 센다 — 만들고 나가기를 반복하는 크루 도배를 월 3회로 묶는다.
  if (getCrewJoinsLeftThisMonth(store, user.id, now) <= 0) {
    throwCrewError('join_limit');
  }

  if (store.crews.some((crew) => isCrewOpen(crew) && crew.nameKey === nameKey)) {
    throwCrewError('name_taken');
  }

  const crew = {
    id: nextId('crew'),
    name,
    nameKey,
    inviteCode: generateCrewInviteCode(store),
    captainUserId: user.id,
    createdByUserId: user.id,
    createdAt: now.toISOString(),
    closedAt: null,
    bans: [],
  };

  store.crews.push(crew);
  pushMembershipRow(store, crew, user.id, 'captain', now);
  cancelPendingCrewJoinRequestsForUser(store, user.id, now);
  touchCrewStore(store);
  return crew;
}

export function joinCrewByCode(store, user, rawCode, now = new Date()) {
  ensureCrewStore(store);
  const crew = findOpenCrewByInviteCode(store, rawCode);

  if (!crew) {
    throwCrewError('not_found');
  }

  admitCrewMember(store, crew, user.id, now);
  return crew;
}

function requireActiveRow(store, crewId, userId) {
  const row = listActiveCrewMembers(store, crewId).find((entry) => entry.userId === userId);

  if (!row) {
    throwCrewError('not_member');
  }

  return row;
}

export function requireCrewCaptain(store, crewId, user) {
  const crew = requireOpenCrew(store, crewId);

  if (crew.captainUserId !== user.id) {
    throwCrewError('not_captain');
  }

  return crew;
}

export function leaveCrew(store, user, crewId, now = new Date()) {
  ensureCrewStore(store);
  const crew = requireOpenCrew(store, crewId);
  const row = requireActiveRow(store, crew.id, user.id);

  endCrewMembership(store, crew, row, 'left', now);
  touchCrewStore(store);
  return crew;
}

export function kickCrewMember(store, user, crewId, targetUserId, now = new Date()) {
  ensureCrewStore(store);
  const crew = requireCrewCaptain(store, crewId, user);

  if (targetUserId === user.id) {
    throw new ApiError(400, '자기 자신은 내보낼 수 없어요. 크루 나가기를 이용해주세요.');
  }

  const row = requireActiveRow(store, crew.id, targetUserId);
  endCrewMembership(store, crew, row, 'kicked', now);

  // 재가입 차단 30일(코드·신청 모두) — 유출된 코드로 들어온 사보타주 계정이 곧장 돌아오지 못한다.
  crew.bans = (crew.bans ?? []).filter((ban) => ban.userId !== targetUserId);
  crew.bans.push({ userId: targetUserId, until: new Date(now.getTime() + CREW_KICK_BAN_MS).toISOString() });

  appendUserNotification(store, {
    userId: targetUserId,
    type: 'crew_kicked',
    title: '크루',
    body: `${crew.name}에서 내보내졌어요. 30일 동안 다시 들어갈 수 없어요.`,
    data: { crewId: crew.id },
    nowIso: () => now.toISOString(),
  });

  touchCrewStore(store);
  return crew;
}

export function transferCrewCaptain(store, user, crewId, targetUserId, now = new Date()) {
  ensureCrewStore(store);
  const crew = requireCrewCaptain(store, crewId, user);

  if (targetUserId === user.id) {
    throw new ApiError(400, '이미 캡틴이에요.');
  }

  const targetRow = requireActiveRow(store, crew.id, targetUserId);
  const captainRow = listActiveCrewMembers(store, crew.id).find((entry) => entry.userId === user.id);

  if (captainRow) {
    captainRow.role = 'member';
  }
  targetRow.role = 'captain';
  crew.captainUserId = targetUserId;
  notifyNewCaptain(store, crew, targetUserId, now);

  touchCrewStore(store);
  return crew;
}

// 코드 재발급 — 옛 코드는 즉시 무효(공유된 링크로는 더 못 들어온다). 옛 코드는 버린 코드
// 목록으로 옮겨 다른 크루에 다시 나가지 않게 한다.
export function rotateCrewInviteCode(store, user, crewId) {
  ensureCrewStore(store);
  const crew = requireCrewCaptain(store, crewId, user);
  const previousCode = crew.inviteCode;

  crew.inviteCode = generateCrewInviteCode(store);
  retireCrewInviteCode(store, previousCode);
  touchCrewStore(store);
  return crew;
}

// 계정 삭제 훅 — authRepository.deleteAccount와 adminRepository.deleteUser 두 곳이 users에서
// 지우기 '전에' 부른다(후임 캡틴 알림이 살아 있는 저장소에 쌓이도록). 활성 멤버십을 'deleted'로
// 끝내고(캡틴이면 이양, 마지막이면 종료), 기다리던 가입 신청은 취소한다. 크루 배열이 아직 없는
// 저장소는 건드리지 않는다 — 크루를 한 번도 안 쓴 서버의 탈퇴가 블롭을 바꾸지 않게.
export function endCrewMembershipsForDeletedUser(store, userId, now = new Date()) {
  if (!Array.isArray(store.crewMembers) && !Array.isArray(store.crewJoinRequests)) {
    return;
  }

  ensureCrewStore(store);

  for (const row of store.crewMembers.filter((entry) => entry.userId === userId && !entry.leftAt)) {
    endCrewMembership(store, findCrew(store, row.crewId), row, 'deleted', now);
  }

  cancelPendingCrewJoinRequestsForUser(store, userId, now);
  touchCrewStore(store);
}

// 운영자 도구 (심판 필수 수정: 이름이 전국 순위표에 공개되는 순간 필요하다).
export function adminRenameCrew(store, crewId, rawName) {
  ensureCrewStore(store);
  const crew = requireOpenCrew(store, crewId);
  const { name, nameKey } = validateCrewName(rawName, { skipBlocklist: true });

  if (store.crews.some((entry) => entry.id !== crew.id && isCrewOpen(entry) && entry.nameKey === nameKey)) {
    throwCrewError('name_taken');
  }

  crew.name = name;
  crew.nameKey = nameKey;
  touchCrewStore(store);
  return crew;
}

// 운영자 종료 — 남은 멤버 전원을 'closed'로 끝내고 크루를 닫는다(대기 중인 신청은 무효).
export function adminCloseCrew(store, crewId, now = new Date()) {
  ensureCrewStore(store);
  const crew = requireOpenCrew(store, crewId);
  const nowIso = now.toISOString();

  for (const row of listActiveCrewMembers(store, crew.id)) {
    row.leftAt = nowIso;
    row.leftReason = 'closed';
  }

  closeCrew(store, crew, now);
  touchCrewStore(store);
  return crew;
}

// 정리 (5분 스위퍼): 70일 지난 종료 크루·나간 멤버 행, 30일 지난 결정된 신청(취소는 하루),
// 만료(7일)된 대기 신청, 사라진 유저의 행, 만료된 차단. 봉인 원장(crewSeasonAwards)과 쓴 적 있는
// 초대 코드 목록(crewRetiredInviteCodes)은 절대 지우지 않는다 — 지우는 크루의 코드는 그 목록으로
// 옮긴다. 지울 게 없으면 내용이 그대로라 mutateStore의 직렬화 비교에서 저장이 생략된다.
export function pruneCrewStore(store, now = new Date()) {
  if (!Array.isArray(store.crews) && !Array.isArray(store.crewMembers) && !Array.isArray(store.crewJoinRequests)) {
    return 0;
  }

  ensureCrewStore(store);
  const nowMs = now.getTime();
  const userIds = new Set((store.users ?? []).map((user) => user.id));
  const isOlderThan = (iso, retentionMs) => {
    const ms = Date.parse(iso ?? '');
    return Number.isFinite(ms) && nowMs - ms >= retentionMs;
  };
  let removed = 0;

  const crewCountBefore = store.crews.length;
  store.crews = store.crews.filter((crew) => {
    if (crew.closedAt && isOlderThan(crew.closedAt, CREW_CLOSED_RETENTION_MS)) {
      retireCrewInviteCode(store, crew.inviteCode);
      return false;
    }
    return true;
  });
  removed += crewCountBefore - store.crews.length;
  const crewIds = new Set(store.crews.map((crew) => crew.id));

  for (const crew of store.crews) {
    const bans = Array.isArray(crew.bans) ? crew.bans : [];
    const keptBans = bans.filter((ban) => userIds.has(ban.userId) && Date.parse(ban.until) > nowMs);
    if (keptBans.length !== bans.length || !Array.isArray(crew.bans)) {
      crew.bans = keptBans;
    }
  }

  const memberCountBefore = store.crewMembers.length;
  store.crewMembers = store.crewMembers.filter((row) => (
    crewIds.has(row.crewId)
    && userIds.has(row.userId)
    && !(row.leftAt && isOlderThan(row.leftAt, CREW_CLOSED_RETENTION_MS))
  ));
  removed += memberCountBefore - store.crewMembers.length;

  const requestCountBefore = store.crewJoinRequests.length;
  store.crewJoinRequests = store.crewJoinRequests.filter((request) => {
    if (!crewIds.has(request.crewId) || !userIds.has(request.userId)) {
      return false;
    }
    if (request.status === 'pending') {
      return isCrewJoinRequestPending(request, nowMs);
    }
    // 취소 행은 재신청 대기(하루)에만 쓰인다 — 그 뒤엔 바로 정리해 신청·취소 반복이 블롭을 못 불린다.
    const retentionMs = request.status === 'cancelled'
      ? CREW_REQUEST_CANCEL_COOLDOWN_MS
      : CREW_DECIDED_REQUEST_RETENTION_MS;
    return !isOlderThan(request.decidedAt ?? request.createdAt, retentionMs);
  });
  removed += requestCountBefore - store.crewJoinRequests.length;

  if (removed > 0) {
    touchCrewStore(store);
  }

  return removed;
}
