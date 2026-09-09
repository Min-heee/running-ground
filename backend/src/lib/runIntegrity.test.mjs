import assert from 'node:assert/strict';

import { buildUserRunMetrics, getRunPointValue } from './points.mjs';
import { createJsonRunsRepository } from '../repositories/runsRepository.mjs';
import {
  applyRunIntegrityCheck,
  classifyCadenceAudit,
  classifyRunIntegrity,
  normalizeCadenceAudit,
  resolveRunIntegrityVerdict,
} from './runIntegrity.mjs';

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`[runIntegrity] ok - ${name}`);
  } catch (error) {
    console.error(`[runIntegrity] failed - ${name}`);
    throw error;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// ── classifyRunIntegrity: table-driven ─────────────────────────────────────────────────────

const CLASSIFIER_CASES = [
  {
    // HONEST GAP, asserted as such: an unmounted bicycle at 20km/h (5.56 m/s — just under the
    // 5.6 m/s impossible-run gate) with pocket-pedaling vibration steps averaging ~70spm reads
    // as 'suspect' only. 70 ≥ the punitive 40spm floor, so stage 2 does not punish it — the
    // telemetry line exists exactly to calibrate this band post-launch.
    name: 'bicycle 20km/h with ~70spm pocket-pedaling → suspect (NOT vehicle)',
    input: { distanceKm: 5, durationSeconds: 900, cadenceSpm: 70 },
    expected: 'suspect',
  },
  {
    // LAUNCH DECISION (adversarial review 2026-07-12): cadence alone never convicts —
    // the mounted-phone signature is client-nulled before reaching the server, while
    // pause/screen-off undercount can push a REAL run into the same low band. Flag only;
    // re-arm as stage 3 once suspect-telemetry proves the band clean.
    name: 'mounted cyclist 15km/h cadence 5 → suspect (cadence alone never convicts at launch)',
    input: { distanceKm: 5, durationSeconds: 1200, cadenceSpm: 5 },
    expected: 'suspect',
  },
  {
    // 0.5km all-out sprint at 2:50/km (5.88 m/s) is trained-amateur POSSIBLE — the 5.6 rule
    // only convicts from 1.5km; short runs fall to the suspect band instead.
    name: 'short-run 0.5km sprint at 2:50/km → suspect, not vehicle',
    input: { distanceKm: 0.5, durationSeconds: 85, cadenceSpm: 180 },
    expected: 'suspect',
  },
  {
    // >7.0 m/s over even 500m is sprint-world-record territory — vehicle outright.
    name: 'short-run 0.5km at 2:20/km (7.1 m/s) → vehicle',
    input: { distanceKm: 0.5, durationSeconds: 70, cadenceSpm: 180 },
    expected: 'vehicle',
  },
  {
    // 1.5km+ sustains the 5.6 m/s rule on its own.
    name: '1.5km at 2:55/km (5.7 m/s) → vehicle',
    input: { distanceKm: 1.5, durationSeconds: 263, cadenceSpm: 170 },
    expected: 'vehicle',
  },
  {
    // 2:30/km = 6.67 m/s — beyond human running, cadence cannot excuse it.
    name: 'elite-impossible 2:30/km with high cadence → vehicle regardless of cadence',
    input: { distanceKm: 5, durationSeconds: 750, cadenceSpm: 170 },
    expected: 'vehicle',
  },
  {
    name: 'elite-impossible 2:30/km with null cadence → vehicle regardless of cadence',
    input: { distanceKm: 5, durationSeconds: 750, cadenceSpm: null },
    expected: 'vehicle',
  },
  {
    // 12:00/km = 1.39 m/s — below the 2.4 m/s running-speed floor, cadence irrelevant.
    name: 'slow walk 12:00/km cadence 95 → clear',
    input: { distanceKm: 2, durationSeconds: 1440, cadenceSpm: 95 },
    expected: 'clear',
  },
  {
    // Screen-off / pause undercount can halve a real ~160spm to ~80: must NOT be punished.
    name: 'screen-off real run 5:30/km cadence 82 → suspect, not vehicle',
    input: { distanceKm: 5, durationSeconds: 1650, cadenceSpm: 82 },
    expected: 'suspect',
  },
  {
    // Solo runs may save without motion permission → cadenceSpm null. Gray zone only.
    name: 'null cadence at 5:00/km → suspect, not vehicle',
    input: { distanceKm: 5, durationSeconds: 1500, cadenceSpm: null },
    expected: 'suspect',
  },
  {
    name: 'real run 5:00/km cadence 150 → clear',
    input: { distanceKm: 5, durationSeconds: 1500, cadenceSpm: 150 },
    expected: 'clear',
  },
  {
    name: 'sub-500m record is never classified, even at vehicle speed',
    input: { distanceKm: 0.4, durationSeconds: 60, cadenceSpm: 0 },
    expected: 'clear',
  },
  {
    // Exactly 5.6 m/s does not trip the strict > impossible-run gate; cadence 100 ≥ 90 clears.
    name: 'boundary: exactly 5.6 m/s with healthy cadence → clear',
    input: { distanceKm: 2.8, durationSeconds: 500, cadenceSpm: 100 },
    expected: 'clear',
  },
  {
    name: 'garbage input (zero duration) → clear',
    input: { distanceKm: 5, durationSeconds: 0, cadenceSpm: 20 },
    expected: 'clear',
  },
  {
    name: 'garbage input (non-finite distance) → clear',
    input: { distanceKm: Number.NaN, durationSeconds: 1200, cadenceSpm: 20 },
    expected: 'clear',
  },
  {
    name: 'missing input object → clear',
    input: undefined,
    expected: 'clear',
  },
];

for (const testCase of CLASSIFIER_CASES) {
  await runTest(`classify: ${testCase.name}`, () => {
    assert.equal(classifyRunIntegrity(testCase.input), testCase.expected);
  });
}

// ── applyRunIntegrityCheck: stamping + LP revocation over a fake store ─────────────────────

function buildUser(rankState = { tier: '러너', lp: 10 }) {
  return { id: 'user-1', name: '러너', rankState: clone(rankState) };
}

function buildStore({ user = buildUser(), notifications = [] } = {}) {
  return { users: [user], runs: [], notifications };
}

function buildTrackedRun(extra = {}) {
  // Default fixture is a VEHICLE via the speed rule (5km at 2:30/km = 6.67 m/s):
  // cadence alone no longer convicts, so the punitive-path tests ride the
  // unambiguous impossible-speed verdict.
  return {
    id: 'run-1',
    userId: 'user-1',
    sourceType: 'runningground',
    date: '2026-07-12',
    distanceKm: 5,
    durationSeconds: 750,
    cadenceSpm: 170,
    pace: '02:30/km',
    ...extra,
  };
}

function buildRankChangeNotification({ userId = 'user-1', matchId = 'match-1', lpDelta = 20 } = {}) {
  return {
    id: `notification-${userId}-${matchId}`,
    userId,
    type: 'rank_change',
    title: '랭크 LP 변동',
    body: `대결 결과로 랭크 ${lpDelta > 0 ? '+' : ''}${lpDelta} LP가 반영됐어요.`,
    data: { matchId, mode: 'duel', lpDelta },
    createdAt: '2026-07-12T12:00:00.000Z',
  };
}

const FIXED_NOW_ISO = () => '2026-07-12T12:34:56.000Z';

await runTest('suspect: stamps verdict + checkedAt, no punishment', () => {
  const user = buildUser();
  const store = buildStore({ user, notifications: [buildRankChangeNotification()] });
  const run = buildTrackedRun({ durationSeconds: 1650, cadenceSpm: 82, matchResult: { matchId: 'match-1', mode: 'duel', resultTone: 'win' } });

  applyRunIntegrityCheck({ store, user, run, nowIso: FIXED_NOW_ISO });

  assert.deepEqual(run.integrity, { verdict: 'suspect', checkedAt: FIXED_NOW_ISO() });
  // NO punishment: rankState untouched even though a rank_change marker exists.
  assert.deepEqual(user.rankState, { tier: '러너', lp: 10 });
});

await runTest('clear: run stays entirely un-stamped', () => {
  const user = buildUser();
  const store = buildStore({ user });
  const run = buildTrackedRun({ durationSeconds: 1500, cadenceSpm: 150 });

  applyRunIntegrityCheck({ store, user, run, nowIso: FIXED_NOW_ISO });

  assert.equal('integrity' in run, false);
});

await runTest('non-runningground saves are never classified', () => {
  const user = buildUser();
  const store = buildStore({ user });
  const run = buildTrackedRun({ sourceType: 'apple_health' });

  applyRunIntegrityCheck({ store, user, run, nowIso: FIXED_NOW_ISO });

  assert.equal('integrity' in run, false);
});

await runTest('vehicle without a matchResult: stamped, no LP touched', () => {
  const user = buildUser();
  const store = buildStore({ user, notifications: [buildRankChangeNotification()] });
  const run = buildTrackedRun();

  applyRunIntegrityCheck({ store, user, run, nowIso: FIXED_NOW_ISO });

  // The speed rule stamps its reason (2026-09-09: 'speed' | 'cadence-watchdog' | 'cadence-audit').
  assert.deepEqual(run.integrity, { verdict: 'vehicle', reason: 'speed', checkedAt: FIXED_NOW_ISO() });
  assert.deepEqual(user.rankState, { tier: '러너', lp: 10 });
});

await runTest('vehicle with applied LP: reverses exactly this user\'s delta with tier-floor clamp semantics', () => {
  const user = buildUser({ tier: '러너', lp: 10 });
  const opponent = { id: 'user-2', name: '상대', rankState: { tier: '러너', lp: 50 } };
  const store = {
    users: [user, opponent],
    runs: [],
    notifications: [
      buildRankChangeNotification({ userId: 'user-1', matchId: 'match-1', lpDelta: 20 }),
      buildRankChangeNotification({ userId: 'user-2', matchId: 'match-1', lpDelta: -20 }),
    ],
  };
  const run = buildTrackedRun({ matchResult: { matchId: 'match-1', mode: 'duel', resultTone: 'win' } });

  applyRunIntegrityCheck({ store, user, run, nowIso: FIXED_NOW_ISO });

  // -20 from 러너/10 crosses the tier boundary: demote to 입문, lp 190 (LP_PER_TIER borrow).
  assert.deepEqual(user.rankState, { tier: '입문', lp: 90 });
  assert.equal(run.integrity.lpRevoked, 20);
  // Stage 2 never touches the OPPONENT's LP (stage-3 follow-up).
  assert.deepEqual(opponent.rankState, { tier: '러너', lp: 50 });
});

await runTest('vehicle loser: the loss LP STAYS — a cheat verdict never refunds a loss (verdict stamped, nothing revoked)', () => {
  const user = buildUser({ tier: '러너', lp: 10 });
  const store = buildStore({
    user,
    notifications: [buildRankChangeNotification({ lpDelta: -20 })],
  });
  const run = buildTrackedRun({ matchResult: { matchId: 'match-1', mode: 'duel', resultTone: 'lose' } });

  applyRunIntegrityCheck({ store, user, run, nowIso: FIXED_NOW_ISO });

  // 적대 리뷰 2026-09-09: this used to annul the -20 too, i.e. the cheater got their lost LP
  // BACK. Only a GAIN is ever revoked; a lost match stays lost, whatever the vehicle reason.
  assert.equal(run.integrity.verdict, 'vehicle');
  assert.equal(run.integrity.reason, 'speed');
  assert.deepEqual(user.rankState, { tier: '러너', lp: 10 });
  assert.equal('lpRevoked' in run.integrity, false);
});

await runTest('idempotence: applying twice revokes once', () => {
  const user = buildUser({ tier: '페이서', lp: 100 });
  const store = buildStore({ user, notifications: [buildRankChangeNotification({ lpDelta: 28 })] });
  const run = buildTrackedRun({ matchResult: { matchId: 'match-1', mode: 'duel', resultTone: 'win' } });

  applyRunIntegrityCheck({ store, user, run, nowIso: FIXED_NOW_ISO });
  applyRunIntegrityCheck({ store, user, run, nowIso: () => '2026-07-12T13:00:00.000Z' });

  assert.deepEqual(user.rankState, { tier: '페이서', lp: 72 });
  assert.equal(run.integrity.lpRevoked, 28);
  // First stamp survives the retry untouched.
  assert.equal(run.integrity.checkedAt, FIXED_NOW_ISO());
});

await runTest('LP not yet applied at save time: revocation retries once the rank_change marker lands', () => {
  const user = buildUser({ tier: '러너', lp: 10 });
  const store = buildStore({ user, notifications: [] });
  const run = buildTrackedRun({ matchResult: { matchId: 'match-1', mode: 'duel', resultTone: 'pending' } });

  // Original save: opponent still running → no rank_change yet → flag only, nothing to revoke.
  applyRunIntegrityCheck({ store, user, run, nowIso: FIXED_NOW_ISO });
  assert.equal(run.integrity.verdict, 'vehicle');
  assert.equal('lpRevoked' in run.integrity, false);
  assert.deepEqual(user.rankState, { tier: '러너', lp: 10 });

  // Opponent finishes → LP applied on the progress path → reconcile re-save retries.
  store.notifications.push(buildRankChangeNotification({ lpDelta: 20 }));
  applyRunIntegrityCheck({ store, user, run, nowIso: FIXED_NOW_ISO });

  assert.equal(run.integrity.lpRevoked, 20);
  assert.deepEqual(user.rankState, { tier: '입문', lp: 90 });
});

await runTest('poisoned input: a throwing run property can never fail the save (run stays un-flagged)', () => {
  const user = buildUser();
  const store = buildStore({ user });
  const run = buildTrackedRun();
  Object.defineProperty(run, 'distanceKm', {
    get() {
      throw new Error('poisoned classifier input');
    },
  });

  assert.doesNotThrow(() => {
    applyRunIntegrityCheck({ store, user, run, nowIso: FIXED_NOW_ISO });
  });
  assert.equal('integrity' in run, false);
  assert.deepEqual(user.rankState, { tier: '러너', lp: 10 });
});

// ── Save-path integration: createTrackedRun end-to-end (json repository harness) ───────────

class TestApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function createRepositoryHarness(initialStore = {}) {
  let store = {
    users: [{ id: 'user-1', name: '러너', connectedSources: [], rankState: { tier: '러너', lp: 10 } }],
    sessions: [{ token: 'token-1', userId: 'user-1' }],
    runs: [],
    notifications: [],
    integrationImports: [],
    ...clone(initialStore),
  };
  let idIndex = 0;

  const repository = createJsonRunsRepository({
    loadStore: () => clone(store),
    mutateStore: (mutator) => {
      const nextStore = clone(store);
      const result = mutator(nextStore);
      store = nextStore;
      return result;
    },
    requireUserByToken: (currentStore, token) => {
      const session = currentStore.sessions.find((entry) => entry.token === token);

      if (!session) {
        throw new TestApiError(401, '세션이 만료됐어요. 다시 로그인해주세요.');
      }

      return currentStore.users.find((entry) => entry.id === session.userId);
    },
    nextId: (prefix) => {
      idIndex += 1;
      return `${prefix}-test-${idIndex}`;
    },
    buildRunDetail: (run, weeklyDistanceKm, sourceOverride, metrics) => ({
      run: { ...run, source: sourceOverride ?? run.source },
      weeklyDistanceKm,
      earnedPoint: getRunPointValue(metrics, run.id),
    }),
    getUserMetrics: (currentStore, userId) => buildUserRunMetrics(
      currentStore.runs.filter((run) => run.userId === userId),
    ),
    decorateIntegrationSource: (currentStore, user, source) => source,
    sourceLabels: { runningground: 'RunningGround' },
    nowIso: FIXED_NOW_ISO,
    formatTimestamp: () => '2026-07-12 21:30',
    createError: (statusCode, message) => new TestApiError(statusCode, message),
  });

  return { repository, getStore: () => clone(store) };
}

function buildTrackedRunInput(extra = {}) {
  // Vehicle via the SPEED rule (5km at 2:30/km) — cadence alone no longer convicts.
  return {
    date: '2026-07-12',
    distanceKm: 5,
    pace: '02:30/km',
    durationSeconds: 750,
    cadenceSpm: 170,
    route: [],
    startedAt: '2026-07-12T12:00:00.000Z',
    endedAt: '2026-07-12T12:12:30.000Z',
    ...extra,
  };
}

await runTest('save path: vehicle match run is flagged, LP revoked once across a retried save', async () => {
  const harness = createRepositoryHarness({
    notifications: [buildRankChangeNotification({ userId: 'user-1', matchId: 'match-1', lpDelta: 20 })],
  });
  const input = buildTrackedRunInput({
    matchResult: { matchId: 'match-1', mode: 'duel', resultTone: 'win', badgeLabel: '승리' },
  });

  const firstPayload = await harness.repository.createTrackedRun({ token: 'token-1', input: clone(input) });
  // Retry the exact same save (timeout/reconcile path) — must dedupe onto the same row.
  await harness.repository.createTrackedRun({ token: 'token-1', input: clone(input) });

  const store = harness.getStore();
  const savedRuns = store.runs.filter((run) => run.userId === 'user-1');
  assert.equal(savedRuns.length, 1);
  assert.equal(savedRuns[0].integrity.verdict, 'vehicle');
  assert.equal(savedRuns[0].integrity.lpRevoked, 20);
  // Revoked exactly ONCE: 러너/10 - 20 → 입문/190 (not 입문/170).
  assert.deepEqual(store.users[0].rankState, { tier: '입문', lp: 90 });
  // The save still answers with the normal run detail payload (run is never lost).
  assert.equal(firstPayload.run.id, savedRuns[0].id);
});

await runTest('save path: a flagged vehicle run is excluded from competitive surfaces and mints no points', async () => {
  const harness = createRepositoryHarness();

  await harness.repository.createTrackedRun({ token: 'token-1', input: buildTrackedRunInput() });

  const store = harness.getStore();
  const savedRun = store.runs[0];
  assert.equal(savedRun.integrity.verdict, 'vehicle');

  const metrics = buildUserRunMetrics(store.runs, new Date('2026-07-12T13:00:00'));
  // Points and the competitive weekly distance both route through isCompetitiveRun.
  assert.equal(metrics.competitiveWeekDistanceKm, 0);
  assert.equal(metrics.totalEarnedPoints, 0);
  // 표시 집계에서도 빠진다 (오너 2026-09-09) — 차량 속도 기록이 판정을 받고도 오늘의
  // 랭킹 1위였던 구멍. 기록 자체는 store.runs에 남는다.
  assert.equal(metrics.currentWeekDistanceKm, 0);
  assert.equal(store.runs.length, 1);
});

await runTest('save path: a clean run saves without any integrity stamp', async () => {
  const harness = createRepositoryHarness();

  await harness.repository.createTrackedRun({
    token: 'token-1',
    input: buildTrackedRunInput({ durationSeconds: 1500, cadenceSpm: 150 }),
  });

  const store = harness.getStore();
  assert.equal('integrity' in store.runs[0], false);
  assert.deepEqual(store.users[0].rankState, { tier: '러너', lp: 10 });
});

await runTest('save path: classifier-hostile values never block the save (guarded to clear)', async () => {
  const harness = createRepositoryHarness();

  // Bypasses route validation on purpose: repository input with a poisoned duration. The
  // classifier guards resolve it to 'clear' and the run persists un-flagged.
  const payload = await harness.repository.createTrackedRun({
    token: 'token-1',
    input: buildTrackedRunInput({ durationSeconds: Number.NaN, cadenceSpm: undefined }),
  });

  const store = harness.getStore();
  assert.equal(store.runs.length, 1);
  assert.equal('integrity' in store.runs[0], false);
  assert.ok(payload.run.id);
});

// ── 케이던스 워치독 (오너 2026-09-09): 자진 신고 + 감사 백스톱 ─────────────────────────────

function buildCadenceAudit(extra = {}) {
  return {
    sensorAvailable: true,
    foregroundMovingSeconds: 600,
    foregroundSteps: 1600,
    strikes: 0,
    disqualified: false,
    ...extra,
  };
}

// 속도 규칙만으로는 clear인 정직한 러닝 (5km/25분, 케이던스 150).
const CLEAN_RUN_SIGNALS = { distanceKm: 5, durationSeconds: 1500, cadenceSpm: 150 };
// 속도 규칙이 vehicle인 러닝 (5km/12.5분 = 6.67 m/s).
const IMPOSSIBLE_RUN_SIGNALS = { distanceKm: 5, durationSeconds: 750, cadenceSpm: 170 };

const CADENCE_VERDICT_CASES = [
  {
    name: 'watchdog self-report → vehicle / cadence-watchdog',
    input: { ...CLEAN_RUN_SIGNALS, cadenceAudit: buildCadenceAudit({ strikes: 2, disqualified: true }) },
    expected: { verdict: 'vehicle', reason: 'cadence-watchdog' },
  },
  {
    // The client already showed the 실격 screen — its reason leads even when speed would convict too.
    name: 'self-report outranks the speed rule for the reason',
    input: { ...IMPOSSIBLE_RUN_SIGNALS, cadenceAudit: buildCadenceAudit({ strikes: 2, disqualified: true }) },
    expected: { verdict: 'vehicle', reason: 'cadence-watchdog' },
  },
  {
    name: 'speed rule keeps convicting under a clean audit → reason speed',
    input: { ...IMPOSSIBLE_RUN_SIGNALS, cadenceAudit: buildCadenceAudit() },
    expected: { verdict: 'vehicle', reason: 'speed' },
  },
  {
    // 180s of foreground running-speed movement with 30 steps = 10 spm (mounted-phone band) AND
    // the client watchdog already warned this runner once: the backstop finishes the job.
    name: 'backstop: strikes 1 + 180s foreground at 10 spm → vehicle / cadence-audit',
    input: { ...CLEAN_RUN_SIGNALS, cadenceAudit: buildCadenceAudit({ foregroundMovingSeconds: 180, foregroundSteps: 30, strikes: 1 }) },
    expected: { verdict: 'vehicle', reason: 'cadence-audit' },
  },
  {
    // 적대 리뷰 2026-09-09: the server must NEVER silently flag a runner the client never
    // warned. Zero strikes → clear even at a flat 0 spm over a full 20 minutes.
    name: 'backstop: strikes 0 → clear even at 0 spm over 20 minutes',
    input: { ...CLEAN_RUN_SIGNALS, cadenceAudit: buildCadenceAudit({ foregroundMovingSeconds: 1200, foregroundSteps: 0, strikes: 0 }) },
    expected: { verdict: 'clear' },
  },
  {
    // 33 spm IS a phone registering cadence (undercount or a slow jog) — the owner rule punishes
    // NON-registration, so this no longer convicts even with a strike on record.
    name: 'backstop: 33 spm is registered cadence → clear even with a strike',
    input: { ...CLEAN_RUN_SIGNALS, cadenceAudit: buildCadenceAudit({ foregroundMovingSeconds: 180, foregroundSteps: 100, strikes: 1 }) },
    expected: { verdict: 'clear' },
  },
  {
    name: 'backstop boundary: 179s of evidence never judges (strike present, 0 spm)',
    input: { ...CLEAN_RUN_SIGNALS, cadenceAudit: buildCadenceAudit({ foregroundMovingSeconds: 179, foregroundSteps: 0, strikes: 1 }) },
    expected: { verdict: 'clear' },
  },
  {
    name: 'backstop boundary: exactly 20 spm is not below the floor',
    input: { ...CLEAN_RUN_SIGNALS, cadenceAudit: buildCadenceAudit({ foregroundMovingSeconds: 180, foregroundSteps: 60, strikes: 1 }) },
    expected: { verdict: 'clear' },
  },
  {
    name: 'backstop boundary: one step under 20 spm at exactly 180s → vehicle',
    input: { ...CLEAN_RUN_SIGNALS, cadenceAudit: buildCadenceAudit({ foregroundMovingSeconds: 180, foregroundSteps: 59, strikes: 1 }) },
    expected: { verdict: 'vehicle', reason: 'cadence-audit' },
  },
  {
    // PRODUCTION FACT: Android expo-sensors unregisters the pedometer in the background, so a
    // ledger without a sensor proves nothing — missing cadence alone never convicts, strikes or not.
    name: 'no sensor: zero steps over 20 minutes stay clear even with strikes',
    input: { ...CLEAN_RUN_SIGNALS, cadenceAudit: buildCadenceAudit({ sensorAvailable: false, foregroundMovingSeconds: 1200, foregroundSteps: 0, strikes: 1 }) },
    expected: { verdict: 'clear' },
  },
  {
    name: 'null saved cadence + no sensor stays suspect, never vehicle',
    input: { distanceKm: 5, durationSeconds: 1500, cadenceSpm: null, cadenceAudit: buildCadenceAudit({ sensorAvailable: false, foregroundMovingSeconds: 1200, foregroundSteps: 0 }) },
    expected: { verdict: 'suspect' },
  },
  {
    name: 'malformed audit is ignored — garbage never convicts (even a string "true" disqualified)',
    input: { ...CLEAN_RUN_SIGNALS, cadenceAudit: { sensorAvailable: 'yes', foregroundMovingSeconds: 180, foregroundSteps: 0, strikes: 0, disqualified: 'true' } },
    expected: { verdict: 'clear' },
  },
  {
    name: 'no audit at all → the speed classifier alone',
    input: CLEAN_RUN_SIGNALS,
    expected: { verdict: 'clear' },
  },
];

for (const testCase of CADENCE_VERDICT_CASES) {
  await runTest(`cadence verdict: ${testCase.name}`, () => {
    assert.deepEqual(resolveRunIntegrityVerdict(testCase.input), testCase.expected);
  });
}

await runTest('normalizeCadenceAudit / classifyCadenceAudit guard the ledger shape', () => {
  assert.equal(normalizeCadenceAudit(null), null);
  assert.equal(normalizeCadenceAudit({ sensorAvailable: true }), null);
  assert.equal(normalizeCadenceAudit(buildCadenceAudit({ foregroundSteps: -1 })), null);
  assert.equal(normalizeCadenceAudit(buildCadenceAudit({ strikes: 1.5 })), null);
  assert.deepEqual(normalizeCadenceAudit({ ...buildCadenceAudit(), extra: 'dropped' }), buildCadenceAudit());
  assert.equal(classifyCadenceAudit(undefined), 'clear');
  assert.equal(classifyCadenceAudit(buildCadenceAudit({ foregroundMovingSeconds: 300, foregroundSteps: 50, strikes: 1 })), 'vehicle');
  // Same ledger without a client warning on record: the backstop stays silent.
  assert.equal(classifyCadenceAudit(buildCadenceAudit({ foregroundMovingSeconds: 300, foregroundSteps: 50, strikes: 0 })), 'clear');
  // The backstop never reads the self-report flag — that is resolveRunIntegrityVerdict's job.
  assert.equal(classifyCadenceAudit(buildCadenceAudit({ disqualified: true })), 'clear');
});

await runTest('cadence-watchdog: stamps the reason and KEEPS the forfeit-loss LP (실격패 is a loss)', () => {
  const user = buildUser({ tier: '러너', lp: 30 });
  const store = buildStore({ user, notifications: [buildRankChangeNotification({ lpDelta: -20 })] });
  const run = buildTrackedRun({
    durationSeconds: 1500,
    cadenceSpm: 150,
    cadenceAudit: buildCadenceAudit({ strikes: 2, disqualified: true }),
    matchResult: { matchId: 'match-1', mode: 'duel', resultTone: 'lose', badgeLabel: '실격패', disqualified: true },
  });

  applyRunIntegrityCheck({ store, user, run, nowIso: FIXED_NOW_ISO });

  assert.deepEqual(run.integrity, { verdict: 'vehicle', reason: 'cadence-watchdog', checkedAt: FIXED_NOW_ISO() });
  // The forfeit path already applied the loss; the disqualified runner does NOT get it back.
  assert.deepEqual(user.rankState, { tier: '러너', lp: 30 });
  assert.equal('lpRevoked' in run.integrity, false);
});

await runTest('cadence-watchdog: a self-report stapled onto a WON match still forfeits the win LP', () => {
  const user = buildUser({ tier: '페이서', lp: 100 });
  const store = buildStore({ user, notifications: [buildRankChangeNotification({ lpDelta: 28 })] });
  const run = buildTrackedRun({
    durationSeconds: 1500,
    cadenceSpm: 150,
    cadenceAudit: buildCadenceAudit({ strikes: 2, disqualified: true }),
    matchResult: { matchId: 'match-1', mode: 'duel', resultTone: 'win' },
  });

  applyRunIntegrityCheck({ store, user, run, nowIso: FIXED_NOW_ISO });

  // Self-report only ever hurts the reporter: a positive delta is revoked like any vehicle run.
  assert.deepEqual(user.rankState, { tier: '페이서', lp: 72 });
  assert.equal(run.integrity.lpRevoked, 28);
});

await runTest('cadence-audit backstop: KEEPS the loss LP like every vehicle verdict (no refund for a lost match)', () => {
  const user = buildUser({ tier: '러너', lp: 10 });
  const store = buildStore({ user, notifications: [buildRankChangeNotification({ lpDelta: -20 })] });
  const run = buildTrackedRun({
    durationSeconds: 1500,
    cadenceSpm: 150,
    cadenceAudit: buildCadenceAudit({ foregroundMovingSeconds: 300, foregroundSteps: 50, strikes: 1 }),
    matchResult: { matchId: 'match-1', mode: 'duel', resultTone: 'lose' },
  });

  applyRunIntegrityCheck({ store, user, run, nowIso: FIXED_NOW_ISO });

  assert.deepEqual(run.integrity, { verdict: 'vehicle', reason: 'cadence-audit', checkedAt: FIXED_NOW_ISO() });
  // 적대 리뷰 2026-09-09: this used to hand the -20 back. The loss stays, exactly like the
  // cadence-watchdog self-report above and the speed rule.
  assert.deepEqual(user.rankState, { tier: '러너', lp: 10 });
  assert.equal('lpRevoked' in run.integrity, false);
});

await runTest('cadence-audit backstop: a GAIN is still revoked (the cheater keeps nothing they won)', () => {
  const user = buildUser({ tier: '페이서', lp: 100 });
  const store = buildStore({ user, notifications: [buildRankChangeNotification({ lpDelta: 28 })] });
  const run = buildTrackedRun({
    durationSeconds: 1500,
    cadenceSpm: 150,
    cadenceAudit: buildCadenceAudit({ foregroundMovingSeconds: 300, foregroundSteps: 50, strikes: 1 }),
    matchResult: { matchId: 'match-1', mode: 'duel', resultTone: 'win' },
  });

  applyRunIntegrityCheck({ store, user, run, nowIso: FIXED_NOW_ISO });

  assert.equal(run.integrity.reason, 'cadence-audit');
  assert.deepEqual(user.rankState, { tier: '페이서', lp: 72 });
  assert.equal(run.integrity.lpRevoked, 28);
});

await runTest('save path: the cadence audit ledger is persisted and a self-reported disqualification flags the run', async () => {
  const harness = createRepositoryHarness();
  const cadenceAudit = buildCadenceAudit({ strikes: 2, disqualified: true });

  const payload = await harness.repository.createTrackedRun({
    token: 'token-1',
    input: buildTrackedRunInput({ durationSeconds: 1500, cadenceSpm: 150, cadenceAudit }),
  });

  const store = harness.getStore();
  const savedRun = store.runs[0];
  assert.deepEqual(savedRun.cadenceAudit, cadenceAudit);
  assert.equal(savedRun.integrity.verdict, 'vehicle');
  assert.equal(savedRun.integrity.reason, 'cadence-watchdog');
  assert.equal(payload.earnedPoint, 0);

  const metrics = buildUserRunMetrics(store.runs, new Date('2026-07-12T13:00:00'));
  assert.equal(metrics.currentWeekDistanceKm, 0);
  assert.equal(metrics.totalEarnedPoints, 0);
});

await runTest('save path: a malformed cadence audit is dropped from the record and never convicts', async () => {
  const harness = createRepositoryHarness();

  await harness.repository.createTrackedRun({
    token: 'token-1',
    input: buildTrackedRunInput({ durationSeconds: 1500, cadenceSpm: 150, cadenceAudit: { disqualified: true } }),
  });

  const store = harness.getStore();
  assert.equal('cadenceAudit' in store.runs[0], false);
  assert.equal('integrity' in store.runs[0], false);
});

console.log('[runIntegrity] all tests passed');
