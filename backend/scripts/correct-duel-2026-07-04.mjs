// correct-duel-2026-07-04.mjs — one-off retroactive correction for the 2026-07-04 22:45 KST
// 5km duel whose 90s DNF seal wrongly recorded the faster (iPhone, 1606s) runner as DNF/집계중
// and the slower (Galaxy, 1622s) runner as the winner. The live session is long pruned; the
// durable damage is the two saved runs' matchResult blobs (+ the LP that was never applied).
// See docs/fair-verdict-design-2026-07-05.md §6 (Stage 0).
//
// What it does (dry-run by DEFAULT — prints exactly what it would change, writes nothing):
//   ① scans store.runs for duel runs started 2026-07-04 13:15–14:15 UTC (22:15–23:15 KST),
//      groups them by matchResult.matchId, prints every 2-user candidate match;
//   ② for the selected match: rewrites the FASTER runner's blob to the WIN shape and the
//      SLOWER runner's to LOSE, with both measured durations (expected 1606s / 1622s) — the
//      exact shape resolveDuelMatchResultFromSavedRuns would have produced, so 기록상세,
//      대결결과(/result reconstruction from saved runs) and 전적 all heal;
//   ③ verifies from store.notifications (rank_change with this matchId) + rankState whether
//      LP was ever applied for this match (per the design it almost certainly was NOT), and
//      — ONLY behind the opt-in flags below — applies the winner's LP delta via the same
//      resolveDuelMatchLpDeltas numbers applyMatchLpIfComplete uses. The loser's negative
//      delta is WAIVED by default (product call: their app showed them WIN);
//   ④ idempotent: a blob that already carries the corrected verdict is skipped, and an
//      existing rank_change notification for this matchId blocks any further LP apply.
//
// Flags:
//   --match-id <id>            select the match explicitly (required for writing when the
//                              scan finds more than one candidate)
//   --yes                      actually write (without it: dry run, always)
//   --apply-winner-lp          apply the winner's LP delta (default OFF)
//   --apply-loser-lp           apply the loser's LP delta (default OFF — waived per product call)
//   --allow-duration-mismatch  proceed even if the pair's measured durations are not exactly
//                              {1606s, 1622s} (safety pin against grabbing the wrong match)
//
// ── Droplet invocation (production = runningground-production, compose.public.yaml,
//    BACKEND_STORE_DRIVER=postgres — SAFE to run while the api container is up: the postgres
//    adapter's mutateStore serializes on a FOR UPDATE row lock and re-reads before writing).
//    The image only ships src/, so copy the two script files in first:
//
//   cd ~/RunningGround/backend
//   DC="docker compose -p runningground-production --env-file ./.env.production -f ./compose.public.yaml"
//   $DC exec api mkdir -p /app/scripts
//   $DC cp ./scripts/correctDuelBlobTransform.mjs api:/app/scripts/correctDuelBlobTransform.mjs
//   $DC cp ./scripts/correct-duel-2026-07-04.mjs  api:/app/scripts/correct-duel-2026-07-04.mjs
//
//   # 1) dry run (no writes; prints candidates + the exact before/after blobs + LP plan):
//   $DC exec api node ./scripts/correct-duel-2026-07-04.mjs
//
//   # 2) real run (blobs only; LP stays untouched):
//   $DC exec api node ./scripts/correct-duel-2026-07-04.mjs --match-id <matchId> --yes
//
//   # 3) real run incl. winner LP (recommended per design; loser LP stays waived):
//   $DC exec api node ./scripts/correct-duel-2026-07-04.mjs --match-id <matchId> --yes --apply-winner-lp
//
// ── json-driver fallback (ONLY if BACKEND_STORE_DRIVER=json — e.g. a preview box): the live
//    server keeps the whole store in an in-process cache and will CLOBBER external writes on
//    its next save, so STOP the api first and run a one-off container with scripts mounted:
//
//   $DC stop api
//   $DC run --rm --no-deps -v "$PWD/scripts:/app/scripts" api \
//       node ./scripts/correct-duel-2026-07-04.mjs --match-id <matchId> --yes
//   $DC start api
//
// Local (repo backend/, json store): node ./scripts/correct-duel-2026-07-04.mjs

import { pathToFileURL } from 'node:url';

import {
  getStoreDiagnostics,
  loadStore,
  mutateStore,
  STORE_DRIVER,
} from '../src/storage/index.mjs';
import { applyLpDelta, resolveDuelMatchLpDeltas } from '../src/lib/rankSystem.mjs';
import { ensureUserRankState } from '../src/lib/userStoreHelpers.mjs';
import { appendUserNotification } from '../src/lib/userNotifications.mjs';
import { buildMatchRunnerProfile } from '../src/lib/runningMatchSessionStoreHelpers.mjs';
import {
  buildCorrectedDuelMatchResult,
  isDuelCorrectionAlreadyApplied,
} from './correctDuelBlobTransform.mjs';

