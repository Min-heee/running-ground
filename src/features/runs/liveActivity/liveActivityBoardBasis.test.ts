import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBoardFromMatchStatus } from './liveActivityBoardModel';
import type { RunningMatchStatusResponse } from '@/lib/api/types';

// 기준 혼합 금지 (2026-08-25 실전: 잠금카드 간격 50-60m vs 인앱 10m) — 듀얼 카드 보드의
// 내 행은 상대 행과 같은 공정비교 시점의 값이어야 한다. 생값(myDistanceKm)은 카드 상단
// 숫자 몫이지 보드 몫이 아니다.

function duelStatus(overrides: Partial<RunningMatchStatusResponse> = {}): RunningMatchStatusResponse {
  return {
    success: true,
    mode: 'duel',
    state: 'active',
    distanceKm: 5,
    slotStartAt: '2026-08-25T00:00:00.000Z',
    slotLabel: '', paceBandLabel: '', levelBandLabel: '', criteriaSummary: '',
    estimatedWaitMinutes: 0, participantCount: 2, acceptedCount: 2, capacity: 2,
    userAccepted: true, readyToStart: true,
    opponent: {
      name: '상대', officialReady: true, officialDistanceKm: 3.1, liveDistanceKm: 3.18,
    } as RunningMatchStatusResponse['opponent'],
    officialComparison: {
      comparedAt: '2026-08-25T00:10:00.000Z', elapsedSeconds: 600,
      participantCount: 2, readyParticipantCount: 2, userDistanceKm: 3.12,
    },
    ...overrides,
  } as RunningMatchStatusResponse;
}

test('공정비교가 준비되면 내 행은 생값이 아니라 같은 시점의 내 공식값이다', () => {
  // 생값 3.17km(기준 시차만큼 앞섬)를 넣어도 보드는 3.12km(공통 시점)를 쓴다 —
  // 3.17 − 3.10 = 70m로 부풀 간격이 3.12 − 3.10 = 20m로 인앱 보드와 일치한다.
  const board = buildBoardFromMatchStatus(duelStatus(), 3.17, '나');
  assert.equal(board.find((row) => row.isMe)?.distanceKm, 3.12);
  assert.equal(board.find((row) => !row.isMe)?.distanceKm, 3.1);
});

test('공정비교 전(시작 직후)에는 예전처럼 생값 폴백 — 상대도 생값이라 기준이 맞는다', () => {
  const status = duelStatus({
    opponent: { name: '상대', officialReady: false, liveDistanceKm: 0.4 } as RunningMatchStatusResponse['opponent'],
    officialComparison: undefined,
  });
  const board = buildBoardFromMatchStatus(status, 0.42, '나');
  assert.equal(board.find((row) => row.isMe)?.distanceKm, 0.42);
  assert.equal(board.find((row) => !row.isMe)?.distanceKm, 0.4);
});
