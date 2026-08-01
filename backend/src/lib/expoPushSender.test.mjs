import assert from 'node:assert/strict';
import test from 'node:test';

import { sendExpoPushNotifications } from './expoPushSender.mjs';
import {
  collectPushTargetEntries,
  collectPushTargets,
  registerPushToken,
  removeOwnPushToken,
  removePushToken,
  removeUserPushTokens,
} from './pushTokens.mjs';

const NOW = new Date('2026-07-31T05:00:00.000Z');
const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

function buildStore() {
  return {
    users: [
      { id: 'user-a', name: '회원G' },
      { id: 'user-b', name: '다른사람', notificationSettings: { marketAlerts: false } },
    ],
    pushTokens: [],
  };
}

test('토큰 등록: 형식 검증 + 기기 이전(같은 토큰은 새 주인에게)', () => {
  const store = buildStore();

  assert.throws(() => registerPushToken(store, { id: 'user-a' }, { token: '이상한토큰' }, NOW), /형식/);

  registerPushToken(store, { id: 'user-a' }, { token: TOKEN_A, platform: 'ios' }, NOW);
  assert.equal(store.pushTokens.length, 1);
  assert.equal(store.pushTokens[0].userId, 'user-a');

  // 같은 기기로 다른 계정 로그인 → 토큰 주인이 바뀐다 (옛 주인에게 알림이 가면 안 된다).
  registerPushToken(store, { id: 'user-b' }, { token: TOKEN_A, platform: 'ios' }, NOW);
  assert.equal(store.pushTokens.length, 1);
  assert.equal(store.pushTokens[0].userId, 'user-b');
});

test('유저당 기기 상한 5개 — 오래된 것부터 밀려난다', () => {
  const store = buildStore();

  for (let index = 0; index < 7; index += 1) {
    registerPushToken(
      store,
      { id: 'user-a' },
      { token: `ExponentPushToken[device${index}xxxxxxxxxxxx]` },
      new Date(NOW.getTime() + index * 1000),
    );
  }

  assert.equal(store.pushTokens.length, 5);
  assert.ok(!store.pushTokens.some((entry) => entry.token.includes('device0')));
  assert.ok(store.pushTokens.some((entry) => entry.token.includes('device6')));
});

test('발송 대상: 탈퇴 유저 잔여 토큰 제외, 설정 게이트 존중', () => {
  const store = buildStore();
  registerPushToken(store, { id: 'user-a' }, { token: TOKEN_A }, NOW);
  registerPushToken(store, { id: 'user-b' }, { token: TOKEN_B }, NOW);
  store.pushTokens.push({ token: 'ExponentPushToken[ghost]', userId: 'user-gone', updatedAt: NOW.toISOString() });

  // 공지: 설정 게이트 없이 전원 (유령 토큰만 제외).
  assert.deepEqual(collectPushTargets(store).sort(), [TOKEN_A, TOKEN_B].sort());

  // 설정 게이트가 있으면 끈 유저는 빠진다.
  assert.deepEqual(collectPushTargets(store, { settingKey: 'marketAlerts' }), [TOKEN_A]);

  removeUserPushTokens(store, 'user-a');
  assert.deepEqual(collectPushTargets(store), [TOKEN_B]);
  removePushToken(store, TOKEN_B);
  assert.deepEqual(collectPushTargets(store), []);
});

test('푸시 발송: 청크 전송 + DeviceNotRegistered 토큰 정리 콜백', async () => {
  const requests = [];
  const invalid = [];
  const tokens = Array.from({ length: 150 }, (_, index) => `ExponentPushToken[t${index}xxxxxxxxxxxxxx]`);

  const result = await sendExpoPushNotifications(
    tokens,
    { title: '공지', body: '내용', data: { type: 'notice' } },
    {
      fetchImpl: async (url, options) => {
        const payload = JSON.parse(options.body);
        requests.push(payload.length);
        return {
          ok: true,
          json: async () => ({
            data: payload.map((entry, index) => (
              index === 0
                ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
                : { status: 'ok' }
            )),
          }),
        };
      },
      onInvalidTokens: async (deadTokens) => {
        invalid.push(...deadTokens);
      },
    },
  );

  assert.deepEqual(requests, [100, 50]); // 100개씩 청크
  assert.equal(result.sent, 148);
  assert.equal(result.failed, 2);
  assert.equal(invalid.length, 2);
});

