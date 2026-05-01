import { areRunsPotentialDuplicates, buildRunExternalKey, buildRunFingerprint } from './runsRepository.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isSyncableSourceType(sourceType) {
  return sourceType !== 'manual';
}

function inferSourceTypeFromLabel(label, sourceLabels) {
  const normalizedLabel = normalizeOptionalString(label).toLowerCase();

  if (normalizedLabel === 'nrc') {
    return 'nrc';
  }

  if (normalizedLabel === 'mynb' || normalizedLabel === 'my nb' || normalizedLabel === 'new balance') {
    return 'mynb';
  }

  return Object.entries(sourceLabels)
    .find(([, displayName]) => displayName.toLowerCase() === normalizedLabel)?.[0] ?? null;
}

function getRunSourceType(run, sourceLabels) {
  return normalizeOptionalString(run.sourceType) || inferSourceTypeFromLabel(run.source, sourceLabels);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asNumber(value, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function toIsoString(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' && value) {
    return value;
  }

  return '';
}

function toDateOnly(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'string' && value) {
    return value.slice(0, 10);
  }

  return '';
}

function createNowIso() {
  return new Date().toISOString();
}

function createDisplayTimestamp() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function isUniqueViolation(error, constraintName) {
  return error?.code === '23505' && (
    error.constraint === constraintName || String(error.message ?? '').includes(constraintName)
  );
}

function mapUserRow(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.nickname,
    realName: row.real_name ?? '',
    phone: row.phone ?? '',
    birthDate: toDateOnly(row.birth_date),
    publicTag: row.public_tag,
    provinceName: row.province_name ?? '',
    cityName: row.city_name ?? '',
    districtName: row.district_name ?? '',
    universityName: row.university_name ?? '',
    addressDetail: row.address_detail ?? '',
    rewardPoints: asNumber(row.reward_points),
    streakDays: asNumber(row.streak_days),
    connectedSources: asArray(row.connected_sources),
    notificationSettings: asObject(row.notification_settings),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapRunRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    date: toDateOnly(row.run_date),
    distanceKm: asNumber(row.distance_km),
    pace: row.pace ?? '',
    source: row.source_label ?? 'Manual',
    sourceType: row.source_type ?? 'manual',
    ...(row.external_id ? { externalId: row.external_id } : {}),
    ...(Array.isArray(row.route) ? { route: clone(row.route) } : {}),
    ...(hasValue(row.duration_seconds) ? { durationSeconds: asNumber(row.duration_seconds) } : {}),
    ...(hasValue(row.cadence_spm) ? { cadenceSpm: asNumber(row.cadence_spm) } : {}),
    ...(hasValue(row.elevation_gain_m) ? { elevationGainM: asNumber(row.elevation_gain_m) } : {}),
    ...(normalizeOptionalString(row.started_at) ? { startedAt: toIsoString(row.started_at) } : {}),
    ...(normalizeOptionalString(row.ended_at) ? { endedAt: toIsoString(row.ended_at) } : {}),
    ...(normalizeOptionalString(row.imported_at) ? { importedAt: toIsoString(row.imported_at) } : {}),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapImportRow(row) {
  const rawPayload = asObject(row.raw_payload);

  return {
    id: row.id,
    userId: row.user_id,
    sourceType: row.source_type,
    sourceLabel: row.source_label,
    externalId: row.external_id ?? '',
    date: toDateOnly(row.run_date),
    distanceKm: asNumber(row.distance_km),
    pace: row.pace ?? '',
    importStatus: row.import_status ?? 'pending',
    ...(hasValue(rawPayload.durationSeconds) ? { durationSeconds: asNumber(rawPayload.durationSeconds) } : {}),
    ...(normalizeOptionalString(rawPayload.startedAt) ? { startedAt: toIsoString(rawPayload.startedAt) } : {}),
    ...(normalizeOptionalString(rawPayload.endedAt) ? { endedAt: toIsoString(rawPayload.endedAt) } : {}),
    rawPayload,
    receivedAt: toIsoString(row.received_at),
    processedAt: toIsoString(row.processed_at),
  };
}

async function runWriteOperation(database, callback) {
  if (typeof database.transaction === 'function') {
    return database.transaction(callback);
  }

  return callback(database);
}

async function requireUserByToken(database, token, createError) {
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
    throw createError(401, '세션이 만료됐어. 다시 로그인해줘.');
  }

  return mapUserRow(result.rows[0]);
}

