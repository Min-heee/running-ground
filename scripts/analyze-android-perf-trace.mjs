#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const THRESHOLDS = {
  activeRoomCheckDurationMs: 5000,
  backgroundTaskStartDurationMs: 5000,
  gpsTrackingStartDurationMs: 5000,
  heartbeatActiveKindCount: 2,
  liveMatchContainerRendersPer10s: 20,
  pollingActiveKindCount: 3,
  trackRunExperienceRendersPer10s: 25,
  watcherActiveKindCount: 2,
};

const RULES = {
  activeRoomCheckSlow: {
    metric: 'durationMs',
    name: 'active room check slow',
    threshold: `>= ${THRESHOLDS.activeRoomCheckDurationMs}ms`,
  },
  backgroundTaskStartSlow: {
    metric: 'durationMs',
    name: 'background task start slow',
    threshold: `>= ${THRESHOLDS.backgroundTaskStartDurationMs}ms`,
  },
  gpsTrackingStartSlow: {
    metric: 'durationMs',
    name: 'GPS tracking start slow',
    threshold: `>= ${THRESHOLDS.gpsTrackingStartDurationMs}ms`,
  },
  heartbeatCountHigh: {
    metric: 'activeKindCount',
    name: 'heartbeat activeKindCount high',
    threshold: `>= ${THRESHOLDS.heartbeatActiveKindCount}`,
  },
  liveMatchContainerRenderHigh: {
    metric: 'renders/10s',
    name: 'LiveMatchContainer render count high',
    threshold: `>= ${THRESHOLDS.liveMatchContainerRendersPer10s}`,
  },
  liveMatchNavigationFailed: {
    metric: 'success',
    name: 'live match navigation failed',
    threshold: 'false',
  },
  pollingCountHigh: {
    metric: 'activeKindCount',
    name: 'polling activeKindCount high',
    threshold: `>= ${THRESHOLDS.pollingActiveKindCount}`,
  },
  trackRunExperienceRenderHigh: {
    metric: 'renders/10s',
    name: 'TrackRunExperience render count high',
    threshold: `>= ${THRESHOLDS.trackRunExperienceRendersPer10s}`,
  },
  watcherCountHigh: {
    metric: 'activeKindCount',
    name: 'watcher activeKindCount high',
    threshold: `>= ${THRESHOLDS.watcherActiveKindCount}`,
  },
};

const INFORMATIONAL_EVENTS = {
  activeRoomCheckAbortedTimeout: {
    label: 'active room check aborted timeout',
    name: 'active room check aborted timeout',
  },
  activeRoomCheckIgnoredAfterAbort: {
    label: 'active room check result ignored after abort',
    name: 'active room check ignored after abort',
  },
  activeRoomCheckOwnerCleanedUp: {
    label: 'active room check owner cleaned up',
    name: 'active room check owner cleaned up',
  },
};

function printUsage() {
  console.log(`Usage: npm run perf:trace-analyze -- <metro-log.txt>

Examples:
  npm run perf:trace-analyze -- ./logs/android-party-run.txt
  node ./scripts/analyze-android-perf-trace.mjs ./logs/android-party-run.txt`);
}

function createInformationalSummary() {
  return Object.fromEntries(
    Object.entries(INFORMATIONAL_EVENTS).map(([key, event]) => [key, {
      count: 0,
      event: event.name,
      firstLine: null,
      maxDurationMs: null,
      sources: new Set(),
    }]),
  );
}

function recordInformationalEvent(summary, key, payload, lineNo) {
  const current = summary[key];

  if (!current) {
    return;
  }

  const durationMs = toNumber(payload.durationMs);
  current.count += 1;
  current.firstLine = current.firstLine === null ? lineNo : Math.min(current.firstLine, lineNo);

  if (durationMs !== null) {
    current.maxDurationMs = current.maxDurationMs === null
      ? durationMs
      : Math.max(current.maxDurationMs, durationMs);
  }

  if (payload.source) {
    current.sources.add(String(payload.source));
  }
}

function recordActiveRoomCheckInformationalEvent(perfLabel, payload, lineNo, informationalSummary) {
  Object.entries(INFORMATIONAL_EVENTS).forEach(([key, event]) => {
    if (perfLabel === event.label) {
      recordInformationalEvent(informationalSummary, key, payload, lineNo);
    }
  });
}

function isSlowSuccessfulActiveRoomCheckEnd(perfLabel, payload, durationMs) {
  return perfLabel === 'active room check end'
    && payload.success === true
    && durationMs !== null
    && durationMs >= THRESHOLDS.activeRoomCheckDurationMs;
}

function parseJsonPayload(line) {
  const startIndex = line.indexOf('{');
  const endIndex = line.lastIndexOf('}');

  if (startIndex === -1 || endIndex <= startIndex) {
    return null;
  }

  try {
    return JSON.parse(line.slice(startIndex, endIndex + 1));
  } catch {
    return null;
  }
}

