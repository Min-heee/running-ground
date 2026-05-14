import { isRgPerfTraceEnabled } from '@/utils/rgPerfTrace';

type RgInputDetailValue = string | number | boolean | null | undefined;
type RgInputDetail = Record<string, RgInputDetailValue>;

const SLOW_INPUT_FEEDBACK_THRESHOLD_MS = 300;
const DEFAULT_RECENT_INPUT_WINDOW_MS = 1_200;

let lastInputInteractionAtMs = 0;

function getNowMs() {
  return typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
}

function cleanDetail(detail?: RgInputDetail): RgInputDetail | undefined {
  if (!detail) {
    return undefined;
  }

  return Object.entries(detail).reduce<RgInputDetail>((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function formatDetail(detail?: RgInputDetail) {
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

function logRgInput(level: 'log' | 'warn', label: string, detail?: RgInputDetail) {
  if (!isRgPerfTraceEnabled()) {
    return;
  }

  const message = `[RG input] ${label}${formatDetail(detail)}`;
  if (level === 'warn') {
    globalThis.console.warn(message);
    return;
  }
  globalThis.console.log(message);
}

function scheduleFrameDelayTrace(label: string, startedAtMs: number, detail?: RgInputDetail) {
  setTimeout(() => {
    const delayMs = Number((getNowMs() - startedAtMs).toFixed(1));
    const frameDetail = {
      delayMs,
      phase: 'next tick',
      ...detail,
    };
    logRgInput(
      delayMs >= SLOW_INPUT_FEEDBACK_THRESHOLD_MS ? 'warn' : 'log',
      delayMs >= SLOW_INPUT_FEEDBACK_THRESHOLD_MS ? 'JS frame delayed' : 'next tick delay',
      frameDetail,
    );
  }, 0);

  const onFrame = () => {
    const delayMs = Number((getNowMs() - startedAtMs).toFixed(1));
    const frameDetail = {
      delayMs,
      phase: 'requestAnimationFrame',
      ...detail,
    };
    logRgInput(
      delayMs >= SLOW_INPUT_FEEDBACK_THRESHOLD_MS ? 'warn' : 'log',
      delayMs >= SLOW_INPUT_FEEDBACK_THRESHOLD_MS ? 'JS frame delayed' : 'requestAnimationFrame delay',
      frameDetail,
    );
  };

  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(onFrame);
    return;
  }

  setTimeout(onFrame, 16);
}

export function beginRgInputTrace(label: string, detail?: RgInputDetail) {
  const startedAtMs = getNowMs();
  lastInputInteractionAtMs = startedAtMs;

  if (!isRgPerfTraceEnabled()) {
    return {
      markFeedback: () => 0,
      markFeedbackCommitted: () => 0,
      markApiStarted: () => 0,
      mark: () => {},
    };
  }

  logRgInput('log', 'press event received', {
    label,
    t: Math.round(startedAtMs),
    ...detail,
  });
  scheduleFrameDelayTrace(label, startedAtMs, {
    label,
    ...detail,
  });

  return {
    markFeedback: (phase: string, feedbackDetail?: RgInputDetail) => {
      const durationMs = Number((getNowMs() - startedAtMs).toFixed(1));
      logRgInput(
        durationMs >= SLOW_INPUT_FEEDBACK_THRESHOLD_MS ? 'warn' : 'log',
        durationMs >= SLOW_INPUT_FEEDBACK_THRESHOLD_MS ? 'slow button feedback' : 'button feedback',
        {
          durationMs,
          label,
          phase,
          ...detail,
          ...feedbackDetail,
        },
      );
      return durationMs;
    },
    markFeedbackCommitted: (feedbackDetail?: RgInputDetail) => {
      const delayMs = Number((getNowMs() - startedAtMs).toFixed(1));
      const logLevel = delayMs >= SLOW_INPUT_FEEDBACK_THRESHOLD_MS ? 'warn' : 'log';
      const traceDetail = {
        delayMs,
        label,
        ...detail,
        ...feedbackDetail,
      };
      logRgInput(logLevel, 'button feedback committed', traceDetail);
      logRgInput(logLevel, 'button feedback delayMs', traceDetail);
      return delayMs;
    },
    markApiStarted: (apiDetail?: RgInputDetail) => {
      const delayMs = Number((getNowMs() - startedAtMs).toFixed(1));
      logRgInput('log', 'API started after feedback', {
        delayMs,
        label,
        ...detail,
        ...apiDetail,
      });
      return delayMs;
    },
    mark: (phase: string, markDetail?: RgInputDetail) => {
      logRgInput('log', phase, {
        durationMs: Number((getNowMs() - startedAtMs).toFixed(1)),
        label,
        ...detail,
        ...markDetail,
      });
    },
  };
}

export function waitForRgInputFeedbackFrame() {
  return new Promise<void>((resolve) => {
    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(() => {
        resolve();
      });
      return;
    }

    setTimeout(resolve, 0);
  });
}

export function isRgInputInteractionRecent(windowMs = DEFAULT_RECENT_INPUT_WINDOW_MS) {
  if (!lastInputInteractionAtMs) {
    return false;
  }

  return getNowMs() - lastInputInteractionAtMs < windowMs;
}