// ── The incident constants ────────────────────────────────────────────────────────────────
// Run started 2026-07-04 22:45 KST = 13:45 UTC; scan ±30min.
const WINDOW_START_MS = Date.parse('2026-07-04T13:15:00Z');
const WINDOW_END_MS = Date.parse('2026-07-04T14:15:00Z');
const GOAL_DISTANCE_KM = 5;
const GOAL_DISTANCE_TOLERANCE_KM = 0.6;
// Measured finishes per the incident record: iPhone 26:46 = 1606s (faster → WIN),
// Galaxy 27:02 = 1622s (slower → LOSE).
const EXPECTED_FASTER_ELAPSED_SECONDS = 1606;
const EXPECTED_SLOWER_ELAPSED_SECONDS = 1622;

// ── CLI ───────────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const readValue = (flag) => {
    const index = args.indexOf(flag);
    return index === -1 ? '' : (args[index + 1] ?? '');
  };

  return {
    matchId: readValue('--match-id').trim(),
    yes: args.includes('--yes'),
    applyWinnerLp: args.includes('--apply-winner-lp'),
    applyLoserLp: args.includes('--apply-loser-lp'),
    allowDurationMismatch: args.includes('--allow-duration-mismatch'),
  };
}

// ── Pure helpers over the store shape ─────────────────────────────────────────────────────

// Same fallback order as finishElapsedFromSavedRun in matchResultBuilders.mjs.
function finishElapsedFromSavedRun(run) {
  const matchResult = run?.matchResult ?? {};
  if (Number.isInteger(matchResult.myDurationSeconds) && matchResult.myDurationSeconds > 0) {
    return matchResult.myDurationSeconds;
  }
  if (Number.isInteger(run?.durationSeconds) && run.durationSeconds > 0) {
    return run.durationSeconds;
  }
  return null;
}

function toKstLabel(isoString) {
  const ms = Date.parse(String(isoString ?? ''));
  if (Number.isNaN(ms)) {
    return String(isoString ?? '(없음)');
  }
  return `${new Date(ms + 9 * 60 * 60 * 1000).toISOString().replace('Z', '')}+09:00(KST)`;
}

function findUser(store, userId) {
  return (store.users ?? []).find((user) => user.id === userId) ?? null;
}

function userLabel(store, userId) {
  const user = findUser(store, userId);
  return user ? `${user.name}(${userId})` : `(탈퇴/미상 ${userId})`;
}

// Collect candidate duel matches in the incident window: duel matchResult with a matchId,
// startedAt inside the window, grouped by matchId; only 2-distinct-user groups qualify.
function collectCandidates(store) {
  const runsByMatchId = new Map();

  for (const run of store.runs ?? []) {
    const matchResult = run?.matchResult;
    if (!matchResult || matchResult.mode !== 'duel' || typeof matchResult.matchId !== 'string' || !matchResult.matchId) {
      continue;
    }

    const startedAtMs = Date.parse(String(run.startedAt ?? ''));
    if (Number.isNaN(startedAtMs) || startedAtMs < WINDOW_START_MS || startedAtMs > WINDOW_END_MS) {
      continue;
    }

    const runs = runsByMatchId.get(matchResult.matchId) ?? [];
    runs.push(run);
    runsByMatchId.set(matchResult.matchId, runs);
  }

  const candidates = [];

  for (const [matchId, runs] of runsByMatchId) {
    const userIds = new Set(runs.map((run) => run.userId));
    if (userIds.size !== 2 || runs.length !== 2) {
      continue;
    }
    candidates.push({ matchId, runs });
  }

  return candidates;
}

function describeCandidate(store, candidate) {
  const lines = [`  matchId: ${candidate.matchId}`];

  for (const run of candidate.runs) {
    const elapsed = finishElapsedFromSavedRun(run);
    const distanceOk = Math.abs(Number(run.distanceKm ?? 0) - GOAL_DISTANCE_KM) <= GOAL_DISTANCE_TOLERANCE_KM;
    lines.push([
      `    run ${run.id} · ${userLabel(store, run.userId)}`,
      `시작 ${toKstLabel(run.startedAt)}`,
      `거리 ${run.distanceKm}km${distanceOk ? '' : ' ⚠️(5km 아님)'}`,
      `기록 ${elapsed ?? '?'}s`,
      `현재 블랍: resultTone=${run.matchResult.resultTone ?? '(없음)'} badge=${run.matchResult.badgeLabel}`,
    ].join(' · '));
  }

  return lines.join('\n');
}

