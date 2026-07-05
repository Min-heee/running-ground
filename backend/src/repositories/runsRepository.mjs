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

export function ensureIntegrationImports(store) {
  if (!Array.isArray(store.integrationImports)) {
    store.integrationImports = [];
  }

  return store.integrationImports;
}

export function getPendingImportCount(store, userId, sourceType) {
  return ensureIntegrationImports(store)
    .filter((entry) => entry.userId === userId && entry.sourceType === sourceType)
    .length;
}

export function buildRunExternalKey(input) {
  const sourceType = normalizeOptionalString(input.sourceType);
  const externalId = normalizeOptionalString(input.externalId);

  if (!sourceType || !externalId) {
    return null;
  }

  return `${sourceType}::${externalId}`;
}

export function buildRunFingerprint(input) {
  const sourceType = normalizeOptionalString(input.sourceType);
  const distanceKm = Number(input.distanceKm);
  const startedAt = normalizeOptionalString(input.startedAt);

  return [
    sourceType || 'unknown',
    normalizeOptionalString(input.date),
    Number.isFinite(distanceKm) ? distanceKm.toFixed(1) : '0.0',
    normalizeOptionalString(input.pace),
    startedAt || 'na',
  ].join('::');
}

function parseTimestampMs(value) {
  const text = normalizeOptionalString(value);

  if (!text) {
    return null;
  }

  const timestampMs = new Date(text).getTime();
  return Number.isFinite(timestampMs) ? timestampMs : null;
}

export function buildRunTimeWindow(input) {
  const startedAtMs = parseTimestampMs(input.startedAt);

  if (!startedAtMs) {
    return null;
  }

  const durationSeconds = Number(input.durationSeconds);
  const durationMs = Number.isFinite(durationSeconds) && durationSeconds > 0
    ? Math.round(durationSeconds * 1000)
    : null;
  let endedAtMs = parseTimestampMs(input.endedAt);

  if ((!endedAtMs || endedAtMs <= startedAtMs) && durationMs) {
    endedAtMs = startedAtMs + durationMs;
  }

  if (!endedAtMs || endedAtMs <= startedAtMs) {
    return null;
  }

  return {
    startMs: startedAtMs,
    endMs: endedAtMs,
    durationMs: endedAtMs - startedAtMs,
  };
}

