import assert from 'node:assert/strict';
import test from 'node:test';

import { settleChaseRunUpload } from './chaseSettlement.mjs';

// 실제 카탈로그의 일산 호수공원(ilsan-lake, 중심 37.6585/126.7676)을 그대로 쓴다 —
// 정산은 arenaId로 카탈로그를 조회하므로 테스트 경기장도 실존 id여야 한다.
const ARENA_CENTER = { latitude: 37.65749, longitude: 126.76325 };
const BASE_MS = Date.parse('2026-07-27T21:00:00.000Z');
const METERS_PER_LAT = 111_320;
const METERS_PER_LNG = 111_320 * Math.cos((ARENA_CENTER.latitude * Math.PI) / 180);

function straightTrack({ startXM, yM = 0, speedMps, durationS }) {
  const points = [];

  for (let second = 0; second <= durationS; second += 1) {
    points.push({
      latitude: ARENA_CENTER.latitude + yM / METERS_PER_LAT,
      longitude: ARENA_CENTER.longitude + (startXM + speedMps * second) / METERS_PER_LNG,
      timestamp: new Date(BASE_MS + second * 1_000).toISOString(),
    });
  }

  return points;
}

// 반대 방향 교차(마주침 1건) 기본 시나리오의 스토어/의존성 페이크.
function buildFixture({ uploaderBonus = 0, candidateBonus = 0, candidateVehicle = false } = {}) {
  const routeA = straightTrack({ startXM: -300, speedMps: 3, durationS: 200 });
  const routeB = straightTrack({ startXM: 300, yM: 5, speedMps: -3, durationS: 200 });
  const store = {
    users: [
      { id: 'user-a', name: '업로더' },
      { id: 'user-b', name: '상대' },
    ],
    runs: [
      {
        id: 'run-b',
        userId: 'user-b',
        date: '2026-07-28',
        startedAt: new Date(BASE_MS).toISOString(),
        endedAt: new Date(BASE_MS + 200_000).toISOString(),
        chase: { arenaId: 'ilsan-lake', bonusPoints: candidateBonus, events: [] },
        ...(candidateVehicle ? { integrity: { verdict: 'vehicle' } } : {}),
      },
      {
        id: 'run-a',
        userId: 'user-a',
        date: '2026-07-28',
        startedAt: new Date(BASE_MS).toISOString(),
        endedAt: new Date(BASE_MS + 200_000).toISOString(),
        chase: { arenaId: 'ilsan-lake', bonusPoints: uploaderBonus, events: [] },
      },
    ],
    chasePresence: [
      { userId: 'user-a', arenaId: 'ilsan-lake', joinedAt: new Date(BASE_MS).toISOString(), expiresAt: new Date(BASE_MS + 10_800_000).toISOString() },
    ],
  };
  const routesById = { 'run-a': routeA, 'run-b': routeB };
  const deps = {
    loadStore: async () => store,
    mutateStore: async (mutator) => mutator(store),
    getStoredRunRoute: async (runId) => routesById[runId] ?? null,
  };

  return { store, deps };
}

test('마주침 정산: 양쪽 +5P, 이벤트 기록, 상대 알림, 슬롯 반납', async () => {
  const { store, deps } = buildFixture();
  const summary = await settleChaseRunUpload({ runId: 'run-a', deps });

  assert.equal(summary.arenaId, 'ilsan-lake');
  assert.equal(summary.newEvents.length, 1);
  assert.equal(summary.newEvents[0].type, 'meet');
  assert.equal(summary.newEvents[0].points, 5);
  assert.equal(summary.totalBonusPoints, 5);

  const runA = store.runs.find((run) => run.id === 'run-a');
  const runB = store.runs.find((run) => run.id === 'run-b');
  assert.equal(runA.chase.bonusPoints, 5);
  assert.equal(runB.chase.bonusPoints, 5);
  assert.equal(runB.chase.events[0].otherName, '업로더');

  // 상대(먼저 끝난 러너)에게 인박스 알림 — chase_settlement 타입이 화이트리스트에
  // 등록되어 있어야 appendUserNotification이 no-op이 되지 않는다.
  const notifications = (store.userNotifications ?? store.notifications ?? []).filter(
    (entry) => entry.userId === 'user-b',
  );
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, 'chase_settlement');
  assert.ok(notifications[0].body.includes('일산 호수공원'));

  // 업로더의 경기장 슬롯은 조기 반납.
  assert.equal(store.chasePresence.length, 0);
});

test('idempotent: 같은 러닝을 두 번 정산해도 이중 지급 없음', async () => {
  const { store, deps } = buildFixture();
  await settleChaseRunUpload({ runId: 'run-a', deps });
  const second = await settleChaseRunUpload({ runId: 'run-a', deps });

  assert.equal(second.newEvents.length, 0);
  assert.equal(store.runs.find((run) => run.id === 'run-a').chase.bonusPoints, 5);
  assert.equal(store.runs.find((run) => run.id === 'run-b').chase.bonusPoints, 5);
});

test('러닝당 상한 30P: 남은 한도만큼만 지급', async () => {
  const { store, deps } = buildFixture({ uploaderBonus: 28 });
  const summary = await settleChaseRunUpload({ runId: 'run-a', deps });

  assert.equal(summary.newEvents[0].points, 2);
  assert.equal(store.runs.find((run) => run.id === 'run-a').chase.bonusPoints, 30);
  // 상대는 상한 여유가 있으므로 온전히 +5P.
  assert.equal(store.runs.find((run) => run.id === 'run-b').chase.bonusPoints, 5);
});

test('차량 판정된 상대 러닝은 정산 대상에서 제외', async () => {
  const { store, deps } = buildFixture({ candidateVehicle: true });
  const summary = await settleChaseRunUpload({ runId: 'run-a', deps });

  assert.equal(summary.newEvents.length, 0);
  assert.equal(store.runs.find((run) => run.id === 'run-b').chase.bonusPoints, 0);
});

test('chase 러닝이 아니면 null', async () => {
  const { store, deps } = buildFixture();
  delete store.runs.find((run) => run.id === 'run-a').chase;
  const summary = await settleChaseRunUpload({ runId: 'run-a', deps });

  assert.equal(summary, null);
});
