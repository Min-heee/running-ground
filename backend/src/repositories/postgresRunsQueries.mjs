import {
  clone,
  isSyncableSourceType,
} from './postgresRunsHelpers.mjs';
import {
  mapImportRow,
  mapRunRow,
  mapUserRow,
} from './postgresRunsRowMappers.mjs';

export async function runWriteOperation(database, callback) {
  if (typeof database.transaction === 'function') {
    return database.transaction(callback);
  }

  return callback(database);
}

export async function requireUserByToken(database, token, createError) {
  const result = await database.query(
    `
      select u.*
      from sessions s
      join users u on u.id = s.user_id
      where s.token = $1
        and s.expires_at > now()
      limit 1
    `,
    [token],
  );

  if (!result.rows[0]) {
    throw createError(401, '세션이 만료됐어요. 다시 로그인해주세요.');
  }

  return mapUserRow(result.rows[0]);
}

export async function loadRunsForUser(database, userId) {
  const result = await database.query(
    `
      select id, user_id, run_date, distance_km, pace, source_label, source_type, external_id,
             route, match_result, duration_seconds, cadence_spm, elevation_gain_m, started_at, ended_at,
             imported_at, created_at, updated_at
      from runs
      where user_id = $1
      order by run_date desc, created_at desc
    `,
    [userId],
  );

  return result.rows.map(mapRunRow);
}

export async function loadPendingImportsForUser(database, userId) {
  const result = await database.query(
    `
      select id, user_id, source_type, source_label, external_id, run_date, distance_km, pace,
             import_status, raw_payload, received_at, processed_at
      from integration_imports
      where user_id = $1
        and import_status = 'pending'
      order by run_date asc nulls last, received_at asc
    `,
    [userId],
  );

  return result.rows.map(mapImportRow);
}

export async function getPendingImportCountForUser(database, userId, sourceType) {
  const pendingImports = await loadPendingImportsForUser(database, userId);
  return pendingImports.filter((entry) => entry.sourceType === sourceType).length;
}

export function requireConnectedSource(user, sourceType, createError) {
  const source = user.connectedSources.find((entry) => entry.sourceType === sourceType);

  if (!source) {
    throw createError(404, '선택한 연동 소스를 찾을 수 없어요.');
  }

  return source;
}

export function requireSyncableConnectedSource(user, sourceType, createError) {
  const source = requireConnectedSource(user, sourceType, createError);

  if (!isSyncableSourceType(sourceType)) {
    throw createError(400, '수동 입력 소스는 외부 import 방식 대신 앱 안에서 직접 기록을 추가해주세요.');
  }

  if (!source.connected) {
    throw createError(409, '이 소스는 아직 연결되지 않았어요. 먼저 연결한 뒤 기록을 가져와주세요.');
  }

  return source;
}

export function getRunForUser(runs, runId, createError) {
  if (!runs.length) {
    throw createError(404, '러닝 기록이 없어요.');
  }

  if (!runId) {
    return runs[0];
  }

  const run = runs.find((entry) => entry.id === runId);

  if (!run) {
    throw createError(404, '러닝 기록을 찾을 수 없어요.');
  }

  return run;
}

export function buildDecoratedSource(source, pendingImportCount, sourceLabels) {
  return {
    ...clone(source),
    displayName: sourceLabels[source.sourceType] ?? source.displayName ?? source.sourceType,
    ...(pendingImportCount > 0 ? { pendingImportCount } : {}),
  };
}

export async function updateUserConnectedSources(database, userId, connectedSources, updatedAt) {
  await database.query(
    `
      update users
      set connected_sources = $2,
          updated_at = $3
      where id = $1
    `,
    [userId, JSON.stringify(connectedSources), updatedAt],
  );
}

export async function insertRun(database, run) {
  await database.query(
    `
      insert into runs (
        id, user_id, run_date, distance_km, pace, source_label, source_type, external_id,
        route, match_result, duration_seconds, cadence_spm, elevation_gain_m, started_at, ended_at,
        imported_at, created_at, updated_at
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18
      )
    `,
    [
      run.id,
      run.userId,
      run.date,
      run.distanceKm,
      run.pace,
      run.source,
      run.sourceType,
      run.externalId ?? null,
      Array.isArray(run.route) ? JSON.stringify(run.route) : null,
      run.matchResult ? JSON.stringify(run.matchResult) : null,
      typeof run.durationSeconds === 'number' ? run.durationSeconds : null,
      typeof run.cadenceSpm === 'number' ? run.cadenceSpm : null,
      typeof run.elevationGainM === 'number' ? run.elevationGainM : null,
      run.startedAt ?? null,
      run.endedAt ?? null,
      run.importedAt ?? null,
      run.createdAt,
      run.updatedAt ?? run.createdAt,
    ],
  );
}

// B-5 (finish-flow relief 2026-07-07): in-place matchResult upgrade for the match-save
// dedupe-as-upgrade retry path — only the match_result jsonb (and updated_at) move, so a
// retried match save can never duplicate the row it upgrades.
export async function updateRunMatchResult(database, runId, matchResult, updatedAt) {
  await database.query(
    `
      update runs
      set match_result = $2,
          updated_at = $3
      where id = $1
    `,
    [runId, matchResult ? JSON.stringify(matchResult) : null, updatedAt],
  );
}

export async function insertImport(database, entry) {
  await database.query(
    `
      insert into integration_imports (
        id, user_id, source_type, source_label, external_id, run_date, distance_km, pace,
        import_status, raw_payload, received_at, processed_at
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12
      )
    `,
    [
      entry.id,
      entry.userId,
      entry.sourceType,
      entry.sourceLabel,
      entry.externalId || null,
      entry.date || null,
      entry.distanceKm,
      entry.pace,
      entry.importStatus ?? 'pending',
      JSON.stringify(entry.rawPayload ?? {}),
      entry.receivedAt,
      entry.processedAt ?? null,
    ],
  );
}

export async function deleteImports(database, importIds) {
  if (!importIds.length) {
    return;
  }

  await database.query(
    `
      delete from integration_imports
      where id = any($1::text[])
    `,
    [importIds],
  );
}
