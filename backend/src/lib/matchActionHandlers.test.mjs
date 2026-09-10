import assert from 'node:assert/strict';
import test from 'node:test';

// B-3 (finish-flow relief 2026-07-07) — the progress-POST epilogue prunes
// (pruneMatchSessions + pruneMatchRooms, each re-running the seal/heal sweep) are throttled
// to at most once per PROGRESS_PRUNE_MIN_INTERVAL_MS server-wide, because every ~2.5s
// heartbeat used to run both while holding the whole-store row lock. Pinned here:
//   1. two finishing pushes within the interval → only the FIRST push's epilogue prune runs
//      (the second all-done session survives the push that completed it);
//   2. the throttle gate itself, with an injectable `now`, opens exactly at the interval;
//   3. the throttled skip changes ONLY housekeeping timing — the push's match semantics
//      (finish freeze, LP) are untouched.
import {
  PROGRESS_PRUNE_MIN_INTERVAL_MS,
  cancelRunningMatch,
  leaveRunningMatch,
  resetProgressPruneThrottle,
  runProgressPollPrunesIfDue,
  updateRunningMatchProgress,
} from './matchActionHandlers.mjs';
import { buildRunningMatchStatusResponse } from './matchResponseBuilders.mjs';
import {
  buildMatchResultByMatchId,
  resolveSavedDuelMatchResult,
  resolveSavedGroupMatchResult,
} from './matchResultBuilders.mjs';
import { getMatchBonusPoints } from './points.mjs';
import {
  clearVanishedMatchTombstones,
  isMatchTombstoned,
} from './vanishedMatchTombstones.mjs';

function iso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

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
    rankState: { tier: '입문', lp: 50 },
    createdAt: iso(-24 * 60 * 60 * 1000),
  };
}

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

// A duel where the OTHER runner finished seconds ago (inside the §B4 window — nothing seals)
// and the pushing runner's finish push completes the match. The all-done session becomes a
// prune candidate ONLY once this push lands, so its survival tells exactly whether the push's
// EPILOGUE prune ran (the unthrottled entry prune sees a not-yet-done session and keeps it).
function createFinishingDuelFixture(matchId) {
  const finished = createUser(`finished-${matchId}`);
  const pusher = createUser(`pusher-${matchId}`);
  const session = {
    id: matchId,
    mode: 'duel',
    isTestMatch: false,
    isPartyRun: false,
    distanceKm: 5,
    slotStartAt: iso(-30 * 60 * 1000),
    startedAt: iso(-30 * 60 * 1000),
    createdAt: iso(-31 * 60 * 1000),
    matchedAt: iso(-31 * 60 * 1000),
    participants: [
      {
        userId: finished.id,
        seedRank: 1,
        acceptedAt: null,
        liveStatus: 'finished',
        liveDistanceKm: 5,
        liveElapsedSeconds: 1622,
        livePace: '05:24/km',
        liveUpdatedAt: iso(-10 * 1000),
        finishedAt: iso(-10 * 1000),
        finishElapsedSeconds: 1622,
      },
      {
        userId: pusher.id,
        seedRank: 2,
        acceptedAt: null,
        liveStatus: 'running',
        liveDistanceKm: 4.9,
        liveElapsedSeconds: 1590,
        livePace: '05:28/km',
        liveUpdatedAt: iso(-5 * 1000),
        finishedAt: null,
        finishElapsedSeconds: null,
      },
    ],
  };
  const store = {
    users: [finished, pusher],
    runs: [createProfileRun(finished.id), createProfileRun(pusher.id)],
    matchSessions: [session],
    matchQueues: { duel: [], group: [] },
    matchRooms: [],
    notifications: [],
  };
  return { store, session, finished, pusher };
}

function pushFinish(store, userId, matchId, elapsedSeconds) {
  return updateRunningMatchProgress(store, { id: userId }, {
    matchId,
    distanceKm: 5,
    elapsedSeconds,
    currentPace: '05:21/km',
    status: 'finished',
  });
}

function buildStore(matchSessions) {
  return {
    users: [createUser('store-a'), createUser('store-b')],
    runs: [],
    matchSessions,
    matchQueues: { duel: [], group: [] },
    matchRooms: [],
    notifications: [],
  };
}

// A stale, already-all-done session whose retention window has expired — the observable a
// due epilogue prune physically drops. POST-FINISH RETENTION (2026-07-09) means a
// JUST-completed session now survives the epilogue prune (kept for the echo window), so the
// old "the completing session disappears" observable no longer distinguishes throttled from
// due. This decoy is instead consumed by whichever prune actually executes.
function buildStaleDoneDecoySession(id) {
  const doneAgoMs = 30 * 60 * 1000; // well past MATCH_SESSION_ALL_DONE_RETENTION_MS (10min)
  const doneParticipant = (userId) => ({
    userId,
    seedRank: 1,
    acceptedAt: null,
    liveStatus: 'finished',
    liveDistanceKm: 5,
    liveElapsedSeconds: 1500,
    livePace: '05:00/km',
    liveUpdatedAt: iso(-doneAgoMs),
    finishedAt: iso(-doneAgoMs),
    finishElapsedSeconds: 1500,
    profileSnapshot: { name: userId },
  });
  return {
    id,
    mode: 'duel',
    isTestMatch: false,
    isPartyRun: true,
    lpApplied: true,
    resultNotificationApplied: true,
    distanceKm: 5,
    slotStartAt: iso(-40 * 60 * 1000),
    startedAt: iso(-40 * 60 * 1000),
    createdAt: iso(-41 * 60 * 1000),
    matchedAt: iso(-41 * 60 * 1000),
    participants: [doneParticipant(`${id}-a`), doneParticipant(`${id}-b`)],
  };
}

