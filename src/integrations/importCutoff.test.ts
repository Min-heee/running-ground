import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IMPORT_MIN_RUN_DATE,
  appendPreLaunchSkipNotice,
  buildAllPreLaunchImportMessage,
  buildPreLaunchSkipNotice,
  didSkipAllFetchedRunsAsPreLaunch,
  isPreLaunchImportRunDate,
  partitionRunsByLaunchCutoff,
} from './importCutoff';

test('client cutoff mirrors the server launch date (backend/src/lib/integrationImportCutoff.mjs)', () => {
  assert.equal(IMPORT_MIN_RUN_DATE, '2026-07-13');
});

test('runs dated before launch are pre-launch, on/after launch are not', () => {
  assert.equal(isPreLaunchImportRunDate('2026-07-12'), true);
  assert.equal(isPreLaunchImportRunDate('2020-01-01'), true);
  assert.equal(isPreLaunchImportRunDate('2026-07-13'), false);
  assert.equal(isPreLaunchImportRunDate('2026-07-14'), false);
});

test('partition keeps on/after-launch runs in order and counts skipped ones', () => {
  const { importableRuns, skippedPreLaunchRuns } = partitionRunsByLaunchCutoff([
    { date: '2026-07-12' },
    { date: '2026-07-13' },
    { date: '2023-09-01' },
    { date: '2026-07-20' },
  ]);

  assert.deepEqual(importableRuns.map((run) => run.date), ['2026-07-13', '2026-07-20']);
  assert.equal(skippedPreLaunchRuns, 2);
});

test('all-pre-launch detection needs at least one fetched run', () => {
  assert.equal(didSkipAllFetchedRunsAsPreLaunch({ fetchedRuns: 3, skippedPreLaunchRuns: 3 }), true);
  assert.equal(didSkipAllFetchedRunsAsPreLaunch({ fetchedRuns: 3, skippedPreLaunchRuns: 2 }), false);
  // fetchedRuns 0 means the device returned nothing — that case must keep the
  // permission guidance, not the cutoff message.
  assert.equal(didSkipAllFetchedRunsAsPreLaunch({ fetchedRuns: 0, skippedPreLaunchRuns: 0 }), false);
});

test('partial-skip notice names the launch date, the count, and the policy in 존댓말', () => {
  const notice = buildPreLaunchSkipNotice(4);

  assert.equal(notice, '출시(2026-07-13) 이전 기록 4개는 가져오지 않았어요 — 러닝스페이스는 출시 이후 기록만 반영해요.');
});

test('all-pre-launch 0-import message explains the cutoff instead of permissions', () => {
  const message = buildAllPreLaunchImportMessage(7);

  assert.equal(message, '기기에서 읽은 7개가 모두 출시(2026-07-13) 이전 기록이라 가져오지 않았어요 — 러닝스페이스는 출시 이후 기록만 반영해요.');
  // Must never read like the permission-guidance copy (설정/권한 안내).
  assert.doesNotMatch(message, /권한|설정/);
});

test('skip notice is appended only when records were actually skipped', () => {
  const base = 'Apple Health에서 5개 기록을 읽었고, 3개를 새로 반영했어요.';

  assert.equal(appendPreLaunchSkipNotice(base, 0), base);
  assert.equal(
    appendPreLaunchSkipNotice(base, 2),
    `${base} 출시(2026-07-13) 이전 기록 2개는 가져오지 않았어요 — 러닝스페이스는 출시 이후 기록만 반영해요.`,
  );
});
