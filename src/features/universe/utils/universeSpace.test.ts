import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BODY_RESOLVE_PX,
  BODY_RESOLVED_PX,
  cloudOpacity,
  depthDimFor,
  depthScaleFor,
  labelOpacity,
  placeChildren,
  fitZoomFor,
  resolveProgress,
  smoothStep,
  UNIVERSE_MAX_ZOOM_FACTOR,
  UNIVERSE_MIN_ZOOM_FACTOR,
  UNIVERSE_ROOT_RADIUS,
  zoomToFrame,
} from './universeSpace';

// 연속 우주의 계약: ① 자식은 부모 안에 들어가고 형제끼리 겹치지 않는다 ② 화면에서 커질수록
// 뭉침이 풀린다. 이 둘이 깨지면 은하가 서로를 먹거나, 확대해도 영영 안 풀린다.

const parent = { x: 0, y: 0, z: 0, radius: 200 };

test('자식은 부모 원 안에 들어간다', () => {
  for (const count of [2, 7, 17, 25, 31, 60]) {
    const scales = Array.from({ length: count }, (_, index) => 1 + (index % 5) * 0.3);

    for (const child of placeChildren(parent, scales)) {
      const reach = Math.hypot(child.x - parent.x, child.y - parent.y) + child.radius;
      assert.ok(reach <= parent.radius, `${count}개일 때 자식이 부모를 벗어남: ${reach} > ${parent.radius}`);
      assert.ok(child.radius > 0);
    }
  }
});

test('형제끼리 겹치지 않는다 — 흐트러뜨려도 남는 자리 안에서만', () => {
  for (const count of [3, 17, 25, 60]) {
    const scales = Array.from({ length: count }, (_, index) => 1 + (index % 7) * 0.2);
    const placed = placeChildren(parent, scales);

    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const distance = Math.hypot(
          placed[i].x - placed[j].x,
          placed[i].y - placed[j].y,
          placed[i].z - placed[j].z,
        );
        assert.ok(
          distance >= placed[i].radius + placed[j].radius,
          `${count}개일 때 ${i}·${j}가 겹침: ${distance} < ${placed[i].radius + placed[j].radius}`,
        );
      }
    }
  }
});

test('자리는 흐트러져 있고 앞뒤가 있다 — 자로 그린 동심원은 우주로 안 읽힌다', () => {
  const scales = Array.from({ length: 25 }, () => 1);
  const placed = placeChildren(parent, scales).slice(1);
  const orbits = placed.map((child) => Math.hypot(child.x - parent.x, child.y - parent.y));
  const depths = placed.map((child) => child.z - parent.z);

  // 같은 궤도에 놓인 것들의 반지름이 전부 같으면 그건 동심원이다.
  assert.ok(new Set(orbits.map((orbit) => orbit.toFixed(3))).size > placed.length * 0.8);
  // 깊이가 전부 0이면 종이처럼 납작하다.
  assert.ok(Math.max(...depths.map(Math.abs)) > parent.radius * 0.05);
  // 그래도 같은 부모, 같은 입력이면 언제나 같은 자리여야 한다.
  assert.deepEqual(placeChildren(parent, scales), placeChildren(parent, scales));
});

test('원근: 가까운 것은 크고 밝게, 먼 것은 작고 어둡게', () => {
  const near = depthScaleFor(0.26);
  const far = depthScaleFor(-0.26);

  assert.ok(near > 1 && far < 1);
  assert.ok(near / far > 1.2, '앞뒤 크기 차이가 눈에 띄어야 한다');
  assert.ok(depthDimFor(near) > depthDimFor(far));
  // 같은 평면이면 아무 일도 없어야 한다.
  assert.equal(depthScaleFor(0), 1);
});

test('전환은 문턱이 아니라 구간에서 섞인다', () => {
  assert.equal(smoothStep(10, 20, 10), 0);
  assert.equal(smoothStep(10, 20, 20), 1);
  assert.equal(smoothStep(10, 20, 5), 0);
  assert.equal(smoothStep(10, 20, 25), 1);

  const mid = smoothStep(10, 20, 15);
  assert.ok(mid > 0.49 && mid < 0.51);
  // 양 끝에서 기울기가 0이라 시작과 끝이 부드럽다 — 선형이면 문턱에서 각이 진다.
  assert.ok(smoothStep(10, 20, 11) < 0.1);
  assert.ok(smoothStep(10, 20, 19) > 0.9);
});

test('하나뿐인 자식은 부모 한가운데에 앉는다', () => {
  const [only] = placeChildren(parent, [1]);

  assert.equal(only.x, parent.x);
  assert.equal(only.y, parent.y);
  assert.ok(only.radius > 0 && only.radius < parent.radius);
  assert.deepEqual(placeChildren(parent, []), []);
});