test('two finishing pushes within the interval: only the first push runs the epilogue prune', () => {
  resetProgressPruneThrottle();

  // Push 1 — throttle armed at 0 → the finished push consumes the shared throttle window and
  // its full match semantics land. (The JUST-completed session is retained for the echo
  // window now, so it is not the observable — the throttle-consumption below is.)
  const first = createFinishingDuelFixture('prune-throttle-m1');
  pushFinish(first.store, first.pusher.id, 'prune-throttle-m1', 1606);
  const firstSession = first.store.matchSessions.find((session) => session.id === 'prune-throttle-m1');
  assert.equal(firstSession.lpApplied, true, 'the every-done LP path is not throttled');

  // The first push consumed the server-wide throttle: a due-prune check within the interval is
  // now gated off (returns false, physically prunes nothing) — proving the second ~2.5s push
  // in the finish convoy skips its epilogue prune+sweep. The decoy would be dropped by a real
  // prune, so its survival confirms the skip.
  const throttledStore = { ...buildStore([buildStaleDoneDecoySession('prune-decoy-throttled')]) };
  assert.equal(runProgressPollPrunesIfDue(throttledStore, new Date(), new Date()), false, 'throttle consumed by push 1');
  assert.equal(throttledStore.matchSessions.length, 1, 'the throttled epilogue prune drops nothing');

  // Re-armed throttle → a due prune runs and the stale decoy is physically dropped.
  resetProgressPruneThrottle();
  const dueStore = { ...buildStore([buildStaleDoneDecoySession('prune-decoy-due')]) };
  assert.equal(runProgressPollPrunesIfDue(dueStore, new Date(), new Date()), true, 're-armed throttle prunes');
  assert.equal(dueStore.matchSessions.length, 0, 'a due epilogue prune drops the stale decoy');
});

test('runProgressPollPrunesIfDue gates on the injectable now at exactly the interval', () => {
  resetProgressPruneThrottle();
  const t0 = Date.parse('2026-07-07T00:00:00.000Z');

  // An already-all-done stale session is the observable prune target. Done stamps sit t0-15min
  // — past the POST-FINISH RETENTION window relative to the injectable t0-based nows AND to
  // real time, so the prune's drop stays observable under retention.
  const isoAtT0 = (offsetMs) => new Date(t0 + offsetMs).toISOString();
  const doneParticipant = (userId) => ({
    userId,
    seedRank: 1,
    acceptedAt: null,
    liveStatus: 'finished',
    liveDistanceKm: 5,
    liveElapsedSeconds: 1500,
    livePace: '05:00/km',
    liveUpdatedAt: isoAtT0(-15 * 60 * 1000),
    finishedAt: isoAtT0(-15 * 60 * 1000),
    finishElapsedSeconds: 1500,
    profileSnapshot: { name: userId },
  });
  const buildStore = () => ({
    users: [createUser('gate-a'), createUser('gate-b')],
    runs: [],
    matchSessions: [{
      id: 'gate-done-match',
      mode: 'duel',
      isTestMatch: false,
      isPartyRun: true,
      lpApplied: true,
      resultNotificationApplied: true,
      distanceKm: 5,
      slotStartAt: isoAtT0(-30 * 60 * 1000),
      startedAt: isoAtT0(-30 * 60 * 1000),
      createdAt: isoAtT0(-31 * 60 * 1000),
      matchedAt: isoAtT0(-31 * 60 * 1000),
      participants: [doneParticipant('gate-a'), doneParticipant('gate-b')],
    }],
    matchQueues: { duel: [], group: [] },
    matchRooms: [],
    notifications: [],
  });

  const storeAtT0 = buildStore();
  assert.equal(runProgressPollPrunesIfDue(storeAtT0, new Date(t0), new Date(t0)), true);
  assert.equal(storeAtT0.matchSessions.length, 0, 'a due call physically prunes');

  const storeInsideInterval = buildStore();
  assert.equal(
    runProgressPollPrunesIfDue(storeInsideInterval, new Date(t0), new Date(t0 + PROGRESS_PRUNE_MIN_INTERVAL_MS - 1)),
    false,
  );
  assert.equal(storeInsideInterval.matchSessions.length, 1, 'inside the interval nothing is touched');

  const storeAtBoundary = buildStore();
  assert.equal(
    runProgressPollPrunesIfDue(storeAtBoundary, new Date(t0), new Date(t0 + PROGRESS_PRUNE_MIN_INTERVAL_MS)),
    true,
  );
  assert.equal(storeAtBoundary.matchSessions.length, 0, 'the gate reopens exactly at the interval');

  resetProgressPruneThrottle();
  const storeAfterReset = buildStore();
  assert.equal(runProgressPollPrunesIfDue(storeAfterReset, new Date(t0), new Date(t0 + 1)), true, 'reset re-arms');
});

// 오너 실기기 대결 2026-08-09. The Android native uploader re-POSTs the last JS-built payload
// byte-for-byte every ~3s and never recomputes anything, so a frozen JS thread produced an endless
// stream of IDENTICAL pushes. Restamping liveUpdatedAt on those kept the runner "연결됨" forever:
// the stall detector could never fire and the opponent's phone confidently rendered a stuck 3.05km.
function createRunningDuelFixture(matchId) {
  const a = createUser(`live-a-${matchId}`);
  const b = createUser(`live-b-${matchId}`);
  const session = {
    id: matchId,
    mode: 'duel',
    isTestMatch: false,
    isPartyRun: false,
    distanceKm: 6,
    slotStartAt: iso(-30 * 60 * 1000),
    startedAt: iso(-30 * 60 * 1000),
    createdAt: iso(-31 * 60 * 1000),
    matchedAt: iso(-31 * 60 * 1000),
    participants: [a, b].map((user, index) => ({
      userId: user.id,
      seedRank: index + 1,
      acceptedAt: null,
      liveStatus: 'running',
      liveDistanceKm: 3.05,
      liveElapsedSeconds: 1200,
      livePace: '06:33/km',
      // Two minutes stale: any restamp is unmistakable.
      liveUpdatedAt: iso(-120 * 1000),
      finishedAt: null,
      finishElapsedSeconds: null,
    })),
  };

  return {
    store: {
      users: [a, b],
      runs: [createProfileRun(a.id), createProfileRun(b.id)],
      matchSessions: [session],
      matchQueues: { duel: [], group: [] },
      matchRooms: [],
      notifications: [],
    },
    session,
    pusher: a,
  };
}

