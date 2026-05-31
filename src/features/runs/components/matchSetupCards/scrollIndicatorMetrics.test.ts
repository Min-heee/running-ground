import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveScrollIndicatorMetrics } from './scrollIndicatorMetrics';

test('scroll indicator hides when content does not overflow', () => {
  const metrics = resolveScrollIndicatorMetrics({
    contentWidth: 240,
    visibleWidth: 240,
    trackWidth: 120,
  });

  assert.equal(metrics.visible, false);
  assert.equal(metrics.thumbWidth, 0);
  assert.equal(metrics.maxScroll, 0);
  assert.equal(metrics.maxThumbTranslateX, 0);
});

test('scroll indicator maps half-visible content to a half-width thumb', () => {
  const metrics = resolveScrollIndicatorMetrics({
    contentWidth: 400,
    visibleWidth: 200,
    trackWidth: 120,
  });

  assert.equal(metrics.visible, true);
  assert.equal(metrics.thumbWidth, 60);
  assert.equal(metrics.maxScroll, 200);
  assert.equal(metrics.maxThumbTranslateX, 60);
});

test('scroll indicator clamps tiny proportional thumbs to the minimum width', () => {
  const metrics = resolveScrollIndicatorMetrics({
    contentWidth: 1000,
    visibleWidth: 100,
    trackWidth: 120,
    minThumbWidth: 32,
  });

  assert.equal(metrics.visible, true);
  assert.equal(metrics.thumbWidth, 32);
  assert.equal(metrics.maxScroll, 900);
  assert.equal(metrics.maxThumbTranslateX, 88);
});

test('scroll indicator handles invalid and negative dimensions safely', () => {
  const invalid = resolveScrollIndicatorMetrics({
    contentWidth: Number.NaN,
    visibleWidth: 100,
    trackWidth: 120,
  });
  const negative = resolveScrollIndicatorMetrics({
    contentWidth: -100,
    visibleWidth: -20,
    trackWidth: -1,
  });

  assert.equal(invalid.visible, false);
  assert.equal(invalid.thumbWidth, 0);
  assert.equal(negative.visible, false);
  assert.equal(negative.maxScroll, 0);
});
