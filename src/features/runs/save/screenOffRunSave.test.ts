import assert from 'node:assert/strict';
import test from 'node:test';

import { buildScreenOffRunSaveJson } from './screenOffRunSave';

function buildRoute(startMs: number, count: number, stepMs: number) {
  return Array.from({ length: count }, (_, index) => ({
    latitude: 37.5 + index * 0.0001,
    longitude: 127.0 + index * 0.0001,
    timestamp: new Date(startMs + index * stepMs).toISOString(),
  }));
}

test('화면 꺼진 완주 페이로드: 크로싱 절단 + PENDING 매치 블롭 + 정식 필드', () => {
  const startMs = Date.parse('2026-08-07T10:00:00.000Z');
  // 40분짜리 경로 (10초 간격 241점) — 크로싱은 38분 24초 지점.
  const route = buildRoute(startMs, 241, 10_000);
  const crossedAtIso = new Date(startMs + 2304 * 1000).toISOString();

  const json = buildScreenOffRunSaveJson({
    route,
    startedAt: new Date(startMs).toISOString(),
    elevationGainM: 12,
    finishDistanceKm: 5.0,
    finishElapsedSeconds: 2304,
    finishPace: '7:41/km',
    crossedAtIso,
    matchId: 'duel-match-test1',
    mode: 'duel',
    matchSource: 'party',
  });

  assert.ok(json);
  const payload = JSON.parse(json as string);

  assert.equal(payload.distanceKm, 5.0);
  assert.equal(payload.durationSeconds, 2304);
  assert.equal(payload.startedAt, new Date(startMs).toISOString());
  assert.equal(typeof payload.date, 'string');
  // 경로가 크로싱 시각에서 절단됐다 (2304s = 231번째 점 이후 제거).
  const lastPoint = payload.route[payload.route.length - 1];
  assert.ok(Date.parse(lastPoint.timestamp) <= Date.parse(crossedAtIso));
  // FIX-A PENDING 블롭: 서버 리졸버가 공식 판정으로 업그레이드할 최소 재료.
  assert.equal(payload.matchResult.matchId, 'duel-match-test1');
  assert.equal(payload.matchResult.mode, 'duel');
  assert.equal(payload.matchResult.source, 'party');
  assert.ok(payload.matchResult.title);
  assert.ok(payload.matchResult.badgeLabel);
  // 걸음 수를 모르는 경로 — 케이던스는 비운다.
  assert.equal(payload.cadenceSpm, null);
});

test('화면 꺼진 완주 페이로드: 경로가 부족하면 null (기존 흐름 유지)', () => {
  const json = buildScreenOffRunSaveJson({
    route: [],
    startedAt: '2026-08-07T10:00:00.000Z',
    elevationGainM: 0,
    finishDistanceKm: 5.0,
    finishElapsedSeconds: 2304,
    finishPace: '7:41/km',
    crossedAtIso: '2026-08-07T10:38:24.000Z',
    matchId: 'duel-match-test2',
    mode: 'duel',
  });

  assert.equal(json, null);
});
