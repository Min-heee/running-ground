import assert from 'node:assert/strict';
import test from 'node:test';

// SEAL REVISION contract (fair-verdict design 2026-07-05 §2/§4): the §B4 fallback seal is a
// PROVISIONAL verdict for a bounded 10-minute revision window; a sealed-DNF runner's plausible
// late finish ANNULS the seal and measured-elapsed truth re-resolves (winner flips at most
// once); LP + result notifications + the saved-run back-fill are deferred to FINALIZATION
// (window close, or every-participant-done); beyond the window the late push downgrades
// byte-identically to the pre-revision behavior.
//
// Timeline control: the progress/leave handlers read the REAL clock internally, so "later"
// moments are simulated by REWINDING the session's absolute timestamps (seal resolvedAt,
// startedAt, finishedAt) — which is also exactly what makes the mechanism restart-durable —
// while sweep-driven moments use sweepStuckMatchSessionFallbacks' explicit `now` parameter.
//
// Importing matchActionHandlers registers the seal-finalization LP applier and importing
// matchResultBuilders registers the saved-run back-fill (both module-init injections), exactly
// as the real server wires them.
import {
  MATCH_DUEL_FINISH_FALLBACK_MS,
  MATCH_SEAL_REVISION_WINDOW_MS,
  MATCH_SESSION_ALL_DONE_RETENTION_MS,
} from './matchConstants.mjs';
import { DUEL_LP } from './rankSystem.mjs';
import {
  leaveRunningMatch,
  resetProgressPruneThrottle,
  updateRunningMatchProgress,
} from './matchActionHandlers.mjs';
import {
  buildMatchResultByMatchId,
  resolveSavedDuelMatchResult,
} from './matchResultBuilders.mjs';
import {
  buildDuelVerdict,
  buildGroupVerdict,
  buildOfficialSessionStandings,
  isParticipantGroupSealedDnf,
  isParticipantSealedDnf,
  pruneMatchSessions,
  sweepStuckMatchSessionFallbacks,
} from './runningMatchSessionStoreHelpers.mjs';
import { isSealWithinRevisionWindow } from './runningMatchSession/matchSessionFallbackSeals.mjs';

function iso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

const BASE_LP = 50;

function createUser(id) {
  return {
    id,
    username: id,
    name: id,
    realName: id,
    publicTag: id,
    provinceName: '경기도',
    cityName: '고양시',
    districtName: '일산서구',
    connectedSources: [],
    notificationSettings: {
      friendAlerts: true,
      districtAlerts: true,
      marketAlerts: true,
    },
    rankState: { tier: '입문', lp: BASE_LP },
    createdAt: iso(-24 * 60 * 60 * 1000),
  };
}

// A profile run so buildMatchRunnerProfile derives the SAME average pace for every runner
// (similar pace → deterministic DUEL_LP.winVsSimilar/loss deltas in every LP pin).
function createProfileRun(userId) {
  return {
    id: `${userId}-profile-run`,
    userId,
    date: iso(-24 * 60 * 60 * 1000).slice(0, 10),
    distanceKm: 5,
    pace: '06:00/km',
    source: 'RunningGround',
    // Match surfaces read the COMPETITIVE-only runner profile — fixture runs must
    // be app-tracked or the pace falls back to the neutral 5.5.
    sourceType: 'runningground',
    startedAt: iso(-24 * 60 * 60 * 1000),
    endedAt: iso(-24 * 60 * 60 * 1000 + 30 * 60 * 1000),
    durationSeconds: 30 * 60,
    createdAt: iso(-24 * 60 * 60 * 1000),
  };
}

// The PENDING blob a device persists when it saves during the window — byte-shaped like the
// save-path resolver's toPendingDuelMatchResult output (no resultTone, 집계 중 badge). The
// run-level pace matches the profile run so the rank-LP pace-similarity comparison stays
// symmetric no matter which side seeded a blob.
function pendingDuelBlobRun(runId, userId, matchId, myDurationSeconds) {
  const startedAt = iso(-40 * 60 * 1000);
  return {
    id: runId,
    userId,
    date: startedAt.slice(0, 10),
    distanceKm: 5,
    pace: '06:00/km',
    source: 'RunningGround',
    sourceType: 'tracked',
    startedAt,
    endedAt: iso(-39 * 60 * 1000),
    durationSeconds: myDurationSeconds,
    createdAt: iso(-95 * 1000),
    matchResult: {
      mode: 'duel',
      matchId,
      source: 'official',
      title: '대결 결과를 집계하고 있어요',
      summary: '상대가 완주하면 결과가 자동으로 업데이트돼요.',
      badgeLabel: '결과 집계 중',
      opponentName: '상대',
      comparedDistanceKm: 5,
      myDurationSeconds,
      myPaceLabel: '05:00/km',
    },
  };
}

