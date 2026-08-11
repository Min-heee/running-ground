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
