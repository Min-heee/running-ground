// wipe-prelaunch-data.mjs — one-off post-launch cleanup (2026-07-21): delete every pre-launch
// test account and all data attached to them, keeping ONLY the accounts in --keep (default
// reviewer01 — Apple is reviewing 1.0.1 with that login; deleting it mid-review = instant
// rejection). Seed/content collections (marketCatalog, notices, regionTree, offline race
// guide) are never touched. See wipePrelaunchDataTransform.mjs for the exact removal matrix.
//
// DRY RUN BY DEFAULT — prints what it would remove and writes NOTHING. Writing requires --yes.
// Before writing it always creates a store backup (createStoreBackup 'wipe-prelaunch-data').
// After the blob write, on the postgres driver it also purges the run_routes side table rows
// belonging to the removed runs/users (best-effort: a failure there leaves harmless orphan
// polylines and is reported, not fatal).
//
// Flags:
//   --keep <username>      account to preserve; repeatable or comma-separated
//                          (default: reviewer01). Matching is case-insensitive.
//   --yes                  actually write (without it: dry run, always)
//   --allow-missing-keep   proceed even if a --keep username doesn't exist in the store
//                          (safety pin against typos silently protecting nobody)
//
// ── Droplet invocation (production = runningground-production, compose.public.yaml,
//    BACKEND_STORE_DRIVER=postgres — SAFE to run while the api container is up: the postgres
//    adapter's mutateStore serializes on a FOR UPDATE row lock and re-reads before writing).
//    The image only ships src/, so copy the two script files in first:
//
//   cd ~/RunningGround/backend
//   DC="docker compose -p runningground-production --env-file ./.env.production -f ./compose.public.yaml"
//   $DC exec api mkdir -p /app/scripts
//   $DC cp ./scripts/wipePrelaunchDataTransform.mjs api:/app/scripts/wipePrelaunchDataTransform.mjs
//   $DC cp ./scripts/wipe-prelaunch-data.mjs  api:/app/scripts/wipe-prelaunch-data.mjs
//   $DC exec api node /app/scripts/wipe-prelaunch-data.mjs          # ① dry run — review counts
//   $DC exec api node /app/scripts/wipe-prelaunch-data.mjs --yes    # ② real wipe

import { pathToFileURL } from 'node:url';

import {
  createStoreBackup,
  loadStore,
  mutateStore,
  STORE_DRIVER,
} from '../src/storage/index.mjs';
import { wipePrelaunchData } from './wipePrelaunchDataTransform.mjs';

function parseArgs(argv) {
  const options = { keepUsernames: [], yes: false, allowMissingKeep: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--yes') {
      options.yes = true;
    } else if (arg === '--allow-missing-keep') {
      options.allowMissingKeep = true;
    } else if (arg === '--keep') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--keep에는 username 값이 필요해.');
      }
      options.keepUsernames.push(...value.split(',').map((name) => name.trim()).filter(Boolean));
      index += 1;
    } else {
      throw new Error(`알 수 없는 플래그: ${arg}`);
    }
  }

  if (options.keepUsernames.length === 0) {
    options.keepUsernames = ['reviewer01'];
  }

  return options;
}

function printSummary(summary, { dryRun }) {
  const mode = dryRun ? '[DRY RUN — 아무것도 안 지움]' : '[적용됨]';
  console.log(`\n${mode} 보존 계정: ${summary.keptUsernames.join(', ') || '(없음)'}`);
  if (summary.missingKeepUsernames.length) {
    console.log(`⚠ 스토어에 없는 --keep 계정: ${summary.missingKeepUsernames.join(', ')}`);
  }
  console.log('삭제 카운트:');
  for (const [key, count] of Object.entries(summary.removedCounts)) {
    console.log(`  ${key.padEnd(28)} ${count}`);
  }
  console.log(`  ${'합계'.padEnd(28)} ${summary.totalRemoved}`);
  console.log(`남는 것: users ${summary.keptCounts.users}, runs ${summary.keptCounts.runs}, `
    + `sessions ${summary.keptCounts.sessions}, notifications ${summary.keptCounts.notifications}`);
}

// run_routes 사이드테이블 정리 (postgres 드라이버 전용). 삭제된 run id + 삭제된 user id 양쪽
// 기준으로 지운다. 실패해도 고아 폴리라인이 남을 뿐 앱 동작엔 무해 — 보고만 하고 계속 간다.
async function purgeRunRoutes(summary) {
  if (STORE_DRIVER !== 'postgres') {
    return;
  }
  if (!summary.removedRunIds.length && !summary.removedUserIds.length) {
    return;
  }

  try {
    const { resolveStoreDatabaseUrl } = await import('../src/storage/postgresStoreAdapter.mjs');
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: resolveStoreDatabaseUrl() });
    await client.connect();
    try {
      const result = await client.query(
        'delete from run_routes where run_id = any($1::text[]) or user_id = any($2::text[])',
        [summary.removedRunIds, summary.removedUserIds],
      );
      console.log(`run_routes 정리: ${result.rowCount}행 삭제`);
    } finally {
      await client.end();
    }
  } catch (error) {
    console.log(`⚠ run_routes 정리 실패 (무해한 고아 경로만 남음): ${error?.message ?? error}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  // Pass 1 — always: read-only preview against the loaded store (deep copy so the dry run
  // can run the real mutator without touching anything).
  const preview = wipePrelaunchData(
    JSON.parse(JSON.stringify(await loadStore())),
    { keepUsernames: options.keepUsernames },
  );

  if (preview.missingKeepUsernames.length && !options.allowMissingKeep) {
    printSummary(preview, { dryRun: true });
    console.error(
      `\n중단: --keep 계정 ${preview.missingKeepUsernames.join(', ')}이(가) 스토어에 없어. `
      + '오타면 고치고, 정말 의도한 거면 --allow-missing-keep을 붙여줘.',
    );
    process.exitCode = 1;
    return;
  }

  if (!options.yes) {
    printSummary(preview, { dryRun: true });
    console.log('\n실제로 지우려면 --yes를 붙여서 다시 실행해줘.');
    return;
  }

  const backupPath = await createStoreBackup('wipe-prelaunch-data');
  if (!backupPath) {
    console.error('중단: 백업 파일을 만들지 못했어. 백업 없이 지우지 않는다.');
    process.exitCode = 1;
    return;
  }
  console.log(`백업 생성: ${backupPath}`);

  const summary = await mutateStore((store) => (
    wipePrelaunchData(store, { keepUsernames: options.keepUsernames })
  ));

  printSummary(summary, { dryRun: false });
  await purgeRunRoutes(summary);
  console.log('\n완료.');
}

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(`wipe-prelaunch-data 실패: ${error?.stack ?? error}`);
    process.exitCode = 1;
  });
}