// Fixture per the design's contract timeline: duel, Galaxy finish receipt t0 (default 100s
// ago — the §B4 90s window has elapsed, so the next touch seals), iPhone screen-off (stale
// 'running' heartbeat). startedAt 30min ago gives the plausibility guard 1800s of wall clock.
function createSealedDuelFixtureStore({
  matchId,
  galaxyElapsed = 1622,
  galaxyFinishedAgoMs = 100 * 1000,
  startedAgoMs = 30 * 60 * 1000,
} = {}) {
  const galaxy = createUser(`galaxy-${matchId}`);
  const iphone = createUser(`iphone-${matchId}`);
  const session = {
    id: matchId,
    mode: 'duel',
    isTestMatch: false,
    isPartyRun: false,
    distanceKm: 5,
    slotStartAt: iso(-startedAgoMs),
    startedAt: iso(-startedAgoMs),
    createdAt: iso(-startedAgoMs - 60 * 1000),
    matchedAt: iso(-startedAgoMs - 60 * 1000),
    participants: [
      {
        userId: galaxy.id,
        seedRank: 1,
        acceptedAt: null,
        liveStatus: 'finished',
        liveDistanceKm: 5,
        liveElapsedSeconds: galaxyElapsed,
        livePace: '05:24/km',
        liveUpdatedAt: iso(-galaxyFinishedAgoMs),
        finishedAt: iso(-galaxyFinishedAgoMs),
        finishElapsedSeconds: galaxyElapsed,
      },
      {
        userId: iphone.id,
        seedRank: 2,
        acceptedAt: null,
        liveStatus: 'running',
        liveDistanceKm: 3.2,
        liveElapsedSeconds: 1100,
        livePace: '05:40/km',
        liveUpdatedAt: iso(-galaxyFinishedAgoMs),
        finishedAt: null,
        finishElapsedSeconds: null,
      },
    ],
  };
  const store = {
    users: [galaxy, iphone],
    runs: [createProfileRun(galaxy.id), createProfileRun(iphone.id)],
    matchSessions: [session],
    matchQueues: { duel: [], group: [] },
    matchRooms: [],
    notifications: [],
  };
  return { store, session, galaxy, iphone };
}

function rewindSealResolvedAt(session, agoMs) {
  const resolution = session.mode === 'duel' ? session.duelFallbackResolution : session.groupFallbackResolution;
  resolution.resolvedAt = iso(-agoMs);
}

function countNotifications(store, type) {
  return (store.notifications ?? []).filter((entry) => entry.type === type).length;
}

function pushFinish(store, userId, matchId, elapsedSeconds, { distanceKm = 5, pace = '05:21/km' } = {}) {
  // These pins assert the push's OWN prune/sweep side effects (heal-then-prune ordering, blob
  // back-fill on the same touch). The progress-POST prunes are throttled server-wide (B-3), so
  // re-arm the throttle before every push to keep the per-push semantics this file pins.
  resetProgressPruneThrottle();
  return updateRunningMatchProgress(store, { id: userId }, {
    matchId,
    distanceKm,
    elapsedSeconds,
    currentPace: pace,
    status: 'finished',
  });
}

// ── 1. Regression pin (the §5 counterfactual): a late finish INSIDE the §B4 window never
//      seals at all — standings by measured elapsed, faster wins, LP exactly once. ──────────
test('1. late finish inside the §B4 window: no seal, faster measured elapsed wins, LP once', () => {
  const { store, session, galaxy, iphone } = createSealedDuelFixtureStore({
    matchId: 'rev-inwindow-duel',
    galaxyFinishedAgoMs: 60 * 1000, // inside the 90s §B4 window — nothing may seal
  });

  pushFinish(store, iphone.id, session.id, 1606);

  assert.equal(session.duelFallbackResolution ?? undefined, undefined, 'no seal inside the §B4 window');
  assert.equal(session.duelFallbackRevision ?? undefined, undefined, 'nothing to revise — no seal existed');

  const standings = buildOfficialSessionStandings(store, session);
  const verdict = buildDuelVerdict(session, standings, iphone.id);
  assert.equal(verdict.resolved, true);
  assert.equal(verdict.winnerUserId, iphone.id, 'faster measured elapsed (1606 < 1622) wins');
  assert.equal(verdict.outcome, 'win');
  assert.equal(verdict.provisional ?? undefined, undefined);
  assert.equal(verdict.revised ?? undefined, undefined);

  // LP exactly once via the every-done gate (similar pace → ±20). Absolute values.
  assert.equal(iphone.rankState.lp, BASE_LP + DUEL_LP.winVsSimilar);
  assert.equal(galaxy.rankState.lp, BASE_LP + DUEL_LP.loss);
  assert.equal(session.lpApplied, true);
  assert.equal(countNotifications(store, 'match_result'), 2);
  assert.equal(countNotifications(store, 'rank_change'), 2);
});