// ── Plan (pure over a store instance; used for both dry-run print and apply) ──────────────

function planCorrection(store, options) {
  const blockers = [];
  const candidates = collectCandidates(store);
  const plan = { candidates, selected: null, blobActions: [], lp: null, blockers };

  if (!candidates.length) {
    blockers.push('창(2026-07-04 22:15~23:15 KST) 안에서 2인 duel 후보를 찾지 못했어.');
    return plan;
  }

  let selected = null;

  if (options.matchId) {
    selected = candidates.find((candidate) => candidate.matchId === options.matchId) ?? null;
    if (!selected) {
      blockers.push(`--match-id ${options.matchId} 에 해당하는 후보가 없어.`);
      return plan;
    }
  } else if (candidates.length === 1) {
    selected = candidates[0];
  } else {
    blockers.push(`후보가 ${candidates.length}건이야 — --match-id 로 하나를 지정해야 해.`);
    return plan;
  }

  plan.selected = selected;

  // Forfeit blobs are terminal on their own verdict path — this incident has none; refuse.
  for (const run of selected.runs) {
    if (/기권/.test(String(run.matchResult.badgeLabel ?? ''))) {
      blockers.push(`run ${run.id} 블랍이 기권 기록이야 — 이 스크립트의 대상이 아니야.`);
      return plan;
    }
  }

  const [first, second] = selected.runs;
  const firstElapsed = finishElapsedFromSavedRun(first);
  const secondElapsed = finishElapsedFromSavedRun(second);

  if (firstElapsed === null || secondElapsed === null) {
    blockers.push('두 기록 모두에서 측정 완주 시간을 읽지 못했어 — 정정 불가.');
    return plan;
  }

  if (firstElapsed === secondElapsed) {
    blockers.push(`두 기록이 동률(${firstElapsed}s)이야 — win/lose 정정 스크립트의 대상이 아니야.`);
    return plan;
  }

  const winnerRun = firstElapsed < secondElapsed ? first : second;
  const loserRun = winnerRun === first ? second : first;
  const winnerElapsed = Math.min(firstElapsed, secondElapsed);
  const loserElapsed = Math.max(firstElapsed, secondElapsed);

  if (winnerElapsed !== EXPECTED_FASTER_ELAPSED_SECONDS || loserElapsed !== EXPECTED_SLOWER_ELAPSED_SECONDS) {
    const message = `측정 기록(${winnerElapsed}s/${loserElapsed}s)이 사건 기록(${EXPECTED_FASTER_ELAPSED_SECONDS}s/${EXPECTED_SLOWER_ELAPSED_SECONDS}s)과 달라.`;
    if (options.allowDurationMismatch) {
      console.warn(`⚠️  ${message} (--allow-duration-mismatch 로 계속 진행)`);
    } else {
      blockers.push(`${message} 정말 이 매치가 맞으면 --allow-duration-mismatch 를 붙여줘.`);
      return plan;
    }
  }

  const winnerUser = findUser(store, winnerRun.userId);
  const loserUser = findUser(store, loserRun.userId);

  if (!winnerUser || !loserUser) {
    blockers.push('참가자 계정을 store.users 에서 찾지 못했어 — 정정 불가.');
    return plan;
  }

  plan.verdict = { winnerRun, loserRun, winnerUser, loserUser, winnerElapsed, loserElapsed };

  // ② corrected blobs — winner WIN / loser LOSE, opponent duration cross-filled.
  const sides = [
    {
      run: winnerRun,
      outcome: 'win',
      myDurationSeconds: winnerElapsed,
      opponentDurationSeconds: loserElapsed,
      opponentUser: loserUser,
      opponentRun: loserRun,
    },
    {
      run: loserRun,
      outcome: 'lose',
      myDurationSeconds: loserElapsed,
      opponentDurationSeconds: winnerElapsed,
      opponentUser: winnerUser,
      opponentRun: winnerRun,
    },
  ];

  for (const side of sides) {
    const target = {
      outcome: side.outcome,
      myDurationSeconds: side.myDurationSeconds,
      opponentDurationSeconds: side.opponentDurationSeconds,
      opponentId: side.opponentUser.id,
    };

    if (isDuelCorrectionAlreadyApplied(side.run.matchResult, target)) {
      plan.blobActions.push({ run: side.run, outcome: side.outcome, status: 'already-correct', before: side.run.matchResult, after: side.run.matchResult });
      continue;
    }

    const after = buildCorrectedDuelMatchResult({
      matchResult: side.run.matchResult,
      outcome: side.outcome,
      myDurationSeconds: side.myDurationSeconds,
      opponentDurationSeconds: side.opponentDurationSeconds,
      opponentId: side.opponentUser.id,
      opponentName: side.opponentUser.name,
      opponentPaceLabel: side.opponentRun.matchResult?.myPaceLabel,
    });

    plan.blobActions.push({ run: side.run, outcome: side.outcome, status: 'apply', before: side.run.matchResult, after });
  }

  // ③ LP — verify nothing was ever applied for this matchId, then plan the opt-in deltas
  // with the SAME numbers applyMatchLpIfComplete uses (profile average pace → duel bracket).
  const matchNotifications = (store.notifications ?? []).filter(
    (notification) => notification?.data?.matchId === selected.matchId,
  );
  const lpAlreadyApplied = matchNotifications.some((notification) => notification.type === 'rank_change');

  const winnerPaceSecPerKm = buildMatchRunnerProfile(store, winnerUser).averagePaceMinutes * 60;
  const loserPaceSecPerKm = buildMatchRunnerProfile(store, loserUser).averagePaceMinutes * 60;
  const { winnerLpDelta, loserLpDelta } = resolveDuelMatchLpDeltas({ winnerPaceSecPerKm, loserPaceSecPerKm });

  plan.lp = {
    matchNotifications,
    lpAlreadyApplied,
    winnerLpDelta,
    loserLpDelta,
    winnerRankState: { ...ensureUserRankState(winnerUser) },
    loserRankState: { ...ensureUserRankState(loserUser) },
    willApplyWinner: options.applyWinnerLp && !lpAlreadyApplied,
    willApplyLoser: options.applyLoserLp && !lpAlreadyApplied,
  };

  if ((options.applyWinnerLp || options.applyLoserLp) && lpAlreadyApplied) {
    blockers.push('이 matchId 로 rank_change 알림이 이미 존재해 — LP 는 이미 반영된 것으로 보고 다시 적용하지 않아.');
  }

  return plan;
}

