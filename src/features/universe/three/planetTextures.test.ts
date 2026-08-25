import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCloudTexture,
  getPlanetMask,
  getPlanetSurface,
  getStarSurface,
  pendingTextureBakeCount,
  resetPlanetTexturesForTest,
  stepTextureBakes,
} from './planetTextures';

// 행 단위 재개형 베이크 (2026-08-26): 어떤 마감으로 몇 번에 나눠 굽든, 통째로 구운 것과
// **한 바이트도** 달라선 안 된다 — 텍스처가 곧 화면이다.

function drainFully(): number {
  let iterations = 0;

  while (pendingTextureBakeCount() > 0) {
    stepTextureBakes(Date.now() + 2);
    iterations += 1;
    assert.ok(iterations < 20_000, '펌프는 유한 시간 안에 반드시 끝난다');
  }

  return iterations;
}

function bytes(texture: { image: { data: unknown } }): Buffer {
  return Buffer.from(texture.image.data as Uint8Array);
}

test('조각 굽기와 통 굽기의 결과는 바이트 단위로 같다', () => {
  resetPlanetTexturesForTest();
  drainFully();
  const slicedSurface = bytes(getPlanetSurface('terrestrial', 0));
  const slicedMask = bytes(getPlanetMask(0));
  const slicedStar = bytes(getStarSurface());
  const slicedCloud = bytes(getCloudTexture());

  resetPlanetTexturesForTest();
  const wholeSurface = bytes(getPlanetSurface('terrestrial', 0));
  const wholeMask = bytes(getPlanetMask(0));
  const wholeStar = bytes(getStarSurface());
  const wholeCloud = bytes(getCloudTexture());

  assert.equal(Buffer.compare(slicedSurface, wholeSurface), 0, 'terrestrial surface');
  assert.equal(Buffer.compare(slicedMask, wholeMask), 0, 'city/water mask');
  assert.equal(Buffer.compare(slicedStar, wholeStar), 0, 'star surface');
  assert.equal(Buffer.compare(slicedCloud, wholeCloud), 0, 'cloud layer');
});

test('펌프는 콜드 스타트에서 유한 스텝으로 0까지 내려가고, 그 뒤 게터는 전부 캐시다', () => {
  resetPlanetTexturesForTest();
  assert.ok(pendingTextureBakeCount() > 20, '콜드 스타트엔 하늘+행성류가 전부 대기 중');

  const iterations = drainFully();
  assert.ok(iterations > 1, '2ms 마감이면 반드시 여러 번에 나뉜다 (통베이크가 아니라는 증거)');
  assert.equal(pendingTextureBakeCount(), 0);

  const before = Date.now();
  getPlanetSurface('gas', 1);
  getStarSurface();
  assert.ok(Date.now() - before <= 50, '드레인 후의 게터는 캐시 반환이라 즉답이다 (베이크면 300ms+)');
});

test('부분 진행 중 게터를 부르면 하던 조각을 이어 완성한다 — 이중 작업 없음, 결과 동일', () => {
  resetPlanetTexturesForTest();
  // 하늘(작은 것들)을 지나 무거운 표면 어딘가까지 조금만 전진시킨다.
  for (let index = 0; index < 30; index += 1) {
    stepTextureBakes(Date.now() + 1);
  }

  const partial = bytes(getPlanetSurface('terrestrial', 1));

  resetPlanetTexturesForTest();
  const whole = bytes(getPlanetSurface('terrestrial', 1));

  assert.equal(Buffer.compare(partial, whole), 0);
});