// ── 2. At seal: verdict resolved && PROVISIONAL, winner = the finisher; NOTHING irreversible
//      has happened (no LP, no notifications, pending blobs untouched, save resolver PENDING). ─
test('2. at seal: provisional verdict, deferred LP/notifications/backfill, save resolver stays pending', () => {
  const { store, session, galaxy, iphone } = createSealedDuelFixtureStore({ matchId: 'rev-atseal-duel' });
  store.runs.push(pendingDuelBlobRun('galaxy-pending-run', galaxy.id, session.id, 1622));

  // First sweep after the §B4 window: seals, but the revision window is open → defer.
  sweepStuckMatchSessionFallbacks(store);
  assert.ok(session.duelFallbackResolution);
  assert.equal(session.duelFallbackResolution.winnerUserId, galaxy.id);
  assert.equal(session.sealFinalizedAt ?? undefined, undefined, 'not finalized inside the window');

  const standings = buildOfficialSessionStandings(store, session);
  const galaxyVerdict = buildDuelVerdict(session, standings, galaxy.id);
  assert.equal(galaxyVerdict.resolved, true);
  assert.equal(galaxyVerdict.provisional, true);
  assert.equal(galaxyVerdict.winnerUserId, galaxy.id);

  // Deferred irreversibles: LP untouched on BOTH users, zero notifications.
  assert.equal(galaxy.rankState.lp, BASE_LP);
  assert.equal(iphone.rankState.lp, BASE_LP);
  assert.equal(session.lpApplied ?? undefined, undefined);
  assert.equal(countNotifications(store, 'match_result'), 0);
  assert.equal(countNotifications(store, 'rank_change'), 0);

  // Deferred back-fill: a second sweep inside the window still must NOT touch the blob.
  sweepStuckMatchSessionFallbacks(store);
  const blob = store.runs.find((run) => run.id === 'galaxy-pending-run').matchResult;
  assert.equal(blob.resultTone ?? undefined, undefined);
  assert.equal(blob.badgeLabel, '결과 집계 중');

  // The save-path resolver refuses to persist the provisional verdict.
  const saved = resolveSavedDuelMatchResult(store, galaxy, blob);
  assert.equal(saved.resultTone ?? undefined, undefined);
  assert.equal(saved.badgeLabel, '결과 집계 중');

  // /result may DISPLAY the provisional verdict — flagged so the client can badge 가확정.
  const result = buildMatchResultByMatchId(store, galaxy, session.id);
  assert.equal(result.provisional, true);
  assert.equal(result.participants.find((p) => p.userId === galaxy.id).resultTone, 'win');
});

// ── 3. Revision, FASTER (1606 vs 1622) at seal+5m: annul, both finishes frozen, winner = the
//      late runner, revised flag, LP exactly once per user, one notification pair per user,
//      back-fill heals BOTH blobs to truth before the session is pruned. ────────────────────
test('3. faster late finish at seal+5m: seal annulled, winner flips once, LP/notifications once, blobs healed', () => {
  const { store, session, galaxy, iphone } = createSealedDuelFixtureStore({ matchId: 'rev-faster-duel' });
  store.runs.push(
    pendingDuelBlobRun('galaxy-pending-faster', galaxy.id, session.id, 1622),
    pendingDuelBlobRun('iphone-pending-faster', iphone.id, session.id, 1606),
  );

  sweepStuckMatchSessionFallbacks(store);
  const winnerAtSeal = session.duelFallbackResolution.winnerUserId;
  assert.equal(winnerAtSeal, galaxy.id);
  rewindSealResolvedAt(session, 5 * 60 * 1000); // "now" is seal+5m — inside the window

  const response = pushFinish(store, iphone.id, session.id, 1606);

  // Annulled + revision marker; both finishes frozen; winner flipped EXACTLY once.
  assert.equal(session.duelFallbackResolution, null);
  assert.ok(session.duelFallbackRevision);
  assert.equal(session.duelFallbackRevision.lateFinishUserId, iphone.id);
  assert.equal(session.duelFallbackRevision.previousWinnerUserId, galaxy.id);
  const iphoneParticipant = session.participants.find((p) => p.userId === iphone.id);
  assert.equal(iphoneParticipant.finishElapsedSeconds, 1606);
  assert.equal(iphoneParticipant.liveStatus, 'finished');

  // The response the late runner received already carries the revised measured-truth verdict.
  assert.ok(response.duelVerdict);
  assert.equal(response.duelVerdict.resolved, true);
  assert.equal(response.duelVerdict.winnerUserId, iphone.id);
  assert.equal(response.duelVerdict.revised, true);
  assert.equal(typeof response.duelVerdict.revisedAt, 'string');

  // LP exactly once per user per match — absolute rankState values.
  assert.equal(iphone.rankState.lp, BASE_LP + DUEL_LP.winVsSimilar);
  assert.equal(galaxy.rankState.lp, BASE_LP + DUEL_LP.loss);
  assert.equal(countNotifications(store, 'match_result'), 2);
  assert.equal(countNotifications(store, 'rank_change'), 2);

  // Back-fill healed BOTH pending blobs to measured truth in the same touch's sweep (the
  // every-done arm), BEFORE the both-finished prune dropped the session.
  const iphoneBlob = store.runs.find((run) => run.id === 'iphone-pending-faster').matchResult;
  const galaxyBlob = store.runs.find((run) => run.id === 'galaxy-pending-faster').matchResult;
  assert.equal(iphoneBlob.resultTone, 'win');
  assert.equal(iphoneBlob.badgeLabel, '승리');
  assert.equal(iphoneBlob.opponentDurationSeconds, 1622);
  assert.equal(galaxyBlob.resultTone, 'lose');
  assert.equal(galaxyBlob.badgeLabel, '패배');
  assert.equal(galaxyBlob.opponentDurationSeconds, 1606);
  // POST-FINISH RETENTION (2026-07-09): the healed both-finished session is now RETAINED for
  // MATCH_SESSION_ALL_DONE_RETENTION_MS (so the slower finisher's device can still receive
  // its 'finished' echo) and prunes only after the window.
  assert.equal(store.matchSessions.length, 1, 'both-finished session retained for the echo window');
  const afterRetention = new Date(Date.now() + MATCH_SESSION_ALL_DONE_RETENTION_MS + 60_000);
  pruneMatchSessions(store, afterRetention);
  assert.equal(store.matchSessions.length, 0, 'both-finished session pruned once the retention window passes');
});