export function areRunsPotentialDuplicates(left, right) {
  const leftWindow = buildRunTimeWindow(left);
  const rightWindow = buildRunTimeWindow(right);

  if (!leftWindow || !rightWindow) {
    return false;
  }

  const leftDistanceKm = Number(left.distanceKm);
  const rightDistanceKm = Number(right.distanceKm);
  const distanceGapKm = Math.abs(leftDistanceKm - rightDistanceKm);

  if (!Number.isFinite(distanceGapKm) || distanceGapKm > 0.8) {
    return false;
  }

  const startGapMs = Math.abs(leftWindow.startMs - rightWindow.startMs);
  const endGapMs = Math.abs(leftWindow.endMs - rightWindow.endMs);

  if (startGapMs <= 15 * 60 * 1000 && endGapMs <= 15 * 60 * 1000) {
    return true;
  }

  const overlapMs = Math.min(leftWindow.endMs, rightWindow.endMs) - Math.max(leftWindow.startMs, rightWindow.startMs);

  if (overlapMs <= 0) {
    return false;
  }

  const shorterDurationMs = Math.min(leftWindow.durationMs, rightWindow.durationMs);
  return overlapMs >= shorterDurationMs * 0.5;
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

function getRunsForUser(store, userId) {
  return store.runs
    .filter((entry) => entry.userId === userId)
    .sort((left, right) => right.date.localeCompare(left.date));
}

function getRunForUser(store, userId, runId, createError) {
  const runs = getRunsForUser(store, userId);

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

function importPendingRunsForUser(store, user, {
  nextId,
  formatTimestamp,
  nowIso,
  sourceLabels,
}) {
  const queue = ensureIntegrationImports(store);
  const connectedSources = user.connectedSources.filter((source) => source.connected && isSyncableSourceType(source.sourceType));
  const connectedSourceTypes = new Set(connectedSources.map((source) => source.sourceType));
  const sourceDisplayNameByType = new Map(connectedSources.map((source) => [source.sourceType, source.displayName]));
  const currentQueue = [...queue];
  const pendingImports = currentQueue.filter((entry) => entry.userId === user.id && connectedSourceTypes.has(entry.sourceType));
  const existingExternalKeys = new Set();
  const existingFingerprints = new Set();
  const existingTimedRuns = [];
  const processedImportIds = new Set();
  const importedRunIds = [];
  const lastSyncedAt = formatTimestamp();
  let scannedRuns = 0;
  let importedRuns = 0;
  let duplicateRuns = 0;

  for (const run of store.runs.filter((entry) => entry.userId === user.id)) {
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
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }

    return String(left.receivedAt).localeCompare(String(right.receivedAt));
  });

  for (const entry of pendingImports) {
    scannedRuns += 1;
    processedImportIds.add(entry.id);

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
      source: entry.sourceLabel ?? sourceDisplayNameByType.get(entry.sourceType) ?? sourceLabels[entry.sourceType] ?? entry.sourceType,
      sourceType: entry.sourceType,
      ...(entry.externalId ? { externalId: entry.externalId } : {}),
      ...(typeof entry.durationSeconds === 'number' ? { durationSeconds: entry.durationSeconds } : {}),
      ...(entry.startedAt ? { startedAt: entry.startedAt } : {}),
      ...(entry.endedAt ? { endedAt: entry.endedAt } : {}),
      createdAt: nowIso(),
      importedAt: lastSyncedAt,
    };

    store.runs.push(run);
    importedRuns += 1;
    importedRunIds.push(run.id);

    if (externalKey) {
      existingExternalKeys.add(externalKey);
    }

    existingFingerprints.add(fingerprint);
    existingTimedRuns.push(run);
  }

  store.integrationImports = currentQueue.filter((entry) => !processedImportIds.has(entry.id));
  user.connectedSources = user.connectedSources.map((source) => (
    source.connected && connectedSourceTypes.has(source.sourceType)
      ? {
        ...source,
        lastSyncedAt,
      }
      : source
  ));

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
}

