import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOrbitSlots,
  countRings,
  pickVisibleLabels,
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

test('이름표: 겹치는 것은 접고, 먼저 온 것(=중요한 것)이 자리를 지킨다', () => {
  const box = (id: string, centerX: number, top: number) => ({
    id,
    centerX,
    top,
    width: 80,
    height: 26,
  });

  // 두 번째는 첫 번째와 겹친다 → 접힌다. 세 번째는 충분히 떨어져 살아남는다.
  const visible = pickVisibleLabels(
    [box('first', 100, 100), box('overlap', 130, 110), box('apart', 300, 100)],
    400,
    400,
  );

  assert.deepEqual([...visible].sort(), ['apart', 'first']);
});

test('이름표: 화면 밖은 접히고, 안쪽 이름을 가로막지도 않는다', () => {
  const outside = { id: 'outside', centerX: -200, top: 100, width: 80, height: 26 };
  // 화면 밖 상자가 자리를 선점했다면 겹치는 inside까지 접혔을 것이다.
  const inside = { id: 'inside', centerX: -170, top: 105, width: 80, height: 26 };

  assert.deepEqual([...pickVisibleLabels([outside], 400, 400)], []);
  assert.deepEqual([...pickVisibleLabels([outside, { ...inside, centerX: 40 }], 400, 400)], ['inside']);
});
