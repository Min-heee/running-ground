import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cameraDistanceFor,
  focalLengthFor,
  panToHold,
  projectPoint,
  unprojectOnFocalPlane,
} from './universeProjection';

// 투영 계약. 여기가 틀리면 3D와 이름표가 갈라지고, 날아간 곳이 허공이 된다.

const W = 1280;
const H = 532;
const camera = { zoom: 4, panX: 0, panY: 0, camDepth: 0 };

test('초점면 위의 것은 예전 직교 배치와 완전히 같은 자리·크기로 나온다', () => {
  // screen = 중심 + 좌표×배율 + 이동. 두 축 모두.
  for (const pan of [{ panX: 0, panY: 0 }, { panX: 120, panY: -80 }]) {
    const view = { ...camera, ...pan };

    for (const [x, y] of [[0, 0], [37, -52], [-140, 96]]) {
      const projected = projectPoint(x, y, view.camDepth, view, W, H);

      assert.ok(projected.visible);
      assert.ok(Math.abs(projected.scale - view.zoom) < 1e-9);
      assert.ok(Math.abs(projected.screenX - (W / 2 + x * view.zoom + view.panX)) < 1e-6);
      // y도 x와 **같은 부호 규칙**을 따른다. 한쪽만 뒤집혀 있으면 x는 가운데인데 y만
      // 수십만 픽셀 밖으로 나간다 — '내 행성으로'가 허공에 내려앉던 실제 버그다.
      assert.ok(Math.abs(projected.screenY - (H / 2 + y * view.zoom + view.panY)) < 1e-6);
    }
  }
});

test('겨냥한 곳으로 이동량을 맞추면 정확히 화면 한가운데에 온다', () => {
  const target = { x: -222.5, y: -656.1, z: 163.8 };
  // 그 천체의 깊이로 카메라를 옮기고(=초점면에 놓고) 가운데로 맞춘다.
  const view = { zoom: 1468.32, panX: -target.x * 1468.32, panY: -target.y * 1468.32, camDepth: target.z };
  const projected = projectPoint(target.x, target.y, target.z, view, W, H);

  assert.ok(Math.abs(projected.screenX - W / 2) < 1e-6);
  assert.ok(Math.abs(projected.screenY - H / 2) < 1e-6);
});

test('앵커 고정: 배율이 바뀌어도 그 천체는 같은 화면 자리에 남는다', () => {
  const target = { x: 90, y: -40, z: 25 };
  const before = { zoom: 3, panX: 60, panY: -20, camDepth: 10 };
  const anchor = projectPoint(target.x, target.y, target.z, before, W, H);

  // 배율과 카메라 깊이가 함께 바뀌는 상황 — 실제 확대가 하는 일 그대로.
  const moved = { ...before, zoom: 7.5, camDepth: 18 };
  const held = panToHold(target, anchor.screenX, anchor.screenY, moved, W, H);
  const after = projectPoint(target.x, target.y, target.z, { ...moved, ...held }, W, H);

  assert.ok(Math.abs(after.screenX - anchor.screenX) < 1e-6);
  assert.ok(Math.abs(after.screenY - anchor.screenY) < 1e-6);
});

test('가까울수록 크게, 카메라 뒤는 그리지 않는다', () => {
  const near = projectPoint(0, 0, 40, { ...camera, camDepth: 0 }, W, H);
  const far = projectPoint(0, 0, -40, { ...camera, camDepth: 0 }, W, H);

  assert.ok(near.scale > camera.zoom);
  assert.ok(far.scale < camera.zoom);

  const distance = cameraDistanceFor(camera, H);
  const behind = projectPoint(0, 0, camera.camDepth + distance, camera, W, H);
  assert.equal(behind.visible, false);
  assert.equal(behind.scale, 0);
});

test('역투영은 투영을 정확히 되돌린다', () => {
  const view = { zoom: 2.5, panX: -140, panY: 70, camDepth: 12 };
  const point = unprojectOnFocalPlane(410, 300, view, W, H);
  const back = projectPoint(point.x, point.y, view.camDepth, view, W, H);

  assert.ok(Math.abs(back.screenX - 410) < 1e-6);
  assert.ok(Math.abs(back.screenY - 300) < 1e-6);
  assert.ok(focalLengthFor(H) > 0);
});
