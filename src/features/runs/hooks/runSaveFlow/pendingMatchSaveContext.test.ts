import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearLocalGoalFreeze,
  getLocalGoalFreeze,
  recordLocalGoalFreezeOnce,
  __resetLocalGoalFreezesForTest,
} from '@/features/runs/sync/localGoalFreezeStore';
import { applyGoalFreezeToDisplayedSnapshot } from './goalFreezeClamp';
import {
  clearPendingMatchSaveContext,
  getPendingMatchSaveContext,
  resolvePendingMatchSaveFallbacks,
  setPendingMatchSaveContext,
  type PendingMatchSaveContext,
} from './pendingMatchSaveContext';

const sampleContext: PendingMatchSaveContext = {
  matchId: 'match-77',
  mode: 'duel',
  matchSource: 'party',
  matchResult: {
    mode: 'duel',
    title: '대결에서 이겼어요',
    summary: '요약',
    badgeLabel: '승리',
    resultTone: 'win',
    matchId: 'match-77',
  },
};

test('set/get/clear round-trips the pending match-save context', () => {
  clearPendingMatchSaveContext();
  assert.equal(getPendingMatchSaveContext(), null);

  setPendingMatchSaveContext(sampleContext);
  assert.deepEqual(getPendingMatchSaveContext(), sampleContext);

  // Save success (runCleanupAfterSave) and both discard paths call this clear.
  clearPendingMatchSaveContext();
  assert.equal(getPendingMatchSaveContext(), null);
});

test('fallback resolution restores matchId/matchResult/matchSource after the runtime is wiped', () => {
  clearPendingMatchSaveContext();
  setPendingMatchSaveContext(sampleContext);

  // The failed-save retry: duel/group statuses and trackedMatchResult are gone (the failure
  // path wiped the match runtime), so live resolution yields nothing.
  const resolved = resolvePendingMatchSaveFallbacks({
    liveMatchId: null,
    liveMatchResult: undefined,
    liveMatchSource: 'official',
    pendingContext: getPendingMatchSaveContext(),
  });

  assert.equal(resolved.activeMatchId, 'match-77');
  assert.deepEqual(resolved.resolvedMatchResult, sampleContext.matchResult);
  // Party-ness survives the wipe: without it a party-run retry would leak into ranked 전적.
  assert.equal(resolved.matchSource, 'party');

  clearPendingMatchSaveContext();
});

test('live runtime always wins over a stale pending context', () => {
  clearPendingMatchSaveContext();
  setPendingMatchSaveContext(sampleContext);

  const liveResult = {
    mode: 'duel' as const,
    title: '새 대결',
    summary: '요약',
    badgeLabel: '승리',
    resultTone: 'win' as const,
    matchId: 'match-88',
  };
  const resolved = resolvePendingMatchSaveFallbacks({
    liveMatchId: 'match-88',
    liveMatchResult: liveResult,
    liveMatchSource: 'official',
    pendingContext: getPendingMatchSaveContext(),
  });

  assert.equal(resolved.activeMatchId, 'match-88');
  assert.deepEqual(resolved.resolvedMatchResult, liveResult);
  assert.equal(resolved.matchSource, 'official');

  clearPendingMatchSaveContext();
});

test('FIX-2: a pending context from a DIFFERENT match never backfills the live match result', () => {
  clearPendingMatchSaveContext();
  setPendingMatchSaveContext(sampleContext); // match-77

  // New match is live (match-88) but its own result has not resolved yet — the stale
  // match-77 verdict must NOT attach to it.
  const resolved = resolvePendingMatchSaveFallbacks({
    liveMatchId: 'match-88',
    liveMatchResult: undefined,
    liveMatchSource: 'official',
    pendingContext: getPendingMatchSaveContext(),
  });

  assert.equal(resolved.activeMatchId, 'match-88');
  assert.equal(resolved.resolvedMatchResult, undefined);
  assert.equal(resolved.matchSource, 'official');

  clearPendingMatchSaveContext();
});

test('FIX-2: the pending matchResult still backfills when it belongs to the live match', () => {
  clearPendingMatchSaveContext();
  setPendingMatchSaveContext(sampleContext); // match-77

  // Same match retried while the runtime still knows the matchId but lost the result.
  const resolved = resolvePendingMatchSaveFallbacks({
    liveMatchId: 'match-77',
    liveMatchResult: undefined,
    liveMatchSource: 'party',
    pendingContext: getPendingMatchSaveContext(),
  });

  assert.equal(resolved.activeMatchId, 'match-77');
  assert.deepEqual(resolved.resolvedMatchResult, sampleContext.matchResult);

  clearPendingMatchSaveContext();
});

