declare const __DEV__: boolean | undefined;

type RgPerfResourceKind = 'polling' | 'heartbeat' | 'watcher' | 'timer';
type RgPerfDetailValue = string | number | boolean | null | undefined;
type RgPerfDetail = Record<string, RgPerfDetailValue>;

type ActiveResource = {
  detail?: RgPerfDetail;
  kind: RgPerfResourceKind;
  label: string;
  startedAtMs: number;
};

const SLOW_SECTION_THRESHOLD_MS = 300;
const RESOURCE_SUMMARY_INTERVAL_MS = 10_000;

let nextResourceId = 0;
let summaryTimer: ReturnType<typeof setTimeout> | null = null;

const activeResources = new Map<number, ActiveResource>();
const openMeasurements = new Map<string, number>();

function getNowMs() {
  return typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
}

function getDebugFlagEnabled() {
  const maybeProcess = globalThis as unknown as {
    process?: {
      env?: {
        EXPO_PUBLIC_RG_PERF_TRACE?: string;
      };
    };
  };

  return maybeProcess.process?.env?.EXPO_PUBLIC_RG_PERF_TRACE === 'true';
}

export function isRgPerfTraceEnabled() {
  return (typeof __DEV__ !== 'undefined' && Boolean(__DEV__)) || getDebugFlagEnabled();
}

function cleanDetail(detail?: RgPerfDetail): RgPerfDetail | undefined {
  if (!detail) {
    return undefined;
  }

  return Object.entries(detail).reduce<RgPerfDetail>((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function formatDetail(detail?: RgPerfDetail) {
  const clean = cleanDetail(detail);
  if (!clean || Object.keys(clean).length === 0) {
    return '';
  }

  try {
    return ` ${JSON.stringify(clean)}`;
  } catch {
    return '';
  }
}

function logRgPerf(level: 'log' | 'warn', label: string, detail?: RgPerfDetail) {
  if (!isRgPerfTraceEnabled()) {
    return;
  }

  const message = `[RG perf] ${label}${formatDetail(detail)}`;
  const logger = globalThis.console;
  if (level === 'warn') {
    logger.warn(message);
    return;
  }
  logger.log(message);
}

export function rgDiagLog(label: string, detail?: RgPerfDetail) {
  const message = `[RG diag] ${label}${formatDetail(detail)}`;
  globalThis.console.log(message);
}

function getActiveResourceCount(kind: RgPerfResourceKind) {
  let count = 0;
  activeResources.forEach((resource) => {
    if (resource.kind === kind) {
      count += 1;
    }
  });
  return count;
}

function scheduleResourceSummary() {
  if (!isRgPerfTraceEnabled() || summaryTimer) {
    return;
  }

  summaryTimer = setTimeout(() => {
    summaryTimer = null;

    const activeLabels = Array.from(activeResources.values())
      .map((resource) => `${resource.kind}:${resource.label}`)
      .join(', ');

    logRgPerf('log', '10s resource summary', {
      heartbeat: getActiveResourceCount('heartbeat'),
      polling: getActiveResourceCount('polling'),
      watcher: getActiveResourceCount('watcher'),
      timer: getActiveResourceCount('timer'),
      total: activeResources.size,
      active: activeLabels || 'none',
    });

    if (activeResources.size > 0) {
      scheduleResourceSummary();
    }
  }, RESOURCE_SUMMARY_INTERVAL_MS);
}

export function rgPerfMark(label: string, detail?: RgPerfDetail) {
  logRgPerf('log', label, {
    t: Math.round(getNowMs()),
    ...detail,
  });
}

export function rgPerfMeasureStart(label: string, detail?: RgPerfDetail) {
  if (!isRgPerfTraceEnabled()) {
    return () => 0;
  }

  const startedAtMs = getNowMs();
  rgPerfMark(`${label} begin`, detail);

  return (endDetail?: RgPerfDetail) => {
    const durationMs = getNowMs() - startedAtMs;
    const roundedDurationMs = Number(durationMs.toFixed(1));
    const level = roundedDurationMs >= SLOW_SECTION_THRESHOLD_MS ? 'warn' : 'log';

    logRgPerf(level, `${label} end`, {
      durationMs: roundedDurationMs,
      ...detail,
      ...endDetail,
    });

    return roundedDurationMs;
  };
}

export function rgPerfBegin(label: string, key = 'default', detail?: RgPerfDetail) {
  if (!isRgPerfTraceEnabled()) {
    return;
  }

  openMeasurements.set(`${label}:${key}`, getNowMs());
  rgPerfMark(`${label} begin`, detail);
}

export function rgPerfEnd(label: string, key = 'default', detail?: RgPerfDetail) {
  if (!isRgPerfTraceEnabled()) {
    return;
  }

  const measurementKey = `${label}:${key}`;
  const startedAtMs = openMeasurements.get(measurementKey);
  if (startedAtMs === undefined) {
    rgPerfMark(`${label} end`, detail);
    return;
  }

  openMeasurements.delete(measurementKey);
  const durationMs = Number((getNowMs() - startedAtMs).toFixed(1));
  const level = durationMs >= SLOW_SECTION_THRESHOLD_MS ? 'warn' : 'log';

  logRgPerf(level, `${label} end`, {
    durationMs,
    ...detail,
  });
}

export function rgPerfTrackResource(
  kind: RgPerfResourceKind,
  label: string,
  detail?: RgPerfDetail,
) {
  if (!isRgPerfTraceEnabled()) {
    return () => {};
  }

  nextResourceId += 1;
  const resourceId = nextResourceId;
  const resource: ActiveResource = {
    detail,
    kind,
    label,
    startedAtMs: getNowMs(),
  };

  activeResources.set(resourceId, resource);
  logRgPerf('log', `${kind} start: ${label}`, {
    activeKindCount: getActiveResourceCount(kind),
    ...detail,
  });
  scheduleResourceSummary();

  return () => {
    const activeResource = activeResources.get(resourceId);
    if (!activeResource) {
      return;
    }

    activeResources.delete(resourceId);
    logRgPerf('log', `${activeResource.kind} stop: ${activeResource.label}`, {
      activeKindCount: getActiveResourceCount(activeResource.kind),
      aliveMs: Number((getNowMs() - activeResource.startedAtMs).toFixed(1)),
      ...activeResource.detail,
    });
  };
}
