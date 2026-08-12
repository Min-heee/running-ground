import assert from 'node:assert/strict';
import test from 'node:test';

import { RACE_COMPLETION_TOLERANCE_KM, resolveRaceEventCompletionStamp } from './raceEventCompletion.mjs';
import { buildUserRunMetrics } from './points.mjs';

// 815런 완주 보상: run.raceEvent 스탬프(저장 길목) + points.mjs 파생 합산. 시계 주입·순수
// 스토어 픽스처 — 되돌리면 결정적으로 깨진다 (스탬프 제거 → 첫 단언, 합산 제거 → 마지막 단언).

const MATCH = 'group-match-815';

function buildStore({ completionBonusPoints = 815, rosterUserIds = ['user-me', 'user-r2'] } = {}) {
  return {
    offlineRaceEvents: [{
      id: 'race-815',
      title: '8·15 광복절 런',
      distanceKm: 8.15,
      startsAt: '2026-08-15T11:15:00.000Z',
      formedMatchId: MATCH,
      ...(completionBonusPoints === null ? {} : { completionBonusPoints }),
    }],
    matchRosters: [{
      id: MATCH,
      mode: 'group',
      createdAt: '2026-08-15T11:00:30.000Z',
      distanceKm: 8.15,
      participantIds: rosterUserIds,
    }],
  };
}

test('완주 + 로스터 참가자 → 이벤트 보상 그대로 스탬프', () => {
  const stamp = resolveRaceEventCompletionStamp(buildStore(), 'user-me', { matchId: MATCH, distanceKm: 8.15 });
  assert.deepEqual(stamp, { eventId: 'race-815', title: '8·15 광복절 런', bonusPoints: 815 });
});

test('허용오차 경계: goal-0.05는 완주, 그보다 1cm 모자라면 미지급', () => {
  assert.ok(resolveRaceEventCompletionStamp(buildStore(), 'user-me', { matchId: MATCH, distanceKm: 8.1 }));
  assert.equal(RACE_COMPLETION_TOLERANCE_KM, 0.05);
  assert.equal(resolveRaceEventCompletionStamp(buildStore(), 'user-me', { matchId: MATCH, distanceKm: 8.09 }), null);
});

test('미완주(리허설 회원K 모양: 5.3/6.0 비율)는 미지급', () => {
  assert.equal(resolveRaceEventCompletionStamp(buildStore(), 'user-me', { matchId: MATCH, distanceKm: 7.2 }), null);
});

test('위조 방어: 로스터 밖 유저·미편성 matchId·로스터 소실은 전부 미지급', () => {
  // 로스터에 없는 유저 — matchId는 클라 입력이므로 이 게이트가 유일한 방벽.
  assert.equal(resolveRaceEventCompletionStamp(buildStore(), 'user-forger', { matchId: MATCH, distanceKm: 8.2 }), null);

  // 어떤 이벤트도 박제하지 않은 matchId.
  assert.equal(resolveRaceEventCompletionStamp(buildStore(), 'user-me', { matchId: 'group-match-other', distanceKm: 8.2 }), null);

  // 로스터가 만료/축출로 사라짐 — 안전하게 미지급.
  const noRoster = buildStore();
  noRoster.matchRosters = [];
  assert.equal(resolveRaceEventCompletionStamp(noRoster, 'user-me', { matchId: MATCH, distanceKm: 8.2 }), null);
});

test('보상 없는 이벤트(테스트런)는 완주해도 스탬프 없음', () => {
  const store = buildStore({ completionBonusPoints: null });
  assert.equal(resolveRaceEventCompletionStamp(store, 'user-me', { matchId: MATCH, distanceKm: 8.2 }), null);
});

test('파생 합산: raceEvent.bonusPoints가 그 러닝의 획득 포인트에 정확히 +815', () => {
  const baseRun = {
    id: 'run-815', userId: 'user-me', date: '2026-08-15', distanceKm: 8.15,
    pace: '05:30/km', durationSeconds: 2694, source: 'RunningGround', sourceType: 'runningground',
    matchResult: { mode: 'group', matchId: MATCH, rank: 3, participantCount: 20, title: 't', summary: 's', badgeLabel: '3위' },
  };
  const at = new Date('2026-08-16T00:00:00.000Z');

  const withoutStamp = buildUserRunMetrics([baseRun], at).runPointsById.get('run-815');
  const withStamp = buildUserRunMetrics([{
    ...baseRun,
    raceEvent: { eventId: 'race-815', title: '8·15 광복절 런', bonusPoints: 815 },
  }], at).runPointsById.get('run-815');

  assert.equal(withStamp.raceEventPoints, 815);
  assert.equal(withStamp.earnedPoint, withoutStamp.earnedPoint + 815);
});