test('an identical re-push does NOT refresh liveUpdatedAt (a frozen device cannot fake liveness)', () => {
  const { store, session, pusher } = createRunningDuelFixture('frozen-repush-duel');
  const push = () => updateRunningMatchProgress(store, { id: pusher.id }, {
    matchId: 'frozen-repush-duel',
    distanceKm: 3.05,
    elapsedSeconds: 1200,
    currentPace: '06:33/km',
    status: 'running',
  });
  const readParticipant = () => session.participants.find((participant) => participant.userId === pusher.id);

  // The FIRST arrival is legitimately new information (the server has never seen this payload), so
  // it stamps. It is every REPLAY after it that must not.
  push();
  const afterFirst = readParticipant().liveUpdatedAt;
  assert.notEqual(afterFirst, iso(-120 * 1000), 'the first push is genuine and does stamp');

  // Exactly what the native uploader does for the rest of a frozen run: the same cached body,
  // every ~3s, forever.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    push();
  }

  const after = readParticipant();
  assert.equal(after.liveUpdatedAt, afterFirst, 'a repeated identical payload must leave the liveness clock alone');
  assert.equal(after.liveDistanceKm, 3.05);
});

test('a standing-still runner still refreshes liveUpdatedAt (elapsed advances on a live JS thread)', () => {
  const { store, session, pusher } = createRunningDuelFixture('stationary-duel');
  const before = session.participants.find((participant) => participant.userId === pusher.id).liveUpdatedAt;

  // Waiting at a crossing: distance does not move, but the app is alive so elapsed does. This must
  // NOT be mistaken for the frozen case — the discriminator is "new information", not "moved".
  updateRunningMatchProgress(store, { id: pusher.id }, {
    matchId: 'stationary-duel',
    distanceKm: 3.05,
    elapsedSeconds: 1230,
    currentPace: '06:40/km',
    status: 'running',
  });

  const after = session.participants.find((participant) => participant.userId === pusher.id);
  assert.notEqual(after.liveUpdatedAt, before, 'a live push with fresh elapsed must restamp');
  assert.equal(after.liveDistanceKm, 3.05, 'distance genuinely did not move');
});

// ── 완주 선언 거리 게이트 (2026-08-23 실전 사고) ─────────────────────────────
// 4.93km에서 '대결종료'를 누른 러너가 7km 그룹런 1위로 확정됐다. 클라이언트 저장
// 흐름은 매치가 붙어 있으면 무조건 status='finished'를 보내고, 서버는 그 말을 그대로
// 믿었다. 이제 완주 선언은 원시 신고 거리로 검증한다 — 목표 미달 선언은 'running'으로
// 강등되어(되돌릴 수 있음) §B4가 미완주자로 정리한다.

test('a sub-goal finish declaration is demoted to running — no finish stamps, no rank entry', () => {
  const { store, session, pusher } = createRunningDuelFixture('short-finish-duel');

  updateRunningMatchProgress(store, { id: pusher.id }, {
    matchId: 'short-finish-duel',
    distanceKm: 4.2,
    elapsedSeconds: 1320,
    currentPace: '08:45/km',
    status: 'finished',
  });

  const mine = session.participants.find((participant) => participant.userId === pusher.id);
  assert.equal(mine.liveStatus, 'running', 'a 4.2km finish claim against a 6km goal is not a finish');
  assert.equal(mine.finishedAt, null, 'no finish timestamp may land');
  assert.equal(mine.finishElapsedSeconds, null, 'the rank key must never be frozen from a sub-goal claim');
  assert.equal(mine.liveDistanceKm, 4.2, 'the pushed distance itself still lands as live progress');

  // The demotion is REVERSIBLE: the durable resend that finally carries the goal distance
  // (or an honest later finish) must still complete the run.
  updateRunningMatchProgress(store, { id: pusher.id }, {
    matchId: 'short-finish-duel',
    distanceKm: 6,
    elapsedSeconds: 1560,
    currentPace: '06:40/km',
    status: 'finished',
  });

  assert.equal(mine.liveStatus, 'finished', 'a later goal-distance finish still completes');
  assert.equal(mine.finishElapsedSeconds, 1560);
});

test('a goal-reaching RAW finish declaration is accepted even when the speed-clamped normalized distance lags', () => {
  const { store, session, pusher } = createRunningDuelFixture('raw-finish-duel');

  // 3.05km → 6.18km in 120s is far over the 12 m/s clamp, so the NORMALIZED distance
  // cannot reach the goal — exactly the wake-after-sleep shape. The gate must judge the
  // RAW declared distance (the server already trusts raw elapsedSeconds as the rank key).
  updateRunningMatchProgress(store, { id: pusher.id }, {
    matchId: 'raw-finish-duel',
    distanceKm: 6.18,
    elapsedSeconds: 2100,
    currentPace: '05:40/km',
    status: 'finished',
  });

  const mine = session.participants.find((participant) => participant.userId === pusher.id);
  assert.equal(mine.liveStatus, 'finished');
  assert.equal(mine.finishElapsedSeconds, 2100);
  assert.equal(mine.liveDistanceKm, 6, 'the accepted finish stores min(goal, raw) — the ledger says the goal, not GPS overshoot');
});