async function loadRunsForUser(database, userId) {
  const result = await database.query(
    `
      select id, user_id, run_date, distance_km, pace, source_label, source_type, external_id,
             route, duration_seconds, cadence_spm, elevation_gain_m, started_at, ended_at,
             imported_at, created_at, updated_at
      from runs
      where user_id = $1
      order by run_date desc, created_at desc
    `,
    [userId],
  );

  return result.rows.map(mapRunRow);
}

async function loadPendingImportsForUser(database, userId) {
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

async function getPendingImportCountForUser(database, userId, sourceType) {
  const pendingImports = await loadPendingImportsForUser(database, userId);
  return pendingImports.filter((entry) => entry.sourceType === sourceType).length;
}

function requireConnectedSource(user, sourceType, createError) {
  const source = user.connectedSources.find((entry) => entry.sourceType === sourceType);

  if (!source) {
    throw createError(404, '선택한 연동 소스를 찾을 수 없어.');
  }

  return source;
}

function requireSyncableConnectedSource(user, sourceType, createError) {
  const source = requireConnectedSource(user, sourceType, createError);

  if (!isSyncableSourceType(sourceType)) {
    throw createError(400, '수동 입력 소스는 외부 import 방식 대신 앱 안에서 직접 기록을 추가해줘.');
  }

  if (!source.connected) {
    throw createError(409, '이 소스는 아직 연결되지 않았어. 먼저 연결한 뒤 기록을 가져와줘.');
  }

  return source;
}

function getRunForUser(runs, runId, createError) {
  if (!runs.length) {
    throw createError(404, '러닝 기록이 없어.');
  }

  if (!runId) {
    return runs[0];
  }

  const run = runs.find((entry) => entry.id === runId);

  if (!run) {
    throw createError(404, '러닝 기록을 찾을 수 없어.');
  }

  return run;
}

function buildDecoratedSource(source, pendingImportCount, sourceLabels) {
  return {
    ...clone(source),
    displayName: sourceLabels[source.sourceType] ?? source.displayName ?? source.sourceType,
    ...(pendingImportCount > 0 ? { pendingImportCount } : {}),
  };
}

async function updateUserConnectedSources(database, userId, connectedSources, updatedAt) {
  await database.query(
    `
      update users
      set connected_sources = $2,
          updated_at = $3
      where id = $1
    `,
    [userId, clone(connectedSources), updatedAt],
  );
}

async function insertRun(database, run) {
  await database.query(
    `
      insert into runs (
        id, user_id, run_date, distance_km, pace, source_label, source_type, external_id,
        route, duration_seconds, cadence_spm, elevation_gain_m, started_at, ended_at,
        imported_at, created_at, updated_at
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14,
        $15, $16, $17
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
      Array.isArray(run.route) ? clone(run.route) : null,
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

async function insertImport(database, entry) {
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
      clone(entry.rawPayload ?? {}),
      entry.receivedAt,
      entry.processedAt ?? null,
    ],
  );
}

async function deleteImports(database, importIds) {
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

export function createPostgresRunsRepository({
  database,
  nextId,
  buildRunDetail,
  buildUserMetrics,
  createError,
  sourceLabels,
  nowIso = createNowIso,
  formatTimestamp = createDisplayTimestamp,
}) {
  if (!database || typeof database.query !== 'function') {
    throw new Error('createPostgresRunsRepository requires a database query adapter.');
  }

  if (typeof buildUserMetrics !== 'function') {
    throw new Error('createPostgresRunsRepository requires a buildUserMetrics function.');
  }

  return {
    async getRun({ token, runId }) {
      const user = await requireUserByToken(database, token, createError);
      const runs = await loadRunsForUser(database, user.id);
      const run = getRunForUser(runs, runId, createError);
      const metrics = buildUserMetrics(runs);

      return buildRunDetail(run, metrics.currentWeekDistanceKm, undefined, metrics);
    },

    async createManualRun({ token, input }) {
      return runWriteOperation(database, async (client) => {
        const user = await requireUserByToken(client, token, createError);
        const createdAt = nowIso();
        const run = {
          id: nextId('run'),
          userId: user.id,
          date: input.date,
          distanceKm: input.distanceKm,
          pace: input.pace,
          source: 'Manual',
          sourceType: 'manual',
          createdAt,
          updatedAt: createdAt,
        };

        await insertRun(client, run);

        const manualSourceIndex = user.connectedSources.findIndex((entry) => entry.sourceType === 'manual');

        if (manualSourceIndex >= 0) {
          const nextConnectedSources = clone(user.connectedSources);
          nextConnectedSources[manualSourceIndex] = {
            ...nextConnectedSources[manualSourceIndex],
            connected: true,
            connectionStatus: 'connected',
            lastSyncedAt: formatTimestamp(),
          };
          await updateUserConnectedSources(client, user.id, nextConnectedSources, createdAt);
        }

        const runs = await loadRunsForUser(client, user.id);
        const metrics = buildUserMetrics(runs);
        return buildRunDetail(run, metrics.currentWeekDistanceKm, undefined, metrics);
      });
    },

    async createTrackedRun({ token, input }) {
      return runWriteOperation(database, async (client) => {
        const user = await requireUserByToken(client, token, createError);
        const createdAt = nowIso();
        const run = {
          id: nextId('run'),
          userId: user.id,
          date: input.date,
          distanceKm: input.distanceKm,
          pace: input.pace,
          durationSeconds: input.durationSeconds,
          ...(typeof input.cadenceSpm === 'number' ? { cadenceSpm: input.cadenceSpm } : {}),
          ...(typeof input.elevationGainM === 'number' ? { elevationGainM: input.elevationGainM } : {}),
          route: Array.isArray(input.route) ? clone(input.route) : [],
          startedAt: input.startedAt,
          endedAt: input.endedAt,
          source: 'RunningGround',
          sourceType: 'runningground',
          createdAt,
          updatedAt: createdAt,
        };

        await insertRun(client, run);

        const runs = await loadRunsForUser(client, user.id);
        const metrics = buildUserMetrics(runs);
        return buildRunDetail(run, metrics.currentWeekDistanceKm, undefined, metrics);
      });
    },

    async queueIntegrationImports({ token, sourceType, normalizedRuns }) {
      return runWriteOperation(database, async (client) => {
        const user = await requireUserByToken(client, token, createError);
        const source = requireSyncableConnectedSource(user, sourceType, createError);
        const receivedAt = nowIso();
        let queuedRuns = 0;

        for (const run of normalizedRuns) {
          try {
            await insertImport(client, {
              id: nextId('import'),
              userId: user.id,
              ...run,
              rawPayload: {
                ...clone(run),
              },
              receivedAt,
            });
            queuedRuns += 1;
          } catch (error) {
            if (isUniqueViolation(error, 'integration_imports_user_source_external_unique_idx')) {
              continue;
            }

            throw error;
          }
        }

        const pendingRuns = await getPendingImportCountForUser(client, user.id, sourceType);

        return {
          success: true,
          source: buildDecoratedSource(source, pendingRuns, sourceLabels),
          queuedRuns,
          pendingRuns,
        };
      });
    },

    async syncIntegrationImports({ token }) {
      return runWriteOperation(database, async (client) => {
        const user = await requireUserByToken(client, token, createError);
        const connectedSources = user.connectedSources.filter((source) => source.connected && isSyncableSourceType(source.sourceType));
        const connectedSourceTypes = new Set(connectedSources.map((source) => source.sourceType));
        const sourceDisplayNameByType = new Map(connectedSources.map((source) => [
          source.sourceType,
          sourceLabels[source.sourceType] ?? source.displayName ?? source.sourceType,
        ]));
        const pendingImports = (await loadPendingImportsForUser(client, user.id))
          .filter((entry) => connectedSourceTypes.has(entry.sourceType));
        const existingRuns = await loadRunsForUser(client, user.id);
        const existingExternalKeys = new Set();
        const existingFingerprints = new Set();
        const existingTimedRuns = [];
        const processedImportIds = [];
        const importedRunIds = [];
        const lastSyncedAt = formatTimestamp();
        const syncedAtIso = nowIso();
        let scannedRuns = 0;
        let importedRuns = 0;
        let duplicateRuns = 0;

        for (const run of existingRuns) {
          const sourceType = getRunSourceType(run, sourceLabels);
          const externalKey = buildRunExternalKey({
            sourceType,
            externalId: run.externalId,
          });

          if (externalKey) {
            existingExternalKeys.add(externalKey);
          }

          if (sourceType) {
            existingFingerprints.add(buildRunFingerprint({
              sourceType,
              date: run.date,
              distanceKm: run.distanceKm,
              pace: run.pace,
              startedAt: run.startedAt,
            }));
          }

          existingTimedRuns.push(run);
        }

        pendingImports.sort((left, right) => {
          const leftDate = String(left.date ?? '');
          const rightDate = String(right.date ?? '');

          if (leftDate !== rightDate) {
            return leftDate.localeCompare(rightDate);
          }

          return String(left.receivedAt).localeCompare(String(right.receivedAt));
        });

        for (const entry of pendingImports) {
          scannedRuns += 1;
          processedImportIds.push(entry.id);

          const externalKey = buildRunExternalKey(entry);
          const fingerprint = buildRunFingerprint(entry);
          const timedDuplicate = existingTimedRuns.some((existingRun) => areRunsPotentialDuplicates(existingRun, entry));

          if ((externalKey && existingExternalKeys.has(externalKey)) || existingFingerprints.has(fingerprint) || timedDuplicate) {
            duplicateRuns += 1;
            continue;
          }

          const run = {
            id: nextId('run'),
            userId: user.id,
            date: entry.date,
            distanceKm: entry.distanceKm,
            pace: entry.pace,
            source: entry.sourceLabel ?? sourceDisplayNameByType.get(entry.sourceType) ?? entry.sourceType,
            sourceType: entry.sourceType,
            ...(entry.externalId ? { externalId: entry.externalId } : {}),
            ...(typeof entry.durationSeconds === 'number' ? { durationSeconds: entry.durationSeconds } : {}),
            ...(entry.startedAt ? { startedAt: entry.startedAt } : {}),
            ...(entry.endedAt ? { endedAt: entry.endedAt } : {}),
            importedAt: syncedAtIso,
            createdAt: syncedAtIso,
            updatedAt: syncedAtIso,
          };

          try {
            await insertRun(client, run);
            importedRuns += 1;
            importedRunIds.push(run.id);

            if (externalKey) {
              existingExternalKeys.add(externalKey);
            }

            existingFingerprints.add(fingerprint);
            existingTimedRuns.push(run);
          } catch (error) {
            if (isUniqueViolation(error, 'runs_user_source_external_unique_idx')) {
              duplicateRuns += 1;
              continue;
            }

            throw error;
          }
        }

        await deleteImports(client, processedImportIds);

        if (connectedSources.length) {
          const nextConnectedSources = user.connectedSources.map((source) => (
            source.connected && connectedSourceTypes.has(source.sourceType)
              ? {
                ...source,
                lastSyncedAt,
              }
              : source
          ));
          await updateUserConnectedSources(client, user.id, nextConnectedSources, syncedAtIso);
        }

        return {
          success: true,
          syncedSources: connectedSources.length,
          scannedRuns,
          importedRuns,
          duplicateRuns,
          syncedRuns: importedRuns,
          importedRunIds,
          lastSyncedAt,
        };
      });
    },
  };
}
