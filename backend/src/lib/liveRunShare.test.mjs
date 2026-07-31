// 친구 라이브 공유 코어 — 하트비트 엔트리/응원 적립·드레인/친구 페이로드의 계약.

import assert from 'node:assert/strict';

import {
  CHEER_PENDING_MAX,
  CHEER_SENDER_MIN_INTERVAL_MS,
  LIVE_RUN_SHARE_FRESH_MS,
  addCheerToEntry,
  buildFriendLiveRunPayload,
  buildNextLiveShareEntry,
  drainPendingCheers,
  isLiveShareEntryFresh,
} from './liveRunShare.mjs';

function runTest(name, testFn) {
  try {
    testFn();
    console.log(`[liveRunShare] ok - ${name}`);
  } catch (error) {
    console.error(`[liveRunShare] failed - ${name}`);
    throw error;
  }
}

const NOW = new Date('2026-07-31T12:00:00.000Z');
const nowIso = () => NOW.toISOString();

function buildRunningEntry(overrides = {}) {
  return {
    enabled: true,
    status: 'running',
    updatedAt: nowIso(),
    latitude: 37.6584,
    longitude: 126.7698,
    distanceKm: 2.4,
    paceLabel: '05:42/km',
    startedAt: new Date(NOW.getTime() - 10 * 60 * 1000).toISOString(),
    allowCheers: true,
    cheers: [],
    cheerSenderLog: {},
    ...overrides,
  };
}

runTest('하트비트는 좌표/지표를 엔트리에 싣고 startedAt을 이어받는다', () => {
  const first = buildNextLiveShareEntry({
    previousEntry: null,
    enabled: true,
    status: 'running',
    latitude: 37.1,
    longitude: 127.2,
    distanceKm: 0.5,
    paceLabel: '06:00/km',
    nowIso,
  });

  assert.equal(first.latitude, 37.1);
  assert.equal(first.startedAt, nowIso());

  const second = buildNextLiveShareEntry({
    previousEntry: first,
    enabled: true,
    status: 'running',
    latitude: 37.2,
    longitude: 127.3,
    distanceKm: 1.1,
    nowIso: () => new Date(NOW.getTime() + 25_000).toISOString(),
  });

  // 시작 시각은 첫 하트비트의 것 — 매번 새로 찍으면 '달린 지 N분'이 항상 0이 된다.
  assert.equal(second.startedAt, first.startedAt);
  assert.equal(second.distanceKm, 1.1);
});

runTest('좌표 없는 하트비트(상태 전환)는 마지막 좌표를 유지한다', () => {
  const previous = buildRunningEntry();
  const next = buildNextLiveShareEntry({
    previousEntry: previous,
    enabled: true,
    status: 'paused',
    nowIso,
  });

  assert.equal(next.latitude, previous.latitude);
  assert.equal(next.longitude, previous.longitude);
});

runTest('종료 하트비트(enabled=false)는 엔트리를 지운다', () => {
  assert.equal(buildNextLiveShareEntry({ enabled: false, status: 'idle', nowIso }), null);
});

runTest('응원은 쌓이고, 드레인하면 비워지며 한 번만 전달된다', () => {
  let entry = buildRunningEntry();
  const added = addCheerToEntry(entry, {
    cheerId: 'cheer-1', fromUserId: 'u2', fromName: '회원G', message: '힘내!', nowMs: NOW.getTime(),
  });

  assert.equal(added.ok, true);
  const drained = drainPendingCheers(added.entry);
  assert.equal(drained.cheers.length, 1);
  assert.equal(drained.cheers[0].message, '힘내!');
  assert.equal(drainPendingCheers(drained.entry).cheers.length, 0);
});

runTest('같은 사람의 연속 응원은 최소 간격으로 막힌다', () => {
  const first = addCheerToEntry(buildRunningEntry(), {
    cheerId: 'c1', fromUserId: 'u2', fromName: '회원G', message: '가자!', nowMs: NOW.getTime(),
  });
  const tooSoon = addCheerToEntry(first.entry, {
    cheerId: 'c2', fromUserId: 'u2', fromName: '회원G', message: '또!', nowMs: NOW.getTime() + CHEER_SENDER_MIN_INTERVAL_MS - 1_000,
  });

  assert.equal(tooSoon.ok, false);
  assert.equal(tooSoon.statusCode, 429);

  const afterInterval = addCheerToEntry(first.entry, {
    cheerId: 'c3', fromUserId: 'u2', fromName: '회원G', message: '다시!', nowMs: NOW.getTime() + CHEER_SENDER_MIN_INTERVAL_MS + 1_000,
  });
  assert.equal(afterInterval.ok, true);
});

