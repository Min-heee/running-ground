import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeLodReveal,
  LOD_COMMIT_RADIUS_RATIO,
  LOD_COMMIT_ZOOM,
  LOD_FOCUS_RADIUS_RATIO,
  LOD_ENTER_ZOOM,
  LOD_FULL_ZOOM,
  resolveFocusedBody,
  resolveLodOpacity,
  UNIVERSE_MAX_ZOOM,
} from '@/features/universe/utils/universeLod';

// 줌 LOD 계약: 어떤 은하가 풀릴지와 얼마나 풀릴지. 이게 흔들리면 확대할 때마다 엉뚱한
// 은하가 열리거나, 원반과 행성이 동시에 진하게 겹쳐 화면이 뭉개진다.

test('reveal: 문턱 아래는 0, 완전 배율 이상은 1, 사이는 선형', () => {
  assert.equal(computeLodReveal(1), 0);
  assert.equal(computeLodReveal(LOD_ENTER_ZOOM), 0);
  assert.equal(computeLodReveal(LOD_FULL_ZOOM), 1);
  assert.equal(computeLodReveal(20), 1);
  const mid = computeLodReveal((LOD_ENTER_ZOOM + LOD_FULL_ZOOM) / 2);
  assert.ok(mid > 0.49 && mid < 0.51);
  // 비정상 입력은 닫힌 상태로 — 확대가 깨져도 화면이 폭발하지 않는다.
  assert.equal(computeLodReveal(Number.NaN), 0);
});

test('문턱 순서: 미리보기가 다 끝난 뒤에 들어가고, 들어갈 배율이 최대 배율 안에 있다', () => {
  // 순서가 깨지면 미리보기가 열리기도 전에 층이 갈아엎어지거나(commit < full),
  // 최대 배율까지 굴려도 영영 못 들어간다(commit > max).
  assert.ok(LOD_ENTER_ZOOM < LOD_FULL_ZOOM);
  assert.ok(LOD_FULL_ZOOM < LOD_COMMIT_ZOOM);
  assert.ok(LOD_COMMIT_ZOOM < UNIVERSE_MAX_ZOOM);
});

test('초점: 화면 중앙에 가장 가까운 은하, 너무 멀면 초점 없음', () => {
  const bodies = [
    { id: 'far', screenX: 900, screenY: 900 },
    { id: 'near', screenX: 420, screenY: 380 },
  ];

  const near = resolveFocusedBody(bodies, 400, 400, 200);
  assert.equal(near?.id, 'near');
  // 진입 판정이 쓰는 거리도 같이 돌려준다 — 화면에 얼마나 가까운지로 문을 잠근다.
  assert.ok(near !== null && Math.abs(near.distance - Math.hypot(20, 20)) < 1e-9);
  // 중앙 근처에 아무것도 없으면 아무것도 열지 않는다.
  assert.equal(resolveFocusedBody([bodies[0]], 400, 400, 200), null);
  assert.equal(resolveFocusedBody([], 400, 400, 200), null);
});

test('진입 반경은 초점 반경보다 좁다 — 빈 우주를 확대하다 끌려 들어가지 않게', () => {
  assert.ok(LOD_COMMIT_RADIUS_RATIO < LOD_FOCUS_RADIUS_RATIO);
  assert.ok(LOD_COMMIT_RADIUS_RATIO > 0);
});

test('불투명도: 원반은 흔적을 남기고, 행성은 reveal을 따른다', () => {
  assert.deepEqual(resolveLodOpacity(0), { disk: 1, planets: 0 });
  const full = resolveLodOpacity(1);
  assert.equal(full.planets, 1);
  // 완전히 사라지면 축소할 때 시선이 끊긴다 — 흔적이 남아야 한다.
  assert.ok(full.disk > 0.15 && full.disk < 0.3);
  // 범위 밖 입력도 안전하게 잘린다.
  assert.deepEqual(resolveLodOpacity(-1), { disk: 1, planets: 0 });
  assert.equal(resolveLodOpacity(9).planets, 1);
});