function parsePerfLabel(line) {
  const matched = line.match(/\[RG perf\]\s*([^{]*)/);
  return matched?.[1]?.trim() ?? '';
}

function parseRenderLine(line) {
  const matched = line.match(/\[RG render\/10s\]\s+([^:]+(?::[^:]+)?)\s*:\s*(\d+)\s+renders/i);

  if (!matched) {
    return null;
  }

  return {
    component: matched[1],
    renders: Number(matched[2]),
  };
}

function toNumber(value) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : null;
}

function truncate(value, maxLength = 140) {
  const oneLine = String(value).replace(/\s+/g, ' ').trim();
  return oneLine.length > maxLength ? `${oneLine.slice(0, maxLength - 1)}…` : oneLine;
}

function formatValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return typeof value === 'number' ? String(Number(value.toFixed(1))) : String(value);
}

function pushFinding(findings, {
  detail = '',
  line,
  lineNo,
  rule,
  value,
}) {
  findings.push({
    detail,
    example: truncate(line),
    lineNo,
    metric: RULES[rule].metric,
    rule: RULES[rule].name,
    threshold: RULES[rule].threshold,
    value,
  });
}

function analyzeLine(line, lineNo, findings, informationalSummary) {
  const perfLabel = parsePerfLabel(line);
  const payload = parseJsonPayload(line);

  if (perfLabel && payload) {
    const durationMs = toNumber(payload.durationMs);
    const activeKindCount = toNumber(payload.activeKindCount);
    recordActiveRoomCheckInformationalEvent(perfLabel, payload, lineNo, informationalSummary);

    if (isSlowSuccessfulActiveRoomCheckEnd(perfLabel, payload, durationMs)) {
      pushFinding(findings, {
        detail: payload.source ? `source=${payload.source}` : '',
        line,
        lineNo,
        rule: 'activeRoomCheckSlow',
        value: durationMs,
      });
    }

    if (
      perfLabel.includes('background task start')
      && durationMs !== null
      && durationMs >= THRESHOLDS.backgroundTaskStartDurationMs
    ) {
      pushFinding(findings, {
        detail: payload.appState ? `appState=${payload.appState}` : '',
        line,
        lineNo,
        rule: 'backgroundTaskStartSlow',
        value: durationMs,
      });
    }

    if (
      perfLabel.includes('GPS tracking start')
      && durationMs !== null
      && durationMs >= THRESHOLDS.gpsTrackingStartDurationMs
    ) {
      pushFinding(findings, {
        detail: payload.matchId ? `matchId=${payload.matchId}` : '',
        line,
        lineNo,
        rule: 'gpsTrackingStartSlow',
        value: durationMs,
      });
    }

    if (
      perfLabel.includes('live match navigation')
      && (payload.success === false || /success["']?\s*[:=]\s*false/i.test(line))
    ) {
      pushFinding(findings, {
        detail: payload.matchId ? `matchId=${payload.matchId}` : '',
        line,
        lineNo,
        rule: 'liveMatchNavigationFailed',
        value: 'false',
      });
    }

    if (
      perfLabel.includes('polling')
      && activeKindCount !== null
      && activeKindCount >= THRESHOLDS.pollingActiveKindCount
    ) {
      pushFinding(findings, {
        detail: payload.key ? `key=${payload.key}` : '',
        line,
        lineNo,
        rule: 'pollingCountHigh',
        value: activeKindCount,
      });
    }

    if (
      perfLabel.includes('heartbeat')
      && activeKindCount !== null
      && activeKindCount >= THRESHOLDS.heartbeatActiveKindCount
    ) {
      pushFinding(findings, {
        detail: payload.matchId ? `matchId=${payload.matchId}` : '',
        line,
        lineNo,
        rule: 'heartbeatCountHigh',
        value: activeKindCount,
      });
    }

    if (
      perfLabel.includes('watcher')
      && activeKindCount !== null
      && activeKindCount >= THRESHOLDS.watcherActiveKindCount
    ) {
      pushFinding(findings, {
        detail: payload.source ? `source=${payload.source}` : '',
        line,
        lineNo,
        rule: 'watcherCountHigh',
        value: activeKindCount,
      });
    }

    if (perfLabel.includes('10s resource summary')) {
      const polling = toNumber(payload.polling);
      const heartbeat = toNumber(payload.heartbeat);
      const watcher = toNumber(payload.watcher);

      if (polling !== null && polling >= THRESHOLDS.pollingActiveKindCount) {
        pushFinding(findings, {
          detail: payload.active ? `active=${payload.active}` : '',
          line,
          lineNo,
          rule: 'pollingCountHigh',
          value: polling,
        });
      }

      if (heartbeat !== null && heartbeat >= THRESHOLDS.heartbeatActiveKindCount) {
        pushFinding(findings, {
          detail: payload.active ? `active=${payload.active}` : '',
          line,
          lineNo,
          rule: 'heartbeatCountHigh',
          value: heartbeat,
        });
      }

      if (watcher !== null && watcher >= THRESHOLDS.watcherActiveKindCount) {
        pushFinding(findings, {
          detail: payload.active ? `active=${payload.active}` : '',
          line,
          lineNo,
          rule: 'watcherCountHigh',
          value: watcher,
        });
      }
    }

    const componentName = String(payload.component ?? payload.label ?? payload.name ?? '');
    const renderCount = toNumber(payload.renders ?? payload.renderCount ?? payload.count);

    if (
      componentName.includes('LiveMatchContainer')
      && renderCount !== null
      && renderCount >= THRESHOLDS.liveMatchContainerRendersPer10s
    ) {
      pushFinding(findings, {
        detail: componentName,
        line,
        lineNo,
        rule: 'liveMatchContainerRenderHigh',
        value: renderCount,
      });
    }

    if (
      componentName.includes('TrackRunExperience')
      && renderCount !== null
      && renderCount >= THRESHOLDS.trackRunExperienceRendersPer10s
    ) {
      pushFinding(findings, {
        detail: componentName,
        line,
        lineNo,
        rule: 'trackRunExperienceRenderHigh',
        value: renderCount,
      });
    }
  }

  const renderLine = parseRenderLine(line);
  if (
    renderLine?.component.includes('LiveMatchContainer')
    && renderLine.renders >= THRESHOLDS.liveMatchContainerRendersPer10s
  ) {
    pushFinding(findings, {
      detail: renderLine.component,
      line,
      lineNo,
      rule: 'liveMatchContainerRenderHigh',
      value: renderLine.renders,
    });
  }

  if (
    renderLine?.component.includes('TrackRunExperience')
    && renderLine.renders >= THRESHOLDS.trackRunExperienceRendersPer10s
  ) {
    pushFinding(findings, {
      detail: renderLine.component,
      line,
      lineNo,
      rule: 'trackRunExperienceRenderHigh',
      value: renderLine.renders,
    });
  }
}

function getInformationalRows(informationalSummary) {
  return Object.values(informationalSummary)
    .filter((event) => event.count > 0)
    .map((event) => [
      event.event,
      event.count,
      formatValue(event.maxDurationMs),
      event.firstLine ?? '',
      Array.from(event.sources).join(', '),
    ]);
}

function summarizeFindings(findings) {
  return findings.reduce((acc, finding) => {
    const current = acc.get(finding.rule) ?? {
      count: 0,
      firstLine: finding.lineNo,
      maxValue: finding.value,
      metric: finding.metric,
      threshold: finding.threshold,
    };

    current.count += 1;
    current.firstLine = Math.min(current.firstLine, finding.lineNo);

    if (typeof finding.value === 'number') {
      const currentMax = typeof current.maxValue === 'number' ? current.maxValue : Number.NEGATIVE_INFINITY;
      current.maxValue = Math.max(currentMax, finding.value);
    }

    acc.set(finding.rule, current);
    return acc;
  }, new Map());
}

function printTable(headers, rows) {
  const separator = headers.map(() => '---');
  console.log(`| ${headers.join(' | ')} |`);
  console.log(`| ${separator.join(' | ')} |`);

  rows.forEach((row) => {
    console.log(`| ${row.map((cell) => String(cell).replace(/\|/g, '\\|')).join(' | ')} |`);
  });
}

function main() {
  const inputPath = process.argv[2];

  if (!inputPath || inputPath === '-h' || inputPath === '--help') {
    printUsage();
    process.exit(inputPath ? 0 : 1);
  }

  const resolvedPath = resolve(inputPath);
  const content = readFileSync(resolvedPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const findings = [];
  const informationalSummary = createInformationalSummary();

  lines.forEach((line, index) => {
    analyzeLine(line, index + 1, findings, informationalSummary);
  });

  console.log(`# Android Perf Trace Analysis: ${basename(resolvedPath)}`);
  console.log('');
  console.log(`- Lines scanned: ${lines.length}`);
  console.log(`- Findings: ${findings.length}`);
  console.log('');

  const informationalRows = getInformationalRows(informationalSummary);
  if (informationalRows.length > 0) {
    console.log('## Informational Summary');
    printTable(
      ['Event', 'Count', 'Max durationMs', 'First line', 'Sources'],
      informationalRows,
    );
    console.log('');
  }

  if (findings.length === 0) {
    console.log('No configured high-risk Android live match patterns were detected.');
    return;
  }

  console.log('## Summary');
  printTable(
    ['Pattern', 'Count', 'Metric', 'Max value', 'Threshold', 'First line'],
    Array.from(summarizeFindings(findings).entries()).map(([rule, summary]) => [
      rule,
      summary.count,
      summary.metric,
      formatValue(summary.maxValue),
      summary.threshold,
      summary.firstLine,
    ]),
  );
  console.log('');

  console.log('## Findings');
  printTable(
    ['Line', 'Pattern', 'Value', 'Threshold', 'Detail', 'Example'],
    findings.map((finding) => [
      finding.lineNo,
      finding.rule,
      formatValue(finding.value),
      finding.threshold,
      truncate(finding.detail, 80),
      finding.example,
    ]),
  );
}

main();
