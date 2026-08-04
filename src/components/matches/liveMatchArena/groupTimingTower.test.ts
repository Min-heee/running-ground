import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  RANK_SHIFT_VISIBLE_MS,
  RANK_SHIFT_VISIBLE_UPDATES,
  advanceRankShiftState,
  buildGroupGapLabel,
  createEmptyRankShiftState,
  isRankShiftVisibleAt,
  resolveRankNumber,
} from './groupTimingTower';
import type { ArenaParticipant } from './types';

function makeParticipant(overrides: Partial<ArenaParticipant> & { id: string }): ArenaParticipant {
  return {
    name: overrides.id,
    paceLabel: '5:30/km',
    distanceKm: 1,
    liveStatus: 'running',
    ...overrides,
  };
}

test('resolveRankNumber prefers the upstream rank label over list order', () => {
  assert.equal(resolveRankNumber(makeParticipant({ id: 'a', rankLabel: '7위' }), 0), 7);
  // 안드로이드 경량 창으로 목록이 잘려도 진짜 순위(rankLabel)가 이긴다.
  assert.equal(resolveRankNumber(makeParticipant({ id: 'a' }), 2), 3);
});

test('gap label: leader, interval, and status overrides', () => {
  const leader = makeParticipant({ id: 'lead', distanceKm: 2.0 });
  const chaser = makeParticipant({ id: 'chase', distanceKm: 1.97 });

  assert.equal(buildGroupGapLabel(leader, null), '선두');
  assert.equal(buildGroupGapLabel(chaser, leader), '+0.03km');
  // 서버 스냅샷 순서가 잠깐 어긋나 앞줄보다 멀리 간 값이 와도 음수로 출력하지 않는다.
  assert.equal(buildGroupGapLabel(leader, chaser), '+0.00km');
  assert.equal(
    buildGroupGapLabel(makeParticipant({ id: 'wait', liveStatus: 'ready', distanceKm: 0 }), leader),
    '측정 대기',
  );
  // 출발 직후 전원 대기: 첫 줄(선두 자리)도 '선두'가 아니라 '측정 대기'가 맞다.
  assert.equal(
    buildGroupGapLabel(makeParticipant({ id: 'wait0', liveStatus: 'ready', distanceKm: 0 }), null),
    '측정 대기',
  );
  assert.equal(
    buildGroupGapLabel(makeParticipant({ id: 'ff', liveStatus: 'forfeited' }), leader),
    '기권',
  );
  assert.equal(
    buildGroupGapLabel(makeParticipant({ id: 'fin', liveStatus: 'finished' }), leader),
    '완주',
  );
});

test('rank shift arrows appear on swap and decay after the update window', () => {
  const a = (rankLabel: string) => makeParticipant({ id: 'a', rankLabel });
  const b = (rankLabel: string) => makeParticipant({ id: 'b', rankLabel });
  let nowMs = 1_000;

  let state = createEmptyRankShiftState();
  state = advanceRankShiftState(state, [a('1위'), b('2위')], nowMs);
  assert.deepEqual(state.shiftById, {});

  // 추월: a가 2위로, b가 1위로 — b는 ▲, a는 ▼.
  nowMs += 1_000;
  state = advanceRankShiftState(state, [b('1위'), a('2위')], nowMs);
  assert.equal(state.shiftById.b?.direction, 'up');
  assert.equal(state.shiftById.a?.direction, 'down');

  // 순위 유지 + 1초 간격 업데이트: 표시 창(4회)까지 살았다가 사라진다.
  for (let update = 1; update < RANK_SHIFT_VISIBLE_UPDATES; update += 1) {
    nowMs += 900;
    state = advanceRankShiftState(state, [b('1위'), a('2위')], nowMs);
    assert.equal(state.shiftById.b?.direction, 'up', `update ${update} should keep the arrow`);
  }
  nowMs += 900;
  state = advanceRankShiftState(state, [b('1위'), a('2위')], nowMs);
  assert.deepEqual(state.shiftById, {});
});

test('rank shift arrows expire by wall clock even when few updates arrive', () => {
  const a = (rankLabel: string) => makeParticipant({ id: 'a', rankLabel });
  const b = (rankLabel: string) => makeParticipant({ id: 'b', rankLabel });

  let state = createEmptyRankShiftState();
  state = advanceRankShiftState(state, [a('1위'), b('2위')], 1_000);
  state = advanceRankShiftState(state, [b('1위'), a('2위')], 2_000);
  assert.equal(state.shiftById.b?.direction, 'up');
  assert.ok(isRankShiftVisibleAt(state.shiftById.b, 2_000 + RANK_SHIFT_VISIBLE_MS - 1));
  assert.ok(!isRankShiftVisibleAt(state.shiftById.b, 2_000 + RANK_SHIFT_VISIBLE_MS));

  // 안드로이드 반올림 등으로 업데이트가 드문드문 와도(첫 전진이 5초 뒤),
  // 벽시계 4초가 지난 화살표는 다음 전진에서 걷힌다.
  state = advanceRankShiftState(state, [b('1위'), a('2위')], 2_000 + RANK_SHIFT_VISIBLE_MS + 1_000);
  assert.deepEqual(state.shiftById, {});
});

test('rank shift state drops runners that left the visible window', () => {
  let state = createEmptyRankShiftState();
  state = advanceRankShiftState(state, [
    makeParticipant({ id: 'a', rankLabel: '1위' }),
    makeParticipant({ id: 'b', rankLabel: '2위' }),
  ], 1_000);
  state = advanceRankShiftState(state, [makeParticipant({ id: 'a', rankLabel: '1위' })], 2_000);
  assert.deepEqual(Object.keys(state.rankById), ['a']);
  assert.deepEqual(state.shiftById, {});
});
