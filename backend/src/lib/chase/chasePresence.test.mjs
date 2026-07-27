import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChaseArenaListPayload,
  buildChaseLivePayload,
  joinChaseArenaPresence,
  updateChasePresencePosition,
} from './chasePresence.mjs';

const NOW = new Date('2026-07-28T12:00:00.000Z');

function buildStore() {
  return {
    users: [
      { id: 'user-a', name: '러너A' },
      { id: 'user-b', name: '러너B' },
    ],
    chasePresence: [],
  };
}

test('활성 경기장은 일산 호수공원 하나만 목록에 노출', () => {
  const payload = buildChaseArenaListPayload(buildStore(), NOW);

  assert.equal(payload.arenas.length, 1);
  assert.equal(payload.arenas[0].id, 'ilsan-lake');
});

test('dormant 경기장은 입장 불가 (404)', () => {
  const store = buildStore();

  assert.throws(
    () => joinChaseArenaPresence(store, { id: 'user-a' }, 'yeouido-han', NOW),
    /찾을 수 없어요/,
  );
});

test('join 응답에 라이브 지도용 지오펜스 좌표가 실린다', () => {
  const payload = joinChaseArenaPresence(buildStore(), { id: 'user-a' }, 'ilsan-lake', NOW);

  assert.equal(payload.arenaId, 'ilsan-lake');
  assert.equal(payload.latitude, 37.6585);
  assert.equal(payload.radiusM, 900);
  assert.equal(payload.currentCount, 1);
});

test('위치 하트비트: 슬롯 업서트 + 좌표/방향/페이스 저장, 라이브 지도에 반영', () => {
  const store = buildStore();
  joinChaseArenaPresence(store, { id: 'user-a' }, 'ilsan-lake', NOW);
  joinChaseArenaPresence(store, { id: 'user-b' }, 'ilsan-lake', NOW);

  updateChasePresencePosition(store, { id: 'user-a' }, {
    arenaId: 'ilsan-lake',
    latitude: 37.6588,
    longitude: 126.7680,
    headingDeg: 425.4, // 정규화 → 65
    paceLabel: '06:10/km',
  }, NOW);
  updateChasePresencePosition(store, { id: 'user-b' }, {
    arenaId: 'ilsan-lake',
    latitude: 37.6580,
    longitude: 126.7670,
  }, new Date(NOW.getTime() + 5_000));

  const live = buildChaseLivePayload(store, { id: 'user-a' }, 'ilsan-lake', new Date(NOW.getTime() + 10_000));

  assert.equal(live.participants.length, 2);
  const self = live.participants.find((entry) => entry.isSelf);
  const other = live.participants.find((entry) => !entry.isSelf);
  assert.equal(self.headingDeg, 65);
  assert.equal(self.paceLabel, '06:10/km');
  assert.equal(self.ageSeconds, 10);
  assert.equal(other.name, '러너B');
  assert.equal(other.headingDeg, null);
});

test('슬롯 없는 유저의 라이브 조회는 403, 위치 하트비트는 슬롯을 재생성한다', () => {
  const store = buildStore();

  assert.throws(
    () => buildChaseLivePayload(store, { id: 'user-a' }, 'ilsan-lake', NOW),
    /입장한 러너만/,
  );

  // TTL 만료로 슬롯이 사라져도 러닝 중 하트비트가 자가 회복.
  updateChasePresencePosition(store, { id: 'user-a' }, {
    arenaId: 'ilsan-lake',
    latitude: 37.6585,
    longitude: 126.7676,
  }, NOW);
  const live = buildChaseLivePayload(store, { id: 'user-a' }, 'ilsan-lake', NOW);
  assert.equal(live.participants.length, 1);
});

test('headingDeg null(정지)은 null로 남는다 — 북쪽 화살표로 강제되지 않는다', () => {
  const store = buildStore();
  updateChasePresencePosition(store, { id: 'user-a' }, {
    arenaId: 'ilsan-lake',
    latitude: 37.6585,
    longitude: 126.7676,
    headingDeg: null,
  }, NOW);

  const live = buildChaseLivePayload(store, { id: 'user-a' }, 'ilsan-lake', NOW);
  assert.equal(live.participants[0].headingDeg, null);
});

test('지오펜스 밖 좌표의 위치 하트비트는 403 — 원격 스토킹 차단', () => {
  const store = buildStore();

  // 서울 시내(경기장에서 수 km 밖)에서 보낸 하트비트: 거부 + 슬롯 미생성.
  assert.throws(
    () => updateChasePresencePosition(store, { id: 'user-a' }, {
      arenaId: 'ilsan-lake',
      latitude: 37.5665,
      longitude: 126.9780,
    }, NOW),
    /경기장 안에서만/,
  );
  assert.equal((store.chasePresence ?? []).length, 0);
  assert.throws(
    () => buildChaseLivePayload(store, { id: 'user-a' }, 'ilsan-lake', NOW),
    /입장한 러너만/,
  );
});

test('A 경기장 슬롯으로 B 경기장 라이브는 볼 수 없다', () => {
  const store = buildStore();
  joinChaseArenaPresence(store, { id: 'user-a' }, 'ilsan-lake', NOW);

  assert.throws(
    () => buildChaseLivePayload(store, { id: 'user-a' }, 'yeouido-han', NOW),
    /입장한 러너만/,
  );
});

test('10분 넘게 낡은 위치는 라이브 지도에서 숨긴다', () => {
  const store = buildStore();
  updateChasePresencePosition(store, { id: 'user-a' }, {
    arenaId: 'ilsan-lake',
    latitude: 37.6585,
    longitude: 126.7676,
  }, NOW);
  updateChasePresencePosition(store, { id: 'user-b' }, {
    arenaId: 'ilsan-lake',
    latitude: 37.6580,
    longitude: 126.7670,
  }, new Date(NOW.getTime() + 11 * 60_000));

  const live = buildChaseLivePayload(
    store,
    { id: 'user-b' },
    'ilsan-lake',
    new Date(NOW.getTime() + 11 * 60_000),
  );

  assert.equal(live.participants.length, 1);
  assert.equal(live.participants[0].userId, 'user-b');
});