// Mutating half — only ever called with --yes and zero blockers, inside mutateStore.
function applyPlan(store, plan) {
  const applied = { blobs: 0, lp: [] };

  for (const action of plan.blobActions) {
    if (action.status !== 'apply') {
      continue;
    }
    action.run.matchResult = action.after;
    applied.blobs += 1;
  }

  const lpTargets = [];
  if (plan.lp.willApplyWinner) {
    lpTargets.push({ user: plan.verdict.winnerUser, deltaLp: plan.lp.winnerLpDelta });
  }
  if (plan.lp.willApplyLoser) {
    lpTargets.push({ user: plan.verdict.loserUser, deltaLp: plan.lp.loserLpDelta });
  }

  for (const { user, deltaLp } of lpTargets) {
    const previousRankState = { ...ensureUserRankState(user) };
    const nextRankState = applyLpDelta(previousRankState, deltaLp);
    user.rankState = { tier: nextRankState.tier, lp: nextRankState.lp };

    // Same copy as appendRankChangeNotification in matchActionHandlers.mjs — and this
    // notification IS the LP idempotency marker (rank_change + matchId) for any re-run.
    appendUserNotification(store, {
      userId: user.id,
      type: 'rank_change',
      title: '랭크 LP 변동',
      body: `대결 결과로 랭크 ${deltaLp > 0 ? '+' : ''}${deltaLp} LP가 반영됐어요.`,
      data: {
        matchId: plan.selected.matchId,
        mode: 'duel',
        tier: user.rankState.tier,
        lp: user.rankState.lp,
        lpDelta: deltaLp,
      },
    });

    applied.lp.push({ userId: user.id, deltaLp, from: previousRankState, to: { ...user.rankState } });
  }

  return applied;
}

// ── Output ────────────────────────────────────────────────────────────────────────────────

