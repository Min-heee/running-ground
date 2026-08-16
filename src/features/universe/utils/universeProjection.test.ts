import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cameraDistanceFor,
  focalLengthFor,
  panToHold,
  projectPoint,
  unprojectAt,
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

test('빈 하늘을 확대하면 초점면의 그 점이 붙들린다 — 엉뚱한 천체를 끌어오지 않는다', () => {
  const view = { zoom: 3, panX: 40, panY: -25, camDepth: 8 };
  const cursor = { x: 300, y: 180 };
  // 커서 아래에 아무것도 없을 때 붙드는 대상 = 초점면 위의 그 점.
  const point = unprojectOnFocalPlane(cursor.x, cursor.y, view, W, H);

  const moved = { ...view, zoom: 9 };
  const held = panToHold({ ...point, z: view.camDepth }, cursor.x, cursor.y, moved, W, H);
  const after = projectPoint(point.x, point.y, view.camDepth, { ...moved, ...held }, W, H);

  assert.ok(Math.abs(after.screenX - cursor.x) < 1e-6);
  assert.ok(Math.abs(after.screenY - cursor.y) < 1e-6);
});

test('역투영은 어느 깊이에서도 투영을 되돌린다 — 두 축이 같은 부호로', () => {
  // 이동량이 두 축 모두 0이 아닌 상태여야 부호 실수가 드러난다. 예전에 손으로 베낀 사본이
  // y만 옛 부호로 남아, 겨눈 자리가 세로로만 튀었다.
  const view = { zoom: 2.5, panX: -140, panY: 260, camDepth: 12 };

  for (const z of [view.camDepth, view.camDepth - 40, view.camDepth + 9]) {
    const point = unprojectAt(410, 300, view, W, H, z);
    const back = projectPoint(point.x, point.y, z, view, W, H);

    assert.ok(Math.abs(back.screenX - 410) < 1e-6, `z=${z} 에서 x가 안 맞음`);
    assert.ok(Math.abs(back.screenY - 300) < 1e-6, `z=${z} 에서 y가 안 맞음`);
  }
});

test('확대 앵커는 커서 아래의 자리를 붙든다 — 천체의 중심이 아니라', () => {
  // 커서가 천체 안이지만 중심에서 벗어난 흔한 경우. 중심을 붙들면 그 천체가 커서로
  // 순간이동하면서 장면이 반지름만큼 통째로 튄다.
  const view = { zoom: 3, panX: 80, panY: -40, camDepth: 5 };
  const bodyCentre = { x: 20, y: 12, z: 30 };
  const centreOnScreen = projectPoint(bodyCentre.x, bodyCentre.y, bodyCentre.z, view, W, H);
  const cursorX = centreOnScreen.screenX + 70;
  const cursorY = centreOnScreen.screenY - 45;

  const underCursor = unprojectAt(cursorX, cursorY, view, W, H, bodyCentre.z);
  const moved = { ...view, zoom: 6 };
  const held = panToHold(underCursor, cursorX, cursorY, moved, W, H);
  const after = projectPoint(underCursor.x, underCursor.y, bodyCentre.z, { ...moved, ...held }, W, H);

  assert.ok(Math.abs(after.screenX - cursorX) < 1e-6);
  assert.ok(Math.abs(after.screenY - cursorY) < 1e-6);

  // 중심을 붙들었다면 천체가 커서로 끌려왔을 것이다 — 그러지 않았음을 확인한다.
  const centreAfter = projectPoint(bodyCentre.x, bodyCentre.y, bodyCentre.z, { ...moved, ...held }, W, H);
  assert.ok(Math.abs(centreAfter.screenX - cursorX) > 1);
});