// ── 4. Revision, SLOWER: the late finish is accepted as a REAL finish (time visible), the
//      winner does NOT change, no revised flag, and the every-done LP gate finally passes. ──
test('4. slower late finish: winner unchanged, no revised flag, late runner is a real finisher, LP once', () => {
  const { store, session, galaxy, iphone } = createSealedDuelFixtureStore({ matchId: 'rev-slower-duel' });

  sweepStuckMatchSessionFallbacks(store);
  rewindSealResolvedAt(session, 5 * 60 * 1000);

  const response = pushFinish(store, iphone.id, session.id, 1700);

  assert.equal(session.duelFallbackResolution, null, 'seal annulled even for a slower finish');
  const iphoneParticipant = session.participants.find((p) => p.userId === iphone.id);
  assert.equal(iphoneParticipant.finishElapsedSeconds, 1700);

  assert.equal(response.duelVerdict.resolved, true);
  assert.equal(response.duelVerdict.winnerUserId, galaxy.id, 'winner unchanged (1622 < 1700)');
  assert.equal(response.duelVerdict.revised ?? undefined, undefined, 'no revised flag when the winner held');
  // The loser now has a REAL 패배 with their real time instead of a DNF.
  assert.equal(response.duelVerdict.myFinishElapsedSeconds, 1700);

  assert.equal(galaxy.rankState.lp, BASE_LP + DUEL_LP.winVsSimilar);
  assert.equal(iphone.rankState.lp, BASE_LP + DUEL_LP.loss);
  assert.equal(session.lpApplied, true);
});

// ── 5. Beyond the window (seal+11m): the push downgrades EXACTLY as today ('running',
//      finishedAt nulled), the verdict stays sealed-final, blobs were already back-filled and
//      LP already applied at finalization; repeated pushes change nothing. ──────────────────
test('5. beyond-window push downgrades byte-identically; finalization already applied LP + backfill', () => {
  const { store, session, galaxy, iphone } = createSealedDuelFixtureStore({ matchId: 'rev-beyond-duel' });
  store.runs.push(
    pendingDuelBlobRun('galaxy-pending-beyond', galaxy.id, session.id, 1622),
    pendingDuelBlobRun('iphone-pending-beyond', iphone.id, session.id, 1606),
  );

  sweepStuckMatchSessionFallbacks(store);
  rewindSealResolvedAt(session, MATCH_SEAL_REVISION_WINDOW_MS + 60 * 1000); // "now" is seal+11m

  // A routine touch finalizes: sealFinalizedAt once, LP + notifications + back-fill now run.
  sweepStuckMatchSessionFallbacks(store);
  assert.equal(typeof session.sealFinalizedAt, 'string');
  assert.equal(galaxy.rankState.lp, BASE_LP + DUEL_LP.winVsSimilar, 'sealed win finally pays LP');
  assert.equal(iphone.rankState.lp, BASE_LP + DUEL_LP.loss, 'the DNF side takes the loser delta');
  const galaxyBlob = store.runs.find((run) => run.id === 'galaxy-pending-beyond').matchResult;
  const iphoneBlob = store.runs.find((run) => run.id === 'iphone-pending-beyond').matchResult;
  assert.equal(galaxyBlob.resultTone, 'win');
  assert.equal(iphoneBlob.resultTone, 'lose');

  // The too-late finish push: byte-identical downgrade (as before the revision feature).
  pushFinish(store, iphone.id, session.id, 1606);
  const iphoneParticipant = session.participants.find((p) => p.userId === iphone.id);
  assert.equal(iphoneParticipant.finishElapsedSeconds, null);
  assert.equal(iphoneParticipant.liveStatus, 'running');
  assert.equal(iphoneParticipant.finishedAt, null);
  assert.ok(session.duelFallbackResolution, 'seal intact — never annulled beyond the window');
  assert.equal(isParticipantSealedDnf(session, iphone.id), true);

  const verdict = buildDuelVerdict(session, buildOfficialSessionStandings(store, session), iphone.id);
  assert.equal(verdict.resolved, true);
  assert.equal(verdict.provisional, false, 'finalized — no longer provisional');
  assert.equal(verdict.winnerUserId, galaxy.id);

  // Hammer more pushes — nothing moves (LP absolute, blobs, notifications, seal).
  pushFinish(store, iphone.id, session.id, 1610);
  pushFinish(store, iphone.id, session.id, 1612);
  assert.equal(galaxy.rankState.lp, BASE_LP + DUEL_LP.winVsSimilar);
  assert.equal(iphone.rankState.lp, BASE_LP + DUEL_LP.loss);
  assert.equal(countNotifications(store, 'match_result'), 2);
  assert.equal(countNotifications(store, 'rank_change'), 2);
  assert.equal(galaxyBlob.resultTone, 'win');
  assert.equal(session.duelFallbackResolution.winnerUserId, galaxy.id);
});

