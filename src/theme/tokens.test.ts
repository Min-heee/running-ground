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
  // fixedColors is the light palette, frozen — pinned chrome renders today's values.
  assert.deepEqual({ ...fixedColors }, { ...light });
  assert.ok(Object.isFrozen(fixedColors));
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