export function createJsonRunsRepository({
  loadStore,
  mutateStore,
  requireUserByToken,
  nextId,
  buildRunDetail,
  getUserMetrics,
  decorateIntegrationSource,
  createError,
  sourceLabels,
  nowIso = createNowIso,
  formatTimestamp = createDisplayTimestamp,
  // C1/C2: the SERVER decides a duel's win/lose at save. Given (store, user, matchResult) it
  // returns the server-authoritative matchResult (overwriting any client-claimed verdict) or a
  // PENDING result when the verdict is not yet resolvable. Defaults to identity so callers that
  // do not pass it (and group/non-match runs) keep their behavior exactly as before.
  resolveMatchResult = (store, user, matchResult) => matchResult,
  // Drops the user's memoized metrics so the post-save recompute sees the just-pushed run. The
  // verdict resolver reads the opponent's runner profile (→ metrics) before the run is pushed,
  // which would otherwise leave a stale, pre-push metrics entry cached and miss the new run's
  // match bonus. No-op by default for callers (and stores) without a metrics cache.
  invalidateUserMetrics = () => {},
}) {
  return {
    async getRun({ token, runId }) {
      const store = await loadStore();
      const user = requireUserByToken(store, token);
      const run = getRunForUser(store, user.id, runId, createError);
      const metrics = getUserMetrics(store, user.id);

      return buildRunDetail(run, metrics.currentWeekDistanceKm, undefined, metrics);
    },

    async createManualRun({ token, input }) {
      return mutateStore((store) => {
        const user = requireUserByToken(store, token);
        const run = {
          id: nextId('run'),
          userId: user.id,
          date: input.date,
          distanceKm: input.distanceKm,
          pace: input.pace,
          source: 'Manual',
          sourceType: 'manual',
          createdAt: nowIso(),
        };

        store.runs.push(run);

        const manualSource = user.connectedSources.find((entry) => entry.sourceType === 'manual');

        if (manualSource) {
          manualSource.connected = true;
          manualSource.connectionStatus = 'connected';
          manualSource.lastSyncedAt = formatTimestamp();
        }

        const metrics = getUserMetrics(store, user.id);
        return buildRunDetail(run, metrics.currentWeekDistanceKm, undefined, metrics);
      });
    },

    async createTrackedRun({ token, input }) {
      return mutateStore((store) => {
        const user = requireUserByToken(store, token);

        // P1-2 stopgap idempotency: a retried /api/runs/tracked after a timeout must NOT double
        // count points / weekly distance / records. Match an already-saved run for the SAME
        // (userId, startedAt) — exact startedAt ISO string — and return its payload instead of
        // inserting a duplicate. The durable fix is a client-supplied clientRunId (post-launch);
        // startedAt collides only for genuine same-second re-submits of the same run.
        //
        // IMPORTANT: match saves (matchResult present) are EXCLUDED — the duel/group reconcile
        // flow deliberately re-saves the same (userId, startedAt) to upgrade a PENDING verdict to
        // the server-resolved win/lose/placement once the opponent's run lands. Short-circuiting
        // those would freeze the result at PENDING. Match points already dedupe by matchId.
        if (input.startedAt && !input.matchResult) {
          const existingRun = store.runs.find((entry) => (
            entry.userId === user.id && entry.startedAt === input.startedAt
          ));

          if (existingRun) {
            const existingMetrics = getUserMetrics(store, user.id);
            return buildRunDetail(existingRun, existingMetrics.currentWeekDistanceKm, undefined, existingMetrics);
          }
        }

        // C1/C2: resolve the duel verdict SERVER-side from the live match session before
        // persisting. The client-supplied resultTone/opponentName are never trusted — they are
        // overwritten by the server verdict, or replaced with a PENDING result when the verdict
        // is not yet resolvable. Group runs and non-match runs pass through untouched.
        const resolvedMatchResult = input.matchResult
          ? resolveMatchResult(store, user, input.matchResult)
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
          route: clone(input.route),
          startedAt: input.startedAt,
          endedAt: input.endedAt,
          ...(resolvedMatchResult ? { matchResult: clone(resolvedMatchResult) } : {}),
          source: 'RunningGround',
          sourceType: 'runningground',
          createdAt: nowIso(),
        };

        store.runs.push(run);

        // The verdict resolver above may have read (and cached) this user's metrics before the
        // run was pushed; drop that stale entry so the recompute includes the new run's bonus.
        invalidateUserMetrics(store, user.id);
        const metrics = getUserMetrics(store, user.id);
        return buildRunDetail(run, metrics.currentWeekDistanceKm, undefined, metrics);
      });
    },

    async queueIntegrationImports({ token, sourceType, normalizedRuns }) {
      return mutateStore((store) => {
        const user = requireUserByToken(store, token);
        const source = requireSyncableConnectedSource(user, sourceType, createError);
        const queue = ensureIntegrationImports(store);
        const receivedAt = nowIso();

        normalizedRuns.forEach((run) => {
          queue.push({
            id: nextId('import'),
            userId: user.id,
            ...run,
            receivedAt,
          });
        });

        return {
          success: true,
          source: decorateIntegrationSource(store, user, source),
          queuedRuns: normalizedRuns.length,
          pendingRuns: getPendingImportCount(store, user.id, sourceType),
        };
      });
    },

    async syncIntegrationImports({ token }) {
      return mutateStore((store) => {
        const user = requireUserByToken(store, token);
        return importPendingRunsForUser(store, user, {
          nextId,
          formatTimestamp,
          nowIso,
          sourceLabels,
        });
      });
    },
  };
}