// ── 실격패 이탈 (오너 2026-09-09): 케이던스 워치독 부정 러닝 ────────────────────────────
// leave에 reason 'disqualified'를 실으면 기권과 똑같이 forfeited로 봉인되고(LP·정렬 그대로 =
// 패배), 참가자에 disqualified/forfeitReason이 박힌다. 상태/결과 페이로드는 그 참가자에
// `disqualified: true`를, 본인 뷰는 `currentUserDisqualified: true`를 노출한다. 저장 시 서버
// 재작성 문구는 본인 '실격패', 상대 '상대 실격 승'. reason이 없는 기권은 바이트 단위로 그대로.

function statusInput(session) {
  return { mode: session.mode, distanceKm: session.distanceKm, slotStartAt: session.slotStartAt, matchId: session.id };
}

test('leave with reason disqualified: participant is forfeited AND flagged; a plain leave carries no flag', () => {
  const { store, session } = createRunningDuelFixture('dq-flag-duel');
  const guest = session.participants[1];

  leaveRunningMatch(store, { id: guest.userId }, { matchId: 'dq-flag-duel', reason: 'disqualified' });

  assert.equal(guest.liveStatus, 'forfeited');
  assert.equal(typeof guest.forfeitedAt, 'string');
  assert.equal(guest.disqualified, true);
  assert.equal(guest.forfeitReason, 'disqualified');

  const plain = createRunningDuelFixture('plain-forfeit-duel');
  const plainGuest = plain.session.participants[1];
  leaveRunningMatch(plain.store, { id: plainGuest.userId }, { matchId: 'plain-forfeit-duel' });

  assert.equal(plainGuest.liveStatus, 'forfeited');
  assert.equal('disqualified' in plainGuest, false);
  assert.equal('forfeitReason' in plainGuest, false);
});

test('status payloads: opponent.disqualified for the other side, currentUserDisqualified for the self view', () => {
  const { store, session, pusher } = createRunningDuelFixture('dq-status-duel');
  const guest = session.participants[1];
  const guestUser = store.users.find((user) => user.id === guest.userId);

  leaveRunningMatch(store, guestUser, { matchId: 'dq-status-duel', reason: 'disqualified' });

  const hostView = buildRunningMatchStatusResponse(store, pusher, statusInput(session));
  assert.equal(hostView.opponent.liveStatus, 'forfeited');
  assert.equal(hostView.opponent.disqualified, true);
  assert.equal('currentUserDisqualified' in hostView, false);

  const guestView = buildRunningMatchStatusResponse(store, guestUser, statusInput(session));
  assert.equal(guestView.currentUserLiveStatus, 'forfeited');
  assert.equal(guestView.currentUserDisqualified, true);
  assert.equal('disqualified' in guestView.opponent, false);
});

test('/result rows + save-time copy: the disqualified side reads 실격패, the winner 상대 실격 승, 0P vs 20P', () => {
  const { store, session, pusher } = createRunningDuelFixture('dq-result-duel');
  const guest = session.participants[1];
  const guestUser = store.users.find((user) => user.id === guest.userId);

  leaveRunningMatch(store, guestUser, { matchId: 'dq-result-duel', reason: 'disqualified' });

  const result = buildMatchResultByMatchId(store, pusher, 'dq-result-duel');
  const guestRow = result.participants.find((row) => row.userId === guest.userId);
  const hostRow = result.participants.find((row) => row.userId === pusher.id);
  assert.equal(guestRow.forfeited, true);
  assert.equal(guestRow.disqualified, true);
  assert.equal(guestRow.resultTone, 'lose');
  assert.equal('disqualified' in hostRow, false);
  assert.equal(hostRow.resultTone, 'win');

  const guestBlob = resolveSavedDuelMatchResult(store, guestUser, {
    mode: 'duel',
    matchId: 'dq-result-duel',
    source: 'official',
    title: '부정 러닝으로 실격패했어요',
    summary: '요약',
    badgeLabel: '실격패',
    resultTone: 'lose',
    disqualified: true,
  });
  assert.equal(guestBlob.badgeLabel, '실격패');
  assert.equal(guestBlob.title, '부정 러닝으로 실격패했어요');
  assert.equal(guestBlob.resultTone, 'lose');
  assert.equal(guestBlob.disqualified, true);

  const hostBlob = resolveSavedDuelMatchResult(store, pusher, {
    mode: 'duel',
    matchId: 'dq-result-duel',
    source: 'official',
    title: '결과 집계 중',
    summary: '요약',
    badgeLabel: '결과 집계 중',
  });
  assert.equal(hostBlob.badgeLabel, '상대 실격 승');
  assert.equal(hostBlob.resultTone, 'win');
  assert.equal('disqualified' in hostBlob, false);

  assert.equal(getMatchBonusPoints({ distanceKm: 6, matchResult: guestBlob }), 0);
  assert.equal(getMatchBonusPoints({ distanceKm: 6, matchResult: hostBlob }), 20);
});

