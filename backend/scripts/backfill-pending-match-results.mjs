// backfill-pending-match-results.mjs — retroactive, OPERATOR-VERIFIED repair for saved runs stuck
// on a PENDING ("결과 집계 중") match blob.
//
// The bug (오너 실기기 대결 2026-08-09, fixed forward in runsRepository/matchResultBuilders):
// the runner who finished FIRST also saved FIRST, with no opponent run yet to verify against, so
// the server correctly stored their blob PENDING — a client-claimed win is never trusted. Nothing
// then healed it: the session-based back-fill runs only inside sweepStuckMatchSessionFallbacks,
// which skips any match that never sealed, and a both-finished duel never seals. The blob stayed
// PENDING forever and getMatchBonusPoints kept returning 0, while the loser (saving second, able
// to verify) collected their 10P. Structurally, every duel shortchanged its winner.
//
// The forward fix heals a counterpart automatically, but ONLY while the live session still exists
// (it is the sole server-built roster; sessions are kept 10 minutes after everyone finishes). This
// script is for the leftovers — matches whose session is long pruned.
//
// WHY THIS SCRIPT IS DELIBERATELY AWKWARD TO RUN (적대 검증 2026-08-09, 두 건 실증):
//   ① matchResult.matchId is unvalidated client input. "Everyone who saved a run with this
//      matchId" is NOT a roster. A non-participant's run can otherwise be picked as the opponent
//      and permanently overwrite a real participant's win with 패배 — and because the wrong
//      verdict is DEFINITE, the never-downgrade guard then locks it in forever.
//   ② Without a live session the verdict is ranked on raw elapsed alone, with no check that the
//      counterpart actually covered the distance. A runner who quit at 1.2km in 400s outranks a
//      genuine 5km/1500s finisher and flips them to 패배 — no malice required.
// So: no blind sweep. You must name the match (--match-id) AND its real participants
// (--participants), and every participant run must look like a genuine finisher of the same goal.
// The dry run prints exactly what would change; nothing is written without --yes.
//
// Points need no separate correction: the balance is derived
// (buildUserRunMetrics(runs).totalEarnedPoints − getRedeemedPointCost), never stored, so healing
// the blob restores the missing bonus retroactively.
//
// LP is deliberately OUT OF SCOPE. Rank LP is computed from session standings
// (matchCompletionAwards), a path independent of the matchResult blob. Use
// scripts/correct-duel-2026-07-04.mjs if a match ever needs an LP correction — it carries the
// opt-in flags and the rank_change idempotency marker.
//
// Idempotent: a blob that already carries a definite verdict is never touched (and never
// downgraded), so re-running is safe.
//
// Flags:
//   --match-id <id>            REQUIRED to write. Without it the script only SURVEYS the store.
//   --participants <a,b,...>   REQUIRED to write. The real participant user ids, verified
//                              out-of-band (see below). Runs by anyone else are ignored.
//   --yes                      actually write (without it: dry run, always)
//
// There is deliberately NO override for the evidence checks. An operator flag that can invert a
// real runner's result is not worth the convenience — if a match genuinely cannot be verified from
// its saved runs, it stays PENDING.
//
// HOW TO VERIFY THE ROSTER out-of-band: the survey pass (no --match-id) prints, per stuck match,
// every saved run and its owner. Cross-check those user ids against the two people who actually
// ran the match — via store.notifications entries carrying the same matchId (server-generated,
// not client input), or by asking them. Do not simply trust the run list: that is the very input
// the guard exists to distrust.
//
// ── Droplet invocation (production = runningground-production, compose.public.yaml,
//    BACKEND_STORE_DRIVER=postgres — SAFE while the api container is up: the postgres adapter's
//    mutateStore serializes on a FOR UPDATE row lock and re-reads before writing).
//    The image only ships src/, so copy the script in first:
//
//   cd ~/RunningGround/backend
//   DC="docker compose -p runningground-production --env-file ./.env.production -f ./compose.public.yaml"
//   $DC exec api mkdir -p /app/scripts
//   $DC cp ./scripts/backfill-pending-match-results.mjs api:/app/scripts/backfill-pending-match-results.mjs
//
//   # 1) survey every stuck match (writes nothing, needs no flags):
//   $DC exec api node ./scripts/backfill-pending-match-results.mjs
//
//   # 2) dry run for one match with its verified roster:
//   $DC exec api node ./scripts/backfill-pending-match-results.mjs \
//       --match-id <matchId> --participants <userA>,<userB>
//
//   # 3) real run:
//   $DC exec api node ./scripts/backfill-pending-match-results.mjs \
//       --match-id <matchId> --participants <userA>,<userB> --yes
//
// ── json-driver fallback (ONLY if BACKEND_STORE_DRIVER=json): the live server keeps the whole
//    store in an in-process cache and will CLOBBER external writes on its next save, so stop the
//    api first and run a one-off container with scripts mounted:
//
//   $DC stop api
//   $DC run --rm --no-deps -v "$PWD/scripts:/app/scripts" api \
//       node ./scripts/backfill-pending-match-results.mjs --match-id <id> --participants <a>,<b> --yes
//   $DC start api
//
// Local (repo backend/, json store): node ./scripts/backfill-pending-match-results.mjs

