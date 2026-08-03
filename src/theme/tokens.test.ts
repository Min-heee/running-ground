import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyThemePalette,
  colors,
  DEFAULT_THEME_MODE,
  fixedColors,
  getAppliedThemeMode,
  getThemePalettesForTest,
} from '@/theme/tokens';

test('light and dark palettes expose exactly the same token keys', () => {
  const { light, dark } = getThemePalettesForTest();
  assert.deepEqual(Object.keys(dark).sort(), Object.keys(light).sort());
});

test('default palette is light and fixedColors mirrors the light palette', () => {
  const { light } = getThemePalettesForTest();
  assert.equal(DEFAULT_THEME_MODE, 'light');
  // Fresh import state: `colors` must already hold the light palette (fresh installs
  // and every module imported before hydration bake light values).
  assert.equal(getAppliedThemeMode(), 'light');
  assert.equal(colors.surfaceApp, light.surfaceApp);
  assert.equal(colors.textPrimary, light.textPrimary);
  // fixedColors pins the CLASSIC light values, frozen — pinned chrome must stay
  // opaque and theme-independent regardless of the themed light palette's look.
  assert.equal(fixedColors.surface, '#FFFFFF');
  assert.equal(fixedColors.surfaceApp, '#F5F7FB');
  assert.equal(fixedColors.textPrimary, light.textPrimary);
  assert.deepEqual(Object.keys({ ...fixedColors }).sort(), Object.keys(light).sort());
  assert.ok(Object.isFrozen(fixedColors));
  // themed light palette is the TOSS-NEUTRAL variant (오너 2026-08-03, T2): gray field,
  // opaque white cards, transparent card edge (borderless look).
  assert.equal(light.surfaceApp, '#F2F4F6');
  assert.equal(light.surface, '#FFFFFF');
  assert.equal(light.cardEdge, 'transparent');
});

test('applyThemePalette mutates the shared colors object in place', () => {
  const { light, dark } = getThemePalettesForTest();
  const sameReference = colors;

  try {
    applyThemePalette('light');
    assert.equal(getAppliedThemeMode(), 'light');
    assert.equal(sameReference.surface, light.surface);
    assert.equal(sameReference.textPrimary, light.textPrimary);

    applyThemePalette('dark');
    assert.equal(getAppliedThemeMode(), 'dark');
    assert.equal(sameReference.surface, dark.surface);
    assert.equal(sameReference.textPrimary, dark.textPrimary);
  } finally {
    applyThemePalette(DEFAULT_THEME_MODE);
  }
});

test('deliberately constant tokens are identical across palettes', () => {
  const { light, dark } = getThemePalettesForTest();
  const mustStayConstant = [
    'white',
    'black',
    'brand',
    'brandLighter',
    'brandWashStrong',
    'dark',
    'darkMuted',
    'darkSoft',
    'night',
    'midnight',
    'slateDark',
    'navyInk',
    'indigoInk',
    'indigoDeep',
    'textPlaceholder',
    'borderNeutral',
    'borderCool',
    'blueWash',
    'dangerSurface',
    'dangerDeep',
    'dangerBorder',
    'translucentWhite18',
    'podiumGoldSoft',
    'podiumSilverSoft',
    'podiumBronzeSoft',
    'rankEliteSoft',
    'raceBoardRowBg',
  ] as const;

  for (const key of mustStayConstant) {
    assert.equal(dark[key], light[key], `token ${key} must not change with theme`);
  }
});

test('themed surface/text tokens actually differ between palettes', () => {
  const { light, dark } = getThemePalettesForTest();
  const mustDiffer = [
    'surface',
    'surfaceApp',
    'surfaceSoft',
    'surfaceSubtleAlt',
    'textPrimary',
    'textSecondary',
    'textMuted',
    'border',
    'borderMuted',
    'brandWash',
    'brandDeep',
    'successText',
    'danger',
    'inkPill',
  ] as const;

  for (const key of mustDiffer) {
    assert.notEqual(dark[key], light[key], `token ${key} should have a dark counterpart`);
  }
});