// ── 6. Finalization idempotency: hammer sweep + /result + verdict builds + progress across
//      the timeline — sealFinalizedAt set ONCE, LP ONCE (absolute), notifications ONCE, and
//      winnerUserId changes AT MOST once over the whole observed sequence. ──────────────────
test('6. hammering across the timeline: sealFinalizedAt once, LP once, notifications once, winner set once', () => {
  const { store, session, galaxy, iphone } = createSealedDuelFixtureStore({ matchId: 'rev-hammer-duel' });

  const observedWinners = [];
  const observe = (now) => {
    const verdict = buildDuelVerdict(session, buildOfficialSessionStandings(store, session, now), galaxy.id, now);
    observedWinners.push(verdict.resolved ? verdict.winnerUserId : null);
  };

  // Pre-seal (window not yet elapsed for THIS observation? it is — the fixture is 100s old, so
  // the very first observation seals). Observe densely across the window and beyond.
  observe(new Date());
  sweepStuckMatchSessionFallbacks(store);
  observe(new Date());
  sweepStuckMatchSessionFallbacks(store, new Date(Date.now() + 2 * 60 * 1000));
  observe(new Date(Date.now() + 2 * 60 * 1000));
  assert.equal(session.sealFinalizedAt ?? undefined, undefined, 'still inside the window');

  sweepStuckMatchSessionFallbacks(store, new Date(Date.now() + MATCH_SEAL_REVISION_WINDOW_MS + 30 * 1000));
  const finalizedAt = session.sealFinalizedAt;
  assert.equal(typeof finalizedAt, 'string');

  // Hammer: more sweeps, /result reads, status-shaped verdict builds, and an idempotent
  // re-push from the winner.
  sweepStuckMatchSessionFallbacks(store, new Date(Date.now() + MATCH_SEAL_REVISION_WINDOW_MS + 60 * 1000));
  observe(new Date(Date.now() + MATCH_SEAL_REVISION_WINDOW_MS + 60 * 1000));
  const result = buildMatchResultByMatchId(store, galaxy, session.id, new Date(Date.now() + MATCH_SEAL_REVISION_WINDOW_MS + 90 * 1000));
  assert.equal(result.provisional ?? undefined, undefined, 'finalized result is no longer provisional');
  pushFinish(store, galaxy.id, session.id, 1622);
  sweepStuckMatchSessionFallbacks(store, new Date(Date.now() + MATCH_SEAL_REVISION_WINDOW_MS + 120 * 1000));
  observe(new Date(Date.now() + MATCH_SEAL_REVISION_WINDOW_MS + 120 * 1000));

  // sealFinalizedAt set exactly once.
  assert.equal(session.sealFinalizedAt, finalizedAt);
  // LP exactly once per user — absolute values prove no re-application across the hammering.
  assert.equal(galaxy.rankState.lp, BASE_LP + DUEL_LP.winVsSimilar);
  assert.equal(iphone.rankState.lp, BASE_LP + DUEL_LP.loss);
  assert.equal(session.lpApplied, true);
  // Notifications exactly once per user.
  assert.equal(countNotifications(store, 'match_result'), 2);
  assert.equal(countNotifications(store, 'rank_change'), 2);
  // winnerUserId changed AT MOST once across the observed sequence (null → galaxy, then held).
  const transitions = observedWinners
    .filter((winner, index, list) => index > 0 && winner !== list[index - 1]).length;
  assert.ok(transitions <= 1, `winner changed ${transitions} times across ${JSON.stringify(observedWinners)}`);
  assert.equal(observedWinners.at(-1), galaxy.id);
});

