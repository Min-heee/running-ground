import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formDueLiveGroupRaceSessions,
  RACE_FORMATION_GRACE_AFTER_START_MS,
  RACE_FORMATION_MIN_PARTICIPANTS,
} from './raceEventFormation.mjs';

// 8·15런 편성: 마감이 지나면 신청자 전원이 하나의 그룹 세션으로 (조 나누기 없음 — 오너 확정).
// 시계는 전부 주입 — Date.now 의존 0 (되돌려도 통과하는 테스트 재발 방지 프로토콜).

const CLOSE_AT = '2026-08-15T11:00:00.000Z';
const START_AT = '2026-08-15T11:15:00.000Z';

function at(iso) {
  return new Date(iso);
}

function buildStore({ tags = ['TAG-A', 'TAG-B', 'TAG-C'], eventKind = 'live_group', formedMatchId } = {}) {
  return {
    users: [
      { id: 'user-a', name: '가', publicTag: 'TAG-A' },
      { id: 'user-b', name: '나', publicTag: 'TAG-B' },
      { id: 'user-c', name: '다', publicTag: 'TAG-C' },
    ],
    offlineRaceEvents: [{
      id: 'race-815',
      title: '8·15 광복절 런',
      distanceKm: 8.15,
      startsAt: START_AT,
      registrationClosesAt: CLOSE_AT,
      registeredUserTags: tags,
      runWindowMinutes: 120,
      ...(eventKind ? { eventKind } : {}),
      ...(formedMatchId ? { formedMatchId } : {}),
    }],
    matchSessions: [],
  };
}

test('마감 후 스윕: 신청자 전원이 하나의 그룹 세션으로, 슬롯은 이벤트 출발 시각', () => {
  const store = buildStore();
  const formed = formDueLiveGroupRaceSessions(store, at('2026-08-15T11:01:00.000Z'));

  assert.equal(formed.length, 1);
  assert.equal(formed[0].participantCount, 3);
  assert.equal(store.matchSessions.length, 1);

  const session = store.matchSessions[0];
  assert.equal(session.mode, 'group');
  assert.equal(session.slotStartAt, START_AT);
  // createMatchSession의 1자리 정규화(8.2)를 이벤트 공표 거리로 되돌린다 — 8.15 그대로.
  assert.equal(session.distanceKm, 8.15);
  // 내구 로스터의 목표 거리도 같은 값이어야 한다 (세션 소멸 후 완주 판정의 신뢰 소스).
  const roster = (store.matchRosters ?? []).find((entry) => entry.id === session.id);
  assert.ok(roster, '로스터가 세션 생성 길목에서 기록돼야 한다');
  assert.equal(roster.distanceKm, 8.15);
  assert.deepEqual(
    session.participants.map((participant) => participant.userId).sort(),
    ['user-a', 'user-b', 'user-c'],
  );
  assert.equal(session.isTestMatch, false);
  // §B4 DNF 봉인 유예 = 출발 + 러닝 윈도우(120분) — 축제에서 뒤처진 러너가 기권 처리되지 않게.
  assert.equal(session.raceSealGraceUntil, new Date(Date.parse(START_AT) + 120 * 60 * 1000).toISOString());
  // 이벤트에 세션이 박제된다 — 멱등의 근거.
  assert.equal(store.offlineRaceEvents[0].formedMatchId, session.id);
});

test('멱등: 두 번째 스윕은 아무것도 만들지 않는다', () => {
  const store = buildStore();
  formDueLiveGroupRaceSessions(store, at('2026-08-15T11:01:00.000Z'));
  const second = formDueLiveGroupRaceSessions(store, at('2026-08-15T11:02:00.000Z'));

  assert.equal(second.length, 0);
  assert.equal(store.matchSessions.length, 1);
});

test('창 밖에서는 편성하지 않는다: 마감 전 · 출발+유예 후', () => {
  const before = buildStore();
  assert.equal(formDueLiveGroupRaceSessions(before, at('2026-08-15T10:59:00.000Z')).length, 0);

  const late = buildStore();
  const pastGraceMs = Date.parse(START_AT) + RACE_FORMATION_GRACE_AFTER_START_MS + 1000;
  assert.equal(formDueLiveGroupRaceSessions(late, new Date(pastGraceMs)).length, 0);
  assert.equal(late.matchSessions.length, 0);
});

test('출발 직후(유예 안)면 편성한다 — 첫 요청이 늦어도 행사가 무산되지 않게', () => {
  const store = buildStore();
  const formed = formDueLiveGroupRaceSessions(store, at('2026-08-15T11:20:00.000Z'));
  assert.equal(formed.length, 1);
});

