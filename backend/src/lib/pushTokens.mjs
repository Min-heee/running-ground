// 원격 푸시 토큰 보관 (오너 2026-07-31: 공지사항을 폰 알림으로) — Expo Push 토큰을
// 유저별로 저장한다. 한 유저가 여러 기기를 쓸 수 있어 배열이고, 기기당 1개로 dedupe한다.
//
// 저장 위치: store.pushTokens[] — { token, userId, platform, updatedAt }.
// 발송 실패(DeviceNotRegistered)는 발송기가 여기로 되돌려 토큰을 지운다.

import { ApiError } from '../response/httpResponse.mjs';

// 한 유저가 등록할 수 있는 기기 수 — 초과 시 가장 오래된 것부터 밀어낸다.
export const MAX_PUSH_TOKENS_PER_USER = 5;

// Expo 푸시 토큰 형식 — ExponentPushToken[xxx] / ExpoPushToken[xxx].
const EXPO_PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export function ensurePushTokens(store) {
  if (!Array.isArray(store.pushTokens)) {
    store.pushTokens = [];
  }

  return store.pushTokens;
}

export function isExpoPushToken(value) {
  return typeof value === 'string' && EXPO_PUSH_TOKEN_PATTERN.test(value.trim());
}

// 등록/갱신 (mutateStore 안에서 호출). 같은 토큰이 다른 계정에 남아 있으면 옮겨온다 —
// 기기를 공유하거나 계정을 바꿔 로그인했을 때 옛 주인에게 알림이 가면 안 된다.
export function registerPushToken(store, user, input, now = new Date()) {
  const token = typeof input?.token === 'string' ? input.token.trim() : '';

  if (!isExpoPushToken(token)) {
    throw new ApiError(400, '푸시 토큰 형식이 올바르지 않아요.');
  }

  const platform = input?.platform === 'ios' || input?.platform === 'android' ? input.platform : 'unknown';
  const existing = ensurePushTokens(store).find((entry) => entry.token === token);

  // 이미 같은 주인/기기로 등록돼 있으면 아무것도 쓰지 않는다 — 앱은 켤 때마다 같은 토큰을
  // 올리므로, 매번 updatedAt만 바꿔 쓰면 whole-store 블롭이 실행마다 통째로 재기록된다(#209).
  if (existing && existing.userId === user.id && existing.platform === platform) {
    return { success: true };
  }

  const tokens = ensurePushTokens(store).filter((entry) => entry.token !== token);

  tokens.push({
    token,
    userId: user.id,
    platform,
    updatedAt: now.toISOString(),
  });

  // 유저당 기기 수 상한 — 오래된 것부터 제거.
  const mine = tokens
    .filter((entry) => entry.userId === user.id)
    .toSorted((left, right) => Date.parse(left.updatedAt ?? '') - Date.parse(right.updatedAt ?? ''));
  const dropCount = Math.max(0, mine.length - MAX_PUSH_TOKENS_PER_USER);
  const dropped = new Set(mine.slice(0, dropCount).map((entry) => entry.token));

  store.pushTokens = tokens.filter((entry) => !dropped.has(entry.token));

  return { success: true };
}

// 발송기 전용 정리 — 죽은 토큰(DeviceNotRegistered)은 주인과 무관하게 지운다.
export function removePushToken(store, token) {
  const tokens = ensurePushTokens(store);
  store.pushTokens = tokens.filter((entry) => entry.token !== token);
  return store.pushTokens;
}

// 로그아웃 등 유저 요청 경로 — 반드시 '내' 토큰만 지운다. 토큰 문자열만으로 남의 기기
// 알림을 꺼버릴 수 있으면 안 된다.
export function removeOwnPushToken(store, userId, token) {
  const tokens = ensurePushTokens(store);
  store.pushTokens = tokens.filter((entry) => !(entry.token === token && entry.userId === userId));
  return store.pushTokens;
}

export function removeUserPushTokens(store, userId) {
  const tokens = ensurePushTokens(store);
  store.pushTokens = tokens.filter((entry) => entry.userId !== userId);
  return store.pushTokens;
}

// 발송 대상 { token, userId } — 알림 설정을 존중한다. settingKey가 주어지면 그 설정이
// 꺼진 유저는 제외. 수신자별 아이콘 배지처럼 토큰 주인이 필요한 발송에 쓴다.
export function collectPushTargetEntries(store, { settingKey = null, userIds = null } = {}) {
  const usersById = new Map((store.users ?? []).map((entry) => [entry.id, entry]));
  const allowedUserIds = userIds ? new Set(userIds) : null;

  return ensurePushTokens(store)
    .filter((entry) => {
      if (allowedUserIds && !allowedUserIds.has(entry.userId)) {
        return false;
      }

      const user = usersById.get(entry.userId);

      if (!user) {
        return false; // 탈퇴한 유저의 잔여 토큰
      }

      if (settingKey) {
        const settings = user.notificationSettings ?? {};
        // 설정이 없으면 기본 ON (기존 유저는 설정 레코드가 없을 수 있다).
        return settings[settingKey] !== false;
      }

      return true;
    })
    .map((entry) => ({ token: entry.token, userId: entry.userId }));
}

export function collectPushTargets(store, options = {}) {
  return collectPushTargetEntries(store, options).map((entry) => entry.token);
}