import { pathToFileURL } from 'node:url';

import {
  getStoreDiagnostics,
  loadStore,
  mutateStore,
  STORE_DRIVER,
} from '../src/storage/index.mjs';
import {
  backFillSavedRunsWithVerifiedRoster,
  isTrustworthyMatchEvidence,
} from '../src/lib/runningMatchStoreHelpers.mjs';
import { findMatchRoster, readMatchRosterGoalDistanceKm } from '../src/lib/matchRosters.mjs';

// ── CLI ───────────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const readValue = (flag) => {
    const index = args.indexOf(flag);
    const value = index === -1 ? '' : (args[index + 1] ?? '');
    // A flag whose "value" is the next flag was written without an argument — treat as absent
    // rather than silently widening the blast radius.
    return value.startsWith('--') ? '' : value;
  };

  return {
    yes: args.includes('--yes'),
    matchId: readValue('--match-id').trim(),
    participantIds: readValue('--participants')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  };
}

// ── Pure survey over the store shape ──────────────────────────────────────────────────────

// Same predicate the back-fill itself applies: a forfeit blob is terminal on its own verdict
// path, and a definite verdict is authoritative — neither is a heal candidate.
export function isStuckMatchBlob(matchResult) {
  if (!matchResult || typeof matchResult !== 'object') {
    return false;
  }

  const mode = matchResult.mode === 'group' ? 'group' : matchResult.mode === 'duel' ? 'duel' : null;
  if (!mode || typeof matchResult.matchId !== 'string' || !matchResult.matchId.trim()) {
    return false;
  }

  if (/기권/.test(String(matchResult.badgeLabel ?? ''))) {
    return false;
  }

  return mode === 'duel'
    ? !['win', 'lose', 'draw'].includes(matchResult.resultTone)
    : !Number.isInteger(matchResult.rank);
}

// Every distinct matchId that still owns at least one stuck blob, with the affected runs.
export function collectStuckMatches(store, matchIdFilter = '') {
  const byMatchId = new Map();

  for (const run of store?.runs ?? []) {
    if (!isStuckMatchBlob(run?.matchResult)) {
      continue;
    }

    const matchId = run.matchResult.matchId.trim();
    if (matchIdFilter && matchId !== matchIdFilter) {
      continue;
    }

    const entry = byMatchId.get(matchId) ?? { matchId, mode: run.matchResult.mode, runs: [] };
    entry.runs.push(run);
    byMatchId.set(matchId, entry);
  }

  return [...byMatchId.values()];
}

// Every saved run carrying this matchId, whoever posted it — the survey shows these so an operator
// can spot a run by someone who was not in the match.
export function collectMatchRuns(store, matchId) {
  return (store?.runs ?? []).filter((run) => run?.matchResult?.matchId === matchId);
}

// Guard ②: a run that did not complete the goal (or is physically implausible, or records no goal
// at all so it cannot be checked) must never be ranked against a genuine finisher — the
// session-less resolver compares raw elapsed only, so a quitter's short time wins. Returns the
// offending runs. The same rule is enforced inside backFillSavedRunsWithVerifiedRoster.
// `goalDistanceKm`는 내구 로스터가 아는 진짜 목표 거리다. 이걸 넘기지 않으면 이 함수는 블롭의
// comparedDistanceKm을 읽는데, 그 값은 화면 꺼짐 정지로 얼어붙고(중도포기자는 자기가 멈춘 지점이
// 목표가 되어 통과한다) 그룹 블롭에는 아예 없다. 실제 집행부(backFillSavedRunsWithVerifiedRoster)는
// 로스터 목표로 판정하므로, 여기서 안 맞추면 드라이런이 "막을 게 없다"고 해놓고 집행은 거절하거나
// 그 반대가 된다. 기본값 null은 로스터 없는 옛 매치의 기존 동작을 그대로 유지한다.
export function findUntrustworthyRuns(runs, goalDistanceKm = null) {
  return runs.filter((run) => !isTrustworthyMatchEvidence(run, goalDistanceKm));
}

