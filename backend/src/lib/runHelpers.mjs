import { getRunPointBreakdown, getRunPointValue, parsePaceToMinutes } from './points.mjs';
import { ApiError } from '../response/httpResponse.mjs';
import { normalizeOptionalString } from './adminNormalizers.mjs';
import { getRunsForUser } from './userStoreHelpers.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function buildRunDetail(run, weeklyDistanceKm, sourceOverride, metrics) {
  const paceMinutes = parsePaceToMinutes(run.pace);

  return {
    run: {
      id: run.id,
      date: run.date,
      distanceKm: run.distanceKm,
      pace: run.pace,
      source: sourceOverride ?? run.source,
      ...(run.sourceType ? { sourceType: run.sourceType } : {}),
      ...(typeof run.durationSeconds === 'number' ? { durationSeconds: run.durationSeconds } : {}),
      ...(typeof run.cadenceSpm === 'number' ? { cadenceSpm: run.cadenceSpm } : {}),
      ...(typeof run.elevationGainM === 'number' ? { elevationGainM: run.elevationGainM } : {}),
      ...(Array.isArray(run.route) ? { route: run.route } : {}),
      ...(normalizeOptionalString(run.startedAt) ? { startedAt: run.startedAt } : {}),
      ...(normalizeOptionalString(run.endedAt) ? { endedAt: run.endedAt } : {}),
      ...(run.matchResult ? { matchResult: clone(run.matchResult) } : {}),
    },
    weeklyDistanceKm,
    estimatedMinutes: Math.round(run.distanceKm * (paceMinutes ?? 5.5)),
    earnedPoint: getRunPointValue(metrics, run.id),
    pointBreakdown: getRunPointBreakdown(metrics, run.id),
  };
}

// #209 GPS route side-table re-attach (postgres driver): runs stored in the app_store blob
// carry `routeStored: true` instead of the embedded route array. Callers that are about to
// build a run DETAIL response resolve the route back from the side table here, so the API
// response keeps exactly its pre-#209 shape. Embedded routes (json driver / not-yet-migrated
// runs) short-circuit untouched, and a side-table miss degrades to today's "no route" shape.
export async function attachStoredRunRoute(run, getStoredRunRoute) {
  if (
    !run
    || typeof run !== 'object'
    || Array.isArray(run.route)
    || run.routeStored !== true
    || typeof getStoredRunRoute !== 'function'
  ) {
    return run;
  }

  const route = await getStoredRunRoute(run.id);
  return Array.isArray(route) ? { ...run, route } : run;
}

// Re-insert a side-table route into an ALREADY BUILT run detail payload (the createTrackedRun
// dedupe-retry paths build the payload inside a synchronous mutateStore mutator, where the
// async side-table fetch cannot run). The route is spliced into buildRunDetail's canonical key
// position — after the stat fields, before startedAt/endedAt/matchResult — so the serialized
// response is byte-identical to one built from an embedded route.
export function attachRouteToRunPayload(runPayload, route) {
  if (
    !runPayload
    || typeof runPayload !== 'object'
    || Array.isArray(runPayload.route)
    || !Array.isArray(route)
  ) {
    return runPayload;
  }

  const rebuilt = {};
  let inserted = false;

  for (const [key, value] of Object.entries(runPayload)) {
    if (!inserted && (key === 'startedAt' || key === 'endedAt' || key === 'matchResult')) {
      rebuilt.route = route;
      inserted = true;
    }

    rebuilt[key] = value;
  }

  if (!inserted) {
    rebuilt.route = route;
  }

  return rebuilt;
}

export function getRunFromList(runs, runId) {
  if (!runs.length) {
    throw new ApiError(404, '러닝 기록이 없어요.');
  }

  if (!runId) {
    return runs[0];
  }

  const run = runs.find((entry) => entry.id === runId);

  if (!run) {
    throw new ApiError(404, '러닝 기록을 찾을 수 없어요.');
  }

  return run;
}

export function getRunForUser(store, userId, runId) {
  return getRunFromList(getRunsForUser(store, userId), runId);
}