// ── 7. Plausibility guard: elapsed 0 / non-integer / greater than wall-clock+slack →
//      no annul, downgrade preserved, seal intact. ──────────────────────────────────────────
test('7. implausible late elapsed (0 / non-integer / > wall-clock+slack) never annuls the seal', () => {
  const { store, session, galaxy, iphone } = createSealedDuelFixtureStore({ matchId: 'rev-guard-duel' });

  sweepStuckMatchSessionFallbacks(store);
  const sealResolvedAt = session.duelFallbackResolution.resolvedAt;
  const iphoneParticipant = session.participants.find((p) => p.userId === iphone.id);

  // elapsed 0 (never a valid measured finish).
  pushFinish(store, iphone.id, session.id, 0);
  assert.ok(session.duelFallbackResolution);
  assert.equal(session.duelFallbackResolution.resolvedAt, sealResolvedAt);
  assert.equal(iphoneParticipant.finishElapsedSeconds, null);
  assert.equal(iphoneParticipant.liveStatus, 'running');
  assert.equal(iphoneParticipant.finishedAt, null);

  // Non-integer elapsed.
  pushFinish(store, iphone.id, session.id, 1606.5);
  assert.ok(session.duelFallbackResolution);
  assert.equal(iphoneParticipant.finishElapsedSeconds, null);
  assert.equal(iphoneParticipant.liveStatus, 'running');

  // More measured time than has physically elapsed since startedAt (1800s) + 120s slack.
  pushFinish(store, iphone.id, session.id, 5000);
  assert.ok(session.duelFallbackResolution);
  assert.equal(session.duelFallbackResolution.resolvedAt, sealResolvedAt);
  assert.equal(iphoneParticipant.finishElapsedSeconds, null);
  assert.equal(isParticipantSealedDnf(session, iphone.id), true);

  const verdict = buildDuelVerdict(session, buildOfficialSessionStandings(store, session), galaxy.id);
  assert.equal(verdict.winnerUserId, galaxy.id, 'sealed verdict survives every implausible push');
});

// ── 8. Forfeit during the window: the DNF side leaves → immediate LP via the every-done
//      gate, back-fill runs BEFORE the prune drops the session, and the (never-reached)
//      window-close finalization can never double-apply. ────────────────────────────────────
test('8. forfeit during the window: every-done LP + backfill-before-prune, no double apply later', () => {
  const { store, session, galaxy, iphone } = createSealedDuelFixtureStore({ matchId: 'rev-forfeit-duel' });
  store.runs.push(pendingDuelBlobRun('galaxy-pending-forfeit', galaxy.id, session.id, 1622));

  sweepStuckMatchSessionFallbacks(store);
  assert.equal(session.duelFallbackResolution.winnerUserId, galaxy.id);
  assert.equal(session.sealFinalizedAt ?? undefined, undefined);

  // The sealed-DNF runner gives up inside the window.
  leaveRunningMatch(store, iphone, { matchId: session.id });

  // Immediate LP via the every-done gate (finished + forfeited).
  assert.equal(galaxy.rankState.lp, BASE_LP + DUEL_LP.winVsSimilar);
  assert.equal(iphone.rankState.lp, BASE_LP + DUEL_LP.loss);
  assert.equal(session.lpApplied, true);

  // The leave's prune ran the sweep FIRST: every-done finalized the seal and back-filled the
  // winner's blob BEFORE the every-done prune dropped the session.
  assert.equal(typeof session.sealFinalizedAt, 'string');
  const galaxyBlob = store.runs.find((run) => run.id === 'galaxy-pending-forfeit').matchResult;
  assert.equal(galaxyBlob.resultTone, 'win');
  assert.equal(galaxyBlob.badgeLabel, '승리');
  // POST-FINISH RETENTION (2026-07-09): the healed every-done session is retained for the
  // echo window and prunes only after it passes.
  assert.equal(store.matchSessions.length, 1, 'every-done session retained for the echo window');
  pruneMatchSessions(store, new Date(Date.now() + MATCH_SESSION_ALL_DONE_RETENTION_MS + 60_000));
  assert.equal(store.matchSessions.length, 0, 'every-done session pruned once the retention window passes');

  // The window-close moment later can never double-apply anything (session is gone; absolute
  // values still exactly one delta).
  sweepStuckMatchSessionFallbacks(store, new Date(Date.now() + MATCH_SEAL_REVISION_WINDOW_MS + 60 * 1000));
  assert.equal(galaxy.rankState.lp, BASE_LP + DUEL_LP.winVsSimilar);
  assert.equal(iphone.rankState.lp, BASE_LP + DUEL_LP.loss);
  assert.equal(countNotifications(store, 'match_result'), 2);
  assert.equal(countNotifications(store, 'rank_change'), 2);
});