function userLabel(store, userId) {
  const user = (store?.users ?? []).find((entry) => entry.id === userId);
  return user ? `${user.name}(${userId})` : `(탈퇴/미상 ${userId})`;
}

// ── Plan / heal ───────────────────────────────────────────────────────────────────────────

export function planHeal(store, options) {
  const blockers = [];
  const matchRuns = collectMatchRuns(store, options.matchId);
  const roster = new Set(options.participantIds);
  const rosterRuns = matchRuns.filter((run) => roster.has(run.userId));
  const outsiderRuns = matchRuns.filter((run) => !roster.has(run.userId));

  if (!options.matchId) {
    blockers.push('--match-id 를 지정해야 해 (일괄 치유는 지원하지 않아 — 로스터 없이 남의 기록을 고칠 수 없어).');
  }

  if (roster.size < 2) {
    blockers.push('--participants 로 실제 참가자 id를 2명 이상 지정해야 해 (쉼표 구분).');
  }

  if (options.matchId && roster.size >= 2 && rosterRuns.length < 2) {
    blockers.push(`이 matchId로 저장된 로스터 기록이 ${rosterRuns.length}건뿐이야 — 승패를 검증하려면 2건 이상 필요해.`);
  }

  // 로스터 게이트는 "누구의 기록이 고쳐지는가"만 막는다. 세션이 없는 이 경로의 resolver는
  // 상대를 "나 아닌 첫 기록"으로 고르므로, 로스터 밖 기록이 store에 남아 있으면 그것이 증거로
  // 쓰여 승패가 뒤집힐 수 있다. 그래서 무시하지 않고 아예 막는다 — 정상적인 대결/그룹에는
  // 참가자 외 기록이 존재할 이유가 없으니, 하나라도 있으면 위조이거나 데이터 문제다.
  if (outsiderRuns.length) {
    for (const run of outsiderRuns) {
      blockers.push(`run ${run.id} (${userLabel(store, run.userId)})가 로스터 밖인데 같은 matchId를 달고 있어 — 이대로 진행하면 이 기록이 상대로 잡혀 판정이 뒤집힐 수 있어. 로스터가 맞는지, 이 기록이 위조가 아닌지 먼저 확인해줘.`);
    }
  }

  const rosterGoalDistanceKm = readMatchRosterGoalDistanceKm(findMatchRoster(store, options.matchId));
  const untrustworthy = findUntrustworthyRuns(rosterRuns, rosterGoalDistanceKm);
  for (const run of untrustworthy) {
    const goalKm = rosterGoalDistanceKm ?? run.matchResult?.comparedDistanceKm;
    const reason = !Number.isFinite(Number(goalKm)) || Number(goalKm) <= 0
      ? '목표 거리가 기록에 없어 완주 여부를 검증할 수 없어'
      : `${run.distanceKm}km로 목표 ${goalKm}km를 채우지 못했거나 속도가 비현실적이야`;
    blockers.push(`run ${run.id} (${userLabel(store, run.userId)})를 증거로 쓸 수 없어 — ${reason}. 세션이 없으면 판정이 순수 경과시간으로만 매겨져서, 이런 기록을 상대로 삼으면 실제 완주자가 패배로 뒤집혀.`);
  }

  return { matchRuns, rosterRuns, outsiderRuns, untrustworthy, roster, blockers };
}

export function applyHeal(store, plan, options) {
  const mode = plan.rosterRuns[0]?.matchResult?.mode === 'group' ? 'group' : 'duel';
  const before = new Map(plan.matchRuns.map((run) => [run.id, run.matchResult]));
  const healedUserIds = backFillSavedRunsWithVerifiedRoster(store, options.matchId, mode, plan.roster);

  return healedUserIds.map((userId) => {
    const run = (store.runs ?? []).find((entry) => (
      entry.userId === userId && entry.matchResult?.matchId === options.matchId
    ));

    return {
      runId: run?.id ?? null,
      userId,
      mode,
      before: before.get(run?.id) ?? null,
      after: run?.matchResult ?? null,
    };
  });
}

// ── Output ────────────────────────────────────────────────────────────────────────────────

function printSurvey(store) {
  const stuckMatches = collectStuckMatches(store);
  console.log(`\n[backfill-pending-match-results] SURVEY driver=${STORE_DRIVER}`);
  console.log(`  store: ${JSON.stringify(getStoreDiagnostics())}`);
  console.log(`\n굳어 있는 매치: ${stuckMatches.length}건\n`);

  for (const entry of stuckMatches) {
    console.log(`  ${entry.matchId} (${entry.mode})`);
    for (const run of collectMatchRuns(store, entry.matchId)) {
      const stuck = isStuckMatchBlob(run.matchResult) ? '미해소' : `해소됨(${run.matchResult.resultTone ?? run.matchResult.rank})`;
      console.log(`    run ${run.id} · ${userLabel(store, run.userId)} · ${run.distanceKm}km / ${run.durationSeconds}s · ${stuck}`);
    }
    console.log('');
  }

  console.log('이 목록은 "이 matchId로 저장한 사람들"일 뿐 참가자 명부가 아니야 — matchId는 검증되지 않는 클라 입력이라');
  console.log('참가자가 아닌 사람의 기록이 섞여 있을 수 있어. 실제 참가자를 확인한 뒤 --match-id 와 --participants 로 진행해줘.');
}