test('최소 인원 미달·대상 아님·태그 미해석은 건너뛴다', () => {
  // 1명뿐 — 성립 안 함 (RACE_FORMATION_MIN_PARTICIPANTS = 2).
  const single = buildStore({ tags: ['TAG-A'] });
  assert.equal(formDueLiveGroupRaceSessions(single, at('2026-08-15T11:01:00.000Z')).length, 0);
  assert.equal(RACE_FORMATION_MIN_PARTICIPANTS, 2);

  // 탈퇴자 태그는 조용히 빠지고, 남은 2명으로는 성립한다.
  const withGhost = buildStore({ tags: ['TAG-A', 'TAG-B', 'TAG-GONE'] });
  const formed = formDueLiveGroupRaceSessions(withGhost, at('2026-08-15T11:01:00.000Z'));
  assert.equal(formed[0].participantCount, 2);

  // live_group이 아닌 이벤트(기존 목록 전용)는 절대 편성하지 않는다.
  const listing = buildStore({ eventKind: null });
  assert.equal(formDueLiveGroupRaceSessions(listing, at('2026-08-15T11:01:00.000Z')).length, 0);

  // 이미 편성된 이벤트는 다시 만들지 않는다.
  const already = buildStore({ formedMatchId: 'group-match-xyz' });
  assert.equal(formDueLiveGroupRaceSessions(already, at('2026-08-15T11:01:00.000Z')).length, 0);
});

// 오너 확정 2026-08-11: 유예 중엔 절대 DNF 봉인이 생기지 않고, 유예가 끝나면 기존 §B4가 살아난다.
// (수정을 되돌리면 — 가드 제거 — 첫 단언이 결정적으로 깨진다.)
test('raceSealGraceUntil 유예 중엔 그룹 DNF 봉인 불가, 유예 후엔 기존 규칙 부활', async () => {
  const { sealGroupFallbackResolutionIfElapsed } = await import('./runningMatchSession/matchSessionFallbackSeals.mjs');
  const buildSession = (graceUntil) => ({
    id: 'group-match-race',
    mode: 'group',
    distanceKm: 6,
    slotStartAt: START_AT,
    ...(graceUntil ? { raceSealGraceUntil: graceUntil } : {}),
    participants: [
      { userId: 'user-a', liveStatus: 'finished', finishedAt: '2026-08-15T11:45:00.000Z', finishElapsedSeconds: 1800 },
      { userId: 'user-b', liveStatus: 'running', finishedAt: null, finishElapsedSeconds: null },
    ],
  });

  // 첫 완주 후 90초가 한참 지났지만(+30분) 유예(+120분) 안 — 봉인 금지.
  const graceUntil = new Date(Date.parse(START_AT) + 120 * 60 * 1000).toISOString();
  const inGrace = buildSession(graceUntil);
  assert.equal(sealGroupFallbackResolutionIfElapsed(inGrace, at('2026-08-15T12:15:00.000Z')), null);
  assert.equal(inGrace.groupFallbackResolution, undefined);

  // 유예가 끝나면 기존 §B4 그대로 — 사라진 러너가 결과를 영원히 붙잡는 것은 여전히 방지.
  const afterGrace = buildSession(graceUntil);
  const sealed = sealGroupFallbackResolutionIfElapsed(afterGrace, at('2026-08-15T13:16:00.000Z'));
  assert.ok(sealed, '유예 종료 후에는 봉인이 생겨야 한다');
  assert.deepEqual(sealed.dnfUserIds, ['user-b']);

  // 유예 필드가 없는 일반 매치는 동작 불변 (기존 90초 창 그대로).
  const normal = buildSession(null);
  assert.ok(sealGroupFallbackResolutionIfElapsed(normal, at('2026-08-15T12:15:00.000Z')));
});

// 오너 확정 2026-08-13: 행사는 랭크(LP)를 움직이지 않는다 — 테스트런에서 하위 30%가 −15 LP를
// 맞은 사건의 재발 방지. 편성이 skipRankLp를 박고, LP 적용부가 그 플래그를 존중한다.
test('레이스 세션은 skipRankLp — 완주해도 랭크 LP가 움직이지 않는다', async () => {
  const store = buildStore();
  formDueLiveGroupRaceSessions(store, at('2026-08-15T11:01:00.000Z'));
  const session = store.matchSessions[0];
  assert.equal(session.skipRankLp, true, '편성이 LP 제외 플래그를 박아야 한다');

  // 프로덕션 경로 그대로: 레이스 중 첫 완료 폴(아직 전원 완주 전)이 조기 분기에서
  // lpApplied를 선점한다 — 이후 어떤 폴/시퀀스도 LP 수학에 도달할 수 없다.
  const { applyMatchLpIfComplete } = await import('./matchCompletionAwards.mjs');
  for (const user of store.users) {
    user.rankState = { tier: '러너', lp: 100 };
  }

  applyMatchLpIfComplete(store, session);
  assert.equal(session.lpApplied, true, '레이스는 첫 폴에서 LP 제외가 선점돼야 한다');

  // 전원 완주 후 재호출돼도 랭크는 불변.
  for (const [index, participant] of session.participants.entries()) {
    participant.liveStatus = 'finished';
    participant.finishedAt = '2026-08-15T12:00:00.000Z';
    participant.finishElapsedSeconds = 2700 + index;
    participant.liveDistanceKm = 8.15;
    participant.liveElapsedSeconds = 2700 + index;
    participant.liveUpdatedAt = '2026-08-15T12:00:00.000Z';
  }
  applyMatchLpIfComplete(store, session);

  for (const user of store.users) {
    assert.deepEqual(user.rankState, { tier: '러너', lp: 100 }, `${user.id}의 LP는 불변이어야 한다`);
  }
});