test('a plain forfeit keeps today\'s verdict copy (패배/승리) — no 실격 wording without the reason', () => {
  const { store, session, pusher } = createRunningDuelFixture('plain-copy-duel');
  const guest = session.participants[1];
  const guestUser = store.users.find((user) => user.id === guest.userId);

  leaveRunningMatch(store, guestUser, { matchId: 'plain-copy-duel' });

  const guestBlob = resolveSavedDuelMatchResult(store, guestUser, {
    mode: 'duel', matchId: 'plain-copy-duel', source: 'official', title: 't', summary: 's', badgeLabel: '기권 패', resultTone: 'lose',
  });
  assert.equal(guestBlob.badgeLabel, '패배');
  assert.equal('disqualified' in guestBlob, false);
  assert.equal(getMatchBonusPoints({ distanceKm: 6, matchResult: guestBlob }), 10);

  const hostBlob = resolveSavedDuelMatchResult(store, pusher, {
    mode: 'duel', matchId: 'plain-copy-duel', source: 'official', title: 't', summary: 's', badgeLabel: '결과 집계 중',
  });
  assert.equal(hostBlob.badgeLabel, '승리');

  const result = buildMatchResultByMatchId(store, pusher, 'plain-copy-duel');
  const guestRow = result.participants.find((row) => row.userId === guest.userId);
  assert.equal(guestRow.forfeited, true);
  assert.equal('disqualified' in guestRow, false);
});

function createRunningGroupFixture(matchId) {
  const users = ['a', 'b', 'c'].map((suffix) => createUser(`group-${suffix}-${matchId}`));
  const session = {
    id: matchId,
    mode: 'group',
    isTestMatch: false,
    isPartyRun: false,
    distanceKm: 5,
    slotStartAt: iso(-30 * 60 * 1000),
    startedAt: iso(-30 * 60 * 1000),
    createdAt: iso(-31 * 60 * 1000),
    matchedAt: iso(-31 * 60 * 1000),
    participants: users.map((user, index) => ({
      userId: user.id,
      seedRank: index + 1,
      acceptedAt: null,
      liveStatus: 'running',
      liveDistanceKm: 2,
      liveElapsedSeconds: 800,
      livePace: '06:40/km',
      liveUpdatedAt: iso(-5 * 1000),
      finishedAt: null,
      finishElapsedSeconds: null,
    })),
  };

  return {
    store: {
      users,
      runs: users.map((user) => createProfileRun(user.id)),
      matchSessions: [session],
      matchQueues: { duel: [], group: [] },
      matchRooms: [],
      notifications: [],
    },
    session,
    users,
  };
}

test('group status: participants[] and groupVerdict.participants[] carry disqualified for the flagged runner only', () => {
  const { store, session, users } = createRunningGroupFixture('dq-group');
  const [host, , flagged] = users;

  leaveRunningMatch(store, flagged, { matchId: 'dq-group', reason: 'disqualified' });

  const hostView = buildRunningMatchStatusResponse(store, host, statusInput(session));
  const flaggedRow = hostView.participants.find((participant) => participant.id === flagged.id);
  assert.equal(flaggedRow.liveStatus, 'forfeited');
  assert.equal(flaggedRow.disqualified, true);
  assert.equal(hostView.participants.filter((participant) => 'disqualified' in participant).length, 1);

  const verdictRow = hostView.groupVerdict.participants.find((participant) => participant.userId === flagged.id);
  assert.equal(verdictRow.forfeited, true);
  assert.equal(verdictRow.disqualified, true);
  assert.equal(hostView.groupVerdict.participants.filter((participant) => 'disqualified' in participant).length, 1);

  const flaggedView = buildRunningMatchStatusResponse(store, flagged, statusInput(session));
  assert.equal(flaggedView.currentUserDisqualified, true);
});

test('pruned session: the winner\'s save still reads 상대 실격 승 off the opponent\'s saved disqualified blob', () => {
  const { store, session, pusher } = createRunningDuelFixture('dq-pruned-duel');
  const guest = session.participants[1];

  // The disqualified runner saved first (their blob is the self-contained 실격 record), then the
  // session was pruned before the winner's save landed — the no-session resolver branch.
  store.runs.push({
    id: 'guest-dq-run',
    userId: guest.userId,
    date: iso().slice(0, 10),
    distanceKm: 2.1,
    pace: '07:00/km',
    durationSeconds: 900,
    source: 'RunningGround',
    sourceType: 'runningground',
    createdAt: iso(),
    matchResult: {
      mode: 'duel',
      matchId: 'dq-pruned-duel',
      source: 'official',
      title: '부정 러닝으로 실격패했어요',
      summary: '요약',
      badgeLabel: '실격패',
      resultTone: 'lose',
      disqualified: true,
      myDurationSeconds: 2000,
    },
  });
  store.matchSessions = [];

  const hostBlob = resolveSavedDuelMatchResult(store, pusher, {
    mode: 'duel',
    matchId: 'dq-pruned-duel',
    source: 'official',
    title: '결과 집계 중',
    summary: '요약',
    badgeLabel: '결과 집계 중',
    myDurationSeconds: 1500,
  });

  assert.equal(hostBlob.resultTone, 'win');
  assert.equal(hostBlob.badgeLabel, '상대 실격 승');
  assert.equal(hostBlob.opponentId, guest.userId);
  assert.equal('disqualified' in hostBlob, false);

  // The pruned-session /result reconstruction (participant-only: the requester must own a saved
  // run) flags the disqualified row from the saved blob too.
  store.runs.push({
    id: 'host-win-run',
    userId: pusher.id,
    date: iso().slice(0, 10),
    distanceKm: 6,
    pace: '04:10/km',
    durationSeconds: 1500,
    source: 'RunningGround',
    sourceType: 'runningground',
    createdAt: iso(),
    matchResult: hostBlob,
  });
  const result = buildMatchResultByMatchId(store, pusher, 'dq-pruned-duel');
  const guestRow = result.participants.find((row) => row.userId === guest.userId);
  const hostRow = result.participants.find((row) => row.userId === pusher.id);
  assert.equal(guestRow.forfeited, true);
  assert.equal(guestRow.disqualified, true);
  assert.equal(hostRow.resultTone, 'win');
  assert.equal('disqualified' in hostRow, false);
});

