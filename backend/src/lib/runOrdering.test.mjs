// 러닝 목록 정렬의 계약 (오너 2026-08-02: 같은 날 두 번 달리면 최근 것이 위로).
// date(일 단위)가 같으면 startedAt(시각)으로 가르고, 시각 없는 수동 기록은 그 날짜 안에서
// 뒤로 — postgres 쿼리의 `run_date desc, created_at desc`와 같은 의미의 json 저장소 판.

import assert from 'node:assert/strict';
import test from 'node:test';

import { compareRunsLatestFirst, getRunsForUser } from './userStoreHelpers.mjs';

test('다른 날짜는 최근 날짜가 먼저', () => {
  const runs = [
    { date: '2026-07-21' },
    { date: '2026-08-01' },
    { date: '2026-07-22' },
  ].sort(compareRunsLatestFirst);

  assert.deepEqual(runs.map((run) => run.date), ['2026-08-01', '2026-07-22', '2026-07-21']);
});

test('같은 날짜는 startedAt(시각)이 늦은 기록이 먼저 — 새벽 10km보다 저녁 5km가 위', () => {
  const runs = [
    { date: '2026-08-01', distanceKm: 10, startedAt: '2026-08-01T00:38:00.000+09:00' },
    { date: '2026-08-01', distanceKm: 5, startedAt: '2026-08-01T19:10:00.000+09:00' },
  ].sort(compareRunsLatestFirst);

  assert.deepEqual(runs.map((run) => run.distanceKm), [5, 10]);
});

test('시각 없는 수동 기록은 같은 날짜 안에서 뒤로', () => {
  const runs = [
    { date: '2026-08-01', id: 'manual' },
    { date: '2026-08-01', id: 'tracked', startedAt: '2026-08-01T07:00:00.000+09:00' },
  ].sort(compareRunsLatestFirst);

  assert.deepEqual(runs.map((run) => run.id), ['tracked', 'manual']);
});

test('getRunsForUser: 저장 순서와 무관하게 최근이 먼저', () => {
  const store = {
    runs: [
      { userId: 'u1', id: 'r1', date: '2026-08-01', startedAt: '2026-08-01T00:38:00.000+09:00' },
      { userId: 'u2', id: 'other', date: '2026-08-02' },
      { userId: 'u1', id: 'r2', date: '2026-08-01', startedAt: '2026-08-01T19:10:00.000+09:00' },
      { userId: 'u1', id: 'r0', date: '2026-07-22' },
    ],
  };

  assert.deepEqual(getRunsForUser(store, 'u1').map((run) => run.id), ['r2', 'r1', 'r0']);
});
