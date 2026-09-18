// 크루 가입 신청 (오너 2026-09-18: 초대 코드 즉시 가입 + 공개 크루 검색·가입 신청·캡틴 승인).
//
// 규칙:
//  - 크루가 없는 사람만 신청할 수 있고, 한 사람이 기다리는 신청은 하나뿐이다(새 신청이 옛 신청을
//    대체하지 않는다 — request_pending). 7일이 지나면 만료(createdAt에서 도출, prune이 정리).
//  - 승인은 코드 가입과 똑같은 관문(admitCrewMember)을 탄다. 그사이 다른 크루에 들어갔으면
//    already_in_crew로 거절하고 신청은 'void'로 남긴다 — 이 표시는 커밋돼야 하므로 오류를
//    mutateStore 안에서 던지지 않고 코드로 돌려준다(던지면 void 표시까지 롤백된다).
//  - 새 신청은 캡틴에게 crew_join_request, 결정은 신청자에게 crew_join_decided 알림.
//  - 같은 크루에는 취소 뒤 하루·거절 뒤 7일이 지나야 다시 신청한다(request_cooldown) — 신청·취소
//    반복으로 한 캡틴에게 알림을 퍼붓는 길을 막는다(적대 리뷰 2026-09-18).

import { nextId } from '../idHelpers.mjs';
import { appendUserNotification } from '../userNotifications.mjs';
import {
  admitCrewMember,
  ensureCrewStore,
  findActiveCrewMembership,
  findPendingCrewJoinRequest,
  getCrewJoinsLeftThisMonth,
  isCrewJoinRequestPending,
  isUserBannedFromCrew,
  listActiveCrewMembers,
  requireCrewCaptain,
  requireOpenCrew,
} from './crewMembership.mjs';
import {
  CREW_MAX_MEMBERS,
  CREW_REQUEST_CANCEL_COOLDOWN_MS,
  CREW_REQUEST_REJECT_COOLDOWN_MS,
  throwCrewError,
} from './crewConstants.mjs';
import { invalidateCrewSeasonMemo } from './crewSeason.mjs';

// 같은 크루에 최근 취소(하루)·거절(7일)된 신청이 있으면 재신청 대기 중이다 (적대 리뷰 2026-09-18:
// 신청·취소 반복이 캡틴 알림 폭탄이 됐다). 코드 가입·만들기가 자동으로 취소한 신청도 같은
// 'cancelled'라 하루를 기다린다 — 그 사이 다른 크루에 들어갔다 나온 드문 경우라 따로 가르지 않는다.
function isCrewJoinRequestCoolingDown(store, crewId, userId, nowMs) {
  return (store.crewJoinRequests ?? []).some((request) => {
    if (request.crewId !== crewId || request.userId !== userId) {
      return false;
    }

    let cooldownMs = 0;
    if (request.status === 'cancelled') {
      cooldownMs = CREW_REQUEST_CANCEL_COOLDOWN_MS;
    } else if (request.status === 'rejected') {
      cooldownMs = CREW_REQUEST_REJECT_COOLDOWN_MS;
    }

    const decidedMs = Date.parse(request.decidedAt ?? '');
    return cooldownMs > 0 && Number.isFinite(decidedMs) && nowMs - decidedMs < cooldownMs;
  });
}

// 신청 가능 여부의 단일 판정 — 신청 API와 크루 상세의 canRequest가 같은 검사를 본다.
// 반환: null(가능) | 오류 코드.
export function resolveCrewJoinRequestBlocker(store, crew, userId, now = new Date()) {
  const nowMs = now.getTime();

  if (findActiveCrewMembership(store, userId)) {
    return 'already_in_crew';
  }
  if (findPendingCrewJoinRequest(store, userId, nowMs)) {
    return 'request_pending';
  }
  if (isUserBannedFromCrew(crew, userId, nowMs)) {
    return 'crew_banned';
  }
  if (isCrewJoinRequestCoolingDown(store, crew.id, userId, nowMs)) {
    return 'request_cooldown';
  }
  if (listActiveCrewMembers(store, crew.id).length >= CREW_MAX_MEMBERS) {
    return 'crew_full';
  }
  if (getCrewJoinsLeftThisMonth(store, userId, now) <= 0) {
    return 'join_limit';
  }
  return null;
}