// ── 저장된 실격/기권 블롭이 leave를 대신한다 (적대 리뷰 2026-09-09) ──────────────────────────
// 클라 워치독 실격 → leave({ reason: 'disqualified' })가 네트워크/400으로 실패(클라가 삼킴) →
// 그래도 저장은 '실격패' 블롭으로 도착한다. 예전에는 저장자가 아직 달리는 참가자라 블롭이 PENDING
// 으로 뒤집히고(나중에 평문 '패배'로 치유) 상대는 평문 '승리'로 굳어 실격 표식이 양쪽 폰에서
// 사라졌다. 이제 저장 시 resolver가 leaveRunningMatch가 했을 스탬프를 같은 헬퍼로 대신 박는다.

function buildSelfForfeitDuelBlob(matchId, { disqualified = false } = {}) {
  return disqualified
    ? {
        mode: 'duel',
        matchId,
        source: 'official',
        title: '부정 러닝으로 실격패 처리됐어요',
        summary: '요약',
        badgeLabel: '실격패',
        resultTone: 'lose',
        disqualified: true,
      }
    : {
        mode: 'duel',
        matchId,
        source: 'official',
        title: '기권으로 대결을 마쳤어요',
        summary: '요약',
        badgeLabel: '기권 패',
        resultTone: 'lose',
      };
}

function buildPendingDuelBlob(matchId) {
  return { mode: 'duel', matchId, source: 'official', title: '결과 집계 중', summary: '요약', badgeLabel: '결과 집계 중' };
}

test('save-only 실격패 (leave never reached the server): the resolver forfeits + flags the participant; host reads 상대 실격 승', () => {
  const { store, session, pusher } = createRunningDuelFixture('dq-save-only-duel');
  const guest = session.participants[1];
  const guestUser = store.users.find((user) => user.id === guest.userId);

  // The guest saves the watchdog's 실격패 blob WITHOUT any leave call.
  const guestBlob = resolveSavedDuelMatchResult(store, guestUser, buildSelfForfeitDuelBlob('dq-save-only-duel', { disqualified: true }));

  // The session participant carries exactly what leaveRunningMatch({ reason: 'disqualified' }) stamps.
  assert.equal(guest.liveStatus, 'forfeited');
  assert.equal(typeof guest.forfeitedAt, 'string');
  assert.equal(guest.liveUpdatedAt, guest.forfeitedAt);
  assert.equal(guest.disqualified, true);
  assert.equal(guest.forfeitReason, 'disqualified');

  // The saver's own blob is NOT turned PENDING — it resolves as the 실격패 loss it claims, 0P.
  assert.equal(guestBlob.badgeLabel, '실격패');
  assert.equal(guestBlob.resultTone, 'lose');
  assert.equal(guestBlob.disqualified, true);
  assert.equal(getMatchBonusPoints({ distanceKm: 6, matchResult: guestBlob }), 0);

  // Host status: opponent forfeited AND disqualified.
  const hostView = buildRunningMatchStatusResponse(store, pusher, statusInput(session));
  assert.equal(hostView.opponent.liveStatus, 'forfeited');
  assert.equal(hostView.opponent.disqualified, true);

  // Host save → 상대 실격 승 (no disqualified key on the winner's blob), 20P.
  const hostBlob = resolveSavedDuelMatchResult(store, pusher, buildPendingDuelBlob('dq-save-only-duel'));
  assert.equal(hostBlob.badgeLabel, '상대 실격 승');
  assert.equal(hostBlob.resultTone, 'win');
  assert.equal('disqualified' in hostBlob, false);
  assert.equal(getMatchBonusPoints({ distanceKm: 6, matchResult: hostBlob }), 20);

  // /result rows agree.
  const result = buildMatchResultByMatchId(store, pusher, 'dq-save-only-duel');
  const guestRow = result.participants.find((row) => row.userId === guest.userId);
  assert.equal(guestRow.forfeited, true);
  assert.equal(guestRow.disqualified, true);

  // A retried save (dedupe re-runs the resolver) is a no-op on the already-terminal participant.
  const forfeitedAt = guest.forfeitedAt;
  resolveSavedDuelMatchResult(store, guestUser, buildSelfForfeitDuelBlob('dq-save-only-duel', { disqualified: true }));
  assert.equal(guest.forfeitedAt, forfeitedAt);
});

test('save-only plain 기권 패: forfeited with NO disqualified key; the winner keeps today\'s plain 승리 copy', () => {
  const { store, session, pusher } = createRunningDuelFixture('plain-save-only-duel');
  const guest = session.participants[1];
  const guestUser = store.users.find((user) => user.id === guest.userId);

  const guestBlob = resolveSavedDuelMatchResult(store, guestUser, buildSelfForfeitDuelBlob('plain-save-only-duel'));

  assert.equal(guest.liveStatus, 'forfeited');
  assert.equal(typeof guest.forfeitedAt, 'string');
  assert.equal('disqualified' in guest, false);
  assert.equal('forfeitReason' in guest, false);
  // Plain forfeit → today's verdict copy, exactly as after a real leave call.
  assert.equal(guestBlob.resultTone, 'lose');
  assert.equal(guestBlob.badgeLabel, '패배');
  assert.equal('disqualified' in guestBlob, false);

  const hostView = buildRunningMatchStatusResponse(store, pusher, statusInput(session));
  assert.equal(hostView.opponent.liveStatus, 'forfeited');
  assert.equal('disqualified' in hostView.opponent, false);

  const hostBlob = resolveSavedDuelMatchResult(store, pusher, buildPendingDuelBlob('plain-save-only-duel'));
  assert.equal(hostBlob.resultTone, 'win');
  assert.equal(hostBlob.badgeLabel, '승리');
  assert.equal('disqualified' in hostBlob, false);
});

