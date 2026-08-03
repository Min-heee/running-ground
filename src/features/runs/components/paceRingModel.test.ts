// 페이스 링 계산의 계약: 3초당 한 칸, 빠르면 꽉 참, 워밍업은 0칸 + 안내.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PACE_RING_TICK_COUNT,
  buildPaceRingModel,
  parsePaceLabelSeconds,
  splitDistanceLabel,
} from './paceRingModel';

test('페이스 라벨 파싱: mm:ss만 읽고 나머지는 null', () => {
  assert.equal(parsePaceLabelSeconds('06:24/km'), 384);
  assert.equal(parsePaceLabelSeconds('6:33/km'), 393);
  assert.equal(parsePaceLabelSeconds('--:--/km'), null);
  assert.equal(parsePaceLabelSeconds(''), null);
  assert.equal(parsePaceLabelSeconds(null), null);
});

test('평균과 같거나 빠르면 링이 꽉 찬다', () => {
  assert.deepEqual(buildPaceRingModel('06:24/km', '06:24/km'), {
    tickCount: PACE_RING_TICK_COUNT,
    filledTicks: PACE_RING_TICK_COUNT,
    statusLine: '평균 페이스 그대로예요',
  });
  assert.deepEqual(buildPaceRingModel('06:24/km', '06:19/km'), {
    tickCount: PACE_RING_TICK_COUNT,
    filledTicks: PACE_RING_TICK_COUNT,
    statusLine: '평균보다 5초 빨라요',
  });
});

test('60초 넘는 갭은 분/초로 읽어준다', () => {
  assert.equal(buildPaceRingModel('06:00/km', '15:00/km').statusLine, '평균보다 9분 느려요');
  assert.equal(buildPaceRingModel('06:00/km', '07:30/km').statusLine, '평균보다 1분 30초 느려요');
  assert.equal(buildPaceRingModel('15:00/km', '06:00/km').statusLine, '평균보다 9분 빨라요');
});

test('느리면 3초당 한 칸씩 빈다 (9초 느림 → 17칸)', () => {
  const model = buildPaceRingModel('06:24/km', '06:33/km');
  assert.equal(model.filledTicks, 17);
  assert.equal(model.statusLine, '평균보다 9초 느려요');
});

test('60초 이상 느리면 전부 빈다', () => {
  assert.equal(buildPaceRingModel('06:00/km', '07:30/km').filledTicks, 0);
});

test('워밍업(현재 페이스 미측정)은 0칸 + 안내 문구', () => {
  const model = buildPaceRingModel('06:24/km', '--:--/km');
  assert.equal(model.filledTicks, 0);
  assert.equal(model.statusLine, '페이스를 재는 중이에요');
});

test('현재 페이스는 있는데 평균만 아직이면 문구를 가른다 — 화면과 모순되지 않게', () => {
  const model = buildPaceRingModel('--:--/km', '06:33/km');
  assert.equal(model.filledTicks, 0);
  assert.equal(model.statusLine, '평균 페이스를 계산 중이에요');
});

test('거리 라벨 분해: 숫자와 단위를 나눈다', () => {
  assert.deepEqual(splitDistanceLabel('4.91km'), { number: '4.91', unit: 'km' });
  assert.deepEqual(splitDistanceLabel('0.00km'), { number: '0.00', unit: 'km' });
});