// ── 9. Group parity: a late finisher inside the window un-DNFs via annul + deterministic
//      RE-SEAL (ranked by measured elapsed among finishers, other rows' relative order
//      preserved); beyond the window a late finish stays blocked. ───────────────────────────
test('9. group: within-window late finish re-seals by measured elapsed; beyond-window stays blocked', () => {
  const users = ['A', 'B', 'C', 'D'].map((tag) => createUser(`group-${tag}`));
  const [a, b, c, d] = users;
  const finishedAgo = MATCH_DUEL_FINISH_FALLBACK_MS + 10 * 1000;
  const session = {
    id: 'rev-group-match',
    mode: 'group',
    isTestMatch: false,
    isPartyRun: false,
    distanceKm: 5,
    slotStartAt: iso(-30 * 60 * 1000),
    startedAt: iso(-30 * 60 * 1000),
    createdAt: iso(-31 * 60 * 1000),
    matchedAt: iso(-31 * 60 * 1000),
    participants: [
      { userId: a.id, seedRank: 1, acceptedAt: null, liveStatus: 'finished', liveDistanceKm: 5, liveElapsedSeconds: 1500, livePace: '05:00/km', liveUpdatedAt: iso(-finishedAgo), finishedAt: iso(-finishedAgo), finishElapsedSeconds: 1500 },
      { userId: b.id, seedRank: 2, acceptedAt: null, liveStatus: 'running', liveDistanceKm: 4.1, liveElapsedSeconds: 1300, livePace: '05:30/km', liveUpdatedAt: iso(-finishedAgo), finishedAt: null, finishElapsedSeconds: null },
      { userId: c.id, seedRank: 3, acceptedAt: null, liveStatus: 'finished', liveDistanceKm: 5, liveElapsedSeconds: 1700, livePace: '05:40/km', liveUpdatedAt: iso(-finishedAgo + 3000), finishedAt: iso(-finishedAgo + 3000), finishElapsedSeconds: 1700 },
      { userId: d.id, seedRank: 4, acceptedAt: null, liveStatus: 'running', liveDistanceKm: 3.4, liveElapsedSeconds: 1250, livePace: '06:00/km', liveUpdatedAt: iso(-finishedAgo), finishedAt: null, finishElapsedSeconds: null },
    ],
  };
  const store = {
    users,
    runs: users.map((user) => createProfileRun(user.id)),
    matchSessions: [session],
    matchQueues: { duel: [], group: [] },
    matchRooms: [],
    notifications: [],
  };

  // Seal: finishers [A(1500), C(1700)], DNF [B, D].
  sweepStuckMatchSessionFallbacks(store);
  assert.deepEqual(session.groupFallbackResolution.finisherUserIds, [a.id, c.id]);
  assert.deepEqual(session.groupFallbackResolution.dnfUserIds, [b.id, d.id]);
  assert.equal(isParticipantGroupSealedDnf(session, b.id), true);

  // B's plausible late finish (1600) inside the window: annul + accepted finish + the sticky
  // sealer RE-SEALS deterministically from raw state on the same touch — B slots between A and
  // C by measured elapsed; A-before-C relative order preserved; D stays DNF below.
  pushFinish(store, b.id, session.id, 1600);
  assert.ok(session.groupFallbackRevision);
  assert.equal(session.groupFallbackRevision.lateFinishUserId, b.id);
  assert.equal(session.groupFallbackRevision.previousWinnerUserId, a.id);
  assert.ok(session.groupFallbackResolution, 're-sealed (D is still missing)');
  assert.deepEqual(session.groupFallbackResolution.finisherUserIds, [a.id, b.id, c.id]);
  assert.deepEqual(session.groupFallbackResolution.dnfUserIds, [d.id]);
  const bParticipant = session.participants.find((p) => p.userId === b.id);
  assert.equal(bParticipant.finishElapsedSeconds, 1600);
  assert.equal(bParticipant.liveStatus, 'finished');

  const verdict = buildGroupVerdict(session, buildOfficialSessionStandings(store, session), b.id);
  assert.equal(verdict.resolved, true);
  assert.equal(verdict.provisional, true, 're-sealed order is provisional until its window closes');
  assert.deepEqual(
    verdict.participants.map((p) => [p.userId, p.rank]),
    [[a.id, 1], [b.id, 2], [c.id, 3], [d.id, 4]],
  );

  // Beyond the (re-)seal's window, D's late finish stays blocked — order frozen.
  rewindSealResolvedAt(session, MATCH_SEAL_REVISION_WINDOW_MS + 60 * 1000);
  pushFinish(store, d.id, session.id, 1400);
  const dParticipant = session.participants.find((p) => p.userId === d.id);
  assert.equal(dParticipant.finishElapsedSeconds, null);
  assert.notEqual(dParticipant.liveStatus, 'finished');
  const frozen = buildGroupVerdict(session, buildOfficialSessionStandings(store, session), d.id);
  assert.deepEqual(
    frozen.participants.map((p) => [p.userId, p.rank]),
    [[a.id, 1], [b.id, 2], [c.id, 3], [d.id, 4]],
  );
});

