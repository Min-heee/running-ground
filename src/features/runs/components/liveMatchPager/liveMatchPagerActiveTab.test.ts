import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSyncedActiveTab } from '@/features/runs/components/liveMatchPager/liveMatchPagerActiveTab';

test('local active tab stays put once the deferred page commit catches up', () => {
  // A synchronous tab press optimistically set the local highlight to 1 before
  // the (deferred) page prop moved. Once page === local, the sync effect must
  // leave the highlight where the press already put it.
  assert.equal(resolveSyncedActiveTab(1, 1), 1);
});

test('local active tab follows an external page change (auto-switch to 결과 보기)', () => {
  // Finish auto-switches the page to 3 (결과 보기) WITHOUT a tab press. The local
  // highlight is still on the last tapped tab; the sync effect must snap it onto
  // the real page so the highlight is never stranded behind an external change.
  assert.equal(resolveSyncedActiveTab(0, 3), 3);
});

test('local active tab follows an external page change in either direction', () => {
  // An iOS swipe back, or a remount that resets page, is also external: whenever
  // the local value and the real page disagree, the page wins.
  assert.equal(resolveSyncedActiveTab(3, 0), 0);
  assert.equal(resolveSyncedActiveTab(2, 1), 1);
});

test('already-synced local active tab is returned unchanged', () => {
  // No-op case: nothing diverged, so the highlight is left exactly as-is.
  assert.equal(resolveSyncedActiveTab(2, 2), 2);
  assert.equal(resolveSyncedActiveTab(0, 0), 0);
});