test('중심은 절대 비지 않는다 — 첫째가 한가운데에 앉는다', () => {
  for (const count of [2, 5, 17, 25, 60]) {
    const scales = Array.from({ length: count }, (_, index) => 2 - index * 0.01);
    const [first] = placeChildren(parent, scales);

    // 여기가 비면 중심을 겨눠 확대했을 때 허공으로 떨어진다.
    assert.equal(first.x, parent.x, `${count}개일 때 중심이 비었다`);
    assert.equal(first.y, parent.y);
    assert.ok(first.radius > 0);
  }

  assert.equal(placeChildren(parent, [1, 1, 1]).length, 3);
});

test('많이 달린 쪽이 더 크다 — 다만 이웃을 삼키지는 않는다', () => {
  const placed = placeChildren(parent, [2.2, 1, 1, 1, 1, 1]);

  assert.ok(placed[0].radius > placed[1].radius);
  // 크기 차이는 두 배를 넘지 않는다(하한 0.55) — 넘으면 작은 쪽이 점으로 사라진다.
  assert.ok(placed[0].radius / placed[1].radius < 2);
});

test('행성 층(sizeFloor 0)은 비율이 그대로 통과한다 — 항성이 진짜로 제일 크다', () => {
  const scales = [1, 0.25, 0.25, 0.25, 0.25, 0.25];
  const guarded = placeChildren(parent, scales);
  const ratio = placeChildren(parent, scales, { sizeFloor: 0 });

  ratio.forEach((placement, index) => {
    assert.equal(placement.x, guarded[index].x);
    assert.equal(placement.y, guarded[index].y);
  });

  assert.ok(guarded[0].radius / guarded[1].radius < 2);
  assert.ok(ratio[0].radius / ratio[1].radius > 3);
  assert.equal(ratio[0].radius, guarded[0].radius);
});

test('해상: 작을 땐 뭉쳐 있고, 커질수록 풀린다', () => {
  assert.equal(resolveProgress(BODY_RESOLVE_PX), 0);
  assert.equal(resolveProgress(BODY_RESOLVED_PX), 1);
  assert.equal(resolveProgress(10_000), 1);
  assert.equal(resolveProgress(Number.NaN), 0);

  const mid = resolveProgress((BODY_RESOLVE_PX + BODY_RESOLVED_PX) / 2);
  assert.ok(mid > 0.49 && mid < 0.51);
});

test('풀려도 뭉침의 흔적은 남고, 이름은 먼저 물러난다', () => {
  assert.equal(cloudOpacity(0), 1);
  assert.ok(cloudOpacity(1) > 0.1 && cloudOpacity(1) < 0.2);
  // 이름은 완전히 풀리기 전에 사라진다 — 안쪽 이름과 겹쳐 읽히는 구간을 없앤다.
  assert.equal(labelOpacity(0), 1);
  assert.equal(labelOpacity(0.6), 0);
  assert.equal(labelOpacity(1), 0);
});

test('세계 크기는 화면과 무관하다 — 화면이 바뀌어도 좌표가 움직이면 안 된다', () => {
  // 이게 화면에서 나오면, 키보드가 올라오거나 기기를 돌리는 순간 모든 천체가 한꺼번에
  // 다시 계산되는데 카메라는 그대로라, 보고 있던 것이 화면 밖으로 날아간다.
  const small = placeChildren({ x: 0, y: 0, z: 0, radius: UNIVERSE_ROOT_RADIUS }, [2, 1, 1, 1]);
  const large = placeChildren({ x: 0, y: 0, z: 0, radius: UNIVERSE_ROOT_RADIUS }, [2, 1, 1, 1]);
  assert.deepEqual(small, large);

  // 화면에 맞추는 일은 배율이 한다.
  const fit = fitZoomFor(390, 620);
  assert.ok(UNIVERSE_ROOT_RADIUS * fit < 390 / 2);
  assert.ok(UNIVERSE_ROOT_RADIUS * fit > 390 / 2 - 40);
  // 크기를 못 재는 순간(레이아웃 전)에도 안전한 값이 나와야 한다.
  assert.equal(fitZoomFor(0, 0), 1);
});

test('배율 한계는 배수로 잰다 — 어느 화면에서도 체감이 같게', () => {
  assert.ok(UNIVERSE_MIN_ZOOM_FACTOR < 1);
  // 나라에서 한 사람까지 4겹을 파고들 만큼은 되어야 한다.
  assert.ok(UNIVERSE_MAX_ZOOM_FACTOR > 200);
});

test('겨냥한 천체는 화면을 채운다', () => {
  const radius = 3;
  const zoom = zoomToFrame(radius, 390, 600);
  assert.ok(radius * zoom > 100 && radius * zoom < 195);
  assert.equal(zoomToFrame(0, 390, 600), 1);
});