// ── 10. Restart durability: serialize/reload the store mid-window — the window math rides on
//       absolute timestamps, so revision acceptance and window-close finalization behave
//       identically on the reloaded store. ──────────────────────────────────────────────────
test('10. store serialize/reload mid-window: revision and finalization behave identically', () => {
  // Arm A — mid-window seal survives a "restart" and still accepts the revision.
  const armA = createSealedDuelFixtureStore({ matchId: 'rev-restart-open' });
  sweepStuckMatchSessionFallbacks(armA.store);
  rewindSealResolvedAt(armA.session, 5 * 60 * 1000);
  const reloadedA = JSON.parse(JSON.stringify(armA.store));
  const sessionA = reloadedA.matchSessions[0];
  assert.equal(isSealWithinRevisionWindow(sessionA, new Date()), true);

  pushFinish(reloadedA, `iphone-rev-restart-open`, sessionA.id, 1606);
  assert.equal(sessionA.duelFallbackResolution, null, 'revision accepted after reload');
  assert.equal(sessionA.duelFallbackRevision.lateFinishUserId, 'iphone-rev-restart-open');
  const verdictA = buildDuelVerdict(sessionA, buildOfficialSessionStandings(reloadedA, sessionA), 'iphone-rev-restart-open');
  assert.equal(verdictA.winnerUserId, 'iphone-rev-restart-open');
  const reloadedIphone = reloadedA.users.find((user) => user.id === 'iphone-rev-restart-open');
  assert.equal(reloadedIphone.rankState.lp, BASE_LP + DUEL_LP.winVsSimilar);

  // Arm B — a seal already past its window survives a "restart" and finalizes, and the late
  // push downgrades exactly as without the restart.
  const armB = createSealedDuelFixtureStore({ matchId: 'rev-restart-closed' });
  sweepStuckMatchSessionFallbacks(armB.store);
  rewindSealResolvedAt(armB.session, MATCH_SEAL_REVISION_WINDOW_MS + 60 * 1000);
  const reloadedB = JSON.parse(JSON.stringify(armB.store));
  const sessionB = reloadedB.matchSessions[0];
  assert.equal(isSealWithinRevisionWindow(sessionB, new Date()), false);

  sweepStuckMatchSessionFallbacks(reloadedB);
  assert.equal(typeof sessionB.sealFinalizedAt, 'string', 'finalized after reload');
  pushFinish(reloadedB, 'iphone-rev-restart-closed', sessionB.id, 1606);
  const iphoneB = sessionB.participants.find((p) => p.userId === 'iphone-rev-restart-closed');
  assert.equal(iphoneB.finishElapsedSeconds, null);
  assert.equal(iphoneB.liveStatus, 'running');
  const reloadedGalaxyB = reloadedB.users.find((user) => user.id === 'galaxy-rev-restart-closed');
  assert.equal(reloadedGalaxyB.rankState.lp, BASE_LP + DUEL_LP.winVsSimilar);
});

// ── 11. Dead-heat revision: an equal measured elapsed re-resolves to the deterministic DRAW
//       verdict. LP for a draw keeps the PRE-EXISTING semantics (standings rank 1/2 via the
//       receipt-order tie-break still take the win/loss deltas) — pinned here as-is, not
//       changed by this design. ─────────────────────────────────────────────────────────────
test('11. dead-heat revision resolves to draw; pre-existing draw LP semantics pinned', () => {
  const { store, session, galaxy, iphone } = createSealedDuelFixtureStore({ matchId: 'rev-deadheat-duel' });

  sweepStuckMatchSessionFallbacks(store);
  rewindSealResolvedAt(session, 5 * 60 * 1000);

  const response = pushFinish(store, iphone.id, session.id, 1622); // exactly the Galaxy's time

  assert.equal(session.duelFallbackResolution, null);
  assert.equal(response.duelVerdict.resolved, true);
  assert.equal(response.duelVerdict.outcome, 'draw');
  assert.equal(response.duelVerdict.winnerUserId, null);
  // The shown provisional WIN was downgraded to a draw — that IS a change of winner, so the
  // revised flag fires (previousWinnerUserId !== null winner).
  assert.equal(response.duelVerdict.revised, true);

  // PRE-EXISTING draw LP semantics (pinned, deliberately unchanged by this design): the
  // standings still rank the dead-heat deterministically (earlier receipt first → Galaxy 1st),
  // and the LP core reads rank 1/2 as winner/loser.
  assert.equal(galaxy.rankState.lp, BASE_LP + DUEL_LP.winVsSimilar);
  assert.equal(iphone.rankState.lp, BASE_LP + DUEL_LP.loss);
  assert.equal(session.lpApplied, true);
});
