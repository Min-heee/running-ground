// 문의하기 (오너 2026-07-31) — 유저가 제목/내용으로 문의를 보내고, 관리자 웹에서
// 확인 후 답변을 달면 유저 앱의 문의 내역과 인박스 알림으로 전달된다.
//
// 저장 구조: store.inquiries[] — 한 문의에 답변 여러 개(추가형). 유저는 자기 문의만,
// 관리자는 전체를 본다.
//
// 보존 정책: 스토어는 whole-blob이라 매 쓰기마다 통째로 직렬화된다(#209 교훈). 문의가
// 무한히 쌓이면 모든 러닝 저장/매치 진행 푸시가 그 비용을 낸다 — 그래서 작성 시마다
// (1) 유저당 최근 INQUIRY_KEEP_PER_USER건, (2) 답변 완료 후 INQUIRY_ANSWERED_TTL_DAYS일 경과분
// 을 정리한다. 미답변 문의는 오래돼도 지우지 않는다 (답변 의무가 남아 있으므로).

import { ApiError } from '../response/httpResponse.mjs';
import { nextId } from './idHelpers.mjs';
import { appendUserNotification } from './userNotifications.mjs';

export const INQUIRY_TITLE_MAX_LENGTH = 60;
export const INQUIRY_BODY_MAX_LENGTH = 1000;
export const INQUIRY_REPLY_MAX_LENGTH = 1000;
// 스팸/실수 연타 방지 — 한 유저가 하루에 보낼 수 있는 문의 수.
export const INQUIRY_DAILY_LIMIT = 10;
// 보존 상한 — 유저당 보관 건수 / 답변 완료분 보관 기간.
export const INQUIRY_KEEP_PER_USER = 20;
export const INQUIRY_ANSWERED_TTL_DAYS = 90;
// 관리자 목록 상한 (오래된 답변 완료분은 잘라 낸다 — 대기 건은 정렬상 항상 위).
export const INQUIRY_ADMIN_LIST_LIMIT = 200;

// 작성 시점에 호출 — 유저당 보관 수, 답변 완료 TTL로 정리한다.
export function pruneInquiries(store, now = new Date()) {
  const inquiries = ensureInquiries(store);
  const answeredCutoffMs = now.getTime() - INQUIRY_ANSWERED_TTL_DAYS * 24 * 60 * 60 * 1_000;
  const keptCountByUser = new Map();

  // 최신순으로 훑으며 유저당 보관 수를 센다 (오래된 것부터 탈락).
  const kept = inquiries
    .toSorted((left, right) => Date.parse(right.createdAt ?? '') - Date.parse(left.createdAt ?? ''))
    .filter((inquiry) => {
      const answered = (inquiry.replies ?? []).length > 0;
      const createdAtMs = Date.parse(inquiry.createdAt ?? '');

      if (answered && Number.isFinite(createdAtMs) && createdAtMs < answeredCutoffMs) {
        return false;
      }

      const keptCount = keptCountByUser.get(inquiry.userId) ?? 0;

      // 미답변은 상한과 무관하게 보관 — 답변 의무가 남아 있다.
      if (answered && keptCount >= INQUIRY_KEEP_PER_USER) {
        return false;
      }

      keptCountByUser.set(inquiry.userId, keptCount + 1);
      return true;
    });

  if (kept.length !== inquiries.length) {
    // 원래 순서(오래된 것부터)를 유지해 되돌린다.
    store.inquiries = kept.toSorted(
      (left, right) => Date.parse(left.createdAt ?? '') - Date.parse(right.createdAt ?? ''),
    );
  }

  return store.inquiries;
}

// 탈퇴 정리 — 유저가 쓴 문의(자유서술 PII)를 함께 파기한다. 삭제 경로에서 호출.
export function removeUserInquiries(store, userId) {
  const inquiries = ensureInquiries(store);
  store.inquiries = inquiries.filter((entry) => entry.userId !== userId);
  return store.inquiries;
}

