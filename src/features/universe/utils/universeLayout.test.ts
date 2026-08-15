import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOrbitSlots,
  buildStarField,
  countRings,
  ringRadius,
} from './universeLayout';

test('궤도 슬롯은 요청한 개수만큼 나온다', () => {
  assert.equal(buildOrbitSlots(17).length, 17);
  assert.equal(buildOrbitSlots(1).length, 1);
  assert.equal(buildOrbitSlots(0).length, 0);
  assert.equal(buildOrbitSlots(-3).length, 0);
});

test('안쪽 궤도부터 정원껏 채운다', () => {
  const slots = buildOrbitSlots(7);

  // 첫 궤도 정원 6 → 6개는 ring 0, 나머지 1개가 ring 1로 넘어간다.
  assert.equal(slots.filter((slot) => slot.ring === 0).length, 6);
  assert.equal(slots.filter((slot) => slot.ring === 1).length, 1);
  assert.equal(countRings(slots), 2);
});

test('같은 궤도의 천체는 고르게 흩어진다', () => {
  const ringZero = buildOrbitSlots(6).filter((slot) => slot.ring === 0);
  const gaps = ringZero.slice(1).map((slot, index) => slot.angle - ringZero[index].angle);

  for (const gap of gaps) {
    assert.ok(Math.abs(gap - (Math.PI * 2) / 6) < 1e-9, `간격이 고르지 않음: ${gap}`);
  }
});

test('단위원 좌표는 반지름 1을 벗어나지 않는다', () => {
  for (const slot of buildOrbitSlots(31)) {
    assert.ok(Math.abs(Math.hypot(slot.unitX, slot.unitY) - 1) < 1e-9);
  }
});

test('가장 바깥 궤도가 최대 반지름에 닿는다', () => {
  assert.equal(ringRadius(2, 3, 120), 120);
  assert.equal(ringRadius(0, 3, 120), 40);
  assert.equal(ringRadius(0, 0, 120), 0);
  assert.equal(ringRadius(0, 3, 0), 0);
});

test('배경 별은 시드가 같으면 항상 같은 자리 — 렌더마다 흔들리면 안 된다', () => {
  assert.deepEqual(buildStarField(20), buildStarField(20));
  assert.notDeepEqual(buildStarField(20, 1), buildStarField(20, 2));
});

test('배경 별은 캔버스 안에 머문다', () => {
  for (const dot of buildStarField(120)) {
    assert.ok(dot.x >= 0 && dot.x <= 1);
    assert.ok(dot.y >= 0 && dot.y <= 1);
    assert.ok(dot.opacity > 0 && dot.opacity <= 1);
    assert.ok(dot.size >= 1);
  }
});