test('the stamp is SELF-only: a winner saving their own 상대 실격 승 / 상대 기권 승 blob is never forfeited', () => {
  const { store, session, pusher } = createRunningDuelFixture('winner-blob-duel');
  const host = session.participants[0];

  for (const badgeLabel of ['상대 실격 승', '상대 기권 승']) {
    resolveSavedDuelMatchResult(store, pusher, {
      mode: 'duel', matchId: 'winner-blob-duel', source: 'official', title: 't', summary: 's', badgeLabel, resultTone: 'win',
    });
    assert.equal(host.liveStatus, 'running', badgeLabel);
    assert.equal('forfeitedAt' in host, false, badgeLabel);
  }
});

test('the stamp never touches a terminal participant: a finished runner\'s 기권 blob leaves the finish intact', () => {
  const { store, session, finished } = createFinishingDuelFixture('finished-forfeit-blob-duel');
  const mine = session.participants[0];

  resolveSavedDuelMatchResult(store, finished, buildSelfForfeitDuelBlob('finished-forfeit-blob-duel'));

  assert.equal(mine.liveStatus, 'finished');
  assert.equal(mine.finishElapsedSeconds, 1622);
  assert.equal('forfeitedAt' in mine, false);
});

test('group: a save-only 실격패 blob forfeits + flags the participant for the other runners (blob returned as saved)', () => {
  const { store, session, users } = createRunningGroupFixture('dq-group-save-only');
  const [host, , flagged] = users;
  const blob = {
    mode: 'group',
    matchId: 'dq-group-save-only',
    source: 'official',
    title: '부정 러닝으로 그룹 대결에서 실격됐어요',
    summary: '요약',
    badgeLabel: '실격패',
    rank: 3,
    participantCount: 3,
    disqualified: true,
  };

  const resolved = resolveSavedGroupMatchResult(store, flagged, blob);

  // The forfeit record stays self-contained and authoritative — returned as saved.
  assert.equal(resolved, blob);

  const participant = session.participants.find((entry) => entry.userId === flagged.id);
  assert.equal(participant.liveStatus, 'forfeited');
  assert.equal(typeof participant.forfeitedAt, 'string');
  assert.equal(participant.disqualified, true);
  assert.equal(participant.forfeitReason, 'disqualified');

  const hostView = buildRunningMatchStatusResponse(store, host, statusInput(session));
  const flaggedRow = hostView.participants.find((entry) => entry.id === flagged.id);
  assert.equal(flaggedRow.liveStatus, 'forfeited');
  assert.equal(flaggedRow.disqualified, true);
  assert.equal(hostView.participants.filter((entry) => 'disqualified' in entry).length, 1);
});

// ---------------------------------------------------------------------------
// 예약 취소 (2026-09-09 파티런 예약): 파티런 세션(isPartyRun)의 취소는 재큐잉 없이 세션·방을
// 걷고 남은 사람에게 취소 알림을 남긴다. 공식 예약의 취소(남은 사람 재큐잉, 1시간 컷오프)는
// 바이트 단위로 예전 그대로다.
// ---------------------------------------------------------------------------

function createReservationFixture({ matchId, isPartyRun, isScheduledPartyRun = isPartyRun, slotOffsetMs, withRoom = isPartyRun }) {
  const host = createUser(`host-${matchId}`);
  const guest = createUser(`guest-${matchId}`);
  const slotStartAt = iso(slotOffsetMs);
  const session = {
    id: matchId,
    mode: 'duel',
    isTestMatch: false,
    isPartyRun,
    // 예약 전용 규칙은 isScheduledPartyRun으로만 갈린다 — 방장 시작 파티런은 isPartyRun만 참이다.
    ...(isScheduledPartyRun ? { isScheduledPartyRun: true } : {}),
    distanceKm: 5,
    slotStartAt,
    createdAt: iso(-60 * 1000),
    matchedAt: iso(-60 * 1000),
    participants: [host, guest].map((user, index) => ({
      userId: user.id,
      seedRank: index + 1,
      acceptedAt: null,
      liveStatus: 'ready',
      liveDistanceKm: 0,
      liveElapsedSeconds: 0,
      livePace: '--:--/km',
      liveUpdatedAt: null,
      finishedAt: null,
    })),
  };
  const room = {
    id: `${matchId}-room`,
    inviteToken: 'RSV001',
    hostUserId: host.id,
    mode: 'duel',
    startMode: 'scheduled',
    distanceKm: 5,
    slotStartAt,
    maxParticipants: 2,
    minParticipants: 2,
    invitedFriendIds: [],
    participants: [host, guest].map((user, index) => ({
      userId: user.id,
      isHost: index === 0,
      isReady: false,
      isCountdownReady: false,
      invited: index > 0,
      joinedAt: iso(-60 * 1000),
    })),
    createdAt: iso(-120 * 1000),
    linkedMatchId: matchId,
  };
  const store = {
    users: [host, guest],
    runs: [createProfileRun(host.id), createProfileRun(guest.id)],
    matchSessions: [session],
    matchQueues: { duel: [], group: [] },
    matchRooms: withRoom ? [room] : [],
    notifications: [],
  };
  return { store, session, room, host, guest, slotStartAt };
}