test('푸시 발송: 빈 대상/빈 메시지/네트워크 실패는 조용히 넘어간다', async () => {
  assert.deepEqual(await sendExpoPushNotifications([], { title: 'a', body: 'b' }), { sent: 0, failed: 0, invalidTokens: [] });
  assert.deepEqual(
    await sendExpoPushNotifications([TOKEN_A], { title: '', body: '' }),
    { sent: 0, failed: 0, invalidTokens: [] },
  );

  const result = await sendExpoPushNotifications([TOKEN_A], { title: '공지', body: '내용' }, {
    fetchImpl: async () => { throw new Error('network down'); },
  });
  assert.equal(result.failed, 1);
  assert.equal(result.sent, 0);
});


test('같은 토큰 재등록은 스토어를 건드리지 않는다 (블롭 재기록 방지)', () => {
  const store = buildStore();
  registerPushToken(store, { id: 'user-a' }, { token: TOKEN_A, platform: 'ios' }, NOW);
  const before = JSON.stringify(store.pushTokens);

  registerPushToken(store, { id: 'user-a' }, { token: TOKEN_A, platform: 'ios' }, new Date(NOW.getTime() + 60_000));

  assert.equal(JSON.stringify(store.pushTokens), before, '동일 등록은 no-op이어야 한다');
});

test('해제는 내 토큰만 — 남의 기기 알림을 끌 수 없다', () => {
  const store = buildStore();
  registerPushToken(store, { id: 'user-a' }, { token: TOKEN_A }, NOW);

  // 공격자(user-b)가 남의 토큰 문자열로 해제 시도 → 아무 일도 없어야 한다.
  removeOwnPushToken(store, 'user-b', TOKEN_A);
  assert.deepEqual(collectPushTargets(store), [TOKEN_A]);

  // 주인은 지울 수 있다.
  removeOwnPushToken(store, 'user-a', TOKEN_A);
  assert.deepEqual(collectPushTargets(store), []);
});

test('발송 대상 entries: 토큰 주인(userId)을 함께 준다 — 수신자별 아이콘 배지용', () => {
  const store = buildStore();
  registerPushToken(store, { id: 'user-a' }, { token: TOKEN_A }, NOW);
  registerPushToken(store, { id: 'user-b' }, { token: TOKEN_B }, NOW);

  assert.deepEqual(
    collectPushTargetEntries(store).toSorted((left, right) => left.userId.localeCompare(right.userId)),
    [
      { token: TOKEN_A, userId: 'user-a' },
      { token: TOKEN_B, userId: 'user-b' },
    ],
  );
});

test('푸시 발송: 수신자별 badge가 페이로드에 실린다 (없으면 필드 생략)', async () => {
  const payloads = [];

  const result = await sendExpoPushNotifications(
    [{ token: TOKEN_A, badge: 3 }, TOKEN_B],
    { title: '공지', body: '내용' },
    {
      fetchImpl: async (url, options) => {
        payloads.push(...JSON.parse(options.body));
        return { ok: true, json: async () => ({ data: [{ status: 'ok' }, { status: 'ok' }] }) };
      },
    },
  );

  assert.equal(result.sent, 2);
  assert.equal(payloads[0].to, TOKEN_A);
  assert.equal(payloads[0].badge, 3);
  assert.equal(payloads[1].to, TOKEN_B);
  assert.equal('badge' in payloads[1], false);
});