test('FIX-A tier 3: a live goal freeze restores the matchId after a full runtime wipe', () => {
  clearPendingMatchSaveContext();

  // Runtime wiped BEFORE any save attempt (the 7/9 mid-run vanish demotion): no live match,
  // no pending context — only the freeze recorded at the crossing survives.
  const resolved = resolvePendingMatchSaveFallbacks({
    liveMatchId: null,
    liveMatchResult: undefined,
    liveMatchSource: 'official',
    pendingContext: null,
    goalFreezes: [{
      matchId: 'match-99',
      crossedAtIso: '2026-07-09T00:35:00.000Z',
      mode: 'duel',
      matchSource: 'official',
    }],
    runStartedAtIso: '2026-07-08T23:55:00.000Z',
  });

  assert.equal(resolved.activeMatchId, 'match-99');
  assert.equal(resolved.resolvedMatchResult, null);
  assert.equal(resolved.matchSource, 'official');
  assert.equal(resolved.matchModeFallback, 'duel');
});

test('ZOMBIE GATE: a freeze crossed BEFORE this run started never claims the save', () => {
  // The 7/9 incident device still holds the old 40:30/7.01 freeze; a later pure solo run
  // must save as solo — not adopt the dead matchId (and its clamp).
  const resolved = resolvePendingMatchSaveFallbacks({
    liveMatchId: null,
    liveMatchResult: undefined,
    liveMatchSource: 'official',
    pendingContext: null,
    goalFreezes: [{
      matchId: 'match-dead',
      crossedAtIso: '2026-07-09T00:35:00.000Z',
      mode: 'duel',
      matchSource: 'official',
    }],
    runStartedAtIso: '2026-07-10T10:00:00.000Z',
  });

  assert.equal(resolved.activeMatchId, null);
  assert.equal(resolved.matchSource, 'official');
});

test('ZOMBIE GATE: no provable run window disables the freeze tier outright', () => {
  const noWindow = resolvePendingMatchSaveFallbacks({
    liveMatchId: null,
    liveMatchResult: undefined,
    liveMatchSource: 'official',
    pendingContext: null,
    goalFreezes: [{
      matchId: 'match-99',
      crossedAtIso: '2026-07-09T00:35:00.000Z',
      mode: 'duel',
      matchSource: 'official',
    }],
  });
  assert.equal(noWindow.activeMatchId, null);

  const unparseable = resolvePendingMatchSaveFallbacks({
    liveMatchId: null,
    liveMatchResult: undefined,
    liveMatchSource: 'official',
    pendingContext: null,
    goalFreezes: [{
      matchId: 'match-99',
      crossedAtIso: '2026-07-09T00:35:00.000Z',
      mode: 'duel',
      matchSource: 'official',
    }],
    runStartedAtIso: 'not-a-date',
  });
  assert.equal(unparseable.activeMatchId, null);
});

test('FIX-A tier 3: the most recent crossing wins when several freezes linger', () => {
  const resolved = resolvePendingMatchSaveFallbacks({
    liveMatchId: null,
    liveMatchResult: undefined,
    liveMatchSource: 'official',
    pendingContext: null,
    goalFreezes: [
      { matchId: 'match-old', crossedAtIso: '2026-07-08T00:00:00.000Z', mode: 'duel', matchSource: 'official' },
      { matchId: 'match-new', crossedAtIso: '2026-07-09T00:35:00.000Z', mode: 'group', matchSource: 'party' },
    ],
    runStartedAtIso: '2026-07-07T23:00:00.000Z',
  });

  assert.equal(resolved.activeMatchId, 'match-new');
  assert.equal(resolved.matchModeFallback, 'group');
  assert.equal(resolved.matchSource, 'party');
});