function printPlan(store, plan, options) {
  const mode = options.yes ? 'APPLY' : 'DRY-RUN';
  console.log(`\n[correct-duel-2026-07-04] mode=${mode} driver=${STORE_DRIVER}`);
  console.log(`  store: ${JSON.stringify(getStoreDiagnostics())}`);
  console.log(`\n① 후보 매치 (2026-07-04 22:15~23:15 KST, duel, 2인): ${plan.candidates.length}건`);

  for (const candidate of plan.candidates) {
    console.log(describeCandidate(store, candidate));
  }

  if (plan.selected && plan.verdict) {
    const { winnerRun, loserRun, winnerElapsed, loserElapsed } = plan.verdict;
    console.log(`\n② 선택된 매치: ${plan.selected.matchId}`);
    console.log(`  WIN  → ${userLabel(store, winnerRun.userId)} · ${winnerElapsed}s (run ${winnerRun.id})`);
    console.log(`  LOSE → ${userLabel(store, loserRun.userId)} · ${loserElapsed}s (run ${loserRun.id})`);

    for (const action of plan.blobActions) {
      console.log(`\n  [${action.outcome.toUpperCase()}] run ${action.run.id} · ${action.status === 'already-correct' ? '이미 정정됨 — 건너뜀 (idempotent)' : '블랍 교체 예정'}`);
      console.log(`    before: ${JSON.stringify(action.before)}`);
      if (action.status === 'apply') {
        console.log(`    after : ${JSON.stringify(action.after)}`);
      }
    }
  }

  if (plan.lp) {
    console.log('\n③ LP 검증/계획:');
    console.log(`  이 matchId 알림: ${plan.lp.matchNotifications.length ? plan.lp.matchNotifications.map((notification) => notification.type).join(', ') : '없음'}`);
    console.log(`  LP 기반영 여부: ${plan.lp.lpAlreadyApplied ? '이미 반영됨(rank_change 존재) — LP 적용 차단' : '미반영 (설계 문서 예상과 일치)'}`);
    console.log(`  winner LP delta ${plan.lp.winnerLpDelta > 0 ? '+' : ''}${plan.lp.winnerLpDelta} · 현재 ${JSON.stringify(plan.lp.winnerRankState)} · ${plan.lp.willApplyWinner ? '적용 예정 (--apply-winner-lp)' : '적용 안 함 (--apply-winner-lp 필요)'}`);
    console.log(`  loser  LP delta ${plan.lp.loserLpDelta} · 현재 ${JSON.stringify(plan.lp.loserRankState)} · ${plan.lp.willApplyLoser ? '적용 예정 (--apply-loser-lp)' : '면제(waive) — 기본값 (--apply-loser-lp 필요)'}`);
  }

  if (plan.blockers.length) {
    console.log('\n⛔ 차단 사유:');
    for (const blocker of plan.blockers) {
      console.log(`  - ${blocker}`);
    }
  }
}

// ── main ──────────────────────────────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs(process.argv);

  if (!options.yes) {
    // Dry run: read-only pass over the loaded store, print the full plan, write nothing.
    const store = await loadStore();
    const plan = planCorrection(store, options);
    printPlan(store, plan, options);
    console.log('\n(dry-run — 아무것도 저장하지 않았어. 실제 반영은 --match-id <id> --yes)');
    return;
  }

  if (!options.matchId) {
    // Writing always requires the explicit match id — even when the scan finds exactly one
    // candidate, the operator must name it (per the design's REQUIRE-explicit rule).
    console.error('⛔ --yes 로 실제 반영하려면 --match-id <id> 를 반드시 지정해야 해. (먼저 dry run 으로 후보를 확인해줘)');
    process.exitCode = 1;
    return;
  }

  // Apply path: plan + mutate INSIDE one mutateStore transaction so the postgres adapter's
  // row lock (or the json adapter's single-process write) sees a consistent store. If the
  // plan hits a blocker, nothing is mutated and mutateStore's change-detection skips the save.
  const outcome = await mutateStore((store) => {
    const plan = planCorrection(store, options);
    printPlan(store, plan, options);

    if (plan.blockers.length) {
      return { plan, applied: null };
    }

    return { plan, applied: applyPlan(store, plan) };
  });

  if (!outcome.applied) {
    console.error('\n⛔ 차단 사유가 있어 아무것도 반영하지 않았어.');
    process.exitCode = 1;
    return;
  }

  console.log(`\n✅ 반영 완료: 블랍 ${outcome.applied.blobs}건 교체, LP ${outcome.applied.lp.length}건 적용.`);
  for (const entry of outcome.applied.lp) {
    console.log(`  LP ${entry.deltaLp > 0 ? '+' : ''}${entry.deltaLp} → ${entry.userId}: ${JSON.stringify(entry.from)} → ${JSON.stringify(entry.to)}`);
  }
  console.log('  (재실행해도 안전해 — 정정된 블랍/기존 rank_change 알림이 이중 반영을 막아.)');
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  try {
    await main();
  } catch (error) {
    console.error('[correct-duel-2026-07-04] failed');
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 1;
  }
  // The postgres adapter keeps an idle pool (30s idle timeout) — exit explicitly so the
  // one-off container/process doesn't linger after all work is done.
  process.exit(process.exitCode ?? 0);
}