test('party reservation cancel: no requeue, session + linked room gone, tombstoned, the other side gets the cancel notice', () => {
  clearVanishedMatchTombstones();
  // 출발 30분 전 — 공식 예약이라면 이미 취소 마감. 파티런은 출발 직전까지 취소된다.
  const { store, session, room, host, guest, slotStartAt } = createReservationFixture({
    matchId: 'party-cancel',
    isPartyRun: true,
    slotOffsetMs: 30 * 60 * 1000,
  });

  const result = cancelRunningMatch(store, host, { mode: 'duel', distanceKm: 5, slotStartAt, matchId: session.id });

  assert.deepEqual(result, { success: true });
  assert.equal(store.matchSessions.some((entry) => entry.id === session.id), false);
  assert.equal(isMatchTombstoned(session.id), true);
  assert.equal(store.matchRooms.some((entry) => entry.id === room.id), false, '연결된 방도 함께 사라진다');
  assert.deepEqual(store.matchQueues.duel, [], '파티런은 남은 사람을 매칭 큐에 넣지 않는다');

  const guestNotices = store.notifications.filter((item) => item.userId === guest.id);
  assert.equal(guestNotices.length, 1);
  assert.equal(guestNotices[0].type, 'match_room_closed');
  assert.equal(guestNotices[0].title, '파티런 예약이 취소됐어요');
  assert.match(guestNotices[0].body, new RegExp(`^${host.name}님이 .+ 파티런 예약을 취소했어요$`));
  assert.deepEqual(guestNotices[0].data, { mode: 'duel' }, '이미 없는 방으로 가는 roomId는 싣지 않는다');
  assert.equal(store.notifications.some((item) => item.userId === host.id), false);
});

test('party reservation cancel is refused once the match has started', () => {
  const { store, session, guest, slotStartAt } = createReservationFixture({
    matchId: 'party-active',
    isPartyRun: true,
    slotOffsetMs: -60 * 1000,
  });

  assert.throws(
    () => cancelRunningMatch(store, guest, { mode: 'duel', distanceKm: 5, slotStartAt, matchId: session.id }),
    { statusCode: 400, message: '이미 출발한 매치는 취소할 수 없어요.' },
  );
  assert.equal(store.matchSessions.length, 1);
  assert.equal(store.matchRooms.length, 1);
});

// 방장 시작 파티런도 isPartyRun이지만 '예약'이 아니다 — 취소 규칙은 공식 예약과 같아야 한다
// (적대 검증 2026-09-10: 새 예약 분기가 방장 시작 방까지 걷어가던 회귀).
test('a host-start party run is NOT treated as a reservation: the 1-hour cutoff and requeue stay', () => {
  clearVanishedMatchTombstones();
  const { store, session, host, guest, slotStartAt } = createReservationFixture({
    matchId: 'host-start-party',
    isPartyRun: true,
    isScheduledPartyRun: false,
    slotOffsetMs: 30 * 60 * 1000,
    withRoom: true,
  });

  // 출발 30분 전 — 공식 규칙(1시간 컷오프)이 그대로 적용돼 취소가 막힌다.
  assert.throws(
    () => cancelRunningMatch(store, host, { mode: 'duel', distanceKm: 5, slotStartAt, matchId: session.id }),
    { statusCode: 400 },
  );
  assert.equal(store.matchSessions.length, 1);
  assert.equal(store.matchRooms.length, 1, '방장 시작 방은 취소 경로가 건드리지 않는다');

  // 여유가 있으면 공식 예약처럼 남은 사람을 재큐잉한다(파티런 취소 알림 없음).
  const early = createReservationFixture({
    matchId: 'host-start-party-early',
    isPartyRun: true,
    isScheduledPartyRun: false,
    slotOffsetMs: 3 * 60 * 60 * 1000,
    withRoom: true,
  });
  const result = cancelRunningMatch(early.store, early.host, {
    mode: 'duel', distanceKm: 5, slotStartAt: early.slotStartAt, matchId: early.session.id,
  });
  assert.deepEqual(result, { success: true });
  assert.equal(early.store.matchQueues.duel.length, 1);
  assert.equal(early.store.matchQueues.duel[0].userId, early.guest.id);
  assert.equal(early.store.notifications.some((item) => item.type === 'match_room_closed'), false);
  void guest;
});

test('official reservation cancel is unchanged: the other runner is re-queued for the same slot, no notice', () => {
  clearVanishedMatchTombstones();
  const { store, session, host, guest, slotStartAt } = createReservationFixture({
    matchId: 'official-cancel',
    isPartyRun: false,
    slotOffsetMs: 2 * 60 * 60 * 1000,
  });

  const result = cancelRunningMatch(store, host, { mode: 'duel', distanceKm: 5, slotStartAt, matchId: session.id });

  assert.deepEqual(result, { success: true });
  assert.equal(store.matchSessions.length, 0);
  assert.equal(isMatchTombstoned(session.id), true);
  assert.equal(store.matchQueues.duel.length, 1);
  assert.equal(store.matchQueues.duel[0].userId, guest.id);
  assert.equal(store.matchQueues.duel[0].slotStartAt, slotStartAt);
  assert.equal(store.notifications.length, 0);
});

test('official reservation cancel still hits the 1h cutoff', () => {
  const { store, session, host, guest, slotStartAt } = createReservationFixture({
    matchId: 'official-late',
    isPartyRun: false,
    slotOffsetMs: 30 * 60 * 1000,
  });

  assert.throws(
    () => cancelRunningMatch(store, host, { mode: 'duel', distanceKm: 5, slotStartAt, matchId: session.id }),
    { statusCode: 400, message: '출발 1시간 전부터는 예약을 취소할 수 없어요.' },
  );
  assert.equal(store.matchSessions.length, 1);
  assert.equal(store.matchQueues.duel.some((entry) => entry.userId === guest.id), false);
});