export function requestToJoinCrew(store, user, crewId, now = new Date()) {
  ensureCrewStore(store);
  const crew = requireOpenCrew(store, crewId);
  const blocker = resolveCrewJoinRequestBlocker(store, crew, user.id, now);

  if (blocker) {
    throwCrewError(blocker);
  }

  const nowIso = now.toISOString();
  const request = {
    id: nextId('crew-request'),
    crewId: crew.id,
    userId: user.id,
    status: 'pending',
    createdAt: nowIso,
    decidedAt: null,
  };
  store.crewJoinRequests.push(request);

  appendUserNotification(store, {
    userId: crew.captainUserId,
    type: 'crew_join_request',
    title: '크루 가입 신청',
    body: `${user.name}님이 ${crew.name}에 가입을 신청했어요.`,
    data: { crewId: crew.id, requestId: request.id },
    nowIso: () => nowIso,
  });

  return request;
}

export function cancelCrewJoinRequest(store, user, requestId, now = new Date()) {
  ensureCrewStore(store);
  const request = store.crewJoinRequests.find((entry) => entry.id === requestId);

  if (!request || request.userId !== user.id || !isCrewJoinRequestPending(request, now.getTime())) {
    throwCrewError('not_found');
  }

  request.status = 'cancelled';
  request.decidedAt = now.toISOString();
  return request;
}

export function listPendingCrewJoinRequests(store, crewId, nowMs) {
  return (store.crewJoinRequests ?? [])
    .filter((request) => request.crewId === crewId && isCrewJoinRequestPending(request, nowMs))
    .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
}

// countsNow: 저장된 행의 인정 시작이 가입 순간인가(프리시즌 즉시 합류) — 문구를 규칙에서 따로
// 계산하지 않고 실제로 저장된 행에서 읽어, pushMembershipRow와 어긋날 수 없게 한다(적대 리뷰
// 2026-09-18: 프리시즌 승인 알림이 '내일 0시부터'라고 거짓말했다).
function notifyDecision(store, crew, request, approved, nowIso, countsNow = false) {
  appendUserNotification(store, {
    userId: request.userId,
    type: 'crew_join_decided',
    title: '크루 가입 신청',
    body: approved
      ? `${crew.name}에 들어갔어요. ${countsNow ? '들어온 순간부터' : '내일 0시부터'} 기록이 크루 점수에 들어가요.`
      : `${crew.name} 가입 신청이 거절됐어요.`,
    data: { crewId: crew.id, requestId: request.id, approved },
    nowIso: () => nowIso,
  });
}

// 캡틴의 승인/거절. 반환: { errorCode } — 커밋 뒤에 던질 오류(void 처리한 already_in_crew).
// 정원·차단·월 이동 횟수 실패는 그대로 던진다(신청은 대기 상태로 남아 캡틴이 자리를 비운 뒤
// 다시 승인할 수 있다).
export function decideCrewJoinRequest(store, user, requestId, approve, now = new Date()) {
  ensureCrewStore(store);
  const nowIso = now.toISOString();
  const request = store.crewJoinRequests.find((entry) => entry.id === requestId);

  if (!request || !isCrewJoinRequestPending(request, now.getTime())) {
    throwCrewError('not_found');
  }

  const crew = requireCrewCaptain(store, request.crewId, user);

  if (!approve) {
    request.status = 'rejected';
    request.decidedAt = nowIso;
    notifyDecision(store, crew, request, false, nowIso);
    return { request, errorCode: null };
  }

  // 신청자가 사라졌다(삭제 훅을 거치지 않은 옛 경로) — 없는 사람을 멤버로 들이지 않는다.
  if (!(store.users ?? []).some((entry) => entry.id === request.userId)) {
    request.status = 'void';
    request.decidedAt = nowIso;
    return { request, errorCode: 'not_found' };
  }

  const active = findActiveCrewMembership(store, request.userId);
  if (active) {
    // 그사이 다른 크루(또는 코드로 이 크루)에 들어갔다 — 신청은 더 의미가 없다.
    request.status = 'void';
    request.decidedAt = nowIso;
    invalidateCrewSeasonMemo(store);
    return { request, errorCode: active.crewId === crew.id ? null : 'already_in_crew' };
  }

  const { row } = admitCrewMember(store, crew, request.userId, now, { keepRequestId: request.id });
  request.status = 'approved';
  request.decidedAt = nowIso;
  notifyDecision(store, crew, request, true, nowIso, row?.countsFrom === row?.joinedAt);
  return { request, errorCode: null };
}