test('FIX-A tier 3: source is never upgraded to official — party latch and unproven sources stay party', () => {
  // In-session party latch (liveMatchSource) beats a freeze that recorded 'official'.
  const latched = resolvePendingMatchSaveFallbacks({
    liveMatchId: null,
    liveMatchResult: undefined,
    liveMatchSource: 'party',
    pendingContext: null,
    goalFreezes: [{ matchId: 'match-99', crossedAtIso: '2026-07-09T00:35:00.000Z', mode: 'duel', matchSource: 'official' }],
    runStartedAtIso: '2026-07-08T23:55:00.000Z',
  });
  assert.equal(latched.matchSource, 'party');

  // A pre-OTA freeze without a recorded source cannot prove official → label 'party'.
  const unproven = resolvePendingMatchSaveFallbacks({
    liveMatchId: null,
    liveMatchResult: undefined,
    liveMatchSource: 'official',
    pendingContext: null,
    goalFreezes: [{ matchId: 'match-99', crossedAtIso: '2026-07-09T00:35:00.000Z' }],
    runStartedAtIso: '2026-07-08T23:55:00.000Z',
  });
  assert.equal(unproven.matchSource, 'party');
  assert.equal(unproven.activeMatchId, 'match-99');
  assert.equal(unproven.matchModeFallback, null);
});

test('FIX-A tier 3: live match and pending context both still win over the freeze', () => {
  clearPendingMatchSaveContext();
  setPendingMatchSaveContext(sampleContext); // match-77

  const pendingWins = resolvePendingMatchSaveFallbacks({
    liveMatchId: null,
    liveMatchResult: undefined,
    liveMatchSource: 'official',
    pendingContext: getPendingMatchSaveContext(),
    goalFreezes: [{ matchId: 'match-99', crossedAtIso: '2026-07-09T00:35:00.000Z', mode: 'duel', matchSource: 'official' }],
  });
  assert.equal(pendingWins.activeMatchId, 'match-77');

  const liveWins = resolvePendingMatchSaveFallbacks({
    liveMatchId: 'match-88',
    liveMatchResult: undefined,
    liveMatchSource: 'official',
    pendingContext: null,
    goalFreezes: [{ matchId: 'match-99', crossedAtIso: '2026-07-09T00:35:00.000Z', mode: 'duel', matchSource: 'official' }],
  });
  assert.equal(liveWins.activeMatchId, 'match-88');

  clearPendingMatchSaveContext();
});

test('no live match and no pending context resolves to a plain solo save', () => {
  clearPendingMatchSaveContext();

  const resolved = resolvePendingMatchSaveFallbacks({
    liveMatchId: null,
    liveMatchResult: undefined,
    liveMatchSource: 'official',
    pendingContext: null,
  });

  assert.equal(resolved.activeMatchId, null);
  assert.equal(resolved.resolvedMatchResult, undefined);
  assert.equal(resolved.matchSource, 'official');
});

test('freeze-clear precondition: the retry re-threads the matchId so the goal freeze clamp reapplies and success can release it', () => {
  __resetLocalGoalFreezesForTest();
  clearPendingMatchSaveContext();

  // The goal was crossed for this match → a freeze exists, keyed by matchId.
  recordLocalGoalFreezeOnce({
    matchId: 'match-77',
    elapsedSeconds: 600,
    distanceKm: 2.0,
    pace: '05:00/km',
    crossedAtIso: '2026-07-07T00:10:00.000Z',
  });
  setPendingMatchSaveContext(sampleContext);

  // Save failed → runtime wiped → retry. Without the pending fallback the retry would save
  // with activeMatchId=null: the clamp would never reapply AND the freeze could never be
  // cleared on success (freeze is cleared ONLY by save success keyed to this matchId, or a
  // discard).
  const resolved = resolvePendingMatchSaveFallbacks({
    liveMatchId: null,
    liveMatchResult: undefined,
    liveMatchSource: 'official',
    pendingContext: getPendingMatchSaveContext(),
  });
  assert.equal(resolved.activeMatchId, 'match-77');

  const freeze = resolved.activeMatchId ? getLocalGoalFreeze(resolved.activeMatchId) : null;
  assert.ok(freeze, 'the retry must find the freeze via the restored matchId');

  // The clamp reapplies exactly as on the original attempt (min-only).
  const clamped = applyGoalFreezeToDisplayedSnapshot(
    {
      route: [],
      distanceKm: 2.4,
      elevationGainM: 3,
      currentPace: '05:10/km',
      elapsedSeconds: 700,
    },
    freeze,
  );
  assert.equal(clamped.elapsedSeconds, 600);
  assert.equal(clamped.distanceKm, 2.0);

  // Save success then clears BOTH via runCleanupAfterSave (clearLocalGoalFreeze(activeMatchId)
  // + clearPendingMatchSaveContext) — the freeze is released only now.
  clearLocalGoalFreeze(resolved.activeMatchId!);
  clearPendingMatchSaveContext();
  assert.equal(getLocalGoalFreeze('match-77'), null);
  assert.equal(getPendingMatchSaveContext(), null);

  __resetLocalGoalFreezesForTest();
});