function printPlan(store, plan, healed, options) {
  console.log(`\n[backfill-pending-match-results] mode=${options.yes ? 'APPLY' : 'DRY-RUN'} driver=${STORE_DRIVER}`);
  console.log(`  store: ${JSON.stringify(getStoreDiagnostics())}`);
  console.log(`\n① 매치 ${options.matchId} · 지정 로스터 ${[...plan.roster].join(', ')}`);

  for (const run of plan.rosterRuns) {
    console.log(`  [로스터] run ${run.id} · ${userLabel(store, run.userId)} · ${run.distanceKm}km / ${run.durationSeconds}s · resultTone=${run.matchResult.resultTone ?? '(없음)'}`);
  }
  for (const run of plan.outsiderRuns) {
    console.log(`  [무시됨 — 로스터 밖] run ${run.id} · ${userLabel(store, run.userId)} · ${run.distanceKm}km`);
  }

  console.log(`\n② 해소 가능: ${healed.length}건`);
  for (const entry of healed) {
    const tone = entry.mode === 'duel'
      ? `resultTone ${entry.before?.resultTone ?? '(없음)'} → ${entry.after?.resultTone}`
      : `rank ${entry.before?.rank ?? '(없음)'} → ${entry.after?.rank}`;
    console.log(`  run ${entry.runId} · ${userLabel(store, entry.userId)} · ${tone} · badge ${entry.before?.badgeLabel ?? '(없음)'} → ${entry.after?.badgeLabel}`);
  }

  if (plan.blockers.length) {
    console.log('\n⛔ 차단 사유:');
    for (const blocker of plan.blockers) {
      console.log(`  - ${blocker}`);
    }
  }

  console.log('\n포인트는 기록에서 파생되므로 블롭이 고쳐지면 과거 적립까지 자동으로 맞춰져. LP는 이 스크립트가 건드리지 않아.');
}

// ── main ──────────────────────────────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs(process.argv);

  // No match named → survey only. Never writes, never needs a roster.
  if (!options.matchId && !options.participantIds.length) {
    printSurvey(await loadStore());
    console.log('\n(survey — 아무것도 저장하지 않았어.)');
    return;
  }

  if (!options.yes) {
    // Dry run on a DEEP CLONE: the report shows the resolver's real output while the live store
    // is never touched. (Structured-clone caveat: the store is plain JSON, so parse/stringify is
    // lossless here — every timestamp is already an ISO string.)
    const clone = JSON.parse(JSON.stringify(await loadStore()));
    const plan = planHeal(clone, options);
    const healed = plan.blockers.length ? [] : applyHeal(clone, plan, options);
    printPlan(clone, plan, healed, options);
    console.log('\n(dry-run — 아무것도 저장하지 않았어. 실제 반영은 --yes)');
    process.exitCode = plan.blockers.length ? 1 : 0;
    return;
  }

  const outcome = await mutateStore((store) => {
    const plan = planHeal(store, options);

    if (plan.blockers.length) {
      return { plan, healed: null, store };
    }

    return { plan, healed: applyHeal(store, plan, options), store };
  });

  // Printing happens OUTSIDE mutateStore: on the postgres driver the callback runs while holding
  // the store's FOR UPDATE row lock, and unbounded terminal output would stall every other write.
  printPlan(outcome.store, outcome.plan, outcome.healed ?? [], options);

  if (!outcome.healed) {
    console.error('\n⛔ 차단 사유가 있어 아무것도 반영하지 않았어.');
    process.exitCode = 1;
    return;
  }

  console.log(`\n✅ 반영 완료: 기록 ${outcome.healed.length}건 해소.`);
  console.log('  (재실행해도 안전해 — 확정된 판정은 절대 다시 건드리지 않아.)');
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  try {
    await main();
  } catch (error) {
    console.error('[backfill-pending-match-results] failed');
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 1;
  }
  // The postgres adapter keeps an idle pool (30s idle timeout) — exit explicitly so the
  // one-off container/process doesn't linger after all work is done.
  process.exit(process.exitCode ?? 0);
}