export function ensureInquiries(store) {
  if (!Array.isArray(store.inquiries)) {
    store.inquiries = [];
  }

  return store.inquiries;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildInquiryPayload(inquiry, { includeUser = false, usersById = null } = {}) {
  const user = includeUser && usersById ? usersById.get(inquiry.userId) : null;

  return {
    id: inquiry.id,
    title: inquiry.title,
    body: inquiry.body,
    status: inquiry.replies?.length ? 'answered' : 'pending',
    createdAt: inquiry.createdAt,
    replies: (inquiry.replies ?? []).map((reply) => ({
      id: reply.id,
      body: reply.body,
      createdAt: reply.createdAt,
    })),
    ...(includeUser
      ? {
          userId: inquiry.userId,
          userName: user?.name ?? '(탈퇴한 사용자)',
          userTag: user?.publicTag ?? '',
        }
      : {}),
  };
}

// 유저: 문의 작성 (mutateStore 안에서 호출).
export function createUserInquiry(store, user, input, now = new Date()) {
  const title = normalizeText(input?.title);
  const body = normalizeText(input?.body);

  if (!title) {
    throw new ApiError(400, '문의 제목을 입력해주세요.');
  }

  if (title.length > INQUIRY_TITLE_MAX_LENGTH) {
    throw new ApiError(400, `문의 제목은 ${INQUIRY_TITLE_MAX_LENGTH}자까지 쓸 수 있어요.`);
  }

  if (!body) {
    throw new ApiError(400, '문의 내용을 입력해주세요.');
  }

  if (body.length > INQUIRY_BODY_MAX_LENGTH) {
    throw new ApiError(400, `문의 내용은 ${INQUIRY_BODY_MAX_LENGTH}자까지 쓸 수 있어요.`);
  }

  const inquiries = pruneInquiries(store, now);
  const dayStartMs = now.getTime() - 24 * 60 * 60 * 1_000;
  const recentCount = inquiries.filter(
    (entry) => entry.userId === user.id && Date.parse(entry.createdAt ?? '') > dayStartMs,
  ).length;

  if (recentCount >= INQUIRY_DAILY_LIMIT) {
    throw new ApiError(429, '하루에 보낼 수 있는 문의 수를 넘었어요. 내일 다시 시도해주세요.');
  }

  const usedIds = new Set(inquiries.map((entry) => entry.id));
  let inquiryId = nextId('inquiry');

  while (usedIds.has(inquiryId)) {
    inquiryId = nextId('inquiry');
  }

  const inquiry = {
    id: inquiryId,
    userId: user.id,
    title,
    body,
    createdAt: now.toISOString(),
    replies: [],
  };

  inquiries.push(inquiry);

  return { inquiry: buildInquiryPayload(inquiry) };
}

// 유저: 내 문의 내역 (최신순).
export function buildMyInquiriesPayload(store, user) {
  const inquiries = ensureInquiries(store)
    .filter((entry) => entry.userId === user.id)
    .toSorted((left, right) => Date.parse(right.createdAt ?? '') - Date.parse(left.createdAt ?? ''))
    .map((entry) => buildInquiryPayload(entry));

  return { inquiries };
}

// 관리자: 전체 문의 (답변 대기 먼저, 그다음 최신순).
export function buildAdminInquiriesPayload(store) {
  const usersById = new Map((store.users ?? []).map((entry) => [entry.id, entry]));
  const inquiries = ensureInquiries(store)
    .map((entry) => buildInquiryPayload(entry, { includeUser: true, usersById }))
    .toSorted((left, right) => {
      if (left.status !== right.status) {
        return left.status === 'pending' ? -1 : 1;
      }

      return Date.parse(right.createdAt ?? '') - Date.parse(left.createdAt ?? '');
    });

  return {
    // 대기 건이 항상 앞에 오므로, 잘려도 처리해야 할 문의는 남는다.
    inquiries: inquiries.slice(0, INQUIRY_ADMIN_LIST_LIMIT),
    totalCount: inquiries.length,
    pendingCount: inquiries.filter((entry) => entry.status === 'pending').length,
  };
}

// 관리자: 답변 달기 (mutateStore 안에서 호출) — 유저에게 인박스 알림도 보낸다.
export function replyToInquiry(store, inquiryId, input, now = new Date()) {
  const body = normalizeText(input?.body);

  if (!body) {
    throw new ApiError(400, '답변 내용을 입력해주세요.');
  }

  if (body.length > INQUIRY_REPLY_MAX_LENGTH) {
    throw new ApiError(400, `답변은 ${INQUIRY_REPLY_MAX_LENGTH}자까지 쓸 수 있어요.`);
  }

  const inquiry = ensureInquiries(store).find((entry) => entry.id === inquiryId);

  if (!inquiry) {
    throw new ApiError(404, '문의를 찾을 수 없어요.');
  }

  if (!Array.isArray(inquiry.replies)) {
    inquiry.replies = [];
  }

  const nowIsoValue = now.toISOString();
  inquiry.replies.push({
    id: nextId('inquiry-reply'),
    body,
    createdAt: nowIsoValue,
  });

  // 알림 본문은 160자에서 잘리므로 앞부분만 미리보기로 싣고 말줄임 — 전문은 앱에서.
  const preview = body.length > 80 ? `${body.slice(0, 80)}…` : body;
  appendUserNotification(store, {
    userId: inquiry.userId,
    type: 'inquiry_reply',
    title: '문의 답변이 도착했어요',
    body: `${inquiry.title} — ${preview}`,
    data: { inquiryId: inquiry.id },
    nowIso: () => nowIsoValue,
  });

  const usersById = new Map((store.users ?? []).map((entry) => [entry.id, entry]));

  return { inquiry: buildInquiryPayload(inquiry, { includeUser: true, usersById }) };
}