runTest('응원 보관 상한을 넘으면 거절한다', () => {
  let entry = buildRunningEntry({
    cheers: Array.from({ length: CHEER_PENDING_MAX }, (unused, index) => ({
      id: `c-${index}`, fromUserId: `u-${index}`, fromName: '친구', message: '힘내', atMs: NOW.getTime(),
    })),
  });
  const overflow = addCheerToEntry(entry, {
    cheerId: 'c-over', fromUserId: 'u-over', fromName: '친구', message: '넘침', nowMs: NOW.getTime(),
  });

  assert.equal(overflow.ok, false);
  assert.equal(overflow.statusCode, 429);
});

runTest('안 뛰는 친구/오래된 엔트리/수신 거부에는 응원이 막힌다', () => {
  assert.equal(addCheerToEntry(null, {
    cheerId: 'c', fromUserId: 'u', fromName: 'n', message: 'm', nowMs: NOW.getTime(),
  }).statusCode, 409);

  const stale = buildRunningEntry({ updatedAt: new Date(NOW.getTime() - 3 * 60 * 1000).toISOString() });
  assert.equal(addCheerToEntry(stale, {
    cheerId: 'c', fromUserId: 'u', fromName: 'n', message: 'm', nowMs: NOW.getTime(),
  }).statusCode, 409);

  const closed = buildRunningEntry({ allowCheers: false });
  assert.equal(addCheerToEntry(closed, {
    cheerId: 'c', fromUserId: 'u', fromName: 'n', message: 'm', nowMs: NOW.getTime(),
  }).statusCode, 403);
});

runTest('메시지 검증: 빈 값과 60자 초과는 400', () => {
  assert.equal(addCheerToEntry(buildRunningEntry(), {
    cheerId: 'c', fromUserId: 'u', fromName: 'n', message: '   ', nowMs: NOW.getTime(),
  }).statusCode, 400);
  assert.equal(addCheerToEntry(buildRunningEntry(), {
    cheerId: 'c', fromUserId: 'u', fromName: 'n', message: '가'.repeat(61), nowMs: NOW.getTime(),
  }).statusCode, 400);
});

runTest('친구 페이로드: 뛰는 중이면 좌표/지표, 아니면 isRunningNow=false만', () => {
  const live = buildFriendLiveRunPayload(buildRunningEntry(), '회원C', NOW.getTime());
  assert.equal(live.isRunningNow, true);
  assert.equal(live.latitude, 37.6584);
  assert.equal(live.allowCheers, true);

  const stale = buildFriendLiveRunPayload(
    buildRunningEntry({ updatedAt: new Date(NOW.getTime() - 3 * 60 * 1000).toISOString() }),
    '회원C',
    NOW.getTime(),
  );
  assert.equal(stale.isRunningNow, false);
  assert.equal(stale.latitude, undefined);
});

// 적대 검증 발견: 죽은 러닝의 잔재 엔트리를 다음 러닝이 이어받으면 며칠 전 응원이 새 러닝
// 시작에 재생되고 startedAt이 이어져 '달린 지 23시간째'가 된다. 저장소들은 이 판정으로
// 낡은 previousEntry를 버린다.
runTest('신선도 판정: 2분 넘게 소식 없는 엔트리는 잔재다', () => {
  assert.equal(isLiveShareEntryFresh(buildRunningEntry(), NOW.getTime()), true);
  assert.equal(isLiveShareEntryFresh(
    buildRunningEntry({ updatedAt: new Date(NOW.getTime() - LIVE_RUN_SHARE_FRESH_MS - 1_000).toISOString() }),
    NOW.getTime(),
  ), false);
  assert.equal(isLiveShareEntryFresh(null, NOW.getTime()), false);
  assert.equal(isLiveShareEntryFresh({ updatedAt: 'garbage' }, NOW.getTime()), false);
});
