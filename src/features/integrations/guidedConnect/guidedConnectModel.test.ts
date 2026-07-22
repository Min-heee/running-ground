import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGuidedSteps,
  getGuidedAppsForPlatform,
  getHubLabel,
} from './guidedConnectModel';

test('platform chip lists: iOS gets 애플워치 first, Android gets 삼성헬스 first — never each other', () => {
  const iosApps = getGuidedAppsForPlatform('ios').map((app) => app.id);
  const androidApps = getGuidedAppsForPlatform('android').map((app) => app.id);

  assert.deepEqual(iosApps, ['apple_watch', 'nrc', 'strava', 'garmin']);
  assert.deepEqual(androidApps, ['samsung_health', 'nrc', 'strava', 'garmin']);
});

test('strava on iOS: 3 numbered steps with the app route, permission, import', () => {
  const steps = buildGuidedSteps('strava', 'ios');

  assert.deepEqual(steps.map((step) => [step.number, step.key]), [
    [1, 'route'],
    [2, 'permission'],
    [3, 'import'],
  ]);
  assert.ok(steps[0].title.includes('스트라바'));
  assert.ok(steps[0].title.includes('Apple 건강'));
  // 2026-07 Strava menu (owner-verified screenshots): app/device connections
  // live under 앱 및 기기 관리, NOT the retired '응용 프로그램, 서비스 및 기기'.
  assert.ok(steps[0].menuPathText?.includes('앱 및 기기 관리'));
  assert.ok(!steps[0].menuPathText?.includes('응용 프로그램'));
  // Version-proof OS fallback: the iPhone Health write switch never moves.
  assert.ok(steps[0].fallbackNote?.includes('iPhone 설정'));
  assert.equal(steps[0].appScheme, 'strava://');
  assert.ok(steps[1].title.includes('Apple 건강 읽기 허용'));
});

test('apple watch: route step is informational (no menu path) and steps still number 1..3', () => {
  const steps = buildGuidedSteps('apple_watch', 'ios');

  assert.equal(steps.length, 3);
  assert.equal(steps[0].key, 'route');
  assert.equal(steps[0].menuPathText, undefined);
  assert.ok(steps[0].description.includes('자동으로'));
  assert.deepEqual(steps.map((step) => step.number), [1, 2, 3]);
});

test('android steps talk about 헬스 커넥트, never Apple 건강', () => {
  assert.equal(getHubLabel('android'), '헬스 커넥트');
  const steps = buildGuidedSteps('strava', 'android');

  for (const step of steps) {
    assert.ok(!`${step.title}${step.description}`.includes('Apple 건강'));
  }
  assert.ok(steps[0].title.includes('헬스 커넥트'));
  // No reliable Android scheme for Strava — the store link is the open action.
  assert.equal(steps[0].appScheme, undefined);
  assert.ok(steps[0].storeUrl?.includes('play.google.com'));
});

test('every route guide ships a store url and a non-empty menu path', () => {
  for (const platform of ['ios', 'android'] as const) {
    for (const app of getGuidedAppsForPlatform(platform)) {
      const [route] = buildGuidedSteps(app.id, platform);
      assert.equal(route.key, 'route');
      if (route.menuPathText !== undefined) {
        assert.ok(route.menuPathText.length > 0, `${app.id}/${platform} menu path`);
        assert.ok(route.storeUrl && route.storeUrl.startsWith('https://'), `${app.id}/${platform} store url`);
      }
    }
  }
});

test('source matchers pick the right app records on both platforms', () => {
  const { matchesGuidedAppSource } = require('./guidedConnectModel') as typeof import('./guidedConnectModel');

  // iOS display names
  assert.equal(matchesGuidedAppSource('strava', 'Strava'), true);
  assert.equal(matchesGuidedAppSource('nrc', 'NRC'), true);
  assert.equal(matchesGuidedAppSource('nrc', 'Nike Run Club'), true);
  assert.equal(matchesGuidedAppSource('apple_watch', '병희의 Apple Watch'), true);
  assert.equal(matchesGuidedAppSource('garmin', 'Connect'), true);
  assert.equal(matchesGuidedAppSource('garmin', 'Garmin Connect'), true);

  // Android package names
  assert.equal(matchesGuidedAppSource('strava', 'com.strava'), true);
  assert.equal(matchesGuidedAppSource('nrc', 'com.nike.plusgps'), true);
  assert.equal(matchesGuidedAppSource('samsung_health', 'com.sec.android.app.shealth'), true);
  assert.equal(matchesGuidedAppSource('garmin', 'com.garmin.android.apps.connectmobile'), true);

  // Cross-app leakage must not happen
  assert.equal(matchesGuidedAppSource('strava', 'NRC'), false);
  assert.equal(matchesGuidedAppSource('apple_watch', 'Strava'), false);
  // Android's generic 'Health Connect' fallback label belongs to NO app —
  // garmin's exact-match 'connect' pattern must not swallow it.
  assert.equal(matchesGuidedAppSource('garmin', 'Health Connect'), false);
  assert.equal(matchesGuidedAppSource('strava', undefined), false);
});

test('import source filter carries the app label and matcher', () => {
  const { getGuidedImportSourceFilter } = require('./guidedConnectModel') as typeof import('./guidedConnectModel');
  const filter = getGuidedImportSourceFilter('strava');

  assert.equal(filter.label, '스트라바');
  assert.equal(filter.matches('Strava'), true);
  assert.equal(filter.matches('병희의 Apple Watch'), false);
});
