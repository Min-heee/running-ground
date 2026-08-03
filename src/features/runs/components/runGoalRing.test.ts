// 목표 링 계산의 계약: 거리/목표 비율만큼 채움, 달성 시 꽉 참 유지, 목표 시각화일 뿐.

import assert from 'node:assert/strict';
import test from 'node:test';

import { GOAL_RING_TICK_COUNT, buildGoalRingModel, splitDistanceLabel } from './runGoalRing';

test('뛴 거리 비율만큼 채워진다 (2.3/5km → 9칸)', () => {
  const model = buildGoalRingModel(2.3, 5);
  assert.equal(model.filledTicks, 9);
  assert.equal(model.statusLine, '목표 5km까지 2.7km 남았어요');
});

test('시작 전(0km)은 0칸 + 전체 남음', () => {
  const model = buildGoalRingModel(0, 3);
  assert.equal(model.filledTicks, 0);
  assert.equal(model.statusLine, '목표 3km까지 3.0km 남았어요');
});

test('목표 달성/초과 시 꽉 찬 채 유지', () => {
  assert.deepEqual(buildGoalRingModel(5, 5), {
    tickCount: GOAL_RING_TICK_COUNT,
    filledTicks: GOAL_RING_TICK_COUNT,
    statusLine: '목표 5km 달성!',
  });
  assert.equal(buildGoalRingModel(7.2, 5).filledTicks, GOAL_RING_TICK_COUNT);
});

test('깨진 입력은 안전 기본값 (목표 0/NaN → 5km, 거리 NaN → 0)', () => {
  assert.equal(buildGoalRingModel(Number.NaN, 0).statusLine, '목표 5km까지 5.0km 남았어요');
});

test('거리 라벨 분해: 숫자와 단위를 나눈다', () => {
  assert.deepEqual(splitDistanceLabel('4.91km'), { number: '4.91', unit: 'km' });
  assert.deepEqual(splitDistanceLabel('0.00km'), { number: '0.00', unit: 'km' });
});
