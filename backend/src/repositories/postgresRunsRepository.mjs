import { areRunsPotentialDuplicates, buildRunExternalKey, buildRunFingerprint } from './runsRepository.mjs';
import {
  clone,
  createDisplayTimestamp,
  createNowIso,
  getRunSourceType,
  isSyncableSourceType,
  isUniqueViolation,
} from './postgresRunsHelpers.mjs';
import {
  buildDecoratedSource,
  deleteImports,
  getPendingImportCountForUser,
  getRunForUser,
  insertImport,
  insertRun,
  loadPendingImportsForUser,
  loadRunsForUser,
  requireSyncableConnectedSource,
  requireUserByToken,
  runWriteOperation,
  updateUserConnectedSources,
} from './postgresRunsQueries.mjs';

export function createPostgresRunsRepository({
  database,
  nextId,
  buildRunDetail,
  buildUserMetrics,
  createError,
  sourceLabels,
  nowIso = createNowIso,
  formatTimestamp = createDisplayTimestamp,
  // C1/C2: server-authoritative duel verdict resolver, identical contract to the json
  // repository. Given (user, matchResult) it returns the server-resolved matchResult or a
  // PENDING one; defaults to identity so this repo is behaviorally identical to the json one
  // (and so callers that do not wire it keep working). Match sessions live on the whole-store
  // (the postgres jsonb store row / json file), NOT the runs table, so the wired resolver reads
  // them via the whole-store seam — this repo just applies whatever it returns.
  resolveMatchResult = async (user, matchResult) => matchResult,
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
        // C1/C2: resolve the duel verdict SERVER-side before persisting — the client-claimed
        // resultTone/opponentName are never trusted. Group runs and non-match runs pass through.
        const resolvedMatchResult = input.matchResult
          ? await resolveMatchResult(user, input.matchResult)
          : undefined;
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
          ...(resolvedMatchResult ? { matchResult: clone(resolvedMatchResult) } : {}),
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
