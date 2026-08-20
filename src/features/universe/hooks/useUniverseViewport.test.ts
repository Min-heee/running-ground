import assert from 'node:assert/strict';
import test from 'node:test';

import { zoomAroundPoint, type UniverseViewport } from '@/features/universe/utils/universeZoom';
import { projectPoint } from '@/features/universe/utils/universeProjection';

// 확대/축소의 계약. 여기가 틀리면 굴린 만큼 되돌아오지 않아서, 축소했는데 보고 있던 것이
// 카메라 뒤로 떨어지거나 오히려 커지는 것처럼 보인다.

const W = 460;
const H = 603;
const FIT = 0.2116;
// 실제 휠 한 칸(deltaY=120)이 만드는 배율.
const NOTCH = Math.exp(-120 * 0.0026);

const start: UniverseViewport = { zoom: FIT, panX: 0, panY: 0, camDepth: 0 };

function notch(viewport: UniverseViewport, direction: 1 | -1, anchor: { x: number; y: number; z: number; onBody: boolean } | null) {
  const factor = direction === -1 ? 1 / NOTCH : NOTCH;

  return zoomAroundPoint(viewport, viewport.zoom * factor, 290, 320, W, H, FIT, anchor);
}

test('확대한 만큼 축소하면 정확히 처음 자리로 돌아온다', () => {
  // 커서가 한 천체 위에 머무는 흔한 경우 — 겨눈 깊이가 고정된다.
  const anchor = { x: 120, y: -80, z: 42, onBody: true };
  let view = start;

  for (let i = 0; i < 20; i += 1) {
    view = notch(view, -1, anchor);
  }

  assert.ok(view.zoom > start.zoom * 10, `20칸 확대가 배율을 키우지 못했다: ${view.zoom}`);
  assert.ok(view.camDepth > 0, `확대가 카메라를 겨눈 깊이로 데려가지 못했다: ${view.camDepth}`);

  for (let i = 0; i < 20; i += 1) {
    view = notch(view, 1, anchor);
  }

  assert.ok(Math.abs(view.zoom / start.zoom - 1) < 1e-9, `배율이 안 돌아옴: ${view.zoom} vs ${start.zoom}`);
  assert.ok(Math.abs(view.camDepth - start.camDepth) < 1e-6, `깊이가 안 돌아옴: ${view.camDepth}`);
  assert.ok(Math.abs(view.panX - start.panX) < 1e-6, `panX가 안 돌아옴: ${view.panX}`);
  assert.ok(Math.abs(view.panY - start.panY) < 1e-6, `panY가 안 돌아옴: ${view.panY}`);
});

test('축소는 반드시 작아진다 — 겨눈 천체가 화면에서 줄어든다', () => {
  // 한 칸 축소했더니 오히려 커지던 증상을 못 박는다. 배율만 보면 안 된다: 카메라 깊이가
  // 엉뚱하게 움직이면 배율이 줄어도 천체가 가까워져 더 커질 수 있다.
  const anchor = { x: 120, y: -80, z: 42, onBody: true };
  let view = start;

  for (let i = 0; i < 12; i += 1) {
    view = notch(view, -1, anchor);
  }

  // 겨눈 것만이 아니라 **화면의 모든 것**이 줄어야 한다. 겨눈 깊이보다 앞에 있는 것과 뒤에
  // 있는 것을 같이 본다 — 카메라가 엉뚱하게 움직이면 그중 한쪽이 오히려 다가온다.
  const bodies = [
    anchor,
    { x: -60, y: 20, z: anchor.z + 26 },
    { x: 210, y: -95, z: anchor.z - 240 },
  ];
  const shotOf = (v: UniverseViewport) => bodies
    .map((body) => projectPoint(body.x, body.y, body.z, v, W, H));
  let previous = shotOf(view);

  assert.ok(previous.every((p) => p.visible), '시작부터 카메라 뒤인 천체가 있어 시험이 무의미하다');

  for (let i = 0; i < 12; i += 1) {
    view = notch(view, 1, anchor);
    const shot = shotOf(view);

    shot.forEach((now, index) => {
      // 축소는 물러나는 일이다 — 보이던 것이 카메라 뒤로 떨어질 수 없다. 예전에 camDepth를
      // 절대 0쪽으로 끌던 시절, 한 칸만 축소해도 보던 것이 통째로 사라졌다.
      assert.ok(now.visible, `${i + 1}칸째 축소에서 ${index}번 천체가 카메라 뒤로 떨어졌다`);
      assert.ok(
        now.scale < previous[index].scale,
        `${i + 1}칸째 축소에서 ${index}번 천체가 오히려 커졌다: ${previous[index].scale} → ${now.scale}`,
      );
    });

    previous = shot;
  }
});

test('빈 하늘을 축소해도 카메라가 뒤로 물러난다', () => {
  // 겨눈 천체가 없으면 기준은 지금의 초점면이다. 그때 camDepth는 변하지 않아야 한다 —
  // 초점면 자체가 기준이므로 앞뒤로 움직일 이유가 없다.
  let view: UniverseViewport = { zoom: FIT * 40, panX: 30, panY: -50, camDepth: 88 };
  const before = view.camDepth;

  for (let i = 0; i < 5; i += 1) {
    view = notch(view, 1, null);
  }

  assert.ok(Math.abs(view.camDepth - before) < 1e-9, `초점면 기준인데 깊이가 흔들렸다: ${view.camDepth}`);
  assert.ok(view.zoom < FIT * 40);
});

test('한계에 닿으면 더 굴려도 흔들리지 않는다', () => {
  // 최소 배율에 붙은 뒤에도 pan/camDepth가 계속 움직이면, 굴릴 때마다 장면이 옆으로 기어간다.
  const anchor = { x: -200, y: 140, z: -30, onBody: true };
  let view = start;

  for (let i = 0; i < 40; i += 1) {
    view = notch(view, 1, anchor);
  }

  const settled = view;
  const again = notch(settled, 1, anchor);

  assert.ok(Math.abs(again.zoom - settled.zoom) < 1e-12);
  assert.ok(Math.abs(again.panX - settled.panX) < 1e-9, `한계에서 panX가 밀렸다: ${settled.panX} → ${again.panX}`);
  assert.ok(Math.abs(again.panY - settled.panY) < 1e-9, `한계에서 panY가 밀렸다: ${settled.panY} → ${again.panY}`);
  assert.ok(Math.abs(again.camDepth - settled.camDepth) < 1e-9, `한계에서 깊이가 밀렸다: ${settled.camDepth} → ${again.camDepth}`);
});
